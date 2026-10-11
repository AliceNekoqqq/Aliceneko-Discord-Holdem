import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {RogueService} from './rogue-service.mjs';
import {CURRENT_RULE_VERSION} from './rogue-run.mjs';
import {pruneObservation,recordObservation,summarizeObservationLines,OBSERVATION_RETENTION_MS,OBSERVATION_MAX_COUNT} from './rogue-observation.mjs';

const NOW=Date.parse('2026-10-10T11:15:00Z');
function fixture(rulesVersion=CURRENT_RULE_VERSION){
 const db=new DatabaseSync(':memory:');let ids=0,clockNow=NOW;
 const sql={exec(q,...args){const s=db.prepare(q),rows=s.columns().length?s.all(...args):(s.run(...args),[]);return{toArray:()=>rows};}};
 const storage={sql,transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}};
 db.exec('CREATE TABLE tavern_members(id TEXT PRIMARY KEY,name TEXT,balance INTEGER CHECK(balance>=0),joined_at INTEGER)');
 db.exec('CREATE TABLE tavern_daily(user_id TEXT,day TEXT,earned INTEGER,PRIMARY KEY(user_id,day))');
 db.exec('CREATE TABLE tavern_ledger(id TEXT PRIMARY KEY,user_id TEXT,amount INTEGER,kind TEXT,note TEXT,at INTEGER)');
 const host={storage,sql,member(id,name,now){let m=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];if(!m){sql.exec('INSERT INTO tavern_members VALUES(?,?,60,?)',id,name,now);m=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];}return m;}};
 const service=new RogueService(host,'1',{idFactory:()=>`observe-${++ids}`,clock:()=>clockNow,rulesVersion});
 return{service,db,sql,p:{guild:'1',id:'2',mode:'normal',requestId:'start',name:'player'},setNow:n=>clockNow=n};
}
const command=(p,run,requestId,action)=>({...p,runId:run.runId,version:run.version,requestId,action});

test('successful v0.9 actions create bounded facts; duplicate request does not append twice and failures do not record',()=>{
 const f=fixture(),run=f.service.start(f.p),act=command(f.p,run,'bless',{type:'BLESSING',relicId:run.room.candidates[0]});
 const next=f.service.act(act),summary=f.service.observationSummary({...f.p,runId:run.runId});
 assert.equal(summary.ruleVersion,CURRENT_RULE_VERSION);assert.equal(summary.entries.length,1);assert.equal(summary.counts.routes,0);
 assert.equal(f.service.act(act).version,next.version);
 assert.equal(f.service.observationSummary({...f.p,runId:run.runId}).entries.length,1);
 assert.throws(()=>f.service.act(command(f.p,next,'bad',{type:'NOT_REAL'})));
 assert.equal(f.service.observationSummary({...f.p,runId:run.runId}).entries.length,1);
});

test('load/save prune raw entries after fourteen days while aggregates remain',()=>{
 const f=fixture(),run=f.service.start(f.p);
 run.observation={counts:{routes:4,battles:2},entries:[{at:NOW-OBSERVATION_RETENTION_MS-1,type:'route',detail:'old'},{at:NOW,type:'camp',detail:'new'}]};
 f.service.save(run);const loaded=f.service.resume({...f.p,runId:run.runId});
 assert.equal(loaded.observation.entries.length,1);assert.equal(loaded.observation.counts.routes,4);
 f.setNow(NOW+OBSERVATION_RETENTION_MS+1);
 const summary=f.service.observationSummary({...f.p,runId:run.runId});
 assert.equal(summary.entries.length,0);assert.equal(summary.counts.routes,4);
});

test('observation counters are fixed-schema, finite, nonnegative, and bounded',()=>{
 const clean=pruneObservation({counts:{routes:Infinity,battles:-9,defeats:1e12,extra:'payload',constructor:{x:1}},entries:[]},NOW);
 assert.deepEqual(clean.counts,{routes:0,rewardsTaken:0,rewardsSkipped:0,upgrades:0,removals:0,shopPurchases:0,campChoices:0,itemUses:0,battles:0,battleRounds:0,defeats:OBSERVATION_MAX_COUNT});
 assert.ok(Object.keys(clean.counts).length===11);
});

test('legacy v0.9 snapshot without observation restores as empty and older rules are excluded',()=>{
 const f=fixture(),run=f.service.start(f.p);delete run.observation;
 f.service.save(run);assert.deepEqual(f.service.observationSummary({...f.p,runId:run.runId}).entries,[]);
 const old=fixture('lantern-rules-v0.8'),legacy=old.service.start(old.p);
 assert.throws(()=>old.service.observationSummary({...old.p,runId:legacy.runId}),e=>e.code==='VERSION');
});

test('boss victory is recorded when the completed run clears battle state',()=>{
 const before={ruleVersion:CURRENT_RULE_VERSION,version:8,phase:'BATTLE',act:3,slot:5,path:[],battle:{turn:4,result:null}};
 const after={...before,version:9,phase:'RESULT',result:{type:'CLEAR'},battle:null};
 const o=recordObservation(before,after,NOW,{type:'END_TURN'});
 assert.equal(o.counts.battles,1);assert.equal(o.counts.battleRounds,4);assert.equal(o.counts.defeats,0);
 assert.equal(o.entries[0].detail,'战斗结束：4 轮，胜利');
});

test('same-length item replacement is a reward taken, and summaries expose four bounded Chinese lines',()=>{
 const before={ruleVersion:CURRENT_RULE_VERSION,version:2,phase:'REWARD',act:1,slot:2,completed:1,deck:[],relics:[],inventory:['old']};
 const after={...before,version:3,phase:'ROUTE',completed:2,inventory:['new'],reward:null};
 const o=recordObservation(before,after,NOW,{type:'REWARD_CLAIM'});
 assert.equal(o.counts.rewardsTaken,1);assert.equal(o.counts.rewardsSkipped,0);
 const lines=summarizeObservationLines({...after,observation:o},NOW);
 assert.equal(lines.length,4);assert.ok(lines.every(x=>x.length<=120));
});

test('route observation records the selected node, not its automatically appended boss',()=>{
 const before={ruleVersion:CURRENT_RULE_VERSION,version:4,phase:'ROUTE',act:1,slot:4,path:[]};
 const after={...before,version:5,phase:'BATTLE',path:[{act:1,slot:4,nodeId:'a1s4n0',type:'elite'},{act:1,slot:5,nodeId:'a1s5boss',type:'boss'}]};
 const o=recordObservation(before,after,NOW,{type:'ROUTE',choice:'a1s4n0'});
 assert.equal(o.counts.routes,1);assert.equal(o.entries[0].detail,'elite a1s4n0');
});

test('abandoning a battle records an exit and never a victory; missing observations have no invented summary',()=>{
 const before={ruleVersion:CURRENT_RULE_VERSION,version:1,phase:'BATTLE',act:1,slot:2,battle:{turn:3}};
 const after={...before,version:2,phase:'RESULT',result:{type:'ABANDON'}};
 const o=recordObservation(before,after,NOW,{type:'ABANDON',confirmed:true});
 assert.equal(o.counts.battles,0);assert.equal(o.entries[0].type,'exit');
 assert.doesNotMatch(o.entries[0].detail,/胜利/);
 assert.deepEqual(summarizeObservationLines(after,NOW),[]);
});
