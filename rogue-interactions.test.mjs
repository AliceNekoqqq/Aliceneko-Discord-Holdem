import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchRogue} from './rogue-interactions.mjs';
import {createRun,runAction} from './rogue-run.mjs';
const NOW=Date.parse('2026-10-10T11:25:00Z');
function fixture(patch={}){
 let run={...createRun({runId:'run-1',owner:'2',guild:'1',mode:'normal',seed:'test',startDay:'2026-10-10',now:NOW}),...patch},actions=0,captured;
 const service={guild:'1',resume(p){captured=p;return run;},start(p){captured=p;return run;},act(p){captured=p;actions++;if(p.version!==run.version){const e=Error();e.code='STALE';throw e;}run=runAction(run,p.action,NOW+actions);return run;},leaderboard(p){captured=p;return {day:'2026-10-10',rows:[]};}};
 const i={id:'100',type:3,guild_id:'1',member:{user:{id:'2',username:'player'}},message:{flags:64},data:{custom_id:'rl:home'}};
 return {service,i,getRun:()=>run,getActions:()=>actions,getCaptured:()=>captured};
}
test('public source gets a new private message, private source can update; signed member supplies identity',()=>{
 const f=fixture();let i={...f.i,user:{id:'9'},message:{flags:0},data:{custom_id:'rl:start:normal',owner:'9',now:9999999999999}};
 const reply=dispatchRogue(f.service,i);assert.equal(reply.type,4);assert.equal(reply.data.flags,64);
 assert.equal(f.getCaptured().id,'2');assert.equal(f.getCaptured().guild,'1');assert.equal(f.getCaptured().now,undefined);
 assert.equal(dispatchRogue(f.service,{...i,message:{flags:64}}).type,7);
});
test('guild mismatch and malformed token stop before service action',()=>{
 const f=fixture();assert.equal(dispatchRogue(f.service,{...f.i,guild_id:'3'}).type,4);
 assert.equal(f.getCaptured(),undefined);assert.equal(f.getActions(),0);
 assert.equal(dispatchRogue(f.service,{...f.i,data:{custom_id:'bad'}}).type,4);assert.equal(f.getActions(),0);
});
test('bot identity is rejected before creating or rewarding a run',()=>{
 const f=fixture();const reply=dispatchRogue(f.service,{...f.i,member:{user:{id:'2',bot:true}},data:{custom_id:'rl:start:normal'}});
 assert.equal(reply.data.flags,64);assert.match(reply.data.content,/真人/);assert.equal(f.getCaptured(),undefined);
});
test('asking to abandon and refreshing never mutate or extend run; confirmed button performs exactly the run action',()=>{
 const f=fixture();const before=JSON.stringify(f.getRun());
 const ask=dispatchRogue(f.service,{...f.i,data:{custom_id:'rl:run-1:0:ask-abandon'}});
 assert.equal(ask.type,7);assert.equal(f.getActions(),0);assert.equal(JSON.stringify(f.getRun()),before);
 const confirmed=ask.data.components[0].components[0].custom_id;
 dispatchRogue(f.service,{...f.i,data:{custom_id:'rl:run-1:0:refresh'}});
 assert.equal(JSON.stringify(f.getRun()),before);
 const result=dispatchRogue(f.service,{...f.i,id:'101',data:{custom_id:confirmed}});
 assert.equal(result.type,7);assert.equal(f.getRun().result.type,'ABANDON');assert.equal(f.getActions(),1);
});
test('event card preview is read only, confirmation atomically buys selected card and advances station',()=>{
 const f=fixture({act:3,slot:1,completed:6,completedActs:2,embers:20,hp:22,room:{type:'event',candidates:['a3_knell_arc']}});
 const ask=dispatchRogue(f.service,{...f.i,data:{custom_id:'rl:run-1:0:event-card-ask',values:['a3_knell_arc']}});
 assert.equal(ask.type,7);assert.equal(f.getRun().embers,20);assert.equal(f.getActions(),0);
 const yes=ask.data.components[0].components[0].custom_id;
 dispatchRogue(f.service,{...f.i,id:'102',data:{custom_id:yes}});
 assert.equal(f.getRun().embers,10);assert.equal(f.getRun().completed,7);
 assert.equal(f.getRun().deck.at(-1).cardId,'a3_knell_arc');
 assert.equal(f.getRun().phase,'ROUTE');
});
test('stale confirmation cannot apply to new state and returns a private error',()=>{
 const f=fixture({version:2});const reply=dispatchRogue(f.service,{...f.i,data:{custom_id:'rl:run-1:1:ask-abandon'}});
 assert.equal(reply.type,4);assert.match(reply.data.content,/过期/);assert.equal(f.getActions(),0);
});
