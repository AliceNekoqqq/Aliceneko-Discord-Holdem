import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRun,CURRENT_RULE_VERSION,SUPPORTED_RULE_VERSIONS} from './rogue-run.mjs';
import {beginBattle} from './rogue-battle.mjs';
import {CATALOG_V13} from './rogue-content-v13.mjs';
import {CATALOG_V14,getCatalog} from './rogue-content-v14.mjs';
import {RogueService} from './rogue-service.mjs';
import {scoreRun,dailySeedGroup} from './rogue-economy.mjs';

const V13='lantern-rules-v0.13', V14='lantern-rules-v0.14';
function fixture(rulesVersion=CURRENT_RULE_VERSION){
 const db=new DatabaseSync(':memory:');let ids=0,now=Date.parse('2026-10-11T12:00:00Z');
 const sql={exec(q,...args){const stmt=db.prepare(q),rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows};}};
 const storage={sql,transactionSync(fn){db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 db.exec('CREATE TABLE tavern_members(id TEXT PRIMARY KEY,name TEXT,balance INTEGER CHECK(balance>=0),joined_at INTEGER)');
 db.exec('CREATE TABLE tavern_daily(user_id TEXT,day TEXT,earned INTEGER,PRIMARY KEY(user_id,day))');
 db.exec('CREATE TABLE tavern_ledger(id TEXT PRIMARY KEY,user_id TEXT,amount INTEGER,kind TEXT,note TEXT,at INTEGER)');
 const host={storage,sql,member(id,name,at){let member=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];if(!member){sql.exec('INSERT INTO tavern_members VALUES(?,?,60,?)',id,name,at);sql.exec('INSERT INTO tavern_ledger VALUES(?,?,60,?,?,?)',`welcome:${id}`,id,'welcome','welcome',at);member=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];}return member;}};
 const service=new RogueService(host,'1',{idFactory:()=>`run-${++ids}`,clock:()=>now,rulesVersion});
 const p={guild:'1',id:'2',name:'玩家',mode:'challenge',requestId:'start-1',now};
 return {db,host,service,p,setVersion(version){return new RogueService(host,'1',{idFactory:()=>`run-${++ids}`,clock:()=>now,rulesVersion:version});}};
}

test('v14 is current while v13 and earlier remain supported and frozen',()=>{
 assert.equal(CURRENT_RULE_VERSION,V14);
 for(const version of ['lantern-rules-v0.4','lantern-rules-v0.6','lantern-rules-v0.7','lantern-rules-v0.8','lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12',V13,V14])assert(SUPPORTED_RULE_VERSIONS.includes(version));
 assert.equal(getCatalog(V14),CATALOG_V14);
 assert.equal(CATALOG_V13.version,'0.13');assert.equal(CATALOG_V14.version,'0.14');assert.notEqual(CATALOG_V13,CATALOG_V14);
 const old=createRun({runId:'old',owner:'1',guild:'2',mode:'normal',seed:'same',startDay:'2026-10-11',rewardEligible:false,now:0,ruleVersion:V13,professionId:'traveler',difficulty:0,inventory:[]});
 const fresh=createRun({runId:'new',owner:'1',guild:'2',mode:'normal',seed:'same',startDay:'2026-10-11',rewardEligible:false,now:0,ruleVersion:V14,professionId:'traveler',difficulty:0,inventory:[]});
 assert.equal(old.catalogVersion,'0.13');assert.equal(fresh.catalogVersion,'0.14');
 const deck=[{uid:1,cardId:'cinder_cut',upgraded:false}];
 for(const run of [old,fresh])assert.equal(beginBattle({ruleVersion:run.ruleVersion,enemyId:'lantern_rat',deck,relics:[],hp:run.hp,seed:'same',professionId:'traveler',difficulty:0,items:[]}).ruleVersion,run.ruleVersion);
});

test('service starts v14 by default, keeps v13 snapshots loadable, and preserves request idempotency',()=>{
 const f=fixture(V13),old=f.service.start(f.p);assert.equal(old.ruleVersion,V13);
 const current=f.setVersion(V14),saved=current.resume({...f.p,runId:old.runId,requestId:'resume-v13'});
 assert.equal(saved.ruleVersion,V13);assert.equal(saved.catalogVersion,'0.13');
 const start=f.setVersion(V14),newPlayer={...f.p,id:'3',requestId:'v14-start'},fresh=start.start(newPlayer);
 assert.equal(fresh.ruleVersion,V14);assert.equal(fresh.catalogVersion,'0.14');
 assert.equal(start.start(newPlayer).runId,fresh.runId);
 const action={guild:f.p.guild,id:newPlayer.id,runId:fresh.runId,version:fresh.version,requestId:'v14-blessing',action:{type:'BLESSING',relicId:fresh.room.candidates[0]}};
 const acted=start.act(action);
 assert.equal(start.act(action).version,acted.version);
 assert.equal(start.resume({...newPlayer,runId:fresh.runId,requestId:'resume-v14'}).version,acted.version);
});

test('daily challenge seed namespaces are stable per version and isolate v13 from v14',()=>{
 const seed13=dailySeedGroup('1','2026-10-11',V13,2),seed14=dailySeedGroup('1','2026-10-11',V14,2);
 assert.notEqual(seed13,seed14);assert.equal(seed13,dailySeedGroup('1','2026-10-11',V13,2));assert.equal(seed14,dailySeedGroup('1','2026-10-11',V14,2));
});

test('v14 full run settlement accepts fifteen stations and six elites while validating difficulty seeds',()=>{
 const run={ruleVersion:V14,result:{type:'CLEAR'},completedActs:3,completed:15,eliteWins:6,hp:28,mode:'challenge'};
 assert.deepEqual(scoreRun(run),{score:4018,baseCoins:30,ranked:true});
 assert.throws(()=>scoreRun({...run,completed:16}),/进度无效/);
 assert.throws(()=>scoreRun({...run,eliteWins:7}),/进度无效/);
 assert.match(dailySeedGroup('1','2026-10-11',V14,2),/v14-elites$/);
 assert.throws(()=>dailySeedGroup('1','2026-10-11',V14,11),/难度无效/);
});
