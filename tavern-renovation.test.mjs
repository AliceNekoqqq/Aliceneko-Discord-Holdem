import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {TavernRenovation} from './tavern-renovation.mjs';
import {RENOVATION_ITEMS,SHOP_STAGES,shopStage} from './tavern-renovation-catalog.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {db,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)};
}
const setup=()=>{const store=storage(),service=new TavernService(store);return {store,service}};
const p={guild:'3',id:'1',name:'Alice',channel:'2'};
function renoDraft(s,item,title,key='key',at=Date.now()){return s.dispatch({...p,action:'renoPrepare',item,title,requestKey:key,at});}

test('catalog has 18 one-time objects, six three-level facilities and five increasing stages',()=>{
 assert.equal(RENOVATION_ITEMS.length,24);assert.equal(RENOVATION_ITEMS.filter(x=>x.kind==='object').length,18);assert.equal(RENOVATION_ITEMS.filter(x=>x.kind==='facility'&&x.levels.length===3).length,6);
 assert.deepEqual(SHOP_STAGES.map(x=>x.threshold),[0,600,3000,10000,25000]);assert.equal(shopStage(9999).level,2);assert.equal(shopStage(10000).level,3);assert.equal(shopStage(25000).level,4);
 assert.equal(RENOVATION_ITEMS.filter(x=>x.kind==='object').reduce((n,x)=>n+x.levels[0].price,0),9510);assert.equal(RENOVATION_ITEMS.filter(x=>x.kind==='facility').flatMap(x=>x.levels).reduce((n,x)=>n+x.price,0),32900);
 for(const item of RENOVATION_ITEMS.filter(x=>x.kind==='facility'))assert.deepEqual(item.levels.map(x=>x.stage),[item.levels[0].stage,Math.min(4,item.levels[0].stage+1),Math.min(4,item.levels[0].stage+2)]);
 assert.equal(RENOVATION_ITEMS.find(x=>x.id==='table_lamp').levels[0].price,120);assert.equal(RENOVATION_ITEMS.find(x=>x.id==='ceramic_vase').levels[0].price,140);assert.equal(RENOVATION_ITEMS.find(x=>x.id==='chalk_menu').levels[0].price,120);
});

test('public board and scene are lazy, expose no member balance, private board creates its wallet, and legacy orders backfill once',async()=>{
 const {store,service:s}=setup();assert.equal(s.rows('SELECT * FROM tavern_members').length,0);
 s.view('1','Alice');store.sql.exec('INSERT INTO tavern_orders(id,user_id,channel,item,price,details,at) VALUES(?,?,?,?,?,?,?)','legacy1','1','2','milk',15,JSON.stringify({itemName:'旧单'}),100);
 const publicBoard=await s.dispatch({guild:'3',action:'renoBoard'}),scene=await s.dispatch({guild:'3',action:'renoScene'});
 assert.equal(publicBoard.total,15);assert.equal(publicBoard.balance,undefined);assert.equal(scene.assets.length,0);
 const privateBoard=await s.dispatch({guild:'3',action:'renoBoard',id:'2',name:'New guest',privateView:true});assert.equal(privateBoard.balance,60);assert.equal(s.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,60);
 const one=s.renovation.board();assert.equal(one.consumption,15);assert.equal(one.direct,0);assert.equal(one.total,15);
 s.renovation.recordConsumption({id:'legacy1',user_id:'1',price:15,at:100},false);assert.equal(s.renovation.board().consumption,15);
 const restarted=new TavernService(store);assert.equal(restarted.renovation.board().consumption,15);
});

test('first paid order records consumption in the same transaction; free orders count zero and repeats do not recount',()=>{
 const {store,service:s}=setup(),d=s.prepare({...p,item:'milk',requestKey:'milk'}),a=s.confirm('1',d.id,'2');assert.equal(s.renovation.board().consumption,15);assert.equal(s.confirm('1',d.id,'2').repeated,true);assert.equal(s.renovation.board().consumption,15);
 const free=s.prepare({...p,item:'water',requestKey:'water'});s.confirm('1',free.id,'2',Date.now()+11000);assert.equal(s.renovation.board().consumption,15);
 const d2=s.prepare({...p,item:'milk',requestKey:'second'});const original=store.sql.exec;store.sql.exec=(q,...a)=>{if(q.startsWith('INSERT INTO tavern_reno_consumption'))throw Error('reno write failure');return original(q,...a)};
 assert.throws(()=>s.confirm('1',d2.id,'2',Date.now()+22000),/reno write failure/);store.sql.exec=original;
 assert.equal(s.one('SELECT status FROM tavern_drafts WHERE id=?',d2.id).status,'pending');assert.equal(s.one('SELECT balance FROM tavern_members WHERE id=?','1').balance,45);assert.equal(s.rows('SELECT * FROM tavern_orders').length,2);
});

test('purchase and each facility upgrade atomically debit, preserve founder/name and keep public identity snapshots',()=>{
 const {service:s}=setup();s.view('1','Alice');s.sql.exec('UPDATE tavern_members SET balance=balance+5000 WHERE id=?','1');const wallet=s.one('SELECT balance FROM tavern_members WHERE id=?','1').balance;const draft=s.renovation.prepare({...p,item:'coat_rack',title:'Alice 的衣帽架',requestKey:'object'});const purchase=s.renovation.confirm('1',draft.id,'2');assert.equal(purchase.balance,wallet-160);assert.equal(purchase.repeated,false);
 assert.equal(s.renovation.confirm('1',draft.id,'2').repeated,true);
 s.sql.exec('UPDATE tavern_members SET balance=balance+1000 WHERE id=?','1');
 const asset=s.one('SELECT * FROM tavern_reno_assets WHERE item=?','coat_rack');assert.equal(asset.name,'Alice 的衣帽架');assert.equal(asset.founder_id,'1');
 s.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','growth-seat','1','Alice',180,1);
 const facility=s.renovation.prepare({...p,item:'seating',title:'第一排座位',requestKey:'seat1'});const l1=s.renovation.confirm('1',facility.id,'2');
 assert.equal(l1.asset.level,1);const upgrade=s.renovation.prepare({...p,item:'seating',title:'柔软坐垫',requestKey:'seat2'});const l2=s.renovation.confirm('1',upgrade.id,'2');
 const after=s.one('SELECT * FROM tavern_reno_assets WHERE item=?','seating');assert.equal(after.level,2);assert.equal(after.name,'第一排座位');assert.equal(after.founder_id,'1');assert.equal(after.updated_id,'1');
 assert.equal(l2.asset.levelName,'柔软坐垫');assert.equal(s.renovation.board().assets.find(a=>a.item==='seating').levelName,'柔软坐垫');assert.equal(s.renovation.scene().assets.find(a=>a.item==='座位区').levelName,'柔软坐垫');
 assert.throws(()=>s.renovation.prepare({...p,item:'seating',title:'第三排座位',requestKey:'seat3-locked'}),/成长至常客客厅/);
 assert.equal(s.renovation.history('seating').entries.length,2);assert.equal(s.renovation.board().direct,160+400+1000);assert.equal(l2.contribution.name,'柔软坐垫');
});

test('competing drafts for an object or stale facility level cannot double-spend; invalid names are rejected',()=>{
 const {service:s}=setup();s.view('1','Alice');s.view('2','Bob');
 s.sql.exec('UPDATE tavern_members SET balance=balance+500 WHERE id=?','1');s.sql.exec('UPDATE tavern_members SET balance=balance+500 WHERE id=?','2');
 const a=s.renovation.prepare({...p,item:'coat_rack',title:'<@123456789>**衣帽架**',requestKey:'a'});
 assert.equal(a.name,'衣帽架');assert.throws(()=>s.renovation.prepare({...p,item:'window_seat',title:'!!',requestKey:'bad-symbols'}),/冠名需为2～24字/);assert.throws(()=>s.renovation.prepare({...p,item:'window_seat',title:'这是一个超过二十四个字符的冠名名称一定不能通过校验',requestKey:'too-long'}),/冠名需为2～24字/);
 const b=s.renovation.prepare({...p,id:'2',name:'Bob',item:'coat_rack',title:'',requestKey:'b'});
 s.renovation.confirm('1',a.id,'2');const balance=s.one('SELECT balance FROM tavern_members WHERE id=?','2').balance;assert.throws(()=>s.renovation.confirm('2',b.id,'2'),/已被其他常客更新|已经购置/);assert.equal(s.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,balance);
 const x=s.renovation.prepare({...p,item:'seating',requestKey:'x'}),y=s.renovation.prepare({...p,id:'2',name:'Bob',item:'seating',requestKey:'y'});s.renovation.confirm('1',x.id,'2');assert.throws(()=>s.renovation.confirm('2',y.id,'2'),/已被其他常客更新/);
});

test('insufficient, expired and changed-price drafts do not spend; completed receipts replay after expiry and guilds isolate',async()=>{
 const {service:s}=setup(),at=Date.now();s.view('1','Alice');
 const costly=s.renovation.prepare({...p,item:'oak_table',requestKey:'costly'},at);
 assert.throws(()=>s.renovation.confirm('1',costly.id,'2',at),/还差300/);
 const expired=s.renovation.prepare({...p,item:'coat_rack',requestKey:'expired'},at);
 assert.throws(()=>s.renovation.confirm('1',expired.id,'2',at+180000),/过期/);
 const changed=s.renovation.prepare({...p,item:'coat_rack',requestKey:'changed'},at);s.sql.exec('UPDATE tavern_reno_drafts SET price=60 WHERE id=?',changed.id);
 assert.throws(()=>s.renovation.confirm('1',changed.id,'2',at),/重新预览/);
 assert.equal(s.view('1').member.balance,60);assert.equal(s.renovation.board().direct,0);assert.equal(s.rows('SELECT * FROM tavern_reno_assets').length,0);
 s.sql.exec('UPDATE tavern_members SET balance=balance+100 WHERE id=?','1');const normal=s.renovation.prepare({...p,item:'coat_rack',title:'旧街衣帽架',requestKey:'normal'},at);s.renovation.confirm('1',normal.id,'2',at);
 assert(s.renovation.confirm('1',normal.id,'2',at+86400000).repeated);assert.equal(s.view('1').member.balance,0);assert.equal(s.renovation.board().direct,160);
 await s.dispatch({...p,action:'renoScene'});await assert.rejects(()=>s.dispatch({...p,guild:'4',action:'renoScene'}),/不匹配/);
 const other=setup().service;assert.equal(other.renovation.board().total,0);assert.equal(other.rows('SELECT * FROM tavern_members').length,0);
});

test('blank title defaults to a safe donor plus item; facility levels unlock progressively and keep level names',()=>{
 const {service:s}=setup(),named={...p,name:'<@123> **Alice**'};s.view('1','Alice');s.sql.exec('UPDATE tavern_members SET balance=balance+5000 WHERE id=?','1');
 const d=s.renovation.prepare({...named,item:'seating',title:'',requestKey:'default'});assert.equal(d.name,'Alice的座位区');s.renovation.confirm('1',d.id,'2');
 assert.throws(()=>s.renovation.prepare({...named,item:'seating',title:'升级坐垫',requestKey:'level2-locked'}),/成长至暖灯酒馆/);
 s.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','grow1','1','Alice',300,1);
 const second=s.renovation.prepare({...named,item:'seating',title:'柔软坐垫',requestKey:'level2'});assert.equal(second.level,2);s.renovation.confirm('1',second.id,'2');
 let asset=s.renovation.board().assets.find(x=>x.item==='seating');assert.equal(asset.name,'Alice的座位区');assert.equal(asset.levelName,'柔软坐垫');
 assert.throws(()=>s.renovation.prepare({...named,item:'seating',title:'会客区升级',requestKey:'level3-locked'}),/成长至常客客厅/);
 s.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','grow2','1','Alice',1400,2);
 const third=s.renovation.prepare({...named,item:'seating',title:'会客区升级',requestKey:'level3'});assert.equal(third.level,3);s.renovation.confirm('1',third.id,'2');
 asset=s.renovation.board().assets.find(x=>x.item==='seating');assert.equal(asset.name,'Alice的座位区');assert.equal(asset.levelName,'会客区升级');assert.equal(asset.founder.name,'Alice');
});

test('failed renovation ledger write rolls back balance, asset, archive and draft status together',()=>{
 const {store,service:s}=setup();s.view('1','Alice');s.sql.exec('UPDATE tavern_members SET balance=balance+100 WHERE id=?','1');const d=s.renovation.prepare({...p,item:'coat_rack',title:'门边衣帽架',requestKey:'rollback'}),before=s.one('SELECT balance FROM tavern_members WHERE id=?','1').balance,original=store.sql.exec;
 store.sql.exec=(q,...a)=>{if(q.startsWith('INSERT INTO tavern_ledger')&&a[3]==='renovation')throw Error('ledger failure');return original(q,...a)};
 assert.throws(()=>s.renovation.confirm('1',d.id,'2'),/ledger failure/);store.sql.exec=original;
 assert.equal(s.one('SELECT balance FROM tavern_members WHERE id=?','1').balance,before);assert.equal(s.one('SELECT * FROM tavern_reno_assets WHERE item=?','coat_rack'),null);assert.equal(s.rows('SELECT * FROM tavern_reno_direct').length,0);assert.equal(s.one('SELECT status FROM tavern_reno_drafts WHERE id=?',d.id).status,'pending');
});

test('pending renovation previews are capped and history pages clamp to the last valid page',()=>{
 const {service:s}=setup(),items=['oak_table','window_seat','bookshelf','coat_rack','copper_lamp','table_lamp','river_photo','ceramic_vase','chalk_menu'];
 for(let i=0;i<8;i++)s.renovation.prepare({...p,item:items[i],requestKey:`pending${i}`});
 assert.throws(()=>s.renovation.prepare({...p,item:items[8],requestKey:'pending8'}),/还有几份装修预览/);
 for(let i=0;i<9;i++)s.sql.exec('INSERT INTO tavern_reno_direct VALUES(?,?,?,?,?,?,?,?,?,?)',`page${i}`,`u${i}`,`N${i}`,'oak_table',1,0,`档案${i}`,1,'purchase',500+i);
 const last=s.renovation.history(undefined,999);assert.equal(last.page,1);assert.equal(last.entries.length,1);assert.equal(last.hasMore,false);
});

test('growth gating follows total consumption plus direct funding and board exposes private values only by id',()=>{
 const {service:s}=setup();s.view('1','Alice');const b=s.renovation.board();assert.equal(b.catalog.find(x=>x.id==='pastry_case').available,false);
 assert.throws(()=>s.renovation.prepare({...p,item:'pastry_case',requestKey:'locked'}),/成长至常客客厅/);
 s.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','growth','1','Alice',3000,1);
 const unlocked=s.renovation.board();assert.equal(unlocked.stage.level,2);assert.equal(unlocked.catalog.find(x=>x.id==='pastry_case').available,true);
 const privateBoard=s.renovation.board('1','Alice');assert.equal(privateBoard.balance,60);assert.equal(privateBoard.mine.total,3000);
});

test('owned facility levels and old-price previews survive catalog repricing safely',()=>{
 const {service:s}=setup();s.view('1','Alice');s.renovation.board();
 s.sql.exec('INSERT INTO tavern_reno_assets VALUES(?,?,?,?,?,?,?,?)','seating',2,'旧价建成的软座','1','Alice','1','Alice',10);
 const owned=s.renovation.board().assets.find(x=>x.item==='seating');assert.equal(owned.level,2);assert.equal(owned.name,'旧价建成的软座');assert.equal(owned.founder.name,'Alice');
 const balance=s.view('1').member.balance,preview=s.renovation.prepare({...p,item:'coat_rack',title:'旧价格预览',requestKey:'stale-old-price'});
 assert.equal(preview.price,160);s.sql.exec('UPDATE tavern_reno_drafts SET price=60 WHERE id=?',preview.id);
 assert.throws(()=>s.renovation.confirm('1',preview.id,'2'),/重新预览/);
 assert.equal(s.view('1').member.balance,balance);assert.equal(s.renovation.board().direct,0);assert.equal(s.renovation.board().assets.find(x=>x.item==='seating').level,2);
});

test('migration preserves old stage unlocks while new stores use only the new growth thresholds',()=>{
 const old=setup(),s=old.service;s.renovation;
 s.sql.exec('INSERT INTO tavern_orders(id,user_id,channel,item,price,details,at) VALUES(?,?,?,?,?,?,?)','old-6000','legacy','2','milk',6000,JSON.stringify({itemName:'旧单'}),1);
 s.sql.exec("DELETE FROM tavern_reno_meta WHERE key='legacy_backfill_v1'");
 s.sql.exec("DELETE FROM tavern_reno_meta WHERE key='economy_v2_stage_floor'");
 const migrated=new TavernRenovation(s);assert.equal(migrated.board().stage.level,4);
 assert.equal(migrated.one("SELECT value FROM tavern_reno_meta WHERE key='economy_v2_stage_floor'").value,'4');
 const restarted=new TavernRenovation(s);assert.equal(restarted.scene().stage.level,4);assert.equal(restarted.board().total,6000);assert.equal(restarted.board().consumption,6000);

 const fresh=setup(),freshReno=fresh.service.renovation;
 fresh.service.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','new-6000','member','新常客',6000,1);
 assert.equal(freshReno.board().stage.level,2);

 const mid=setup(),midReno=mid.service.renovation;
 mid.service.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','mid-1000','legacy','中级旧店',1000,1);
 mid.service.sql.exec("DELETE FROM tavern_reno_meta WHERE key='economy_v2_stage_floor'");
 const midMigrated=new TavernRenovation(mid.service);assert.equal(midMigrated.board().stage.level,2);
 mid.service.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)','mid-growth','legacy','中级旧店',9000,2);
 assert.equal(midMigrated.board().stage.level,3);assert.equal(midMigrated.board().total,10000);
});

test('names are data snapshots; channel and user ownership protect drafts; history paginates',()=>{
 const {service:s}=setup();s.view('1','Alice');s.view('2','Bob');
 s.sql.exec('UPDATE tavern_members SET balance=balance+100 WHERE id=?','1');const d=s.renovation.prepare({...p,item:'coat_rack',title:'私家冠名',requestKey:'private'});
 assert.throws(()=>s.renovation.draft(d.id,'2','2'),/不是你的/);assert.throws(()=>s.renovation.draft(d.id,'1','9'),/不是你的/);
 s.renovation.confirm('1',d.id,'2');assert.equal(s.renovation.scene().assets[0].name,'私家冠名');assert.equal(s.renovation.scene().assets[0].founder,'Alice');
 for(let i=0;i<9;i++)s.sql.exec('INSERT INTO tavern_reno_direct VALUES(?,?,?,?,?,?,?,?,?,?)',`r${i}`,`u${i}`,`N${i}`,'oak_table',1,0,`冠名${i}`,1,'purchase',200+i);
 assert.equal(s.renovation.history().entries.length,8);assert.equal(s.renovation.history().hasMore,true);assert.equal(s.renovation.history('coat_rack').entries.length,1);assert.equal(s.renovation.history(undefined,1).entries.length,2);
});
