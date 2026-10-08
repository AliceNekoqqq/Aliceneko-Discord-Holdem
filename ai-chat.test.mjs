import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {BOT_KNOWLEDGE_MARKDOWN, getBotKnowledge} from "./bot-knowledge.mjs";
import {
  aiCommand,
  buildOpenAIChatRequest,
  buildGenerateContentRequest,
  generateGemini,
  GEMINI_MAX_RETRIES,
  discordImageParts,
  developerIdentityContext,
  getBotEmojiTokens,
  handleAiCommand,
  makeSystemInstruction,
  commentOnGameTransition,
  publicGameEvent,
  replyToMention,
  startTypingIndicator
} from "./ai-chat.mjs";
import { DiscordGateway } from "./discord-gateway.mjs";

test('chat waits 90 seconds on every attempt for text and images', async () => {
  const originalTimeout = AbortSignal.timeout;
  const deadlines = new WeakMap();
  AbortSignal.timeout = milliseconds => {
    const signal = new AbortController().signal;
    deadlines.set(signal, milliseconds);
    return signal;
  };
  try {
    for (const image of [false, true]) {
      let attempts = 0;
      const parts = image ? [{inlineData:{mimeType:'image/png',data:'iVBORw=='}}] : [{text:'你好'}];
      await generateGemini({GEMINI_API_KEY:'test',AI_REQUEST_LOG_ENABLED:'false'}, [{role:'user',parts}], 'chat', async (_url, options) => {
        assert.equal(deadlines.get(options.signal), 90000);
        if (++attempts === 1) throw new DOMException('slow upstream', 'TimeoutError');
        return Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]});
      }, [], '', async () => {});
      assert.equal(attempts, 2);
    }
    await generateGemini({GEMINI_API_KEY:'test',AI_REQUEST_LOG_ENABLED:'false'}, [{role:'user',parts:[{text:'开局'}]}], 'game', async (_url, options) => {
      assert.equal(deadlines.get(options.signal), 20000);
      return Response.json({candidates:[{content:{parts:[{text:'开局了。'}]}}]});
    });
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
});

test("split cloud persona reaches chat and game requests without a seam or truncation", async () => {
  const persona = "人设内容。\n".repeat(500);
  const env = {GEMINI_API_KEY:"test-key",GEMINI_API_BASE_URL:"https://example.test/v1",GEMINI_MODEL:"gemini-3.8-flash",GEMINI_PERSONA:persona.slice(0,1500),GEMINI_PERSONA_CONT:persona.slice(1500)};
  assert.ok(Buffer.byteLength(persona,"utf8") > 5120);
  for (const context of ["chat", "game"]) {
    await generateGemini(env,[{role:"user",parts:[{text:"test"}]}],context,async (_url,options) => {
      const body = JSON.parse(options.body);
      assert.ok(body.messages[0].content.includes(persona.trim()));
      return new Response(JSON.stringify({choices:[{message:{content:"完成。"},finish_reason:"stop"}]}),{status:200});
    });
  }
});

function fakeDb() {
  const state = {memoryEnabled:1,settingExists:false,persona:"",gameHost:0,hostFeatures:{host_commentary:0,host_start:0,host_results:0},history:[],channelHistory:[],channelMemory:new Map(),processed:new Set()};
  return {
    state,
    prepare(sql) {
      const query = {sql,args:[]};
      const channelKey=(guildId,channelId)=>`${guildId}:${channelId}`;
      return {
        query,
        bind(...args) { query.args=args; return this; },
        async first() {
          if (query.sql.includes("ai_member_settings")) return state.settingExists ? {memory_enabled:state.memoryEnabled} : null;
          if (query.sql.includes("ai_channel_memory_config")) {
            const enabled=state.channelMemory.get(channelKey(query.args[0],query.args[1]));
            return enabled===undefined?null:{enabled};
          }
          if (query.sql.includes("ai_guild_config")) return {persona:state.persona,game_host:state.gameHost,...state.hostFeatures};
          return null;
        },
        async run() {
          if (query.sql.includes("INSERT OR IGNORE INTO ai_processed_messages")) {
            const id=query.args[0];
            if(state.processed.has(id))return {meta:{changes:0}};
            state.processed.add(id);
          }
          if (query.sql.includes("ai_member_settings")) {state.memoryEnabled=query.args[2];state.settingExists=true;}
          if (query.sql.includes("INSERT INTO ai_channel_memory_config")) state.channelMemory.set(channelKey(query.args[0],query.args[1]),query.args[2]);
          if (query.sql.includes("DELETE FROM ai_chat_history")&&!query.sql.includes("id NOT IN")) {
            state.history=state.history.filter(row=>row.guild_id!==query.args[0]||row.user_id!==query.args[1]);
          }
          if (query.sql.includes("DELETE FROM ai_channel_chat_history")&&!query.sql.includes("id NOT IN")) {
            state.channelHistory=state.channelHistory.filter(row=>row.guild_id!==query.args[0]||
              (query.sql.includes("user_id = ?")?row.user_id!==query.args[1]:row.channel_id!==query.args[1]));
          }
          if (query.sql.includes("ai_guild_config") && query.sql.includes("persona")) state.persona=query.args[1];
          if (query.sql.includes("ai_guild_config") && query.sql.includes("host_commentary")) {
            state.gameHost=query.args[1];
            state.hostFeatures={host_commentary:query.args[2],host_start:query.args[3],host_results:query.args[4]};
          } else if (query.sql.includes("ai_guild_config") && query.sql.includes("game_host")) state.gameHost=query.args[1];
          return {meta:{changes:1}};
        },
        async all() {
          const isChannel=query.sql.includes("ai_channel_chat_history");
          const rows=(isChannel?state.channelHistory:state.history).filter(row=>isChannel
            ?row.guild_id===query.args[0]&&row.channel_id===query.args[1]
            :row.guild_id===query.args[0]&&row.user_id===query.args[1]);
          const limit=Number(query.args.at(-1))||30;
          return {results:rows.sort((a,b)=>Number(a.id||0)-Number(b.id||0)).slice(-limit).reverse()};
        }
      };
    },
    async batch(statements) {
      for(const statement of statements) {
        const {sql,args}=statement.query;
        if(sql.startsWith("INSERT INTO ai_chat_history")) state.history.push({guild_id:args[0],user_id:args[1],role:args[2],content:args[3],created_at:args[4],id:state.history.length+1});
        if(sql.startsWith("INSERT INTO ai_channel_chat_history")) state.channelHistory.push({guild_id:args[0],channel_id:args[1],user_id:args[2],role:args[3],content:args[4],speaker_name:args[5],created_at:args[6],id:state.channelHistory.length+1});
        if(sql.includes("DELETE FROM ai_chat_history")&&!sql.includes("id NOT IN")) state.history=state.history.filter(row=>row.guild_id!==args[0]||row.user_id!==args[1]);
        if(sql.includes("DELETE FROM ai_channel_chat_history")&&!sql.includes("id NOT IN")) state.channelHistory=state.channelHistory.filter(row=>row.guild_id!==args[0]||row.user_id!==args[1]);
        if(sql.includes("DELETE FROM ai_chat_history")&&sql.includes("id NOT IN")) {
          const limit=args.at(-1);
          const scoped=state.history.filter(row=>row.guild_id===args[0]&&row.user_id===args[1]);
          const retained=new Set(scoped.slice(-limit).map(row=>row.id));
          state.history=state.history.filter(row=>row.guild_id!==args[0]||row.user_id!==args[1]||retained.has(row.id));
        }
        if(sql.includes("DELETE FROM ai_channel_chat_history")&&sql.includes("id NOT IN")) {
          const limit=args.at(-1);
          const scoped=state.channelHistory.filter(row=>row.guild_id===args[0]&&row.channel_id===args[1]);
          const retained=new Set(scoped.slice(-limit).map(row=>row.id));
          state.channelHistory=state.channelHistory.filter(row=>row.guild_id!==args[0]||row.channel_id!==args[1]||retained.has(row.id));
        }
      }
      return {success:true};
    }
  };
}

test('Gemini retries rate limits with Retry-After and keeps the same model and prompt',async()=>{
  const waits=[],requests=[];
  const env={GEMINI_API_KEY:'test-key',GEMINI_API_BASE_URL:'https://example.test/v1',GEMINI_MODEL:'gemini-3.8-flash'};
  const answer=await generateGemini(env,[{role:'user',parts:[{text:'你好'}]}],'chat',async(url,options)=>{
    requests.push({url,body:options.body});
    if(requests.length===1)return new Response('',{status:429,headers:{'Retry-After':'7'}});
    if(requests.length===2)return new Response('',{status:503});
    return Response.json({choices:[{message:{content:'你好。'}}]});
  },[],'',async ms=>waits.push(ms));
  assert.equal(answer,'你好。');
  assert.deepEqual(waits,[7000,6000]);
  assert.equal(new Set(requests.map(r=>r.body)).size,1);
  assert.equal(JSON.parse(requests[0].body).model,'gemini-3.8-flash');
});

test('request monitoring stores every attempt and outcome with full context but no credentials',async t=>{
  const writes=[],events=[];let calls=0;
  t.mock.method(console,'info',(event,data)=>events.push({event,data}));
  const db={prepare(sql){return {bind(...args){return {async run(){writes.push({sql,args});return {success:true};}};}};}};
  const env={CHAT_DB:db,GEMINI_API_KEY:'secret-api-123',BOT_TOKEN:'secret-bot-456',GEMINI_API_BASE_URL:'https://example.test/v1',GEMINI_PERSONA:'完整人设'};
  const answer=await generateGemini(env,[{role:'user',parts:[{text:'上一轮'}]},{role:'model',parts:[{text:'上一轮回复。'}]},{role:'user',parts:[{text:'这一轮secret-api-123 secret-bot-456'}]}],'chat',async()=>{
    calls++;
    return calls===1?new Response('quota secret-api-123',{status:429}):Response.json({model:'actual-flash',usage:{total_tokens:50},choices:[{message:{content:'完成。'}}]});
  },[],'相关知识',async()=>{});
  assert.equal(answer,'完成。');
  const inserts=writes.filter(w=>w.sql.startsWith('INSERT'));
  const updates=writes.filter(w=>w.sql.startsWith('UPDATE'));
  assert.equal(inserts.length,2);
  assert.deepEqual(inserts.map(w=>w.args[2]),[1,2]);
  assert.equal(inserts[0].args[1],inserts[1].args[1]);
  const request=JSON.parse(inserts[0].args[6]);
  assert.match(request.messages[0].content,/完整人设/);
  assert.match(request.messages[0].content,/相关知识/);
  assert.equal(request.messages[1].content,'上一轮');
  assert.match(request.messages.at(-1).content,/\[REDACTED\]/);
  assert.deepEqual(updates.map(w=>w.args[0]),[429,200]);
  assert.equal(updates[1].args[3],'actual-flash');
  assert.equal(JSON.parse(updates[1].args[4]).total_tokens,50);
  const logged=JSON.stringify({writes,events});
  assert.equal(logged.includes(env.GEMINI_API_KEY),false);
  assert.equal(logged.includes(env.BOT_TOKEN),false);
  assert.equal(logged.includes('Authorization'),false);
});

test('request monitoring can be disabled without affecting generation',async t=>{
  t.mock.method(console,'info',()=>assert.fail('disabled logging'));
  const answer=await generateGemini({AI_REQUEST_LOG_ENABLED:'false',GEMINI_API_KEY:'test'},[],'chat',async()=>Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]}));
  assert.equal(answer,'完成。');
});

test('Discord images use multimodal OpenAI content, while ordinary chat stays text-only',()=>{
  const images=discordImageParts({attachments:[{url:'https://cdn.discordapp.com/attachments/123/456/photo.png?ex=abc&hm=def',content_type:'image/png',size:1234}]});
  assert.equal(images.length,1);
  const body=buildOpenAIChatRequest([{role:'user',parts:[{text:'看看这张'},...images]}]);
  assert.deepEqual(body.messages.at(-1).content,[{type:'text',text:'看看这张'},{type:'image_url',image_url:{url:images[0].imageUrl}}]);
  assert.equal(buildOpenAIChatRequest([{role:'user',parts:[{text:'你好'}]}]).messages.at(-1).content,'你好');
});

test('Discord attachment selection rejects untrusted URLs and unsupported or oversized files',()=>{
  const attachment={url:'https://cdn.discordapp.com/attachments/1/2/test.jpg',filename:'test.jpg',size:500};
  for(const patch of [{url:'http://cdn.discordapp.com/attachments/1/2/test.jpg'},{url:'https://evil.test/test.jpg'},{url:'https://cdn.discordapp.com.evil.test/attachments/1/2/test.jpg'},{content_type:'text/html'},{size:6*1024*1024}])assert.equal(discordImageParts({attachments:[{...attachment,...patch}]}).length,0);
  assert.equal(discordImageParts({attachments:[attachment]}).length,1);
  assert.equal(discordImageParts({attachments:Array.from({length:7},(_,n)=>({...attachment,url:`https://cdn.discordapp.com/attachments/1/${n}/test.jpg`}))}).length,4);
});

test('image-only mentions send real images and save no image URLs in conversational memory',async t=>{
  const db=fakeDb();const modelRequests=[],replies=[];
  const imageUrl='https://cdn.discordapp.com/attachments/1/2/photo.png?hm=signed';
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url===imageUrl)return new Response(Uint8Array.from([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
    if(url.includes('example.test')){modelRequests.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:'图里是一只猫。'}}]});}
    if(url.endsWith('/messages'))replies.push(JSON.parse(options.body));
    return new Response('{}');
  });
  await replyToMention({BOT_TOKEN:'bot-token',GEMINI_API_KEY:'api-key',GEMINI_API_BASE_URL:'https://example.test/v1',CHAT_DB:db,AI_REQUEST_LOG_ENABLED:'false'},
    {id:'image-only',guild_id:'g',channel_id:'c',author:{id:'u'},content:'<@bot>',attachments:[{url:imageUrl,content_type:'image/png',size:50}]},'bot');
  assert.equal(modelRequests.length,1);
  assert.equal(modelRequests[0].messages.at(-1).content[1].image_url.url,'data:image/png;base64,iVBORw==');
  assert.equal(replies[0].content,'图里是一只猫。');
  assert.match(db.state.history[0].content,/附带1张图片/);
  assert.equal(JSON.stringify(db.state.history).includes(imageUrl),false);
});

test('native Gemini receives inline image bytes instead of a Discord file URI',async()=>{
  const imageUrl='https://cdn.discordapp.com/attachments/1/2/photo.png';let captured;
  const bytes=Uint8Array.from([137,80,78,71]);
  await generateGemini({GEMINI_API_KEY:'api-key',AI_REQUEST_LOG_ENABLED:'false'},[{role:'user',parts:[{text:'看看'},...discordImageParts({attachments:[{url:imageUrl,content_type:'image/png',size:4}]})]}],'chat',async(url,options)=>{
    if(url===imageUrl)return new Response(bytes,{headers:{'Content-Type':'image/png'}});
    captured=JSON.parse(options.body);
    return Response.json({candidates:[{content:{parts:[{text:'完成。'}]}}]});
  });
  assert.deepEqual(captured.contents[0].parts[1],{inlineData:{mimeType:'image/png',data:'iVBORw=='}});
});

test('OpenAI image bytes are delivered inline and omitted from request diagnostic storage',async()=>{
  const calls=[],logs=[];
  const db={prepare(sql){return {bind(...params){if(sql.startsWith('INSERT INTO ai_request_logs'))logs.push(JSON.parse(params[6]));return {run:async()=>({})};}}}};
  const env={GEMINI_API_KEY:'test-secret',GEMINI_API_BASE_URL:'https://example.test/v1',CHAT_DB:db};
  await generateGemini(env,[{role:'user',parts:[{text:'识图'},{imageUrl:'https://cdn.discordapp.com/attachments/1/2/a.png',mimeType:'image/png'}]}],'chat',async(url,options)=>{
    calls.push(url);
    if(url.includes('cdn.discordapp.com')){assert.equal(options.redirect,'manual');return new Response(Uint8Array.from([137,80,78,71]));}
    const body=JSON.parse(options.body);
    assert.equal(body.messages.at(-1).content[1].image_url.url,'data:image/png;base64,iVBORw==');
    return Response.json({choices:[{message:{content:'章鱼。'}}]});
  });
  assert.equal(calls.length,2);
  assert.equal(logs[0].messages.at(-1).content[1].image_url.url,'[image binary omitted from diagnostic log]');
  assert.ok(!JSON.stringify(logs).includes('iVBORw=='));
});

test('image download uses Workers-compatible redirect handling and never follows a redirect',async()=>{
  let requests=0,waits=0;
  await assert.rejects(generateGemini({GEMINI_API_KEY:'test-key',GEMINI_API_BASE_URL:'https://example.test/v1',AI_REQUEST_LOG_ENABLED:'false'},[{role:'user',parts:[{imageUrl:'https://cdn.discordapp.com/attachments/1/2/a.png',mimeType:'image/png'}]}],'chat',async(_url,options)=>{
    requests++;
    if(options.redirect==='error')throw Error('Invalid redirect value');
    assert.equal(options.redirect,'manual');
    return new Response('',{status:302,headers:{Location:'https://untrusted.example/a.png'}});
  },[], '',async()=>{waits++;}),/image_redirect_rejected/);
  assert.equal(requests,1);assert.equal(waits,0);
});

test('Gemini stops after exactly three retries, including network and invalid replies',async()=>{
  const waits=[];let calls=0;
  await assert.rejects(generateGemini({GEMINI_API_KEY:'test'},[{role:'user',parts:[{text:'你好'}]}],'chat',async()=>{
    calls++;
    if(calls===1)throw new TypeError('network');
    if(calls===2)return new Response('invalid json');
    return Response.json({candidates:[]});
  },[],'',async ms=>waits.push(ms)),/gemini_empty_response/);
  assert.equal(GEMINI_MAX_RETRIES,3);
  assert.equal(calls,4);
  assert.deepEqual(waits,[3000,6000,12000]);
});

test('permanent API errors and blocked replies are not retried',async()=>{
  for(const response of [new Response('',{status:401}),new Response('',{status:405}),Response.json({promptFeedback:{blockReason:'SAFETY'}})]) {
    let calls=0;
    await assert.rejects(generateGemini({GEMINI_API_KEY:'test'},[],'chat',async()=>{calls++;return response;},[],'',async()=>assert.fail('unexpected retry')));
    assert.equal(calls,1);
  }
});

test('continuation requests share the three-retry failure budget',async()=>{
  let calls=0;const waits=[];
  const answer=await generateGemini({GEMINI_API_KEY:'test',GEMINI_API_BASE_URL:'https://example.test/v1'},[],'chat',async()=>{
    calls++;
    if(calls===1||calls>=3)return new Response('',{status:429});
    return Response.json({choices:[{message:{content:'然后'},finish_reason:'length'}]});
  },[],'',async ms=>waits.push(ms));
  assert.equal(calls,5);
  assert.equal(waits.length,3);
  assert.equal(answer,'然后…');
});

test('failed mentions remain silent, stop typing and never save failed conversations',async t=>{
  const db=fakeDb();let stopped=0;const replies=[];
  t.mock.method(globalThis,'setTimeout',callback=>{queueMicrotask(callback);return 0;});
  t.mock.method(globalThis,'setInterval',()=>123);
  t.mock.method(globalThis,'clearInterval',()=>{stopped++;});
  t.mock.method(console,'warn',()=>{});
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.includes('generativelanguage')){calls++;return new Response('',{status:429});}
    if(url.endsWith('/messages'))replies.push(JSON.parse(options.body));
    return new Response('{}');
  });
  const env={BOT_TOKEN:'test',GEMINI_API_KEY:'test',CHAT_DB:db};
  const message={id:'failed-message',guild_id:'g',channel_id:'c',author:{id:'u'},content:'<@bot> 你好'};
  assert.equal(await replyToMention(env,message,'bot'),true);
  assert.equal(calls,4);
  assert.equal(replies.length,0);
  assert.equal(stopped,1);
  assert.equal(db.state.history.length,0);
  assert.equal(db.state.channelHistory.length,0);
  await replyToMention(env,message,'bot');
  assert.equal(calls,4);
});

test('a mention replies once after recovery and saves only the valid answer',async t=>{
  const db=fakeDb(),replies=[];let calls=0;
  t.mock.method(globalThis,'setTimeout',callback=>{queueMicrotask(callback);return 0;});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.includes('generativelanguage')){
      calls++;
      return calls<3?new Response('',{status:429}):Response.json({candidates:[{content:{parts:[{text:'终于等到你啦。'}]}}]});
    }
    if(url.endsWith('/messages'))replies.push(JSON.parse(options.body));
    return new Response('{}');
  });
  await replyToMention({BOT_TOKEN:'test',GEMINI_API_KEY:'test',CHAT_DB:db},{id:'recovered',guild_id:'g',channel_id:'c',author:{id:'u'},content:'<@bot> 你好'},'bot');
  assert.equal(calls,3);
  assert.equal(replies.length,1);
  assert.equal(replies[0].content,'终于等到你啦。');
  assert.equal(db.state.history.length,2);
  assert.equal(db.state.history[1].content,'终于等到你啦。');
});

test("Gemini requests disable request storage and keep the key out of the URL", async () => {
  const body = buildGenerateContentRequest([{role:"user",parts:[{text:"你好"}]}],"爱讲冷笑话");
  assert.equal(body.store,false);
  assert.equal(body.contents[0].role,"user");
  assert.equal(body.generationConfig.maxOutputTokens,2048);
  assert.match(body.systemInstruction.parts[0].text,/每次都把意思说完整/); 
  assert.match(body.systemInstruction.parts[0].text,/爱讲冷笑话/);
  const env = {GEMINI_API_KEY:"test-secret",GEMINI_MODEL:"gemini-3.8-flash",GEMINI_PERSONA:"爱讲冷笑话"};
  let captured;
  const answer = await generateGemini(env,body.contents,"chat",async (url,options) => {
    captured={url,options};
    return Response.json({candidates:[{content:{parts:[{text:"你好呀"}]}}]});
  });
  assert.equal(answer,"你好呀");
  assert.equal(captured.url.includes(env.GEMINI_API_KEY),false);
  assert.equal(captured.options.headers["x-goog-api-key"],env.GEMINI_API_KEY);
  assert.equal(JSON.parse(captured.options.body).store,false);
});

test("custom Gemini gateway uses OpenAI chat completions with memory and persona", async () => {
  const history = [
    {role:"user",parts:[{text:"第一句"}]},
    {role:"model",parts:[{text:"上一轮回复"}]},
    {role:"user",parts:[{text:"接着说"}]}
  ];
  const built = buildOpenAIChatRequest(history,"爱讲冷笑话");
  assert.deepEqual(built.messages.map(message=>message.role),["system","user","assistant","user"]);
  assert.match(built.messages[0].content,/爱讲冷笑话/);
  assert.equal(built.messages[2].content,"上一轮回复");
  assert.equal(built.max_tokens,2048);
  assert.equal(built.stream,false);

  const env = {
    GEMINI_API_KEY:"test-secret",
    GEMINI_API_BASE_URL:"https://gcli.ggchan.dev/v1/",
    GEMINI_MODEL:"gemini-3.8-flash",
    GEMINI_PERSONA:"爱讲冷笑话"
  };
  let captured;
  const answer = await generateGemini(env,history,"chat",async (url,options) => {
    captured={url,options};
    return Response.json({choices:[{message:{content:"接着聊"}}]});
  });
  assert.equal(answer,"接着聊");
  assert.equal(captured.url,"https://gcli.ggchan.dev/v1/chat/completions");
  assert.equal(captured.options.headers.Authorization,"Bearer test-secret");
  const request = JSON.parse(captured.options.body);
  assert.equal(request.model,"gemini-3.8-flash");
  assert.equal(request.messages.length,4);
  assert.match(request.messages[0].content,/爱讲冷笑话/);
  assert.equal(request.messages[2].role,"assistant");
  assert.equal(request.messages[2].content,"上一轮回复");
  assert.equal(captured.url.includes("test-secret"),false);
});

test("incomplete Chinese chat replies continue from the cutoff without repeating", async () => {
  const env={
    GEMINI_API_KEY:"test-secret",
    GEMINI_API_BASE_URL:"https://gcli.ggchan.dev/v1/",
    GEMINI_MODEL:"gemini-3.8-flash"
  };
  const requests=[];
  const answers=[
    {choices:[{message:{content:"UNO 其实很简单，最先打光手牌就"},finish_reason:"stop"}]},
    {choices:[{message:{content:"能获胜。"},finish_reason:"stop"}]}
  ];
  const answer=await generateGemini(env,[{role:"user",parts:[{text:"UNO 怎么玩？"}]}],"chat",async (url,options)=>{
    requests.push(JSON.parse(options.body));
    return Response.json(answers.shift());
  });
  assert.equal(answer,"UNO 其实很简单，最先打光手牌就能获胜。");
  assert.equal(requests.length,2);
  assert.match(requests[1].messages.at(-1).content,/紧接停止处继续/);
  assert.equal(requests[1].max_tokens,2048);
});

test("provider token-limit finish reasons trigger a continuation", async () => {
  const openAIEnv={
    GEMINI_API_KEY:"test-secret",
    GEMINI_API_BASE_URL:"https://gcli.ggchan.dev/v1/"
  };
  let openAICalls=0;
  const openAIAnswer=await generateGemini(openAIEnv,[{role:"user",parts:[{text:"介绍 UNO"}]}],"chat",async ()=>{
    openAICalls++;
    return Response.json({choices:[{message:{content:openAICalls===1?"UNO 的目标是先出完手牌":"，再根据颜色或数字出牌。"},finish_reason:openAICalls===1?"length":"stop"}]});
  });
  assert.equal(openAICalls,2);
  assert.equal(openAIAnswer,"UNO 的目标是先出完手牌，再根据颜色或数字出牌。");

  let completedCalls=0;
  const completedAnswer=await generateGemini(openAIEnv,[{role:"user",parts:[{text:"介绍 UNO"}]}],"chat",async ()=>{
    completedCalls++;
    return Response.json({choices:[{message:{content:"UNO 很简单。"},finish_reason:"length"}]});
  });
  assert.equal(completedCalls,1);
  assert.equal(completedAnswer,"UNO 很简单。");

  const nativeEnv={GEMINI_API_KEY:"test-secret"};
  let nativeCalls=0;
  const nativeAnswer=await generateGemini(nativeEnv,[{role:"user",parts:[{text:"介绍 UNO"}]}],"chat",async ()=>{
    nativeCalls++;
    return Response.json({candidates:[{
      content:{parts:[{text:nativeCalls===1?"UNO 的目标是先出完手牌":"，并在最后一张牌前喊 UNO。"}]},
      finishReason:nativeCalls===1?"MAX_TOKENS":"STOP"
    }]});
  });
  assert.equal(nativeCalls,2);
  assert.equal(nativeAnswer,"UNO 的目标是先出完手牌，并在最后一张牌前喊 UNO。");
});

test("chat uses at most one paid continuation request", async () => {
  const env={
    GEMINI_API_KEY:"test-secret",
    GEMINI_API_BASE_URL:"https://gcli.ggchan.dev/v1/"
  };
  let calls=0;
  const answer=await generateGemini(env,[{role:"user",parts:[{text:"UNO 怎么玩？"}]}],"chat",async ()=>{
    calls++;
    return Response.json({choices:[{message:{
      content:calls===1?"UNO 的目标是先把手牌打完":"再根据颜色或数字匹配",
    },finish_reason:"length"}]});
  });
  assert.equal(calls,2);
  assert.equal(answer,"UNO 的目标是先把手牌打完再根据颜色或数字匹配…");
});

test("system instruction protects private cards and excludes admin assistance", () => {
  const prompt = makeSystemInstruction("活泼");
  assert.match(prompt,/私密手牌/);
  assert.match(prompt,/不要充当管理员助手/);
  assert.match(prompt,/以红豆粉的身份自然聊天/);
  assert.match(prompt,/活泼/);
});

test("ordinary chat simulates the tavern naturally without repeating stage directions", () => {
  const prompt=makeSystemInstruction("");
  assert.match(prompt,/默认模拟发生在小酒馆里的谈话/);
  assert.match(prompt,/不要每条回复都写动作/);
  assert.match(prompt,/不要假定用户现实中身处店内/);
  assert.match(makeSystemInstruction("","game"),/结算时明确宣布给出的胜者或结果/);
});

test("AI replies collapse redundant blank lines but keep single line breaks", async () => {
  const answer=await generateGemini(
    {GEMINI_API_KEY:"test-secret"},
    [{role:"user",parts:[{text:"分两段回答"}]}],
    "chat",
    async ()=>Response.json({candidates:[{content:{parts:[{text:"第一段。\n\n\n第二段。\n第三行。"}]}}]})
  );
  assert.equal(answer,"第一段。\n第二段。\n第三行。");
  assert.match(makeSystemInstruction(""),/段与段之间不要留空行/);
});

test("bot knowledge retrieval adds relevant authoritative facts only", () => {
  const unoKnowledge=getBotKnowledge("UNO 的 +2 可以叠 +4 吗？");
  assert.match(unoKnowledge,/默认混合叠加：\+2 可接 \+2 或 \+4/);
  assert.doesNotMatch(unoKnowledge,/小盲 10/);
  const chatPrompt=makeSystemInstruction("红豆粉","chat",[],unoKnowledge);
  assert.match(chatPrompt,/机器人功能索引/);
  assert.match(chatPrompt,/权威知识条目/);
  assert.match(chatPrompt,/正常回复末尾不要自动添加记忆说明/);
  assert.doesNotMatch(makeSystemInstruction("红豆粉","game",[],unoKnowledge),/默认混合叠加/);
  assert.match(chatPrompt,/没有自然语言管理员助手/);
  for (const [question, expected] of [
    ["德州扑克小盲和边池怎么算", "德州扑克"],
    ["抽鬼牌输了会改名多久", "抽鬼牌"],
    ["怎么关闭我的聊天记忆", "对话记忆"],
    ["怎么开游戏主持", "AI 游戏主持"],
    ["UNO头像能用机器人上传的表情吗", "个人座位设置"],
    ["UNO排行榜第一名能领身份组吗", "排行榜"]
  ]) assert.match(getBotKnowledge(question),new RegExp(expected));
  assert.match(getBotKnowledge("你都能干嘛"),/功能总览与命令/);
  assert.match(getBotKnowledge("可以用我上传的表情吗"),/自定义应用表情/);
  assert.match(getBotKnowledge("AI 会保存我和它的对话吗"),/最多保留最近 30 条消息/);
  assert.match(getBotKnowledge("我想清除聊天记录"),/个人记忆和频道共享记忆/);
  assert.match(getBotKnowledge("本频道有共享记忆吗"),/默认关闭/);
  assert.match(getBotKnowledge("管理员怎么开启当前频道的总上下文记忆"),/\/ai 频道记忆 开启/);
  assert.match(getBotKnowledge(["我们在玩 UNO", "这桌最多几个人？"]),/2～10 人|2–10 人/);
});

test("developer identity and Red Bean Powder OC facts are retrieved only when relevant", () => {
  const identity=getBotKnowledge("谁开发了你？红豆粉和你是什么关系？");
  assert.match(identity,/开发者与原创角色创作者/);
  assert.match(identity,/红豆粉/);
  assert.match(identity,/亲近的姐姐/);
  const sibling=getBotKnowledge("开发者是你的姐姐吗？");
  assert.match(sibling,/亲近的姐姐/);
  assert.match(sibling,/自然聊天/);
  const profile=getBotKnowledge("红豆粉的生日、身高和性格设定是什么？");
  assert.match(profile,/18 岁/);
  assert.match(profile,/167cm/);
  assert.match(profile,/7 月 7 日/);
  assert.match(profile,/讨好型倾向/);
  const tavern=getBotKnowledge("外婆为什么叫她红豆粉？小酒馆在什么地方？");
  assert.match(tavern,/临河小城的旧街/);
  assert.match(tavern,/红豆甜点/);
  assert.doesNotMatch(getBotKnowledge("UNO 怎么开局？"),/167cm/);
  const chatInstruction=makeSystemInstruction("","chat");
  assert.match(chatInstruction,/人格源自开发者红豆粉本人/);
  assert.match(chatInstruction,/亲近的姐姐/);
  assert.doesNotMatch(getBotKnowledge("UNO 怎么开局？"),/姐姐/);
  const aliases=getBotKnowledge("♡aliceneko♡ 是谁？");
  assert.match(aliases,/.aliceneko/);
  assert.match(aliases,/♡aliceneko♡/);
  assert.match(aliases,/不能用于验证当前发言者/);
  assert.doesNotMatch(makeSystemInstruction("","game",[],identity),/167cm/);
});

test("developer account identity uses an exact local Discord User ID match", async t => {
  const ownerId="112233445566778899";
  const verified=developerIdentityContext({DEVELOPER_DISCORD_USER_ID:ownerId},{author:{id:ownerId}});
  assert.match(verified,/身份已确认/);
  assert.match(verified,/开发者红豆粉/);
  assert.doesNotMatch(verified,new RegExp(ownerId));
  const impostor=developerIdentityContext({DEVELOPER_DISCORD_USER_ID:ownerId},{
    author:{id:"123456789012345678",username:"♡aliceneko♡",global_name:"红豆粉"},
    member:{nick:".aliceneko"}
  });
  assert.match(impostor,/身份未匹配/);
  assert.match(impostor,/不要把当前发言者与她混为一人/);
  assert.doesNotMatch(impostor,new RegExp(ownerId));
  assert.match(developerIdentityContext({}, {author:{id:ownerId}}),/尚未有效配置/);

  const calls=[];
  const guildId="333333333333333333",channelId="444444444444444444";
  t.mock.method(globalThis,"setInterval",()=>123);
  t.mock.method(globalThis,"clearInterval",()=>{});
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    const target=String(url);
    calls.push({url:target,options});
    if(target==="https://example.test/v1/chat/completions") {
      return Response.json({choices:[{message:{content:"姐姐，记得啦。"},finish_reason:"stop"}]});
    }
    if(target==="https://discord.com/api/v10/guilds/"+guildId)return Response.json({id:guildId,owner_id:"555555555555555555"});
    if(target==="https://discord.com/api/v10/guilds/"+guildId+"/roles")return Response.json([{id:guildId,permissions:"1024"}]);
    if(target==="https://discord.com/api/v10/channels/"+channelId)return Response.json({id:channelId,guild_id:guildId,type:0,permission_overwrites:[]});
    if(target==="https://discord.com/api/v10/guilds/"+guildId+"/members?limit=1000")return Response.json([{user:{id:ownerId,username:"♡aliceneko♡",global_name:"红豆粉"},nick:".aliceneko",roles:[]}]);
    return Response.json({});
  });
  const env={BOT_TOKEN:"test",GEMINI_API_KEY:"test",GEMINI_API_BASE_URL:"https://example.test/v1",DEVELOPER_DISCORD_USER_ID:ownerId};
  for (const [messageId,author] of [
    ["owner",{id:ownerId,username:"♡aliceneko♡",global_name:"红豆粉"}],
    ["impostor",{id:"123456789012345678",username:"♡aliceneko♡",global_name:"红豆粉"}]
  ]) {
    await replyToMention(env,{id:messageId,guild_id:guildId,channel_id:channelId,author,member:{nick:".aliceneko"},content:"<@bot> 你好"},"bot");
  }
  const requests=calls.filter(call=>call.url==="https://example.test/v1/chat/completions").map(call=>JSON.parse(call.options.body));
  assert.equal(requests.length,2);
  assert.match(requests[0].messages[0].content,/身份已确认/);
  assert.match(requests[1].messages[0].content,/身份未匹配/);
  assert.match(requests[0].messages[0].content,/\[开发者账号\]/);
  for (const request of requests) {
    assert.equal(request.messages.at(-1).content,'你好');
    assert.match(request.messages[0].content,/不是当前用户发送的正文/);
    assert.match(request.messages[0].content,/服务器当前时间/);
  }
  for (const request of requests) assert.doesNotMatch(JSON.stringify(request),new RegExp(ownerId));
});

test("published knowledge document is generated from the Worker knowledge source", async () => {
  const document=await readFile(new URL("./BOT_KNOWLEDGE.md",import.meta.url),"utf8");
  assert.equal(document,BOT_KNOWLEDGE_MARKDOWN);
});

test("AI command exposes member memory, channel memory and independently configurable host features", () => {
  const groups = aiCommand.options.map(group=>group.name);
  assert.deepEqual(groups,["记忆","频道记忆","主持"]);
  assert.equal(groups.includes("管理员助手"),false);
  assert.equal(groups.includes("人格"),false);
  assert.deepEqual(aiCommand.options.find(group=>group.name==="频道记忆").options.map(option=>option.name),["查看","开启","关闭","清除"]);
  const host=aiCommand.options.find(group=>group.name==="主持");
  const featureCommand=host.options.find(option=>option.name==="功能");
  assert.deepEqual(featureCommand.options.map(option=>option.name),["实时吐槽","开局播报","宣布结果"]);
  assert.ok(featureCommand.options.every(option=>option.type===5));
});

test("AI host feature settings update only selected toggles", async () => {
  const db=fakeDb();
  const reply=await handleAiCommand({CHAT_DB:db},{
    guild_id:"guild-1",
    member:{user:{id:"admin-1"},permissions:"40"},
    data:{options:[{name:"主持",options:[{name:"功能",options:[
      {name:"实时吐槽",value:true},
      {name:"宣布结果",value:true}
    ]}]}]}
  });
  assert.deepEqual(db.state.hostFeatures,{host_commentary:1,host_start:0,host_results:1});
  assert.match(reply.data.content,/已更新：实时吐槽、宣布结果/);
  assert.match(reply.data.content,/开局播报：关闭/);
  const allOff=await handleAiCommand({CHAT_DB:db},{
    guild_id:"guild-1",
    member:{user:{id:"admin-1"},permissions:"40"},
    data:{options:[{name:"主持",options:[{name:"关闭"}]}]}
  });
  assert.deepEqual(db.state.hostFeatures,{host_commentary:0,host_start:0,host_results:0});
  assert.match(allOff.data.content,/一键关闭全部/);
});

test("memory off control changes only the calling member setting", async () => {
  const db = fakeDb();
  const reply = await handleAiCommand({CHAT_DB:db},{
    guild_id:"guild-1",
    member:{user:{id:"user-1"},permissions:"0"},
    data:{options:[{name:"记忆",options:[{name:"关闭"}]}]}
  });
  assert.equal(db.state.memoryEnabled,0);
  assert.match(reply.data.content,/已关闭/);
  assert.equal(reply.data.flags,64);
});

test("channel memory is off by default, scoped to the current channel, and admin controlled", async () => {
  const db=fakeDb();
  const interaction=(action,permissions="0",channelId="channel-1")=>({
    guild_id:"guild-1",channel_id:channelId,
    member:{user:{id:"member-1"},permissions},
    data:{options:[{name:"频道记忆",options:[{name:action}]}]}
  });
  const status=await handleAiCommand({CHAT_DB:db},interaction("查看"));
  assert.match(status.data.content,/已关闭/);
  const denied=await handleAiCommand({CHAT_DB:db},interaction("开启"));
  assert.match(denied.data.content,/管理服务器/);
  assert.equal(db.state.channelMemory.size,0);
  const enabled=await handleAiCommand({CHAT_DB:db},interaction("开启","40"));
  assert.match(enabled.data.content,/已开启当前频道/);
  assert.equal(db.state.channelMemory.get("guild-1:channel-1"),1);
  const otherChannel=await handleAiCommand({CHAT_DB:db},interaction("查看","0","channel-2"));
  assert.match(otherChannel.data.content,/已关闭/);
  db.state.channelHistory.push({guild_id:"guild-1",channel_id:"channel-1",user_id:"u1",role:"user",content:"旧内容",id:1});
  const cleared=await handleAiCommand({CHAT_DB:db},interaction("清除","40"));
  assert.match(cleared.data.content,/已清除/);
  assert.equal(db.state.channelHistory.length,0);
  assert.equal(db.state.channelMemory.get("guild-1:channel-1"),1);
});

test("clearing personal memory also removes that member from channel memory", async () => {
  const db=fakeDb();
  db.state.history.push({guild_id:"guild-1",user_id:"member-1",role:"user",content:"个人内容"});
  db.state.channelHistory.push(
    {guild_id:"guild-1",channel_id:"channel-1",user_id:"member-1",role:"user",content:"共享内容"},
    {guild_id:"guild-1",channel_id:"channel-1",user_id:"other",role:"user",content:"他人内容"}
  );
  const reply=await handleAiCommand({CHAT_DB:db},{
    guild_id:"guild-1",channel_id:"channel-1",member:{user:{id:"member-1"},permissions:"0"},
    data:{options:[{name:"记忆",options:[{name:"清除"}]}]}
  });
  assert.match(reply.data.content,/长期记忆、个人对话和频道共享记忆/);
  assert.deepEqual(db.state.history,[]);
  assert.deepEqual(db.state.channelHistory.map(row=>row.user_id),["other"]);
});

test("full multiline cloud persona is preserved in the shared system instruction", () => {
  const profile="# 红豆粉｜完整人设\n## 基本资料\n姓名：红豆粉\n"+("人物细节".repeat(400));
  const prompt=makeSystemInstruction(profile);
  assert.match(prompt,/# 红豆粉｜完整人设\n## 基本资料\n姓名：红豆粉/);
  assert.ok(prompt.includes("人物细节".repeat(400)));
  assert.ok([...profile].length>1000);
});

test("uploaded bot emojis are validated and supplied as real Discord markup", async () => {
  let request;
  const env={TABLES:{
    idFromName(name){assert.equal(name,"system-emojis");return "emoji-do";},
    get(id){assert.equal(id,"emoji-do");return {async fetch(url,options){
      request={url,options};
      return Response.json({items:[
        {id:"123456789",name:"redbean",animated:false},
        {id:"234567890",name:"dance",animated:true},
        {id:"345678901",name:"bad name"},
        {id:"456789012",name:"removed",available:false},
        {id:"123456789",name:"duplicate",animated:true}
      ]});
    }};}
  }};
  const tokens=await getBotEmojiTokens(env);
  assert.deepEqual(tokens,["<:redbean:123456789>","<a:dance:234567890>"]);
  assert.equal(request.url,"https://internal");
  assert.equal(JSON.parse(request.options.body).op,"appEmojis");
  const prompt=makeSystemInstruction("红豆粉","chat",tokens);
  assert.match(prompt,/<:redbean:123456789>/);
  assert.match(prompt,/<a:dance:234567890>/);
});

test("legacy persona command is not available in Discord", async () => {
  const db=fakeDb();
  const reply=await handleAiCommand({CHAT_DB:db},{
    guild_id:"guild-1",
    member:{user:{id:"user-1"},permissions:"40"},
    data:{options:[]}
  });
  assert.match(reply.data.content,/使用 \/ai 记忆、\/ai 频道记忆 或 \/ai 主持/);
  assert.equal(db.state.persona,"");
});

test("public game events include only public summaries", () => {
  const before={game:"poker",epoch:"e",version:3,handNo:0,phase:"lobby",players:[]};
  const after={
    game:"poker",epoch:"e",version:4,handNo:1,phase:"preflop",
    players:[{id:"1",name:"小明",cards:[1,2],stack:500}],
    deck:Array.from({length:40},()=>52),
    showdown:[{cards:[3,4]}]
  };
  const event=publicGameEvent(before,after);
  assert.match(event.text,/小明/);
  assert.equal(JSON.stringify(event).includes("cards"),false);
  assert.equal(JSON.stringify(event).includes("deck"),false);
  assert.equal(JSON.stringify(event).includes("showdown"),false);
});

test("host feature gates announce results independently from live commentary", async t => {
  const db=fakeDb();
  db.state.hostFeatures={host_commentary:0,host_start:0,host_results:1};
  const calls=[];
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    calls.push({url,options});
    if(String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      return Response.json({candidates:[{content:{parts:[{text:"小明赢下了这一局。"}]}}]});
    }
    return new Response("{}",{status:200});
  });
  const env={BOT_TOKEN:"test",GEMINI_API_KEY:"test",CHAT_DB:db};
  const storage={state:null,async get(){return this.state;},async put(_key,value){this.state=value;}};
  const before={game:"poker",guild:"g1",channel:"c1",epoch:"e1",version:1,handNo:1,phase:"river",players:[],log:["河牌"]};
  const settled={...before,version:2,phase:"settled",players:[{id:"u1",name:"小明"}],settlements:[{label:"小明",net:20}]};
  assert.equal(await commentOnGameTransition(env,storage,before,settled),true);
  const sent=calls.find(call=>String(call.url).includes("/channels/c1/messages"));
  assert.ok(sent);
  assert.match(sent.options.body,/小明赢下了这一局/);

  const active={...settled,version:3,phase:"turn",log:["小明加注"]};
  const action={...active,version:4,log:["小红跟注"]};
  const callCount=calls.length;
  assert.equal(await commentOnGameTransition(env,storage,active,action),false);
  assert.equal(calls.length,callCount);
});

test("typing indicator refreshes while waiting and stops when the request finishes", async t => {
  const calls=[];
  let refresh;
  let cleared=false;
  t.mock.method(globalThis,"setInterval",(callback,ms)=>{
    assert.equal(ms,8000);
    refresh=callback;
    return 42;
  });
  t.mock.method(globalThis,"clearInterval",timer=>{
    assert.equal(timer,42);
    cleared=true;
  });
  const stop=startTypingIndicator({BOT_TOKEN:"test-token"},"channel-1",async (url,options)=>{
    calls.push({url,options});
    return new Response(null,{status:204});
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://discord.com/api/v10/channels/channel-1/typing");
  assert.equal(calls[0].options.method,"POST");
  assert.equal(calls[0].options.headers.Authorization,"Bot test-token");
  refresh();
  assert.equal(calls.length,2);
  stop();
  assert.equal(cleared,true);
  refresh();
  assert.equal(calls.length,2);
});

test("Gateway replies to direct mentions and ignores ordinary guild messages", async t => {
  const sent=[];
  t.mock.method(globalThis,"fetch",async (url,options)=> {
    sent.push({url,body:JSON.parse(options.body)});
    return url.includes('generativelanguage')?Response.json({candidates:[{content:{parts:[{text:'你好。'}]}}]}):new Response("{}",{status:200});
  });
  const tasks=[];
  const host={env:{BOT_TOKEN:"test-token",GEMINI_API_KEY:"test-key"},ctx:{storage:{async put(){},async get(){return null;},async delete(){}},waitUntil(p){tasks.push(p);}}};
  const gateway=new DiscordGateway(host);
  gateway.botId="bot-1";
  gateway.onGuildMessage({id:"m1",guild_id:"g",channel_id:"c",author:{id:"u"},content:"hi"});
  assert.equal(tasks.length,0);
  gateway.onGuildMessage({id:"m2",guild_id:"g",channel_id:"c",author:{id:"u"},content:"<@bot-1> 你好",mentions:[{id:"bot-1"}]});
  assert.equal(tasks.length,1);
  await Promise.all(tasks);
  const replies=sent.filter(item=>item.url.endsWith('/messages'));
  assert.equal(replies.length,1);
  assert.equal(replies[0].url,"https://discord.com/api/v10/channels/c/messages");
  assert.deepEqual(replies[0].body.allowed_mentions,{parse:[]});
  assert.equal(replies[0].body.message_reference.message_id,"m2");
});

test("Gateway identifies with only non-privileged guild and message intents", async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,"WebSocket");
  class FakeWebSocket {
    static OPEN=1;
    static CONNECTING=0;
    constructor(url) { this.url=url;this.readyState=1;this.listeners={};this.sent=[];FakeWebSocket.last=this; }
    addEventListener(name,fn) { this.listeners[name]=fn; }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState=3; }
  }
  Object.defineProperty(globalThis,"WebSocket",{configurable:true,value:FakeWebSocket});
  t.after(()=> {
    if(previous)Object.defineProperty(globalThis,"WebSocket",previous);
    else delete globalThis.WebSocket;
  });
  const tasks=[];
  const host={env:{BOT_TOKEN:"test"},ctx:{storage:{async put(){},async get(){return null;},async delete(){}},waitUntil(p){tasks.push(p);}}};
  const gateway=new DiscordGateway(host);
  await gateway.ensure();
  const socket=FakeWebSocket.last;
  assert.match(socket.url,/gateway\.discord\.gg/);
  socket.listeners.message({data:JSON.stringify({op:10,d:{heartbeat_interval:45000}})});
  await Promise.all(tasks);
  const identify=socket.sent.find(packet=>packet.op===2);
  assert.ok(identify);
  assert.equal(identify.d.intents,(1<<0)|(1<<9));
  assert.equal((identify.d.intents&(1<<15))===0,true);
  gateway.clearHeartbeats();
});

test("chat memory is scoped to one member and stores only successful direct chats", async t => {
  const db=fakeDb();
  const calls=[];
  const env={
    BOT_TOKEN:"test",
    GEMINI_API_KEY:"test",
    GEMINI_PERSONA:"# 红豆粉｜完整人设\n姓名：红豆粉\n语气自然、简洁。",
    CHAT_DB:db,
    TABLES:{
      idFromName(name){return name;},
      get(){return {async fetch(){return Response.json({items:[{id:"123456789",name:"redbean",animated:false}]});}};}
    }
  };
  t.mock.method(globalThis,"fetch",async (url,options) => {
    calls.push({url,options});
    if(String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      return Response.json({candidates:[{content:{parts:[{text:"嗨，记住啦。"}]}}]});
    }
    return new Response("{}",{status:200});
  });
  await replyToMention(env,{
    id:"m1",guild_id:"g1",channel_id:"c1",author:{id:"u1"},content:"<@bot-1> 我喜欢蓝色"
  },"bot-1");
  assert.equal(db.state.history.length,2);
  assert.equal(db.state.history[0].guild_id,"g1");
  assert.equal(db.state.history[0].user_id,"u1");
  assert.equal(db.state.history[0].content,"我喜欢蓝色");
  assert.equal(JSON.parse(calls[2].options.body).content,"嗨，记住啦。");
  assert.equal(calls[0].url,"https://discord.com/api/v10/channels/c1/typing");
  assert.doesNotMatch(calls[2].options.body,/会保存最近 30 条/);
  const request=JSON.parse(calls[1].options.body);
  assert.equal(request.contents.at(-1).parts[0].text,"我喜欢蓝色");
  assert.match(request.systemInstruction.parts[0].text,/# 红豆粉｜完整人设\n姓名：红豆粉/);
  assert.match(request.systemInstruction.parts[0].text,/<:redbean:123456789>/);

  db.state.memoryEnabled=0;
  db.state.settingExists=true;
  const before=db.state.history.length;
  await replyToMention(env,{
    id:"m2",guild_id:"g1",channel_id:"c1",author:{id:"u1"},content:"<@bot-1> 这条不要保存"
  },"bot-1");
  assert.equal(db.state.history.length,before);
  const secondRequest=JSON.parse(calls[4].options.body);
  assert.equal(secondRequest.contents.length,1);
});

test("channel memory combines channel and personal context, with speaker labels", async t => {
  const db=fakeDb();
  db.state.channelMemory.set("g1:c1",1);
  db.state.history.push(
    {guild_id:"g1",user_id:"u2",role:"user",content:"我之前的个人话题",created_at:10,id:1},
    {guild_id:"g1",user_id:"u2",role:"model",content:"个人记忆回复",created_at:11,id:2}
  );
  db.state.channelHistory.push(
    {guild_id:"g1",channel_id:"c1",user_id:"u1",role:"user",content:"我们刚才在聊 UNO",speaker_name:"小明",created_at:20,id:1},
    {guild_id:"g1",channel_id:"c1",user_id:"u1",role:"model",content:"这里的共享上下文",speaker_name:"",created_at:21,id:2}
  );
  const calls=[];
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    calls.push({url,options});
    if(String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      return Response.json({candidates:[{content:{parts:[{text:"接着聊吧。"}]}}]});
    }
    return new Response("{}",{status:200});
  });
  await replyToMention({BOT_TOKEN:"test",GEMINI_API_KEY:"test",CHAT_DB:db},{
    id:"m3",guild_id:"g1",channel_id:"c1",author:{id:"u2",username:"小红"},content:"<@bot-1> 那后来呢？"
  },"bot-1");
  const request=JSON.parse(calls.find(call=>String(call.url).startsWith("https://generativelanguage.googleapis.com/")).options.body);
  assert.deepEqual(request.contents.map(item=>item.parts[0].text),[
    "我之前的个人话题","个人记忆回复","【小明】我们刚才在聊 UNO","这里的共享上下文","【小红】那后来呢？"
  ]);
  assert.equal(db.state.history.length,4);
  assert.equal(db.state.channelHistory.length,4);
  assert.equal(db.state.channelHistory[2].speaker_name,"小红");
});

test("member memory opt-out prevents their messages entering shared channel memory", async t => {
  const db=fakeDb();
  db.state.channelMemory.set("g1:c1",1);
  db.state.memoryEnabled=0;
  db.state.settingExists=true;
  db.state.channelHistory.push(
    {guild_id:"g1",channel_id:"c1",user_id:"u1",role:"user",content:"别人留下的上下文",speaker_name:"小明",created_at:20,id:1},
    {guild_id:"g1",channel_id:"c1",user_id:"u1",role:"model",content:"之前的回答",speaker_name:"",created_at:21,id:2}
  );
  const calls=[];
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    calls.push({url,options});
    if(String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      return Response.json({candidates:[{content:{parts:[{text:"收到。"}]}}]});
    }
    return new Response("{}",{status:200});
  });
  await replyToMention({BOT_TOKEN:"test",GEMINI_API_KEY:"test",CHAT_DB:db},{
    id:"m4",guild_id:"g1",channel_id:"c1",author:{id:"u2",username:"小红"},content:"<@bot-1> 不要记住这句"
  },"bot-1");
  const request=JSON.parse(calls.find(call=>String(call.url).startsWith("https://generativelanguage.googleapis.com/")).options.body);
  assert.deepEqual(request.contents.map(item=>item.parts[0].text),[
    "【小明】别人留下的上下文","之前的回答","【小红】不要记住这句"
  ]);
  assert.equal(db.state.history.length,0);
  assert.equal(db.state.channelHistory.length,2);
});

test("direct chats receive only the feature knowledge relevant to the question", async t => {
  const calls=[];
  t.mock.method(globalThis,"fetch",async (url,options) => {
    calls.push({url,options});
    if(String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      return Response.json({candidates:[{content:{parts:[{text:"可以呀。"}]}}]});
    }
    return new Response("{}",{status:200});
  });
  await replyToMention({BOT_TOKEN:"test",GEMINI_API_KEY:"test"},{
    id:"uno-question",guild_id:"g1",channel_id:"c1",author:{id:"u1"},content:"<@bot-1> UNO 的 +2 可以叠 +4 吗？"
  },"bot-1");
  const request=JSON.parse(calls[1].options.body);
  assert.match(request.systemInstruction.parts[0].text,/默认混合叠加：\+2 可接 \+2 或 \+4/);
  assert.doesNotMatch(request.systemInstruction.parts[0].text,/起始虚拟筹码 2,000/);
  assert.equal(JSON.parse(calls[2].options.body).content,"可以呀。");
});

test("recent chat context resolves follow-up questions about the current game", async t => {
  const db=fakeDb();
  db.state.history.push(
    {guild_id:"g1",user_id:"u1",role:"user",content:"我们来玩 UNO 吧"},
    {guild_id:"g1",user_id:"u1",role:"model",content:"好呀，准备开桌！"}
  );
  const calls=[];
  const env={BOT_TOKEN:"test",GEMINI_API_KEY:"test",CHAT_DB:db};
  t.mock.method(globalThis,"fetch",async (url,options) => {
    calls.push({url,options});
    if(String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      return Response.json({candidates:[{content:{parts:[{text:"普通 UNO 桌最多 10 人。"}]}}]});
    }
    return new Response("{}",{status:200});
  });
  await replyToMention(env,{
    id:"follow-up",guild_id:"g1",channel_id:"c1",author:{id:"u1"},content:"<@bot-1> 这桌最多几个人？"
  },"bot-1");
  const prompt=JSON.parse(calls[1].options.body).systemInstruction.parts[0].text;
  assert.match(prompt,/2～10 人|2–10 人/);
  assert.match(prompt,/电脑陪练/);
});

