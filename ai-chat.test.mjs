import test from "node:test";
import assert from "node:assert/strict";
import {
  aiCommand,
  buildOpenAIChatRequest,
  buildGenerateContentRequest,
  generateGemini,
  getBotEmojiTokens,
  handleAiCommand,
  makeSystemInstruction,
  publicGameEvent,
  replyToMention
} from "./ai-chat.mjs";
import { DiscordGateway } from "./discord-gateway.mjs";

function fakeDb() {
  const state = {memoryEnabled:1,settingExists:false,persona:"",gameHost:0,history:[],processed:new Set()};
  return {
    state,
    prepare(sql) {
      const query = {sql,args:[]};
      return {
        query,
        bind(...args) { query.args=args; return this; },
        async first() {
          if (query.sql.includes("ai_member_settings")) return state.settingExists ? {memory_enabled:state.memoryEnabled} : null;
          if (query.sql.includes("ai_guild_config")) return {persona:state.persona,game_host:state.gameHost};
          return null;
        },
        async run() {
          if (query.sql.includes("INSERT OR IGNORE INTO ai_processed_messages")) {
            const id=query.args[0];
            if(state.processed.has(id))return {meta:{changes:0}};
            state.processed.add(id);
          }
          if (query.sql.includes("ai_member_settings")) {state.memoryEnabled=query.args[2];state.settingExists=true;}
          if (query.sql.includes("ai_guild_config") && query.sql.includes("persona")) state.persona=query.args[1];
          if (query.sql.includes("ai_guild_config") && query.sql.includes("game_host")) state.gameHost=query.args[1];
          return {meta:{changes:1}};
        },
        async all() { return {results:state.history.filter(row=>row.guild_id===query.args[0]&&row.user_id===query.args[1])}; }
      };
    },
    async batch(statements) {
      for(const statement of statements) {
        const {sql,args}=statement.query;
        if(sql.startsWith("INSERT INTO ai_chat_history")) state.history.push({guild_id:args[0],user_id:args[1],role:args[2],content:args[3],id:state.history.length+1});
      }
      return {success:true};
    }
  };
}

test("Gemini requests disable request storage and keep the key out of the URL", async () => {
  const body = buildGenerateContentRequest([{role:"user",parts:[{text:"你好"}]}],"爱讲冷笑话");
  assert.equal(body.store,false);
  assert.equal(body.contents[0].role,"user");
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

test("system instruction protects private cards and excludes admin assistance", () => {
  const prompt = makeSystemInstruction("活泼");
  assert.match(prompt,/私密手牌/);
  assert.match(prompt,/不要充当管理员助手/);
  assert.match(prompt,/以红豆粉的身份自然聊天/);
  assert.match(prompt,/活泼/);
});

test("AI command exposes only member memory and game-host controls", () => {
  const groups = aiCommand.options.map(group=>group.name);
  assert.deepEqual(groups,["记忆","主持"]);
  assert.equal(groups.includes("管理员助手"),false);
  assert.equal(groups.includes("人格"),false);
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
  assert.match(reply.data.content,/使用 \/ai 记忆 或 \/ai 主持/);
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

test("Gateway replies to direct mentions and ignores ordinary guild messages", async t => {
  const sent=[];
  t.mock.method(globalThis,"fetch",async (url,options)=> {
    sent.push({url,body:JSON.parse(options.body)});
    return new Response("{}",{status:200});
  });
  const tasks=[];
  const host={env:{BOT_TOKEN:"test-token"},ctx:{storage:{async put(){},async get(){return null;},async delete(){}},waitUntil(p){tasks.push(p);}}};
  const gateway=new DiscordGateway(host);
  gateway.botId="bot-1";
  gateway.onGuildMessage({id:"m1",guild_id:"g",channel_id:"c",author:{id:"u"},content:"hi"});
  assert.equal(tasks.length,0);
  gateway.onGuildMessage({id:"m2",guild_id:"g",channel_id:"c",author:{id:"u"},content:"<@bot-1> 你好",mentions:[{id:"bot-1"}]});
  assert.equal(tasks.length,1);
  await Promise.all(tasks);
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,"https://discord.com/api/v10/channels/c/messages");
  assert.deepEqual(sent[0].body.allowed_mentions,{parse:[]});
  assert.equal(sent[0].body.message_reference.message_id,"m2");
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
  assert.equal(JSON.parse(calls[1].options.body).content,"嗨，记住啦。");
  assert.doesNotMatch(calls[1].options.body,/会保存最近 30 条/);
  const request=JSON.parse(calls[0].options.body);
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
  const secondRequest=JSON.parse(calls[2].options.body);
  assert.equal(secondRequest.contents.length,1);
});
