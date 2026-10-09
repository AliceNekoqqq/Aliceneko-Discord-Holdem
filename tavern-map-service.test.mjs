import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { TavernMapService } from './tavern-map-service.mjs';

function storage() {
  const db = new DatabaseSync(':memory:');
  return { db, sql: { exec(q, ...a) { const s=db.prepare(q); if(s.columns().length){const rows=s.all(...a);return {toArray:()=>rows,one:()=>rows[0]}} s.run(...a);return {toArray:()=>[]}; } }, transactionSync(fn) { this.db.exec('BEGIN');try{const v=fn();this.db.exec('COMMIT');return v}catch(e){this.db.exec('ROLLBACK');throw e} } };
}
const snap = (overrides={}) => ({ guild:'100', channel:'200', epoch:'round-1', at:100000, expires:200000, game:'poker', phase:'flop', players:[{id:'1',name:'Alice',bot:false}], closed:false, ...overrides });

test('map tracking is wallet-free, validates IDs, sanitizes names, deduplicates visitors and throttles touches',()=>{
 const s=storage(),map=new TavernMapService(s);
 assert.equal(map.touch({id:'@everyone',name:'Bad',channel:'2'},1000),false);
 assert.equal(map.touch({id:'1',name:'@Alice\n',channel:'2'},1000),true);
 assert.equal(map.touch({id:'1',name:'Different',channel:'3'},1050),true); // rename bypasses throttle
 assert.equal(map.touch({id:'1',name:'Different',channel:'3'},1090),false);
 assert.equal(map.touch({id:'2',name:'Bob',channel:'3',kind:'order'},1090),true);
 assert.equal(map.board(1090).visitorCount,2);
 assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='tavern_members'").get().n,0);
 assert.equal(map.board(1090).visitors.find(v=>v.id==='1').name,'Different');
});

test('30-minute visitor boundary is inclusive, unique users count beyond display cap, and orders are aggregates only',()=>{
 const s=storage(),map=new TavernMapService(s),now=2000000;
 for(let i=1;i<=44;i++)map.touch({id:String(i),name:`P${i}`,channel:'9'},now-(i===1?1800000:1000));
 map.touch({id:'99',name:'Expired',channel:'9'},now-1800001);
 s.sql.exec('CREATE TABLE tavern_orders (id TEXT, user_id TEXT, item TEXT, price INTEGER, details TEXT, at INTEGER)');
 s.sql.exec('INSERT INTO tavern_orders VALUES(?,?,?,?,?,?)','private1','1','secret-item',24,'{"preference":"secret"}',now-10);
 s.sql.exec('INSERT INTO tavern_orders VALUES(?,?,?,?,?,?)','private2','2','free-tea',0,'{}',now-20);
 s.sql.exec('INSERT INTO tavern_orders VALUES(?,?,?,?,?,?)','old','3','x',99,'{}',now-1800001);
 const board=map.board(now);assert.equal(board.visitorCount,44);assert.equal(board.visitors.length,40);assert.equal(board.visitors.some(v=>v.id==='99'),false);
 assert.deepEqual(board.recentOrders,{orderCount:2,paidOrders:1});
 assert.deepEqual(Object.keys(board.recentOrders).sort(),['orderCount','paidOrders']);
});

test('next map expiry includes visitors outside the display cap and exact table expiry',()=>{
 const s=storage(),map=new TavernMapService(s),now=2000000;
 for(let i=1;i<=44;i++)map.touch({id:String(i),name:`P${i}`,channel:'9'},now-(i===44?1799000:1000));
 map.recordTable(snap({channel:'999',epoch:'e1',at:now-100,expires:now+500,players:[]}),now);
 assert.equal(map.nextExpiry(now),now+500);
 assert.equal(map.nextExpiry(now+500),now-1799000+1800001);
});

test('table snapshots allow nonnumeric bot IDs, retain bot markers, exclude bots from visits, and enforce epoch tombstones',()=>{
 const s=storage(),map=new TavernMapService(s);
 assert.equal(map.recordTable(snap({expires:999999999,players:[{id:'1',name:'Alice',bot:false},{id:'bot1',name:'Dealer',bot:true}]}),100000),true);
 assert.equal(map.board(100001).tables[0].expires,1900000);
 assert.equal(map.board(100001).tables[0].players[1].bot,true);
 assert.equal(s.db.prepare('SELECT user_id FROM tavern_map_visits WHERE user_id=?').get('bot1'),undefined);
 assert.equal(map.recordTable(snap({epoch:'round-2',at:100001,expires:220000,players:[{id:'2',name:'Bob',bot:false}]}),100001),true);
 assert.equal(map.recordTable(snap({epoch:'round-1',at:100003,expires:220000,closed:true,players:[]}),100003),false); // old epoch close rejected even with newer event timestamp
 assert.equal(map.recordTable(snap({epoch:'round-2',at:100002,expires:220000,closed:true,players:[]}),100002),true);
 assert.equal(map.board(100003).tableCount,0);
 assert.equal(map.recordTable(snap({epoch:'round-2',at:100003,expires:220000,players:[{id:'2',name:'Bob',bot:false}]}),100003),false); // tombstone blocks resurrection
 assert.equal(map.recordTable(snap({epoch:'round-3',at:100003,expires:220000,players:[{id:'2',name:'@B\nob',bot:false}]}),100003),true);
 const board=map.board(100004);assert.equal(board.tableCount,1);assert.equal(board.tables[0].players[0].name,'Bob');
 assert.deepEqual(Object.keys(board.tables[0]).sort(),['at','channel','closed','epoch','expires','game','guild','phase','players']);
 assert.equal(s.db.prepare('SELECT snapshot FROM tavern_map_tables').get().snapshot.includes('secret'),false);
 assert.equal(map.recordTable(snap({at:100005,expires:100004}),100005),false);
 assert.equal(map.recordTable(snap({at:100006}),100005),false); // future event
 assert.equal(map.recordTable(snap({at:100002}),100006),false); // out of order
});

test('dispatch only touches verified IDs before mapBoard and mapTable accepts internal snapshots',()=>{
 const s=storage(),map=new TavernMapService(s);
 assert.deepEqual(map.dispatch({action:'mapBoard',id:'not-an-id',name:'X',channel:'2'},1000).visitors,[]);
 map.dispatch({action:'mapTouch',id:'5',name:'Map guest',channel:'2'},1001);
 assert.equal(map.dispatch({action:'mapBoard',id:'6',name:'Board guest',channel:'2'},1002).visitorCount,2);
 assert.equal(map.dispatch({action:'mapTable',table:snap({at:1003,expires:200000})},1003),true);
 assert.equal(map.dispatch({action:'mapTable',table:{...snap(),players:[{id:'bot1',name:'Robot',bot:false}]}},1004),false);
});

test('expired snapshots are hidden from board and visitor/table output is bounded',()=>{
 const s=storage(),map=new TavernMapService(s);
 for(let i=1;i<=10;i++)map.recordTable(snap({channel:String(200+i),epoch:`e${i}`,at:100000+i,expires:i===1?100005:300000,players:[]}),100020);
 const b=map.board(100020);assert.equal(b.tableCount,9);assert.equal(b.tables.length,8);assert(!b.tables.some(t=>t.channel==='201'));
});

test('table update and participant touch roll back together on transaction failure',()=>{
 const s=storage(),map=new TavernMapService(s);map.ensureSchema();
 const original=s.sql.exec.bind(s.sql);s.sql.exec=(q,...a)=>{if(q.startsWith('INSERT INTO tavern_map_visits'))throw Error('injected failure');return original(q,...a)};
 assert.throws(()=>map.recordTable(snap(),100000),/injected failure/);
 s.sql.exec=original;
 assert.equal(map.board(100000).tableCount,0);
});

