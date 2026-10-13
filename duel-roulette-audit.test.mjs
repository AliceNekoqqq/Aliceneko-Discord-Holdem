import test from 'node:test';
import assert from 'node:assert/strict';
import {DevilState,defaultRng} from './devil-roulette-engine.mjs';
import * as game from './duel-roulette-model.mjs';
import {panel,board} from './duel-roulette-ui.mjs';
import {PrivatePanels} from './private-panels.mjs';
import {DuelRoulettePenalties} from './duel-roulette-penalties.mjs';
const started=()=>{const t=game.create('devil_roulette','1','2','3','甲');game.accept(t,'4','乙');t.turn=t.state.turnPlayerId='1';t.state.shells=[false,true,false,true];t.state.pointer=0;return t;};
const storage=()=>{const map=new Map();return {map,async get(k){return structuredClone(map.get(k));},async put(k,v){if(typeof k==='object')for(const [a,b]of Object.entries(k))map.set(a,structuredClone(b));else map.set(k,structuredClone(v));},async delete(k){for(const x of Array.isArray(k)?k:[k])map.delete(x);},async setAlarm(){},async deleteAlarm(){}};};
for(const [item,setup,reason] of [
 ['cigarette',()=>{},'生命已满'],['medicine',()=>{},'生命已满'],
 ['magnifier',s=>s.knownShells['1'][s.pointer]=false,'当前弹位已探明'],
 ['phone',s=>s.pointer=s.shells.length-1,'没有未来弹位'],
 ['phone',s=>{for(let n=s.pointer+1;n<s.shells.length;n++)s.knownShells['1'][n]=s.shells[n];},'全部探明'],
 ['saw',s=>s.sawArmed=true,'已生效'],
 ['handcuffs',s=>s.handcuffed.add('4'),'已被铐'],
 ['handcuffs',s=>s.pointer=s.shells.length-1,'最后一发']
])test(`roulette prevents ineffective ${item}: ${reason}`,()=>{
 const t=started(),s=DevilState.restore(t.state);s.items['1']=[item];setup(s);t.state=s.serialize();const before=structuredClone(t);
 assert(!s.canUseItem('1',item));assert(s.itemUnavailableReason('1',item).includes(reason));
 assert.throws(()=>game.shootOrItem(t,'1',item));assert.deepEqual(t,before);
 const p=panel(t,'1'),b=p.components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith('~'+item));assert(b.disabled);assert(JSON.stringify(p).includes(reason));
});
test('adrenaline targets obey the same useful-item guards and rejection never consumes either inventory',()=>{
 const t=started(),s=DevilState.restore(t.state);s.items['1']=['adrenaline'];s.items['4']=['cigarette','phone','handcuffs','saw'];s.pointer=s.shells.length-1;s.sawArmed=true;t.state=s.serialize();
 assert.deepEqual(s._stealableItems('1'),[]);assert(!s.canUseItem('1','adrenaline'));const before=s.serialize();assert.throws(()=>s.apply('adrenaline','1'));assert.deepEqual(s.serialize(),before);
 for(const k of s.items['4']){const snap=structuredClone(t);assert.throws(()=>game.shootOrItem(t,'1','adrenaline',k));assert.deepEqual(t,snap);}
 s.hp['1']=3;assert.deepEqual(s._stealableItems('1'),['cigarette']);s.apply('adrenaline','1',{stealKey:'cigarette'});assert.equal(s.hp['1'],4);assert.equal(s.items['1'].length,0);assert(!s.items['4'].includes('cigarette'));
});
test('private roulette dashboard is complete, bounded and conceals inverter counts without leaking opponent intel',()=>{
 const t=started();t.state.knownShells['4']={3:true};t.state.items['1']=['beer','beer','phone','adrenaline'];t.state.items['4']=['medicine'];t.state.inverterObscured=true;
 const p=panel(t,'1');assert(JSON.stringify(p).includes('甲')||JSON.stringify(p).includes('你的生命'));assert(p.embeds[0].fields.find(f=>f.name==='乙').value.includes('4/4'));assert(JSON.stringify(p).includes('超时'));assert(JSON.stringify(p).includes('数量暂时隐藏'));assert(JSON.stringify(p).includes('啤酒 ×2'));assert(!JSON.stringify(p).includes('往后第 3 发'));assert(!JSON.stringify(p).includes('2 实弹'));assert(p.content.length<=2000);assert(p.components.length<=5);
 assert(p.components.flatMap(r=>r.components).some(c=>c.label.includes('空弹续行动')));
});
test('saw on a blank shot is spent and its explanation matches the actual rule; shots return immediate outcome',()=>{
 const t=started();t.state.sawArmed=true;const p=panel(t,'1');assert(JSON.stringify(p).includes('空弹也消耗手锯'));
 const r=game.shootOrItem(t,'1','shoot_self');assert(!t.state.sawArmed);assert(r.notice.includes('向自己'));assert(r.notice.includes('空弹'));assert.equal(t.turn,'1');
});
test('rename pending shows its actual deadline and only valid actions; applied and failed penalties show execution results',()=>{
 const t=started();game.settle(t,'1','胜利');t.penalty.status='renamePending';t.penalty.renameUntil=Date.now()+60000;
 const stamp=`<t:${Math.floor(t.penalty.renameUntil/1000)}:R>`;const p=panel(t,'1'),b=board(t);assert(JSON.stringify(p).includes(stamp));assert(b.embeds[0].description.includes(stamp));assert(!p.components.flatMap(r=>r.components).some(c=>c.custom_id.endsWith('~mute')));assert(p.components[0].components[0].label.includes('重填'));
 t.penalty.status='prepareRename';assert.equal(panel(t,'1').components.length,0);assert(!board(t).components.flatMap(r=>r.components).some(c=>c.custom_id.endsWith(':rename')));
 t.phase='closed';t.penaltyNotice='机器人权限不足，惩罚未执行。';assert(panel(t,'1').content.includes('权限不足'));assert(panel(t,'4').content.includes('未执行'));
});
test('expired old panel reconnects with renewed credentials in the same turn',async tst=>{
 const st=storage(),p=new PrivatePanels(st,{BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'}),t=started();const old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);let seq=100,posts=0;
 globalThis.fetch=async(url,o)=>{if(o.method==='POST')posts++;return Response.json({id:String(++seq)});};
 await p.remember(t,{token:'first',member:{user:{id:'1'}},data:{}},{type:4,data:{flags:64}});await p.sync(t);const records=await p.read();records['1'].send.token='renewed';records['1'].send.expires=Date.now()+10000;records['1'].panel.expires=Date.now()-1;await st.put('privatePanels',await st.get('privatePanels'));
 // Write encryption directly to preserve the expired panel until prune is invoked.
 const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},await p.key(),new TextEncoder().encode(JSON.stringify(records)));
 const pack=x=>btoa(String.fromCharCode(...new Uint8Array(x)));await st.put('privatePanels',{iv:pack(iv),data:pack(bytes)});
 await p.prune(t);await p.sync(t);assert.equal(posts,2);assert(await st.get('privateSyncAt'));assert((await p.read())['1'].panel.expires>Date.now());
});
test('failed private updates and old-panel retirement stop after bounded retries',async tst=>{
 const st=storage(),p=new PrivatePanels(st,{BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'}),t=started(),old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);
 globalThis.fetch=async()=>Response.json({id:'100'});await p.remember(t,{token:'token',member:{user:{id:'1'}},data:{}},{type:4,data:{flags:64}});await p.sync(t);t.version++;
 const records=await p.read();records['1'].retire=[{token:'retired',expires:Date.now()+10000,ref:'99'}];await p.write(records);let patches=0;globalThis.fetch=async()=>{patches++;return new Response('',{status:403});};
 for(let n=0;n<6;n++)await p.sync(t);assert.equal(patches,6);assert.equal((await p.read())['1'].retire.length,0);
});
test('nickname application retry preserves an intervening human or other-game nickname change',async tst=>{
 const st=storage(),service=new DuelRoulettePenalties({ctx:{storage:st},env:{BOT_TOKEN:'test'}}),t=started();game.settle(t,'1','胜利');await service.dispatch({guild:'3',action:'create',penalty:t.penalty});
 const records=await st.get('duelRoulettePenalties');Object.assign(records[t.penalty.id],{status:'applyingRename',original:'原昵称',nickname:'临时昵称',restoreAt:Date.now()+60000,retryAt:Date.now()-1});await st.put('duelRoulettePenalties',records);
 let patches=0;const old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);globalThis.fetch=async(url,o)=>{if(o.method==='PATCH')patches++;return Response.json({nick:'人工新昵称'});};await service.alarm('3');assert.equal(patches,0);assert.equal((await service.dispatch({guild:'3',action:'view',id:t.penalty.id})).status,'externallyChanged');
});
test('500 complete roulette games preserve health, item capacity, valid turns and round-trip snapshots',()=>{
 for(let n=0;n<500;n++){
  const s=new DevilState(['1','4'],{rng:defaultRng(),alternateFirstTurn:true});let steps=0;
  while(s.phase!=='ended'){
   assert(++steps<250,`game ${n} exceeded action bound`);assert(s.totalRemaining>0);assert(['1','4'].includes(s.currentPlayerId));
   for(const id of s.players){assert(s.hp[id]>0&&s.hp[id]<=4);assert(s.items[id].length<=4);for(const k of Object.keys(s.knownShells[id]))assert(Number(k)>=s.pointer&&Number(k)<s.shells.length);}
   if(steps%5===0)assert.deepEqual(DevilState.restore(s.serialize()).serialize(),s.serialize());
   const id=s.currentPlayerId,usable=[...new Set(s.items[id])].filter(k=>s.canUseItem(id,k));
   const action=usable.length&&steps%3===0?usable[0]:'shoot_opponent';s.apply(action,id,{expectedToken:s.turnToken,...(action==='adrenaline'?{stealKey:s._stealableItems(id)[0]}:{})});
  }
  assert.equal(s.hp[s.other(s.winnerId)],0);assert(s.hp[s.winnerId]>0);
 }
});
