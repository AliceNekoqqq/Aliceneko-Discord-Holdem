import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {TavernSlots,SLOT_STOPS,SLOT_TTL,evaluateSlots,slotRandomStop} from './tavern-slots.mjs';
import {answerTavern,immediateTavernReply,tavernDeferredReply,tavernCommand,finishTavern} from './tavern-ui.mjs';
import {slotsData,slotsRules} from './tavern-slots-ui.mjs';
import {renderSlotsImage} from './tavern-slots-image.mjs';

function setup(t,stops=[9,9,9]){
 const db=new DatabaseSync(':memory:'),map=new Map();t.after(()=>db.close());
 const storage={sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const r=s.all(...a);return {toArray:()=>r,one:()=>r[0]};}s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};
 const tavern=new TavernService(storage);let calls=0;
 const slots=new TavernSlots(tavern,()=>{calls++;return stops[(calls-1)%stops.length];});tavern._slots=slots;
 return {db,storage,tavern,slots,calls:()=>calls};
}
const base={guild:'3',id:'1',channel:'2',name:'Alice'};
const interaction=(action='slots',extra={})=>({type:3,id:'999',token:'private-token',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},message:{flags:64},data:{custom_id:`t:3:1:${action}`},...extra});
const envFor=s=>({TABLES:{idFromName:n=>n,get:()=>({fetch:async(url,o)=>{try{return Response.json(await s.dispatch(JSON.parse(o.body)));}catch(e){return Response.json({error:e.message});}}})}});

test('all 1000 equally likely stop combinations produce exact 95% RTP and one payout tier',()=>{
 let total=0;const counts={triple:0,pair:0,none:0};
 for(const a of SLOT_STOPS)for(const b of SLOT_STOPS)for(const c of SLOT_STOPS){const r=evaluateSlots([a,b,c]);total+=r.multiplier;counts[r.kind]++;}
 assert.equal(total,950);assert.deepEqual(counts,{triple:46,pair:462,none:492});
 assert.throws(()=>evaluateSlots(['unknown','beer','beer']),/无效/);
});
test('random stops reject the biased uint32 tail',()=>{
 const input=[4294967295,4294967290,4294967289];let n=0;
 assert.equal(slotRandomStop(a=>{a[0]=input[n++];}),9);assert.equal(n,3);
});
test('opening is free; a triple debits and credits once, even on replay after reconstruction',t=>{
 const {tavern:s,slots,storage,calls}=setup(t),view=slots.view(base,1000);
 assert.equal(view.balance,500);assert.equal(view.stats.plays,0);assert.equal(slots.view(base,1001).token,view.token);
 const p={...base,token:view.token,bet:10},r=slots.spin(p,2000);
 assert.equal(r.balance,1490);assert.equal(r.result.payout,1000);assert.equal(r.stats.net,990);assert.equal(calls(),3);
 const restored=new TavernSlots(new TavernService(storage),()=>{throw Error('must not reroll');});
 const replay=restored.spin(p,2000000);assert(replay.repeated);assert.deepEqual(replay.result,r.result);assert.equal(replay.balance,1490);
 assert.equal(s.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind LIKE 'slots_%'").n,2);
 assert.throws(()=>restored.spin({...p,bet:20}),/另一金额/);
});
test('pair returns exactly the stake; three distinct symbols lose only the selected stake',t=>{
 const {slots,tavern:s}=setup(t,[0,0,3,0,3,5]);const a=slots.view(base,1000),pair=slots.spin({...base,token:a.token,bet:50},2000);
 assert.equal(pair.balance,500);assert.equal(pair.result.net,0);assert.equal(pair.result.kind,'pair');
 const loss=slots.spin({...base,token:pair.token,bet:20},5000);
 assert.equal(loss.balance,480);assert.equal(loss.result.kind,'none');assert.equal(loss.stats.plays,2);assert.equal(loss.stats.wagered,70);assert.equal(loss.stats.returned,50);
 assert.equal(s.one('SELECT COUNT(*) n FROM tavern_daily').n,0);assert.equal(s.one('SELECT COUNT(*) n FROM tavern_orders').n,0);
});
test('wrong owner, channel, bet, forged token, expired window and insufficient funds do not charge',t=>{
 const {slots,tavern:s,calls}=setup(t),v=slots.view(base,1000),p={...base,token:v.token,bet:10};
 for(const extra of [{id:'2'},{channel:'4'},{bet:0},{bet:100},{bet:'10'},{token:'a'.repeat(16)}])assert.throws(()=>slots.spin({...p,...extra},2000));
 assert.throws(()=>slots.spin(p,1000+SLOT_TTL),/过期/);assert.equal(calls(),0);
 s.sql.exec("UPDATE tavern_members SET balance=9 WHERE id='1'");assert.throws(()=>slots.spin(p,2000),/不足/);assert.equal(calls(),0);assert.equal(s.member('1').balance,9);
 const fresh=slots.view(base,1000+SLOT_TTL);assert.notEqual(fresh.token,v.token);
});
test('wallet, both ledgers, result and next-round token roll back together on a write failure',t=>{
 const {slots,tavern:s,storage}=setup(t),v=slots.view(base,1000),p={...base,token:v.token,bet:10};const exec=storage.sql.exec;
 storage.sql.exec=(q,...a)=>{if(a[3]==='slots_return')throw Error('disk');return exec(q,...a);};
 assert.throws(()=>slots.spin(p,2000),/disk/);storage.sql.exec=exec;
 assert.equal(s.member('1').balance,500);assert.equal(s.one('SELECT COUNT(*) n FROM tavern_slots').n,1);assert.equal(s.one('SELECT status FROM tavern_slots').status,'ready');assert.equal(s.one("SELECT COUNT(*) n FROM tavern_ledger WHERE kind LIKE 'slots_%'").n,0);
 assert.equal(slots.spin(p,2000).balance,1490);
});
test('a second channel cannot bypass the player cooldown; another guild keeps an independent wallet',async t=>{
 const {slots,tavern:s}=setup(t),other=setup(t),a=slots.view(base,1000),b=slots.view({...base,channel:'4'},1000);
 slots.spin({...base,token:a.token,bet:10},2000);
 assert.throws(()=>slots.spin({...base,channel:'4',token:b.token,bet:10},2001),/稍候/);
 assert.equal(other.slots.view(base,1000).balance,500);
 await s.dispatch({...base,action:'slotsView'});await assert.rejects(()=>s.dispatch({...base,guild:'9',action:'slotsView'}),/服务器不匹配/);
});
test('public entry opens privately; actions validate owner, guild, privacy, type and bots',()=>{
 assert.deepEqual(tavernDeferredReply(interaction('slots',{message:{flags:0},data:{custom_id:'t:3:any:slots'}})),{type:5,data:{flags:64}});
 assert.deepEqual(tavernDeferredReply(interaction('slots')),{type:6});
 const command={...interaction(),type:2,data:{name:'酒馆',options:[{name:'老虎机'}]}};
 assert.deepEqual(tavernDeferredReply(command),{type:5,data:{flags:64}});assert(tavernCommand.options.some(o=>o.name==='老虎机'));
 for(const bad of [interaction('slots',{member:{user:{id:'4'}}}),interaction('slots',{message:{flags:0}}),interaction('slots',{guild_id:'9'}),interaction('slots',{member:{user:{id:'1',bot:true}}}),interaction('slotsSpin~0000000000000000~999')])assert.equal(immediateTavernReply(bad).type,4);
});
test('the full UI path settles once, restores a stale receipt and shows actual rules with legal component sizes',async t=>{
 const {slots,tavern:s}=setup(t),env=envFor(s),view=await answerTavern(env,interaction()),v=slots.view(base);
 assert(view.content.includes('500币'));const spin=interaction(`slotsSpin~${v.token}~10`),won=await answerTavern(env,spin),again=await answerTavern(env,spin);
 assert(won.content.includes('返还 1000'));assert(again.content.includes('没有重复扣币'));assert.equal(slots.view(base).stats.plays,1);
 assert((await answerTavern(env,interaction('slotsRules'))).content.includes('95%'));
 for(const c of won.components.flatMap(r=>r.components))assert(Buffer.byteLength(c.custom_id)<=100);
 assert.deepEqual(slotsRules('3','1').allowed_mentions,{parse:[]});
 const low=slotsData({...slots.view(base),balance:9},'3','1');assert(low.components[0].components.every(c=>c.disabled));
});
test('a lost Discord response can recover from the saved round without repeating the stake',async t=>{
 const {tavern:s,slots}=setup(t),env={...envFor(s),DISCORD_APPLICATION_ID:'123'},v=slots.view(base),spin=interaction(`slotsSpin~${v.token}~10`),old=globalThis.fetch;
 let payload;t.after(()=>globalThis.fetch=old);globalThis.fetch=async(url,o)=>{payload=o.body instanceof FormData?JSON.parse(o.body.get('payload_json')):JSON.parse(o.body);throw Error('network');};
 await finishTavern(env,spin);assert.equal(payload.attachments.length,1);assert(payload.embeds[0].image.url.startsWith('attachment://'));assert(payload.content.includes('返还 1000'));
 assert.equal(slots.view(base).balance,1490);await finishTavern(env,spin);assert.equal(slots.view(base).stats.plays,1);
});
test('result pictures are valid, distinct PNGs and do not contain account data',async()=>{
 const blank=await renderSlotsImage(null),win=await renderSlotsImage({symbols:['butterfly','butterfly','butterfly'],kind:'triple',multiplier:70});
 assert.equal(new DataView(win.buffer).getUint32(16),840);assert.equal(new DataView(win.buffer).getUint32(20),460);
 assert.deepEqual([...win.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.notDeepEqual(win,blank);assert(win.length<100000);
});
