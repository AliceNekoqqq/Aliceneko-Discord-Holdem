import test from 'node:test';
import assert from 'node:assert/strict';
import {replyToMention,buildOpenAIChatRequest,handleAiCommand} from './ai-chat.mjs';
import {NOVELAI_OBJECT} from './novelai.mjs';
const message={id:'8201',guild_id:'820',channel_id:'821',author:{id:'1',username:'A'},mentions:[{id:'99'}],content:'<@99> 想看看你今天的穿搭'};
function fixture(t,output,notice='已加入生图队列'){
 const rpc=[],posts=[],model=[];
 const env={BOT_TOKEN:'test',GEMINI_API_KEY:'test',NOVELAI_API_KEY:'secret-never-in-prompt',GEMINI_MAX_RETRIES:'0',AI_REQUEST_LOG_ENABLED:'false',TABLES:{idFromName:n=>n,get:name=>({async fetch(url,o){const p=JSON.parse(o.body);rpc.push({name,p});return Response.json(p.op==='novelai'?{accepted:true,notice}:{});}})}};
 t.mock.method(globalThis,'fetch',async(url,o)=>{
  if(String(url).includes('generativelanguage')){model.push(JSON.parse(o.body));return Response.json({candidates:[{content:{parts:[{text:typeof output==='string'?output:JSON.stringify(output)}]}}]});}
  if(String(url).endsWith('/messages')&&o?.method==='POST'){posts.push(JSON.parse(o.body));return Response.json({id:'8202'});}
  return Response.json({id:'821',guild_id:'820',type:0,permission_overwrites:[]});
 });return {env,rpc,posts,model};
}
test('natural-language visual request uses one LLM call and only the current speaker owns the queued job',async t=>{
 const f=fixture(t,{reply:'我整理一下画面。',image:{prompt:'1girl, pink hair, casual clothes',evidence:'想看看你今天的穿搭',parameters:{},parameterEvidence:{}}});
 await replyToMention(f.env,message,'99');
 const calls=f.rpc.filter(r=>r.p.op==='novelai');assert.equal(calls.length,1);assert.equal(calls[0].name,NOVELAI_OBJECT);assert.equal(calls[0].p.user,'1');assert.equal(calls[0].p.reference,'8201');assert.equal(f.model.length,1);assert.equal(f.model[0].generationConfig.responseMimeType,'application/json');
 assert.match(f.posts[0].content,/已加入/);assert.doesNotMatch(JSON.stringify(f.posts),/parameterEvidence|"image"|secret-never/);assert(!JSON.stringify(f.model).includes('secret-never'));
});
test('chat inline size, steps and guidance are supplied by the AI and override only the current job',async t=>{
 const f=fixture(t,{reply:'正在整理。',image:{prompt:'a cat',evidence:'我要一张猫图',parameters:{width:1024,height:1024,steps:24,scale:6},parameterEvidence:{width:'1024*1024',height:'1024*1024',steps:'24步',scale:'CFG 6'}}});
 await replyToMention(f.env,{...message,content:'<@99> 我要一张猫图，1024*1024，24步，CFG 6'},'99');
 const calls=f.rpc.filter(c=>c.p.op==='novelai');assert.equal(calls.length,1);assert.equal(calls[0].p.action,'绘制');assert.deepEqual(calls[0].p.params,{width:1024,height:1024,steps:24,scale:6});assert(!f.rpc.some(c=>['默认','偏好'].includes(c.p.action)));
});
test('plain reply, ordinary chat, negation and missing evidence never enqueue',async t=>{
 for(const [content,output]of [['你好','你好呀。'],['不要生图',{reply:'好的。',image:null}],['你好',{reply:'你好呀。',image:{prompt:'cat',evidence:'想看看你今天的穿搭'}}]]){
  const f=fixture(t,output);await replyToMention(f.env,{...message,content:'<@99> '+content},'99');assert.equal(f.rpc.filter(r=>r.p.op==='novelai').length,0);assert.equal(f.posts.length,1);
 }
});
test('pending defaults get an accurate notice without claiming an image exists',async t=>{
 const f=fixture(t,{reply:'准备中。',image:{prompt:'cat',evidence:'画只猫'}},'生图功能已接入，正在等待开发者调整默认参数后开放。');await replyToMention(f.env,{...message,content:'<@99> 画只猫'},'99');assert.match(f.posts[0].content,/等待开发者/);
});
test('OpenAI-compatible tool request is structured and slash preferences work independently of chat D1',async()=>{
 const r=buildOpenAIChatRequest([{role:'user',parts:[{text:'画只猫'}]}],'','chat','test',[],'','',{imageGeneration:{source:'current_user_message_only'}});assert.deepEqual(r.response_format,{type:'json_object'});assert.equal(r.max_tokens,2048);
 const calls=[],env={TABLES:{idFromName:n=>n,get:n=>({async fetch(url,o){calls.push(JSON.parse(o.body));return Response.json({notice:'已保存'});}})}};
 const i={id:'1',guild_id:'2',channel_id:'3',member:{user:{id:'4'}},data:{options:[{name:'生图',options:[{name:'偏好',options:[{name:'参数',value:'{"scale":6}'},{name:'尺寸',value:'1024x1024'},{name:'步数',value:24}]}]}]}};
 const reply=await handleAiCommand(env,i);assert.equal(reply.data.flags,64);assert.equal(calls[0].user,'4');assert.equal(calls[0].admin,false);assert.deepEqual(calls[0].params,{scale:6,width:1024,height:1024,steps:24});
});

test('slash drawing prepares the English body through the current model; explicit options win over extracted values',async t=>{
 const f=fixture(t,{reply:'正在整理。',image:{prompt:'1girl, pink twintails, blue dress, full body, standing in a garden',evidence:'请画图',parameters:{steps:20},parameterEvidence:{steps:'20步'}}});
 const original=f.env.TABLES.get;
 f.env.TABLES.get=n=>({async fetch(url,o){const p=JSON.parse(o.body);if(p.action==='查看')return Response.json({defaults:{enabled:true},preferences:{scale:6}});return original(n).fetch(url,o);}});
 const i={id:'1',guild_id:'2',channel_id:'3',member:{user:{id:'4'}},data:{options:[{name:'生图',options:[{name:'绘制',options:[{name:'描述',value:'画红小豆穿蓝裙站在花园里，全身，20步'},{name:'步数',value:24}]}]}]}};
 const r=await handleAiCommand(f.env,i),queued=f.rpc.find(x=>x.p.action==='绘制').p;
 assert.equal(r.data.flags,64);assert.equal(f.model.length,1);assert.equal(queued.prompt,'1girl, pink twintails, blue dress, full body, standing in a garden');assert.deepEqual(queued.params,{steps:24});assert.equal(queued.user,'4');assert.equal(queued.id,'1');assert.equal(queued.channel,'3');
 const system=f.model[0].systemInstruction.parts[0].text;assert.match(system,/粉色|pink hair/);assert.match(system,/不无故改成眼睛/);assert(!JSON.stringify(f.model).includes('secret-never-in-prompt'));
 assert.deepEqual(f.model[0].contents,[{role:'user',parts:[{text:'请画图：画红小豆穿蓝裙站在花园里，全身，20步'}]}]);
});
test('slash preparation failure never falls back to raw description or queues an image',async t=>{
 const f=fixture(t,'not a structured image response');
 f.env.TABLES.get=n=>({async fetch(url,o){const p=JSON.parse(o.body);f.rpc.push({name:n,p});assert.equal(p.action,'查看');return Response.json({defaults:{enabled:true},preferences:{}});}});
 const i={id:'1',guild_id:'2',channel_id:'3',member:{user:{id:'4'}},data:{options:[{name:'生图',options:[{name:'绘制',options:[{name:'描述',value:'一只猫'}]}]}]}};
 const r=await handleAiCommand(f.env,i);assert.match(r.data.content,/整理失败/);assert.equal(f.model.length,1);assert.equal(f.rpc.length,1);
});
test('closed generation and invalid explicit parameters stop before the text model; trial remains developer-only',async t=>{
 const f=fixture(t,{reply:'整理中。',image:{prompt:'a cat',evidence:'请画图'}});
 let enabled=false;f.env.TABLES.get=()=>({async fetch(){return Response.json({defaults:{enabled},preferences:{}});}});
 const i={id:'1',guild_id:'2',channel_id:'3',member:{user:{id:'4'}},data:{options:[{name:'生图',options:[{name:'绘制',options:[{name:'描述',value:'猫'}]}]}]}};
 assert.match((await handleAiCommand(f.env,i)).data.content,/未开放/);
 enabled=true;i.data.options[0].options[0].options.push({name:'步数',value:51});assert.match((await handleAiCommand(f.env,i)).data.content,/超出/);
 i.data.options[0].options[0].name='试画';assert.match((await handleAiCommand(f.env,i)).data.content,/只有开发者/);assert.equal(f.model.length,0);
});
