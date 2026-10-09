import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {TavernOperations} from './tavern-operations.mjs';

function storage(){const db=new DatabaseSync(':memory:'),map=new Map();return {db,sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...a);return {toArray:()=>rows,one:()=>rows[0]}}s.run(...a);return {toArray:()=>[]}}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)}}
const ts=s=>Date.parse(`${s}T12:00:00+08:00`);
const fixedClock=()=>ts('2026-10-09');
function setup(randomIndex=()=>0,clock=fixedClock){const store=storage(),service=new TavernService(store),ops=new TavernOperations(service,randomIndex,clock);return {store,service,ops}}
const order=(id,user_id,at,price=15,name='')=>({id,user_id,at,price,name});
const actor=(id,name=id)=>({id,name});

test('Beijing day boundary, persisted daily manager, restart stability, empty slate and first visitor fill',()=>{
 const {store,ops}=setup(n=>n-1),before=ts('2026-10-07'),after=ts('2026-10-08');
 let b=ops.board(null,before);assert.equal(b.manager,null);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM tavern_members').get().n,0);
 ops.visit('11','One',before);ops.visit('22','Two',before+1000);b=ops.board(null,before+2000);assert.equal(b.manager.id,'11');
 const restarted=new TavernOperations(new TavernService(store),()=>0,fixedClock);assert.equal(restarted.board(null,before+4000).manager.id,'11');assert.equal(restarted.board(null,after).manager.id,'11');
 const {ops:empty}=setup();const d=empty.board(null,before);assert.equal(d.manager,null);empty.visit('9','First',before);assert.equal(empty.board(null,before).manager.id,'9');
});


test('Beijing 23:59:59 to midnight rotates the persisted manager exactly at the day boundary',()=>{
 const store=storage(),service=new TavernService(store),before=Date.parse('2026-10-08T23:59:59+08:00'),midnight=before+1000;service.member('1','Alice',before-1000);service.member('2','Bob',before-1000);let draw=0;const ops=new TavernOperations(service,n=>draw++===0?0:n-1,()=>midnight);
 const prior=ops.board(null,before);assert.equal(prior.day,'2026-10-08');assert.equal(prior.nextDayAt,midnight);assert.equal(prior.manager.id,'1');
 const next=ops.board(null,midnight);assert.equal(next.day,'2026-10-09');assert.equal(next.manager.id,'2');assert.equal(ops.board(null,midnight+60000).manager.id,'2');
});

test('manager draw can choose any equally eligible legacy candidate via injected secure-random seam',()=>{
 const store=storage(),service=new TavernService(store),at=ts('2026-10-08');service.member('1','Alice',at);service.member('2','Bob',at);service.sql.exec('UPDATE tavern_members SET joined_at=? WHERE id=?',at,'1');service.sql.exec('UPDATE tavern_members SET joined_at=? WHERE id=?',at,'2');const ops=new TavernOperations(service,n=>n-1,fixedClock);assert.equal(ops.board(null,at).manager.id,'2');
});

test('visits are real-person candidates, name refresh and six-hour write throttling',()=>{
 const {ops}=setup(),at=ts('2026-10-01');ops.visit('1','Alice',at);ops.visit('1','Alice',at+1000);assert.equal(ops.one('SELECT last_visit FROM tavern_ops_visits WHERE user_id=?','1').last_visit,at);ops.visit('1','Alicia',at+2000);assert.equal(ops.one('SELECT name FROM tavern_ops_visits WHERE user_id=?','1').name,'Alicia');assert.throws(()=>ops.visit('bot','Bot',at),/无效/);
});

test('manager settings reject non-manager, invalid value and stale day; accepted fields persist',()=>{
 const {ops}=setup(),at=ts('2026-10-08'),b=ops.visit('1','Alice',at);assert.equal(b.mine.isManager,true);assert.throws(()=>ops.set({id:'2',day:b.day,field:'welcome',value:'warm'},at),/只有今日店长/);assert.throws(()=>ops.set({id:'1',day:'2026-10-07',field:'welcome',value:'warm'},at),/过期/);assert.throws(()=>ops.set({id:'1',day:b.day,field:'balance',value:'warm'},at),/有效/);assert.equal(ops.set({id:'1',day:b.day,field:'welcome',value:'cozy'},at).settings.welcome,'cozy');
});

test('monthly vote may change until unlock; locked or old-month votes fail and tie uses catalogue order',()=>{
 const {ops}=setup(),at=ts('2026-10-08');ops.vote({id:'1',name:'Alice',month:'202610',candidate:'c2'},at);ops.vote({id:'2',name:'Bob',month:'202610',candidate:'c1'},at);assert.equal(ops.board('1',at).mine.vote.candidate,'c2');ops.vote({id:'1',name:'Alice',month:'202610',candidate:'c1'},at);assert.equal(ops.board('1',at).mine.vote.candidate,'c1');
 for(let i=0;i<30;i++)ops.recordGame(`g${i}`,{at},[actor('1','Alice')]);assert.equal(ops.board(null,at).season.unlocked,true);assert.equal(ops.board(null,at).season.selected,'c1');assert.throws(()=>ops.vote({id:'3',month:'202610',candidate:'c2'},at),/已经解锁/);assert.throws(()=>ops.vote({id:'1',month:'202609',candidate:'c1'},at),/过期/);
});

test('paid order gives first daily customer one point, de-duplicates, and rolls back with caller transaction',()=>{
 const {store,ops}=setup(),at=ts('2026-10-08');ops.host.member('1','Alice',at);ops.host.member('2','Bob',at);assert.equal(ops.recordOrder(order('o1','1',at),false),true);assert.equal(ops.recordOrder(order('o2','1',at+500),false),true);assert.equal(ops.board(null,at).season.points,1);assert.equal(ops.board(null,at).activity.orderGuests,1);ops.recordOrder(order('o3','2',at+1000,0),false);assert.equal(ops.board(null,at).season.points,1);
 assert.throws(()=>store.transactionSync(()=>{ops.recordOrder(order('rollback','2',at),true);throw Error('rollback')}),/rollback/);assert.equal(ops.one("SELECT COUNT(*) n FROM tavern_ops_events WHERE event_key='order:rollback'").n,0);assert.equal(ops.board(null,at).season.points,1);
});

test('qualifying game events are idempotent, actors participate once per event, and historical events do not unlock current season',()=>{
 const {ops}=setup(),old=ts('2026-09-30'),now=ts('2026-10-01');assert.equal(ops.recordGame('same',{at:old},[actor('1','A'),actor('2','B')],false),true);assert.equal(ops.recordGame('same',{at:old},[actor('1','A')],false),false);assert.equal(ops.board(null,old).season.points,1);for(let i=0;i<29;i++)ops.recordGame(`old${i}`,{at:old},[actor('1','A')],false);assert.equal(ops.board(null,now).season.unlocked,false);assert.equal(ops.board(null,old).season.unlocked,false);assert.equal(ops.board(null,old).activity.gameCount,30);
});

test('season menu unlock is month scoped and previous preview item disappears after month rollover',()=>{
 const {ops}=setup(),oct=ts('2026-10-08'),nov=ts('2026-11-01');ops.vote({id:'1',month:'202610',candidate:'c3'},oct);for(let i=0;i<30;i++)ops.recordGame(`oct${i}`,{at:oct},[actor('1','Alice')]);const item=ops.item('season_202610_c3',oct);assert.equal(item.price,35);assert.equal(ops.item('season_202610_c3',nov),null);assert.equal(ops.item('season_202611_c1',nov),null);assert.deepEqual(ops.menu(nov).map(x=>x.id).slice(0,7),['water','tea','milk','soda','special','cake','snack']);
});


test('season unlock uses injected current month, independent of the machine month',()=>{
 const nov=ts('2026-11-09'),{ops}=setup(()=>0,()=>nov);for(let i=0;i<30;i++)ops.recordGame(`nov${i}`,{at:nov},[actor('1','Alice')]);const b=ops.board(null,nov);assert.equal(b.season.month,'202611');assert.equal(b.season.unlocked,true);assert.equal(ops.item('season_202611_c1',nov).price,28);
});

test('public board and scene do not create wallets or expose private data; private fields are opt-in',()=>{
 const {service,ops}=setup(),at=ts('2026-10-08');const publicBoard=ops.board(null,at),scene=ops.scene(at);assert.equal(publicBoard.mine,undefined);assert.equal(publicBoard.manager,null);assert.equal(service.rows('SELECT * FROM tavern_members').length,0);assert.equal(scene.source,'program_confirmed_operations');assert.equal(scene.id,undefined);assert.equal(scene.balance,undefined);assert.equal(JSON.stringify(scene).includes('restrictions'),false);ops.visit('1','Alice',at);assert.equal(ops.board('1',at).mine.isManager,true);
});

test('daily common activity reaches goal, participation is required, and stamp claims are idempotent',()=>{
 const {ops}=setup(),at=ts('2026-10-08');ops.visit('1','Alice',at);ops.visit('2','Bob',at);const day=ops.board(null,at).day;const actors=[actor('1','Alice'),actor('2','Bob')];ops.recordGame('a',{at},actors);ops.recordGame('b',{at},actors);ops.recordOrder(order('a1','1',at));ops.recordOrder(order('b1','2',at));const b=ops.board('1',at);assert.equal(b.activity.completed,true);assert.equal(b.activity.gameGoal,2);assert.equal(b.activity.orderGoal,2);assert.equal(ops.claim({id:'1',day},at).mine.stamps.length,1);assert.equal(ops.claim({id:'1',day},at).mine.stamps.length,1);assert.throws(()=>ops.claim({id:'3',day},at),/参与并完成/);assert.equal(ops.rows('SELECT * FROM tavern_ops_stamps').length,1);
});

test('exactly three seasonal candidates keep 28/32/35 prices, and menu browsing is wallet-free',async()=>{
 const {service,ops}=setup(),at=ts('2026-10-09');const b=ops.board(null,at);assert.equal(b.season.options.length,3);assert.deepEqual(b.season.options.map(x=>x.price),[28,32,35]);assert(b.season.options.every(x=>x.name&&x.description&&x.serve));
 assert.equal(await ops.dispatch({action:'opsBoard'}).then(x=>x.source),'program_confirmed_operations');await ops.dispatch({action:'opsMenu'});assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 await ops.dispatch({action:'opsMenu',id:'7',name:'Momo'});assert.equal(service.rows('SELECT * FROM tavern_members').length,0);assert.equal(ops.one('SELECT name FROM tavern_ops_visits WHERE user_id=?','7').name,'Momo');
});

test('vote registers the voter as a candidate without opening a wallet',()=>{
 const {service,ops}=setup(),at=ts('2026-10-09');ops.vote({id:'31',name:'Voter',month:'202610',candidate:'c2'},at);assert.equal(ops.one('SELECT name FROM tavern_ops_visits WHERE user_id=?','31').name,'Voter');assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
});

test('late previous-day confirmed order does not create a random manager draw for that old day',()=>{
 const {service,ops}=setup(),yesterday=ts('2026-10-08'),today=ts('2026-10-09');service.member('1','Alice',yesterday);service.member('2','Bob',yesterday);ops.recordOrder(order('late-order','1',yesterday),false);assert.equal(ops.one('SELECT day FROM tavern_ops_days WHERE day=?','2026-10-08'),null);assert(ops.board(null,today).manager);
});
