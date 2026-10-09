import test from 'node:test';
import assert from 'node:assert/strict';
import {TavernOperationsLive} from './tavern-operations-live.mjs';

const now=Date.parse('2026-10-09T12:00:00+08:00'),midnight=Date.parse('2026-10-10T00:00:00+08:00');
function setup(t){
 const map=new Map([['tavernGuild','3']]);let scene='start';
 const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
 const host={ctx:{storage,blockConcurrencyWhile:fn=>fn()},env:{BOT_TOKEN:'test'}},live=new TavernOperationsLive(host);
 live.data=(guild,at)=>({content:`${scene} ${new Date(at+28800000).toISOString().slice(0,10)}`,allowed_mentions:{parse:[]},components:[]});
 const oldFetch=globalThis.fetch,sent=[];globalThis.fetch=async(u,o)=>{sent.push({url:u,data:JSON.parse(o.body)});return Response.json({id:'4'});};t.after(()=>globalThis.fetch=oldFetch);
 return {live,map,sent,change:v=>scene=v};
}
test('public lobby changes coalesce; idle alarm is next Beijing midnight, not polling',async t=>{
 const s=setup(t);await s.live.track({guild:'3',channel:'2',message:'4'},now);assert.equal(s.map.get('alarm'),midnight);
 await s.live.changed(now+1);assert.equal(s.map.get('alarm'),midnight);
 s.change('new');await s.live.changed(now+10);await s.live.changed(now+20);assert.equal(s.map.get('alarm'),now+2010);
 await s.live.flush(now+2000);assert.equal(s.sent.length,0);await s.live.flush(now+2010);assert.equal(s.sent.length,1);assert.equal(s.map.get('alarm'),midnight);
 assert.deepEqual(s.sent[0].data.allowed_mentions,{parse:[]});assert(!JSON.stringify(s.sent[0].data).includes('balance'));
});
test('rollover refreshes existing lobby once and deleted messages remove their alarms',async t=>{
 const s=setup(t);await s.live.track({guild:'3',channel:'2',message:'4'},now);await s.live.flush(midnight);assert.equal(s.sent.length,1);await s.live.flush(midnight+1);assert.equal(s.sent.length,1);
 globalThis.fetch=async()=>new Response('',{status:404});s.change('gone');await s.live.changed(midnight+2);await s.live.flush(midnight+2002);assert.equal(s.map.get('tavernLobbyLive').boards.length,0);assert.equal(s.map.has('alarm'),false);
});
test('failed Discord writes back off and stop retrying before daily alarm',async t=>{
 const s=setup(t);await s.live.track({guild:'3',channel:'2',message:'4'},now);s.change('broken');await s.live.changed(now);
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:500});};
 let at=now+2000;for(let i=0;i<4;i++){await s.live.flush(at);const next=s.map.get('alarm');assert(next>at);at=next;}
 assert.equal(calls,4);assert.equal(s.map.get('alarm'),midnight);assert.equal(s.map.get('tavernLobbyLive').due,null);
});
test('new lobby binding and scene changes survive in-flight Discord refresh',async t=>{
 const s=setup(t);await s.live.track({guild:'3',channel:'2',message:'4'},now);s.change('first');await s.live.changed(now);
 let release;const held=new Promise(r=>release=r);globalThis.fetch=async()=>{await held;return Response.json({});};
 const pending=s.live.flush(now+2000);await new Promise(r=>setImmediate(r));
 s.change('second');await s.live.track({guild:'3',channel:'5',message:'6'},now+2001);await s.live.changed(now+2001);release();await pending;
 const state=s.map.get('tavernLobbyLive');assert.equal(state.boards.length,2);assert.equal(state.boards[0].message,'6');assert.equal(state.due,now+4000);
 globalThis.fetch=async()=>Response.json({});await s.live.flush(now+4000);assert.equal(s.map.get('alarm'),midnight);
});
test('navigation untracks only exact lobby; tracking is bounded to five channels',async t=>{
 const s=setup(t);for(let i=1;i<=7;i++)await s.live.track({guild:'3',channel:String(i),message:String(i+10)},now);
 assert.equal(s.map.get('tavernLobbyLive').boards.length,5);
 await s.live.untrack({channel:'7',message:'999'},now);assert.equal(s.map.get('tavernLobbyLive').boards.length,5);
 await s.live.untrack({channel:'7',message:'17'},now);assert.equal(s.map.get('tavernLobbyLive').boards.length,4);
 for(const b of s.map.get('tavernLobbyLive').boards)await s.live.untrack(b,now);assert.equal(s.map.has('alarm'),false);
 await assert.rejects(s.live.track({guild:'9',channel:'2',message:'4'},now),/无效/);
});
