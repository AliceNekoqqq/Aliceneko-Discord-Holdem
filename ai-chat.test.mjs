import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {BOT_KNOWLEDGE_MARKDOWN, getBotKnowledge} from "./bot-knowledge.mjs";
import {
  aiCommand,
  buildOpenAIChatRequest,
  buildGenerateContentRequest,
  generateGemini,
  getBotEmojiTokens,
  handleAiCommand,
  makeSystemInstruction,
  commentOnGameTransition,
  publicGameEvent,
  replyToMention,
  startTypingIndicator
} from "./ai-chat.mjs";
import { DiscordGateway } from "./discord-gateway.mjs";

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
  const state = {memoryEnabled:1,settingExists:false,persona:"",gameHost:0,hostFeatures:{host_commentary:0,host_start:0,host_results:0},history:[],processed:new Set()};
  return {
    state,
    prepare(sql) {
      const query = {sql,args:[]};
      return {
        query,
        bind(...args) { query.args=args; return this; },
        async first() {
          if (query.sql.includes("ai_member_settings")) return state.settingExists ? {memory_enabled:state.memoryEnabled} : null;
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
          if (query.sql.includes("ai_guild_config") && query.sql.includes("persona")) state.persona=query.args[1];
          if (query.sql.includes("ai_guild_config") && query.sql.includes("host_commentary")) {
            state.gameHost=query.args[1];
            state.hostFeatures={host_commentary:query.args[2],host_start:query.args[3],host_results:query.args[4]};
          } else if (query.sql.includes("ai_guild_config") && query.sql.includes("game_host")) state.gameHost=query.args[1];
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
  assert.match(getBotKnowledge("我想清除聊天记录"),/删除该成员在本服务器保存的对话正文/);
  assert.match(getBotKnowledge(["我们在玩 UNO", "这桌最多几个人？"]),/2～10 人|2–10 人/);
});

test("published knowledge document is generated from the Worker knowledge source", async () => {
  const document=await readFile(new URL("./BOT_KNOWLEDGE.md",import.meta.url),"utf8");
  assert.equal(document,BOT_KNOWLEDGE_MARKDOWN);
});

test("AI command exposes only member memory and independently configurable host features", () => {
  const groups = aiCommand.options.map(group=>group.name);
  assert.deepEqual(groups,["记忆","主持"]);
  assert.equal(groups.includes("管理员助手"),false);
  assert.equal(groups.includes("人格"),false);
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
