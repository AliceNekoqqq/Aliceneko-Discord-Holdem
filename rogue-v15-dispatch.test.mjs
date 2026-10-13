import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRun,CURRENT_RULE_VERSION,V15_RULE_VERSION,SUPPORTED_RULE_VERSIONS,V14_RULE_VERSION} from './rogue-run.mjs';
import {beginBattle} from './rogue-battle.mjs';
import {CATALOG_V14,getCatalog as getCatalog14} from './rogue-content-v14.mjs';
import {CATALOG_V15,getCatalog as getCatalog15} from './rogue-content-v15.mjs';
import {RogueService} from './rogue-service.mjs';
import {scoreRun,dailySeedGroup} from './rogue-economy.mjs';

const V15=V15_RULE_VERSION;
function fixture(rulesVersion=V15){
 const db=new DatabaseSync(':memory:');let ids=0,now=Date.parse('2026-10-11T12:00:00Z');
 const sql={exec(q,...args){const stmt=db.prepare(q),rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows};}};
 const storage={sql,transactionSync(fn){db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 db.exec('CREATE TABLE tavern_members(id TEXT PRIMARY KEY,name TEXT,balance INTEGER CHECK(balance>=0),joined_at INTEGER)');
 db.exec('CREATE TABLE tavern_daily(user_id TEXT,day TEXT,earned INTEGER,PRIMARY KEY(user_id,day))');
 db.exec('CREATE TABLE tavern_ledger(id TEXT PRIMARY KEY,user_id TEXT,amount INTEGER,kind TEXT,note TEXT,at INTEGER)');
 const host={storage,sql,member(id,name,at){let member=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];if(!member){sql.exec('INSERT INTO tavern_members VALUES(?,?,60,?)',id,name,at);sql.exec('INSERT INTO tavern_ledger VALUES(?,?,60,?,?,?)',`welcome:${id}`,id,'welcome','welcome',at);member=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];}return member;}};
 const service=new RogueService(host,'1',{idFactory:()=>`run-${++ids}`,clock:()=>now,rulesVersion});
 const p={guild:'1',id:'2',name:'玩家',mode:'normal',requestId:'start-1'};
 return {db,host,service,p,setVersion(version){return new RogueService(host,'1',{idFactory:()=>`run-${++ids}`,clock:()=>now,rulesVersion:version});}};
}

test('v15 remains explicitly supported and frozen while v16 becomes current',()=>{
 assert.equal(CURRENT_RULE_VERSION,'lantern-rules-v0.21');assert.equal(V15,'lantern-rules-v0.15');assert.equal(V14_RULE_VERSION,'lantern-rules-v0.14');
 for(const version of ['lantern-rules-v0.4','lantern-rules-v0.6','lantern-rules-v0.7','lantern-rules-v0.8','lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13',V14_RULE_VERSION,V15,CURRENT_RULE_VERSION])assert(SUPPORTED_RULE_VERSIONS.includes(version));
 assert.equal(getCatalog14(V14_RULE_VERSION),CATALOG_V14);assert.equal(getCatalog15(V15),CATALOG_V15);
 assert.equal(CATALOG_V14.version,'0.14');assert.equal(CATALOG_V15.version,'0.15');assert.notEqual(CATALOG_V14,CATALOG_V15);
 const old=createRun({runId:'old',owner:'2',guild:'1',mode:'normal',seed:'same',startDay:'2026-10-11',rewardEligible:false,now:0,ruleVersion:V14_RULE_VERSION,professionId:'traveler',difficulty:0,inventory:[]});
 const fresh=createRun({runId:'new',owner:'2',guild:'1',mode:'normal',seed:'same',startDay:'2026-10-11',rewardEligible:false,now:0,ruleVersion:V15,professionId:'traveler',difficulty:0,inventory:[]});
 assert.equal(old.catalogVersion,'0.14');assert.equal(fresh.catalogVersion,'0.15');
 for(const run of [old,fresh])assert.equal(beginBattle({ruleVersion:run.ruleVersion,enemyId:'lantern_rat',deck:run.deck,relics:[],hp:run.hp,seed:'same',professionId:'traveler',difficulty:0,items:[]}).ruleVersion,run.ruleVersion);
});

test('service loads v14 and v15 snapshots, and request retries do not repeat battle effects or settlement',()=>{
 const f=fixture(V14_RULE_VERSION),old=f.service.start(f.p);assert.equal(old.ruleVersion,V14_RULE_VERSION);
 const current=f.setVersion(V15),saved=current.resume({...f.p,runId:old.runId,requestId:'resume-v14'});assert.equal(saved.ruleVersion,V14_RULE_VERSION);assert.equal(saved.catalogVersion,'0.14');
 const service=f.setVersion(V15),player={...f.p,id:'3',requestId:'v15-start'},run=service.start(player);assert.equal(run.ruleVersion,V15);assert.equal(run.catalogVersion,'0.15');assert.equal(service.start(player).runId,run.runId);
 const battle=beginBattle({ruleVersion:V15,enemyId:'patrol_apprentice',deck:[{uid:0,cardId:'slash',upgraded:false}],relics:[],hp:30,seed:'retry'});
 const charge=structuredClone(CATALOG_V15.enemies.patrol_apprentice.intents.find(i=>i.kind==='charge'));
 battle.turn=1;battle.intent=charge;battle.energy=3;battle.hand=[{uid:0,cardId:'slash',upgraded:false}];battle.draw=[];battle.discard=[];battle.enemyShield=0;battle.enemyHp=40;
 const injected={...run,phase:'BATTLE',room:{type:'battle',enemyId:'patrol_apprentice'},battle,version:run.version+1};
 f.host.storage.transactionSync(()=>service.save(injected));
 const action={guild:'1',id:'3',runId:run.runId,version:injected.version,requestId:'break-once',action:{type:'PLAY',uid:0}};
 const first=service.act(action),retry=service.act(action);
 const savedBattle=JSON.parse(f.db.prepare('SELECT snapshot FROM rogue_runs WHERE id=?').get(run.runId).snapshot).battle;
 assert.equal(retry.battle.log.filter(x=>x.includes('破势')).length,first.battle.log.filter(x=>x.includes('破势')).length);
 assert.equal(savedBattle.log.filter(x=>x.includes('破势')).length,1);
 const tempoBattle=beginBattle({ruleVersion:V15,enemyId:'a2_mirror_regent',deck:[{uid:0,cardId:'slash',upgraded:false}],relics:[],hp:30,seed:'tempo-retry'});
 tempoBattle.intent={kind:'tempo',playThreshold:2,onCalm:{kind:'guard',value:8,label:'节奏架盾'},onRush:{kind:'attack',value:4,hits:2,label:'节奏连击'},label:'节奏检验'};
 tempoBattle.plays=2;tempoBattle.hand=[];tempoBattle.draw=[];tempoBattle.discard=[tempoBattle.deck[0]];tempoBattle.enemyShield=0;
 const tempoRun={...first,phase:'BATTLE',room:{type:'battle',enemyId:'a2_mirror_regent'},battle:tempoBattle,version:first.version+1};
 f.host.storage.transactionSync(()=>service.save(tempoRun));
 const endTurn={guild:'1',id:'3',runId:run.runId,version:tempoRun.version,requestId:'tempo-once',action:{type:'END_TURN'}};
 const tempoFirst=service.act(endTurn),tempoRetry=service.act(endTurn);
 assert.equal(tempoRetry.battle.turn,tempoFirst.battle.turn);
 assert.equal(tempoRetry.battle.enemyShield,8);
 const result={...injected,phase:'RESULT',result:{type:'CLEAR'},completedActs:3,completed:15,eliteWins:6,hp:28,settlement:{score:4018,baseCoins:30,ranked:true}};
 f.host.storage.transactionSync(()=>service.save(result));
 const before=f.db.prepare('SELECT balance FROM tavern_members WHERE id=?').get('3').balance;
 const end={guild:'1',id:'3',runId:run.runId};service.settle({...end,requestId:'settle-once'});service.settle({...end,requestId:'settle-retry'});
 const after=f.db.prepare('SELECT balance FROM tavern_members WHERE id=?').get('3').balance;
 assert.equal(after-before,30);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM rogue_receipts WHERE run_id=?').get(run.runId).n,1);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM tavern_ledger WHERE id=?').get(`rogue:${run.runId}`).n,1);
});

test('daily challenge namespaces isolate v14 and v15 and validate difficulty 0 through 10',()=>{
 const old=dailySeedGroup('1','2026-10-11',V14_RULE_VERSION,4),fresh=dailySeedGroup('1','2026-10-11',V15,4);
 assert.notEqual(old,fresh);assert.equal(fresh,dailySeedGroup('1','2026-10-11',V15,4));
 assert.match(dailySeedGroup('1','2026-10-11',V15,10),/difficulty-10\/15stations-3energy-5draw-v15-bosses$/);
 assert.throws(()=>dailySeedGroup('1','2026-10-11',V15,11),/难度无效/);
});

test('v15 scoring accepts fifteen stations and six elites while rejecting out-of-range progress',()=>{
 const run={ruleVersion:V15,result:{type:'CLEAR'},completedActs:3,completed:15,eliteWins:6,hp:28,mode:'challenge'};
 assert.deepEqual(scoreRun(run),{score:4018,baseCoins:30,ranked:true});
 assert.throws(()=>scoreRun({...run,completed:16}),/进度无效/);assert.throws(()=>scoreRun({...run,eliteWins:7}),/进度无效/);
});
