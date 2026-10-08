import test from 'node:test';
import assert from 'node:assert/strict';
import {DiscordGateway} from './discord-gateway.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,fetcher){
  t.mock.method(globalThis,'fetch',fetcher);
  const tasks=[];
  const host={env:{BOT_TOKEN:'test',GEMINI_API_KEY:'test',AI_REQUEST_LOG_ENABLED:'false'},ctx:{storage:{},waitUntil(p){tasks.push(p);}}};
  const gateway=new DiscordGateway(host);gateway.botId='bot';
  const mention=(id,channel)=>gateway.onGuildMessage({id,guild_id:'guild',channel_id:channel,author:{id:'user'},mentions:[{id:'bot'}],content:'<@bot> '+id});
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

test('same channel preserves ordering and an earlier completion cannot remove its successor',async t=>{
  let release;const blocked=new Promise(resolve=>release=resolve);t.after(release);const started=[];
  const {gateway,tasks,mention}=fixture(t,async(url,options)=>{
    if(url.includes('generativelanguage')){
      const text=JSON.parse(options.body).contents.at(-1).parts[0].text;started.push(text);
      if(text==='first')await blocked;
      return Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]});
    }
    return Response.json({});
  });
  mention('first','a');mention('second','a');await tick();
  assert.deepEqual(started,['first']);assert.equal(gateway.chatQueues.size,1);
  release();await Promise.all(tasks);
  assert.deepEqual(started,['first','second']);assert.equal(gateway.chatQueues.size,0);
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
