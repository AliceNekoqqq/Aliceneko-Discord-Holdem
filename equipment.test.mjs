import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {MENU} from './tavern-catalog.mjs';
import {RENOVATION_ITEMS} from './tavern-renovation-catalog.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');
 const store={sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length)return {toArray:()=>s.all(...args)};s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {store,s:new TavernService(store)};
}
const base={id:'1',name:'Alice',channel:'2'};
function fund(s,id='1'){s.member(id);s.sql.exec('UPDATE tavern_members SET balance=20000 WHERE id=?',id);}
function draft(s,item,key='buy',id='1'){return s.renovation.prepare({...base,id,item,requestKey:key});}
test('equipment gate preserves original menu, prevents forged orders and unlocks public coffee after one paid purchase',()=>{
 const {store,s}=setup();assert.equal(s.operations.menu().length,20);assert.equal(s.operations.lockedMenu().length,9);
 assert.equal(s.rows('SELECT * FROM tavern_members').length,0);
 for(const item of MENU.filter(x=>x.requiresEquipment))assert.throws(()=>s.prepare({...base,item:item.id,requestKey:'forged'}),/尚未解锁/);
 assert.equal(s.rows('SELECT * FROM tavern_drafts').length,0);
 fund(s);const d=draft(s,'coffee_machine');assert.equal(s.operations.menu().length,20);
 const answer=s.renovation.confirm('1',d.id,'2');assert.equal(answer.balance,19100);assert.equal(s.operations.menu().length,23);
 assert.equal(s.view('9').menu.filter(x=>x.requiresEquipment==='coffee_machine').length,3);
 assert(s.renovation.confirm('1',d.id,'2').repeated);assert.equal(s.member('1').balance,19100);
 assert.equal(s.rows("SELECT * FROM tavern_ledger WHERE kind='renovation'").length,1);
 const restored=new TavernService(store);assert(restored.operations.item('cappuccino'));assert.equal(setup().s.operations.item('cappuccino'),null);
 const order=restored.prepare({...base,item:'cappuccino',requestKey:'coffee'});assert.equal(order.price,28);const paid=restored.confirm('1',order.id,'2');assert.equal(paid.balance,19072);assert(restored.confirm('1',order.id,'2').repeated);
});
test('equipment purchase rollback leaves money, public unlock and contribution unchanged',()=>{
 const {store,s}=setup();fund(s);const d=draft(s,'coffee_machine');const exec=store.sql.exec;
 store.sql.exec=(q,...args)=>{if(q.startsWith('INSERT INTO tavern_ledger')&&args[3]==='renovation')throw Error('disk');return exec(q,...args);};
 assert.throws(()=>s.renovation.confirm('1',d.id,'2'),/disk/);store.sql.exec=exec;
 assert.equal(s.member('1').balance,20000);assert.equal(s.renovation.board().total,0);assert.equal(s.operations.item('cappuccino'),null);
 assert.equal(s.one('SELECT status FROM tavern_reno_drafts WHERE id=?',d.id).status,'pending');
 assert.equal(s.renovation.confirm('1',d.id,'2').balance,19100);
});
test('concurrent previews buy shared equipment once, respecting owner/channel and stage',()=>{
 const {s}=setup();fund(s);fund(s,'9');assert.throws(()=>draft(s,'blender','stage'),/成长/);
 const a=draft(s,'coffee_machine','a'),b=draft(s,'coffee_machine','b','9');
 assert.throws(()=>s.renovation.confirm('9',a.id,'2'),/不是你的/);assert.throws(()=>s.renovation.confirm('1',a.id,'4'),/不是你的/);
 s.renovation.confirm('1',a.id,'2');assert.throws(()=>s.renovation.confirm('9',b.id,'2'),/其他常客/);assert.equal(s.member('9').balance,20000);
 assert.equal(s.rows('SELECT * FROM tavern_reno_assets').length,1);assert.equal(s.operations.menu().length,23);
});
test('all four equipment map to nine unique menu items and unlock only their recipes',()=>{
 const {s}=setup();fund(s);s.renovation.board();s.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','fixture','1','Alice',10000,Date.now());
 let expected=20;
 for(const equipment of RENOVATION_ITEMS.filter(x=>x.menuUnlocks)){
  const dishes=MENU.filter(x=>x.requiresEquipment===equipment.id);assert.deepEqual(new Set(dishes.map(x=>x.name)),new Set(equipment.menuUnlocks));
  const d=draft(s,equipment.id,equipment.id);s.renovation.confirm('1',d.id,'2');expected+=dishes.length;assert.equal(s.operations.menu().length,expected);
 }
 assert.equal(expected,29);assert.equal(s.operations.lockedMenu().length,0);assert.equal(s.renovation.board().direct,8200);
});
test('confirmation revalidates equipment even for a fabricated pending order',()=>{
 const {s}=setup();fund(s);s.operations.menu();
 s.sql.exec('INSERT INTO tavern_drafts VALUES(?,?,?,?,?,?,?,?,?)','fake','key','1','2','cappuccino',28,'{}',Date.now()+180000,'pending');
 assert.throws(()=>s.confirm('1','fake','2'),/菜单已更新/);assert.equal(s.member('1').balance,20000);assert.equal(s.rows('SELECT * FROM tavern_orders').length,0);
});
