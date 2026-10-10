import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUgcModelOutput,generateUgcCandidate} from './tavern-ugc-ai.mjs';
import {ugcInteraction,immediateUgcReply,ugcDeferredReply} from './tavern-ugc-ui.mjs';

const interaction=(custom_id,user='22',flags=64,type=3)=>({type,guild_id:'11',channel_id:'33',member:{user:{id:user,username:'A'}},message:{flags},data:{custom_id}});

test('UGC model output accepts only the structured candidate schema',()=>{
 assert.deepEqual(parseUgcModelOutput('{"reply":"还想补充什么？","patch":{"flavor":"清新果香"},"missing":["制作方式"]}'),{reply:'还想补充什么？',patch:{flavor:'清新果香'},missing:['制作方式']});
 for(const raw of ['not json','{"reply":"x","patch":{"price":10},"missing":[]}','{"reply":7,"patch":{},"missing":[]}'])assert.throws(()=>parseUgcModelOutput(raw));
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

test('UGC components require the current member, server and private panel',()=>{
 assert.equal(ugcInteraction(interaction('t:11:22:ugcView')),true);
 assert.equal(immediateUgcReply(interaction('t:11:22:ugcView','99')).data.flags,64);
 assert.equal(immediateUgcReply(interaction('t:12:22:ugcView')).data.flags,64);
 assert.equal(immediateUgcReply(interaction('t:11:22:ugcView','22',0)).data.flags,64);
 assert.deepEqual(ugcDeferredReply(interaction('t:11:22:ugcView')),{type:6});
 const slash={type:2,guild_id:'11',channel_id:'33',member:{user:{id:'22'}},data:{name:'酒馆',options:[{name:'研发'}]}};
 assert.equal(ugcInteraction(slash),true);assert.deepEqual(ugcDeferredReply(slash),{type:5,data:{flags:64}});
});
