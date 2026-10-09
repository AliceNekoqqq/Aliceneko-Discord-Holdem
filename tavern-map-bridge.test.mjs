import test from 'node:test';
import assert from 'node:assert/strict';
import {TavernMapBridge} from './tavern-map-bridge.mjs';
const now=Date.parse('2026-10-09T12:00:00+08:00');
const table={guild:'3',channel:'2',epoch:'table1',game:'uno',phase:'playing',players:[{id:'1',name:'Alice',hand:[1,2]},{id:'bot1',name:'电脑',bot:true,hand:[3]}],deck:[4],token:'secret'};
function setup(){const map=new Map(),calls=[];let fail=false;const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const[a,b]of Object.entries(k))map.set(a,structuredClone(b));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k)};const env={TABLES:{idFromName:n=>n,get:n=>({fetch:async(u,o)=>{const p=JSON.parse(o.body);calls.push(p);if(fail)throw Error('offline');return Response.json({ok:true});}})}};const host={ctx:{storage},env,armAlarm:async()=>{}};return {map,calls,bridge:new TavernMapBridge(host),fail:v=>fail=v};}
test('game public outbox strips hands/tokens, coalesces, and does not keep idle tables alive',async()=>{
 const s=setup();await s.bridge.capture(table,now,true);const job=s.map.get('tavernMapJob');assert(!JSON.stringify(job).includes('hand'));assert(!JSON.stringify(job).includes('secret'));assert.equal(job.players[1].bot,true);
 await s.bridge.capture(table,now+10000,true);assert.equal(s.map.get('tavernMapJob').at,now);await s.bridge.flush(now+1999);assert.equal(s.calls.length,0);await s.bridge.flush(now+2000);assert.equal(s.calls.length,1);assert.equal(s.map.has('tavernMapSyncAt'),false);
 await s.bridge.capture(table,now+100000,false);assert.equal(s.map.has('tavernMapSyncAt'),false);await s.bridge.capture(table,now+100000,true);assert.equal(s.map.get('tavernMapJob').at,now+100000);
 await s.bridge.capture({...table,phase:'closed'},now+110000);assert(s.map.get('tavernMapJob').closed);await s.bridge.flush(now+112000);assert.equal(s.calls.length,2);assert(s.calls.at(-1).closed);
});
test('map snapshot delivery retries finitely, then sleeps until a new real event',async()=>{
 const s=setup();s.fail(true);await s.bridge.capture(table,now,true);let at=now+2000;
 for(let n=0;n<4;n++){await s.bridge.flush(at);at=s.map.get('tavernMapSyncAt')||at+1000;}
 assert.equal(s.calls.length,4);assert.equal(s.map.has('tavernMapSyncAt'),false);assert.equal(s.map.has('tavernMapJob'),false);await s.bridge.capture(table,now+180000,true);assert(s.map.get('tavernMapSyncAt'));
});
