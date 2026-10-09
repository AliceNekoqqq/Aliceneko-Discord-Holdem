import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {dispatchPetHome,petHomeRequest} from './pet-registry.mjs';
import {DAILY_REWARD_CAP,dayKey} from './tavern-catalog.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {db,map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));}};
}
const base={guild:'3',id:'1',name:'Alice',channel:'2'};
function setup(){const store=storage(),host=new TavernService(store);let serial=0;return {store,host,pets:host.pets,do:(action,extra={},now=Date.now())=>host.pets.dispatch({...base,action,requestKey:String(++serial),...extra},now)};}
function adopt(s,now=Date.now()){return s.do('petAdopt',{species:'lamp-cat',petName:'灯灯'},now);}
const plan=['alley-paper','bakery-friend','drain-smell','fork-neighbor','porch-friend'];
function complete(s,now=Date.now(),material='paper'){
 let view=s.do('petStart',{material},now);
 let ticks=0;while(view.walk){
  const choice=view.walkView.choices.find(c=>c.id===plan[view.walk.step]&&!c.disabled)||view.walkView.choices.find(c=>!c.disabled);
  view=s.do('petAct',{walkId:view.walk.id,version:view.walk.version,choice:choice.id},now+(++ticks));
 }
 return view;
}

test('view does not create wallet; adoption is single, durable and never gives another welcome grant',()=>{
 const s=setup();assert.equal(s.do('petView').pet,null);assert.equal(s.host.rows('SELECT * FROM tavern_members').length,0);
 const v=adopt(s);assert.equal(v.balance,60);assert.equal(v.pet.name,'灯灯');
 assert.throws(()=>adopt(s),/只能领养一只/);
 assert.equal(new TavernService(s.store).pets.view('1').pet.species,'lamp-cat');
 assert.equal(s.host.rows("SELECT * FROM tavern_ledger WHERE kind='welcome'").length,1);
 assert.equal(s.host.pets.view('2').pet,null);
});
test('global immutable adoption home rejects a second server and cannot be rebound by another owner',async()=>{
 const store=storage();assert.deepEqual(await dispatchPetHome(store,{id:'1',guild:'3'}),{guild:null});
 assert.deepEqual(await dispatchPetHome(store,{id:'1',guild:'3',claim:true}),{guild:'3'});
 assert.deepEqual(await dispatchPetHome(store,{id:'1',guild:'4',claim:true}),{guild:'3'});
 await assert.rejects(()=>dispatchPetHome(store,{id:'2',guild:'4',claim:true}),/归属不匹配/);
 const env={TABLES:{idFromName:n=>n,get:n=>({fetch:async(_,o)=>{assert.equal(n,'pet-owner:1');return Response.json(await dispatchPetHome(store,JSON.parse(o.body)));}})}};
 assert.deepEqual(await petHomeRequest(env,{id:'1',guild:'4',claim:true}),{guild:'3'});
});
test('two reward opportunities are reserved once; starting resumes instead of rerolling and practice gives no assets',()=>{
 const s=setup(),now=Date.now();adopt(s,now);
 const a=s.do('petStart',{material:'metal'},now),b=s.do('petStart',{material:'cloth'},now+1);
 assert.equal(a.walk.id,b.walk.id);assert.equal(a.walk.seed,b.walk.seed);assert.equal(b.reward.used,1);assert.equal(b.walk.material,'metal');
 let v=complete(s,now+2);assert.equal(v.receipt.rewarded,true);assert.equal(v.materials.metal,v.receipt.materials);
 v=complete(s,now+20,'cloth');assert.equal(v.receipt.rewarded,true);assert.equal(v.reward.used,2);
 const before={balance:v.balance,materials:v.materials,growth:v.pet.growth};v=complete(s,now+40,'wood');
 assert.equal(v.receipt.rewarded,false);assert.equal(v.receipt.coins,0);assert.equal(v.receipt.materials,0);assert.equal(v.receipt.growth,0);
 assert.deepEqual({balance:v.balance,materials:v.materials,growth:v.pet.growth},before);
});
test('old walk version and another owner cannot act; complete result persists through restart',()=>{
 const s=setup();adopt(s);const start=s.do('petStart');const params={walkId:start.walk.id,version:0,choice:start.walkView.choices.find(c=>!c.disabled).id};
 s.do('petAct',params);assert.throws(()=>s.do('petAct',params),/路线已经变化/);
 assert.throws(()=>s.do('petAct',{...params,id:'2'}),/先领养/);
 const finish=complete(s);const reloaded=new TavernService(s.store).pets.view('1');assert.equal(reloaded.walk,null);assert.deepEqual(reloaded.receipt,finish.receipt);
 assert.throws(()=>s.do('petAct',params),/已经结束/);
});
test('repeated interaction key returns the same outcome without advancing or paying twice',()=>{
 const s=setup();adopt(s);const view=s.do('petStart');const p={walkId:view.walk.id,version:0,choice:view.walkView.choices.find(c=>!c.disabled).id,requestKey:'same'};
 const a=s.do('petAct',p),b=s.do('petAct',p);assert.equal(a.walk.step,b.walk.step);assert(b.notice.includes('没有重复'));
 assert.throws(()=>s.do('petCare',{requestKey:'same'}),/凭证不匹配/);
});
test('the pet subcap is inside the existing total cap and the wallet ledger matches actual credited amounts',()=>{
 const s=setup(),now=Date.now();adopt(s,now);s.host.sql.exec('INSERT INTO tavern_daily VALUES(?,?,?)','1',dayKey(now),DAILY_REWARD_CAP-3);
 const a=complete(s,now+1);assert.equal(a.receipt.coins,3);assert.equal(a.balance,63);
 const b=complete(s,now+20);assert.equal(b.receipt.coins,0);assert(b.receipt.materials>0);assert.equal(b.balance,63);
 assert.equal(s.host.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?','1',dayKey(now)).earned,DAILY_REWARD_CAP);
 assert.equal(s.host.one("SELECT SUM(amount) AS n FROM tavern_ledger WHERE kind='pet'").n,3);
});
test('daily arrival gift and pet settlement use the same allowance in either order',()=>{
 for(const giftFirst of [true,false]){
  const s=setup(),now=Date.now();adopt(s,now);
  s.host.sql.exec('INSERT INTO tavern_daily VALUES(?,?,?)','1',dayKey(now),130);
  if(giftFirst)s.host.claimDaily('1','Alice',now);
  const v=complete(s,now+1);
  if(!giftFirst)s.host.claimDaily('1','Alice',now+20);
  assert.equal(s.host.view('1','Alice',now).earned,150);
  assert.equal(s.host.view('1','Alice',now).member.balance,80);
  assert.equal(s.host.one('SELECT SUM(amount) AS n FROM tavern_ledger WHERE kind IN (?,?)','pet','daily_gift').n,20);
  assert.equal(v.receipt.coins,giftFirst?0:Math.min(10,6+v.receipt.stars*2));
 }
});
test('past-midnight settlement stays on the reserved day; care and new walks remain within per-day growth caps',()=>{
 const s=setup(),before=Date.parse('2026-10-09T15:59:50Z'),after=Date.parse('2026-10-09T16:00:10Z');adopt(s,before);s.do('petStart',{},before);
 const old=complete(s,after);assert.equal(old.receipt.day,'2026-10-09');assert.equal(old.reward.used,0);
 assert.equal(s.host.one('SELECT used FROM pet_daily WHERE owner=? AND day=?','1','2026-10-09').used,1);
 complete(s,after+20);const today=complete(s,after+40);assert.equal(today.reward.used,2);s.do('petCare',{},after+60);s.do('petCare',{},after+70);
 assert.equal(s.host.one('SELECT xp FROM pet_daily WHERE owner=? AND day=?','1','2026-10-10').xp,25);
});
test('wallet, ledger, growth, materials and final route all roll back on a failed settlement',()=>{
 const s=setup();adopt(s);let v=s.do('petStart');for(let n=0;n<4;n++){const choice=v.walkView.choices.find(c=>c.id===plan[n]&&!c.disabled)||v.walkView.choices.find(c=>!c.disabled);v=s.do('petAct',{walkId:v.walk.id,version:v.walk.version,choice:choice.id});}
 const params={walkId:v.walk.id,version:v.walk.version,choice:'porch-friend'},original=s.store.sql.exec;
 s.store.sql.exec=(q,...args)=>{if(q==='INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)'&&args[3]==='pet')throw Error('disk failed');return original(q,...args);};
 assert.throws(()=>s.do('petAct',params),/disk failed/);s.store.sql.exec=original;
 const failed=s.pets.view('1');assert.equal(failed.balance,60);assert.equal(failed.walk.step,4);assert.equal(failed.pet.growth,0);assert.deepEqual(failed.materials,{});
 const good=s.do('petAct',params);assert(good.receipt.coins>0);assert.equal(s.host.rows("SELECT * FROM tavern_ledger WHERE kind='pet'").length,1);
});
test('shop confirmation uses current price and recipe version; owned items cannot be bought twice and can be moved free',()=>{
 const s=setup();adopt(s);let pet=s.pets.profile('1');pet.materials.metal=1;s.pets.save('1',pet);
 assert.throws(()=>s.do('petBuy',{item:'bell-charm',expectedPrice:1,expectedShopVersion:'v1'}),/预览已变化/);
 const p={item:'bell-charm',expectedPrice:30,expectedShopVersion:'v1',requestKey:'buy-once'};
 const a=s.do('petBuy',p),b=s.do('petBuy',p);assert.equal(a.balance,30);assert.equal(b.balance,30);assert.equal(b.materials.metal,0);
 assert.throws(()=>s.do('petBuy',{...p,requestKey:'new-buy'}),/已经拥有/);
 const equipped=s.do('petEquip',{item:'bell-charm'});assert.equal(equipped.decor.charm,'bell-charm');assert.equal(equipped.balance,30);
 assert.throws(()=>s.do('petEquip',{item:'not-an-item'}),/已经拥有/);
});
test('a failed purchase cannot consume money or material; the original confirmation can retry safely',()=>{
 const s=setup();adopt(s);const pet=s.pets.profile('1');pet.materials.metal=1;s.pets.save('1',pet);const original=s.store.sql.exec;
 s.store.sql.exec=(q,...args)=>{if(q==='UPDATE pet_profiles SET body=?,version=version+1 WHERE owner=?')throw Error('profile write failed');return original(q,...args);};
 const p={item:'bell-charm',expectedPrice:30,expectedShopVersion:'v1',requestKey:'recover'};
 assert.throws(()=>s.do('petBuy',p),/profile write/);s.store.sql.exec=original;
 assert.equal(s.pets.view('1').balance,60);assert.equal(s.pets.view('1').materials.metal,1);assert.equal(s.host.rows("SELECT * FROM tavern_ledger WHERE kind='pet_shop'").length,0);
 assert.equal(s.do('petBuy',p).balance,30);
});
test('first crafted pinwheel is a one-time keepsake; repeated practice cannot duplicate it or produce materials',()=>{
 const s=setup();adopt(s);for(let n=0;n<4;n++)complete(s,Date.now()+n*20);
 const v=s.pets.view('1');assert.equal(v.items.filter(x=>x==='paper-pinwheel').length,1);assert.equal(v.pet.firstWindmill,true);assert(v.pet.unlockedHabits.includes('paper-lover'));
 assert(v.pet.memories.filter(x=>x.kind==='first-pinwheel').length===1);
});
test('all basic materials have a guaranteed selectable source and long absence causes no charge or lost pet',()=>{
 for(const material of ['paper','thread','wood','cloth','flower','metal']){const s=setup(),now=Date.now();adopt(s,now);const v=complete(s,now+1,material);assert(v.materials[material]>=1);const later=s.pets.view('1',now+100*86400000);assert.equal(later.pet.name,'灯灯');assert.equal(later.balance,v.balance);}
});
