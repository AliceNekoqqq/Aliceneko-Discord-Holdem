import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUgcModelOutput,generateUgcCandidate} from './tavern-ugc-ai.mjs';
import {ugcInteraction,immediateUgcReply,ugcDeferredReply} from './tavern-ugc-ui.mjs';

const interaction=(custom_id,user='22',flags=64,type=3)=>({type,guild_id:'11',channel_id:'33',member:{user:{id:user,username:'A'}},message:{flags},data:{custom_id}});

test('UGC model output keeps usable recipe fields and normalizes common model formats',()=>{
 assert.deepEqual(parseUgcModelOutput('{"reply":"还想补充什么？","patch":{"flavor":"清新果香"},"missing":["制作方式"]}'),{reply:'还想补充什么？',patch:{flavor:'清新果香'},missing:['制作方式']});
 const alcohol=parseUgcModelOutput('{"reply":"还需确认容量与酒精度","patch":{"name":"夜航金汤力","ingredients":["金酒"],"type":"drink"},"missing":[]}',{draft:{type:'drink'}});
 assert(alcohol.missing.includes('servingSizeMl'));assert(alcohol.missing.includes('alcoholPercent'));
 assert.deepEqual(parseUgcModelOutput('{"reply":"规格已确认","patch":{"servingSizeMl":330,"alcoholPercent":4.8},"missing":[]}',{draft:{type:'drink'}}).patch,{servingSizeMl:330,alcoholPercent:4.8});
 const fence=String.fromCharCode(96).repeat(3);
 const wrapped=parseUgcModelOutput('这是候选：\n'+fence+'json\n{"reply":"先试一杯","patch":{"ingredients":"柠檬、茶叶、清水","temperature":"冰凉","price":30},"missing":[],"extra":"忽略"}\n'+fence,{draft:{type:'drink'}});
 assert.deepEqual(wrapped.patch,{ingredients:['柠檬','茶叶','清水'],temperature:'cold'});
 assert.deepEqual(parseUgcModelOutput('{"reply":"继续","patch":{"name":"越权改名","flavor":"香气更浓"},"missing":[]}',{draft:{type:'drink'},edit_target:'flavor'}).patch,{flavor:'香气更浓'});
 assert.deepEqual(parseUgcModelOutput('{"reply":"可以","patch":{"ingredients":["米酒","糯米"],"description":"一杯温热米酒"},"missing":[]}',{draft:{type:'drink'}}).patch.ingredients,['米酒','糯米']);
 assert.throws(()=>parseUgcModelOutput('not json'),/invalid_json/);
 assert.throws(()=>parseUgcModelOutput('{"reply":"x","patch":{"method":"能治疗疾病"},"missing":[]}'),/危险内容/);
});

test('UGC generation retries malformed JSON once and keeps provider failures private',async t=>{
 const old=globalThis.fetch;let calls=0,loggedEnv;
 globalThis.fetch=async(_url,options)=>{
  calls++;const request=JSON.parse(options.body);assert.equal(request.contents.length,1);assert.equal(request.store,false);
  return Response.json({candidates:[{content:{parts:[{text:calls===1?'broken':'{"reply":"可以补充杯型吗？","patch":{},"missing":["杯型"]}'}]}}]});
 };
 t.after(()=>{globalThis.fetch=old;});
 const result=await generateUgcCandidate({GEMINI_API_KEY:'test',AI_REQUEST_LOG_ENABLED:'true'},{draft:{name:'柚香茶'},history:[]});
 assert.equal(calls,2);assert.equal(result.reply,'可以补充杯型吗？');assert.deepEqual(result.patch,{});
});

test('five model rounds accept JSON, a fenced reply, a preface, loose ingredients and single-field edit',async t=>{
 const old=globalThis.fetch,fence=String.fromCharCode(96).repeat(3),outputs=[
  '{"reply":"先定名字。","patch":{"name":"晚风柠茶"},"missing":["食材"]}',
  fence+'json\n{"reply":"加入柠檬和茶。","patch":{"ingredients":["柠檬","茶叶"]},"missing":["温度"]}\n'+fence,
  '研发建议：{"reply":"做成冰饮。","patch":{"temperature":"冷饮"},"missing":[]}',
  '{"reply":"可以试试。","patch":{"ingredients":"柠檬、茶叶、清水","price":25},"missing":[]}',
  '{"reply":"香气加强。","patch":{"name":"不应更名","flavor":"柠檬香气更浓"},"missing":[]}'
 ];let calls=0;
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:outputs[calls++]},finish_reason:'stop'}]});
 t.after(()=>{globalThis.fetch=old;});
 const env={GEMINI_API_KEY:'fixture',GEMINI_API_BASE_URL:'https://fixture.invalid/v1'};
 for(let i=0;i<outputs.length;i++){const result=await generateUgcCandidate(env,{draft:{type:'drink'},target:i===4?'flavor':null,text:'帮我完善柠檬茶'});assert(!result.errorCode,JSON.stringify(result));if(i===4)assert.deepEqual(result.patch,{flavor:'柠檬香气更浓'});}
 assert.equal(calls,5);
});

test('UGC retries a transient upstream error before giving up on the turn',async t=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>++calls===1?new Response('busy',{status:503}):Response.json({choices:[{message:{content:'{"reply":"可以继续","patch":{"name":"莓果茶"},"missing":[]}'},finish_reason:'stop'}]});
 t.after(()=>{globalThis.fetch=old;});
 const result=await generateUgcCandidate({GEMINI_API_KEY:'fixture',GEMINI_API_BASE_URL:'https://fixture.invalid/v1'},{draft:{type:'drink'},text:'做莓果茶'});
 assert.equal(calls,2);assert.equal(result.patch.name,'莓果茶');
});

test('UGC components require the current member, server and private panel',()=>{
 assert.equal(ugcInteraction(interaction('t:11:22:ugcView')),true);
 assert.equal(immediateUgcReply(interaction('t:11:22:ugcView','99')).data.flags,64);
 assert.equal(immediateUgcReply(interaction('t:12:22:ugcView')).data.flags,64);
 assert.equal(immediateUgcReply(interaction('t:11:22:ugcView','22',0)).data.flags,64);
 assert.deepEqual(ugcDeferredReply(interaction('t:11:22:ugcView')),{type:6});
 const retry=ugcDeferredReply(interaction('t:11:22:ugcRetry~ugc_12345678901234567890~3'));
 assert.equal(retry.type,7);assert(retry.data.content.includes('已收到重试'));assert.equal(retry.data.components[0].components[0].label,'刷新研发面板');
 const slash={type:2,guild_id:'11',channel_id:'33',member:{user:{id:'22'}},data:{name:'酒馆',options:[{name:'研发'}]}};
 assert.equal(ugcInteraction(slash),true);assert.deepEqual(ugcDeferredReply(slash),{type:5,data:{flags:64}});
});
