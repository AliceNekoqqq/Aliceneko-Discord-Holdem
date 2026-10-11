import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAT_PIPELINE_RUNTIME,DiscordGateway} from './discord-gateway.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('gateway readiness requires its real open socket and authenticated bot',t=>{
  t.mock.method(globalThis,'WebSocket',class {static OPEN=1;});
  const gateway=new DiscordGateway({env:{},ctx:{storage:{}}});
  assert.deepEqual(gateway.status(),{connected:false,ready:false,chatRuntime:CHAT_PIPELINE_RUNTIME});
  gateway.socket={readyState:1};
  assert.equal(gateway.status().ready,false);
  gateway.botId='bot';assert.equal(gateway.status().ready,true);
  gateway.socket.readyState=3;assert.equal(gateway.status().ready,false);
});
function fixture(t,fetcher,extraEnv={}){
  t.mock.method(globalThis,'fetch',fetcher);
  const tasks=[];
  const host={env:{BOT_TOKEN:'test',GEMINI_API_KEY:'test',AI_REQUEST_LOG_ENABLED:'false',...extraEnv},ctx:{storage:{},waitUntil(p){tasks.push(p);}}};
  const gateway=new DiscordGateway(host);gateway.botId='bot';
  const mention=(id,channel,guild='guild',author='user')=>gateway.onGuildMessage({id,guild_id:guild,channel_id:channel,author:{id:author,username:author},mentions:[{id:'bot'}],content:'<@bot> '+id});
  return {gateway,tasks,mention};
}

test('a slow request cannot block the same user in a different channel',async t=>{
  let release;const blocked=new Promise(resolve=>release=resolve);t.after(release);
  const started=[],replies=[];
  const {gateway,tasks,mention}=fixture(t,async(url,options)=>{
    if(url.includes('generativelanguage')){
      const text=JSON.parse(options.body).contents.at(-1).parts[0].text;started.push(text);
      if(text==='first')await blocked;
      return Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]});
    }
    if(url.endsWith('/messages'))replies.push(url);
    return Response.json({});
  });
  mention('first','a');mention('second','b');await tick();
  assert.deepEqual(started,['first','second']);
  assert.ok(replies.includes('https://discord.com/api/v10/channels/b/messages'));
  assert.equal(gateway.chatQueues.size,1);
  release();await Promise.all(tasks);assert.equal(gateway.chatQueues.size,0);
});

test('A/B/A in one channel preserves arrival order and each reply references its own message',async t=>{
  let releaseFirst,releaseSecond;
  const firstBlocked=new Promise(resolve=>releaseFirst=resolve);
  const secondBlocked=new Promise(resolve=>releaseSecond=resolve);
  t.after(()=>{releaseFirst();releaseSecond();});const started=[];
  const references=[];
  const {gateway,tasks,mention}=fixture(t,async(url,options)=>{
    if(url.includes('generativelanguage')){
      const text=JSON.parse(options.body).contents.at(-1).parts[0].text;started.push(text);
      if(text==='first')await firstBlocked;
      if(text==='second')await secondBlocked;
      return Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]});
    }
    if(url.endsWith('/messages'))references.push(JSON.parse(options.body).message_reference.message_id);
    return Response.json({});
  });
  mention('first','a','guild','A');mention('second','a','guild','B');mention('third','a','guild','A');await tick();
  assert.deepEqual(started,['first']);assert.equal(gateway.chatQueues.size,1);
  releaseFirst();await tick();
  assert.deepEqual(started,['first','second']);
  assert.deepEqual(references,['first']);
  assert.equal(gateway.chatQueues.size,1,'the first request must not remove its queued successor');
  releaseSecond();await Promise.all(tasks);
  assert.deepEqual(started,['first','second','third']);
  assert.deepEqual(references,['first','second','third']);
  assert.equal(gateway.chatQueues.size,0);
});

test('the next speaker reads complete channel history only after the prior D1 batch commits',async t=>{
  let releaseBatch;
  const batchBlocked=new Promise(resolve=>releaseBatch=resolve);
  let markBatchStarted;
  const batchStarted=new Promise(resolve=>markBatchStarted=resolve);
  t.after(()=>releaseBatch());
  const personalRows=[];const channelRows=[];
  const personalReads=[];const channelSnapshots=[];const modelRequests=[];const replyReferences=[];
  let firstBatch=true;
  const db={
    prepare(sql){
      return {
        sql,args:[],
        bind(...args){this.args=args;return this;},
        async first(){
          if(sql.includes('ai_member_settings'))return {memory_enabled:1};
          if(sql.includes('ai_channel_memory_config'))return {enabled:1};
          return null;
        },
        async all(){
          if(sql.includes('FROM ai_chat_history')){
            const user=this.args[1];personalReads.push(user);
            return {results:personalRows.filter(row=>row.user_id===user).map(row=>({...row}))};
          }
          if(sql.startsWith('SELECT role, content, user_id, speaker_name, created_at, id FROM ai_channel_chat_history')){
            const snapshot=channelRows.map(row=>({...row}));channelSnapshots.push(snapshot);
            return {results:snapshot.slice().reverse()};
          }
          return {results:[]};
        },
        async run(){return {meta:{changes:1}};}
      };
    },
    async batch(statements){
      if(firstBatch){firstBatch=false;markBatchStarted();await batchBlocked;}
      for(const statement of statements){
        if(statement.sql.includes('INSERT INTO ai_chat_history')){
          const [guild_id,user_id,role,content,created_at]=statement.args;
          personalRows.push({guild_id,user_id,role,content,created_at,id:personalRows.length+1});
        } else if(statement.sql.includes('INSERT INTO ai_channel_chat_history')){
          const [guild_id,channel_id,user_id,role,content,speaker_name,created_at]=statement.args;
          channelRows.push({guild_id,channel_id,user_id,role,content,speaker_name,created_at,id:channelRows.length+1});
        }
      }
    }
  };
  const {gateway,tasks,mention}=fixture(t,async(url,options)=>{
    if(url.includes('generativelanguage')){
      const body=JSON.parse(options.body);
      const userText=body.contents.at(-1).parts[0].text;
      modelRequests.push({userText,system:body.systemInstruction.parts[0].text});
      return Response.json({candidates:[{content:{parts:[{text:userText.startsWith('A:')?'A-model-response':'B-model-response'}]}}]});
    }
    if(url.endsWith('/messages'))replyReferences.push(JSON.parse(options.body).message_reference.message_id);
    return Response.json({});
  },{CHAT_DB:db});
  mention('A: hello','a','guild','A');mention('B: hello','a','guild','B');
  await batchStarted;
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(modelRequests.map(request=>request.userText),['A: hello']);
  assert.deepEqual(replyReferences,['A: hello'],'A must already be delivered while its history batch is still blocked');
  assert.ok(personalReads.includes('A'));
  assert.ok(!personalReads.includes('B'),'B must not read personal history while A is still saving');
  assert.deepEqual(channelSnapshots,[[]]);

  releaseBatch();
  await Promise.all(tasks);
  assert.deepEqual(modelRequests.map(request=>request.userText),['A: hello','B: hello']);
  assert.ok(personalReads.includes('B'));
  assert.deepEqual(channelSnapshots[1].map(row=>[row.user_id,row.role]),[['A','user'],['A','model']]);
  assert.deepEqual(replyReferences,['A: hello','B: hello']);
  const bSystem=modelRequests[1].system;
  const runtime=JSON.parse(bSystem.slice(bSystem.lastIndexOf('\n')+1));
  assert.equal(runtime.currentSpeaker.key,'current_user');
  assert.deepEqual(runtime.channelConversation.records.map(row=>row.speaker),['member_1','bot']);
  assert.equal(runtime.channelConversation.records[1].replyTo,'member_1');
  assert.equal(runtime.channelConversation.participants.find(person=>person.key==='member_1')?.name,'A');
  assert.equal(gateway.chatQueues.size,0);
});

test('same channel id in another guild does not wait for the first guild',async t=>{
  let release;const blocked=new Promise(resolve=>release=resolve);t.after(release);const started=[];
  const {gateway,tasks,mention}=fixture(t,async(url,options)=>{
    if(url.includes('generativelanguage')){
      const text=JSON.parse(options.body).contents.at(-1).parts[0].text;started.push(text);
      if(text==='guild-one')await blocked;
      return Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]});
    }
    return Response.json({});
  });
  mention('guild-one','same-channel','guild-one');mention('guild-two','same-channel','guild-two');await tick();
  assert.deepEqual(started,['guild-one','guild-two']);
  release();await Promise.all(tasks);assert.equal(gateway.chatQueues.size,0);
});

test('Discord delivery failures are logged and do not prevent a later reply',async t=>{
  const warnings=[];t.mock.method(console,'warn',(...args)=>warnings.push(args));let deliveries=0;
  const {gateway,tasks,mention}=fixture(t,async(url)=>{
    if(url.includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]});
    if(url.endsWith('/messages')&&++deliveries===1)return new Response('',{status:403});
    return Response.json({});
  });
  mention('first','a');mention('second','a');await Promise.all(tasks);
  assert.equal(deliveries,2);assert.equal(gateway.chatQueues.size,0);
  assert.ok(warnings.some(([event,detail])=>event==='ai_reply_delivery_failed'&&detail.status===403));
});

test('ensure reports the chat pipeline runtime on every gateway state path',async t=>{
  const storage={async put(){},async get(){return undefined;}};
  const host={env:{BOT_TOKEN:'test'},ctx:{storage,waitUntil(){}}};
  const gateway=new DiscordGateway(host);
  assert.deepEqual(await new DiscordGateway({env:{},ctx:{storage}}).ensure(),{
    connected:false,reason:'missing_bot_token',chatRuntime:CHAT_PIPELINE_RUNTIME
  });
  gateway.socket={readyState:WebSocket.OPEN};
  assert.deepEqual(await gateway.ensure(),{connected:true,connecting:false,chatRuntime:CHAT_PIPELINE_RUNTIME});
  gateway.socket={readyState:WebSocket.CONNECTING};
  assert.deepEqual(await gateway.ensure(),{connected:true,connecting:true,chatRuntime:CHAT_PIPELINE_RUNTIME});
  gateway.socket=null;gateway.retryTimer={};
  assert.deepEqual(await gateway.ensure(),{connected:false,retryScheduled:true,chatRuntime:CHAT_PIPELINE_RUNTIME});

  const OriginalWebSocket=globalThis.WebSocket;
  globalThis.WebSocket=class {
    constructor(){this.readyState=WebSocket.CONNECTING;}
    addEventListener(){}
  };
  t.after(()=>{globalThis.WebSocket=OriginalWebSocket;});
  gateway.retryTimer=null;
  assert.deepEqual(await gateway.ensure(),{connected:true,connecting:true,chatRuntime:CHAT_PIPELINE_RUNTIME});
});

