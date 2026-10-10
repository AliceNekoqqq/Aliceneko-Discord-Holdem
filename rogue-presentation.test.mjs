import test from 'node:test';
import assert from 'node:assert/strict';
import {rogueVisualResponse,patchRoguePanel} from './rogue-presentation.mjs';
import {createRun,runAction} from './rogue-run.mjs';

function fixture(){
 let run=createRun({runId:'visual-1',owner:'123',guild:'456',seed:'image-test',now:0,professionId:'traveler'}),actions=0;
 const service={guild:'456',resume:()=>structuredClone(run),act:r=>{actions++;run=runAction(run,r.action,100);return structuredClone(run);}};
 const interaction={type:3,id:'789',guild_id:'456',member:{user:{id:'123',username:'旅人'}},message:{flags:64},data:{custom_id:'rl:visual-1:0:refresh'}};
 return {service,interaction,run:()=>run,actions:()=>actions};
}
const png=()=>new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'});
test('private refresh becomes bounded multipart and forwarding clears flags and keeps file attachment',async()=>{
 const f=fixture(),before=JSON.stringify(f.run());let capture;
 const response=await rogueVisualResponse(f.service,f.interaction,{render:async(run,options)=>{capture={run,options};return png();}});
 assert.match(response.headers.get('Content-Type'),/multipart/);assert.equal(capture.options.view,'auto');
 await patchRoguePanel(response,'https://discord.test/private',{fetcher:async(url,init)=>{
  assert.equal(init.method,'PATCH');assert.equal(init.headers['Content-Type'],undefined);
  const body=JSON.parse(init.body.get('payload_json'));assert.equal(body.flags,undefined);
  assert.equal(body.attachments.length,1);assert.match(body.embeds[0].image.url,/^attachment:\/\/lantern-map-0.png$/);
  assert.equal(init.body.get('files[0]').type,'image/png');return new Response('{}');
 }});
 assert.equal(f.actions(),0);assert.equal(JSON.stringify(f.run()),before);
});
test('map detail captures latest state read-only despite old button, deck details clear old picture',async()=>{
 const f=fixture();f.run().version=5;let called=0;
 const map=await rogueVisualResponse(f.service,{...f.interaction,data:{custom_id:'rl:visual-1:0:details:map%3A0'}},{render:async(run,{view})=>{assert.equal(run.version,5);assert.equal(view,'map');called++;return png();}});
 assert.match(map.headers.get('Content-Type'),/multipart/);
 const deck=await rogueVisualResponse(f.service,{...f.interaction,data:{custom_id:'rl:visual-1:0:details:deck%3A0'}},{render:()=>{throw Error('must not draw deck');}});
 assert.deepEqual((await deck.json()).data.attachments,[]);assert.equal(called,1);assert.equal(f.actions(),0);
});
test('image failure falls back to full text and buttons after one committed action, never repeats it',async()=>{
 const f=fixture();const choice=f.run().room.candidates[0];
 const response=await rogueVisualResponse(f.service,{...f.interaction,data:{custom_id:`rl:visual-1:0:bless:${choice}`}},{render:()=>{throw Error('render unavailable');}});
 const reply=await response.json();assert.equal(f.actions(),1);assert.equal(f.run().version,1);assert.ok(reply.data.components.length);assert.deepEqual(reply.data.attachments,[]);
});
test('invalid identity or malformed action never render an unrelated player map',async()=>{
 const f=fixture();for(const interaction of [{...f.interaction,guild_id:'other'},{...f.interaction,data:{custom_id:'bogus'}}]){
  const response=await rogueVisualResponse(f.service,interaction,{render:()=>{throw Error('must not draw');}});const reply=await response.json();assert.equal(reply.data.flags,64);assert.deepEqual(reply.data.attachments,[]);
 }assert.equal(f.actions(),0);
});
test('JSON text fallback strips ephemeral flags and removes previous attachments; failed patch is reported',async()=>{
 const response=Response.json({data:{flags:64,content:'text',components:[]}});
 await assert.rejects(patchRoguePanel(response,'https://discord.test/private',{fetcher:async(url,init)=>{const data=JSON.parse(init.body);assert.equal(data.flags,undefined);assert.deepEqual(data.attachments,[]);return new Response('',{status:500});}}),/HTTP 500/);
});
