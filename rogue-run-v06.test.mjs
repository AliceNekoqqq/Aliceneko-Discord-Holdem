import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,runAction,CURRENT_RULE_VERSION,RunActionError} from './rogue-run.mjs';
import {PROFESSIONS,ITEMS} from './rogue-content-v06.mjs';
import {play} from './rogue-playthrough.mjs';
const fresh=(p='traveler',seed='richness')=>createRun({runId:'new',owner:'1',guild:'1',seed,professionId:p,ruleVersion:CURRENT_RULE_VERSION,now:0});
test('all eight professions receive one starter relic and stable saved boss plans',()=>{
 for(const id of Object.keys(PROFESSIONS)){const r=fresh(id);assert.equal(r.phase,'ROUTE');assert.equal(r.deck.length,8);assert.deepEqual(r.relics,[PROFESSIONS[id].starterRelic]);assert.equal(r.inventory.length,0);assert.equal(r.bosses.length,3);
 const n=runAction(JSON.parse(JSON.stringify(r)),{type:'ROUTE',choice:r.room.choices[0]},1);assert.deepEqual(n.bosses,r.bosses);assert.equal(n.battle.professionId,id);}
 assert.throws(()=>fresh('unknown'),e=>e instanceof RunActionError);
});
test('item reward replacement is atomic, rejects full inventory without selected slot, and preserves skip',()=>{
 const ids=Object.keys(ITEMS),r=fresh();r.inventory=ids.slice(0,2);r.phase='REWARD';r.reward={index:0,queue:[{kind:'item',candidates:[ids[2]],done:false}],completed:false};
 const original=JSON.stringify(r);assert.throws(()=>runAction(r,{type:'REWARD',choice:ids[2]},1),e=>e.code==='INVENTORY_FULL');assert.equal(JSON.stringify(r),original);
 const n=runAction(r,{type:'REWARD',choice:ids[2],replaceIndex:1},1);assert.deepEqual(n.inventory,[ids[0],ids[2]]);assert.equal(n.completed,1);
 assert.deepEqual(runAction(r,{type:'REWARD',choice:null},1).inventory,r.inventory);
});
test('shop consumable cannot overdraw or evade capacity; services never repeat',()=>{
 const r=fresh();r.phase='ROOM';r.act=2;r.slot=1;r.completed=3;r.embers=8;r.inventory=Object.keys(ITEMS).slice(0,2);r.room={type:'shop',stock:[],itemStock:['cold_ash_item'],services:{}};
 assert.throws(()=>runAction(r,{type:'SHOP',choice:'item',itemId:'cold_ash_item'},1));
 const n=runAction(r,{type:'SHOP',choice:'item',itemId:'cold_ash_item',replaceIndex:0},1);assert.equal(n.embers,0);assert.equal(n.inventory[0],'cold_ash_item');assert.equal(n.room.itemStock.length,0);
 assert.throws(()=>runAction(n,{type:'SHOP',choice:'item',itemId:'cold_ash_item',replaceIndex:0},2));
});
test('event candidate and life payment are validated before advancing station',()=>{
 const r=fresh();r.phase='ROOM';r.act=3;r.slot=1;r.completed=6;r.hp=2;r.room={type:'event',eventId:'borrow_fire',choices:['trade','leave'],lifeCost:2,candidates:['forge_stance']};
 assert.throws(()=>runAction(r,{type:'EVENT',choice:'trade',cardId:'forge_stance'},1),e=>e.code==='INSUFFICIENT_HP');
 r.hp=3;assert.throws(()=>runAction(r,{type:'EVENT',choice:'trade',cardId:'heavy_blow'},1));
 const n=runAction(r,{type:'EVENT',choice:'trade',cardId:'forge_stance'},1);assert.equal(n.hp,1);assert.equal(n.completed,7);assert.equal(n.deck.length,9);
});
test('each profession completes three acts through real actions with JSON recovery between decisions',()=>{
 // Seed sweep verifies viability; this deterministic two-step policy is not a human win-rate estimate.
 for(const id of Object.keys(PROFESSIONS)){let cleared;for(let n=0;n<20;n++){const result=play(id,'s'+n);if(result.result==='CLEAR'){cleared=result;break;}}assert.ok(cleared,`no complete playthrough for ${id}`);assert.equal(cleared.completed,9);}
});
