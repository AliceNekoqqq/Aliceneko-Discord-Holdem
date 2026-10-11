import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {RogueService} from './rogue-service.mjs';
import {RULE_VERSION,CURRENT_RULE_VERSION,V10_RULE_VERSION} from './rogue-run.mjs';
import {dayKey} from './tavern-catalog.mjs';

const NOW=Date.parse('2026-10-10T11:15:00Z');
function fixture(guild='1'){
 const db=new DatabaseSync(':memory:');let fault=null,ids=0,currentTime=NOW;
 const sql={exec(q,...args){
  if(fault&&q.includes(fault))throw Error('injected SQL failure');
  const stmt=db.prepare(q),rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);
  return {toArray:()=>rows};
 }};
 const storage={sql,transactionSync(fn){db.exec('BEGIN');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 db.exec('CREATE TABLE tavern_members(id TEXT PRIMARY KEY,name TEXT,balance INTEGER CHECK(balance>=0),joined_at INTEGER)');
 db.exec('CREATE TABLE tavern_daily(user_id TEXT,day TEXT,earned INTEGER,PRIMARY KEY(user_id,day))');
 db.exec('CREATE TABLE tavern_ledger(id TEXT PRIMARY KEY,user_id TEXT,amount INTEGER,kind TEXT,note TEXT,at INTEGER)');
 const host={storage,sql,member(id,name,now){let m=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];if(!m){sql.exec('INSERT INTO tavern_members VALUES(?,?,60,?)',id,name,now);sql.exec('INSERT INTO tavern_ledger VALUES(?,?,60,?,?,?)',`welcome:${id}`,id,'welcome','welcome',now);m=sql.exec('SELECT * FROM tavern_members WHERE id=?',id).toArray()[0];}return m;}};
 const clock=()=>currentTime;
 const service=new RogueService(host,guild,{idFactory:()=>`${guild}-run-${++ids}`,clock,rulesVersion:RULE_VERSION});
 const p={guild,id:'2',mode:'challenge',requestId:'start-1',now:NOW};
 const one=(q,...a)=>sql.exec(q,...a).toArray()[0];
 const terminal=(r,type='CLEAR',acts=3)=>{const n={...r,phase:'RESULT',completedActs:acts,completed:acts*3,eliteWins:0,hp:20,result:{type,at:NOW}};service.save(n);return n;};
 return {db,service,p,one,terminal,setFault:v=>fault=v,setNow:v=>currentTime=v,host,clock};
}
const command=(p,r,requestId,action,now=p.now)=>({...p,runId:r.runId,version:r.version,requestId,action,now});
test('production service defaults to v0.9 and challenge profession is fixed server-side',()=>{
 const f=fixture(),service=new RogueService(f.host,'1',{idFactory:()=> 'daily-v06',clock:f.clock});
 assert.equal(service.rulesVersion,CURRENT_RULE_VERSION);
 const run=service.start({...f.p,requestId:'v06-start',professionId:'traveler',inventory:['tonic','bandage']});
 assert.equal(run.ruleVersion,CURRENT_RULE_VERSION);
 assert.equal(run.professionId,service.challengeProfession(f.p));
 assert.deepEqual(run.inventory,[]);
});
test('restart/JSON restore, duplicate requests and stale buttons do not duplicate actions',()=>{
 const f=fixture(),r=f.service.start(f.p);
 assert.equal(f.service.start(f.p).runId,r.runId);
 const a=command(f.p,r,'bless-1',{type:'BLESSING',relicId:'brooch'});
 const next=f.service.act(a);
 assert.equal(f.service.act(a).version,next.version);
 assert.throws(()=>f.service.act({...a,requestId:'old-button'}),e=>e.code==='STALE');
 const restarted=new RogueService(f.host,'1',{clock:f.clock,rulesVersion:RULE_VERSION});
 assert.deepEqual(restarted.resume({...f.p,runId:r.runId,now:NOW+1000}),next);
 assert.equal(restarted.resume({...f.p,runId:r.runId,now:NOW+2000}).lastActionAt,next.lastActionAt);
});
test('non-owner and other server cannot read, mutate or settle a run',()=>{
 const f=fixture(),r=f.service.start(f.p);
 for(const overrides of [{id:'3'},{guild:'9'}]){
  assert.throws(()=>f.service.resume({...f.p,runId:r.runId,...overrides}));
  assert.throws(()=>f.service.settle({...f.p,runId:r.runId,...overrides}));
  assert.throws(()=>f.service.act({...command(f.p,r,'bad',{type:'ABANDON',confirmed:true}),...overrides}));
 }
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,60);
});
test('two reward starts are reserved on creation, no refunds on abandonment; third can still rank',()=>{
 const f=fixture();
 for(let i=1;i<=3;i++){
  const r=f.service.start({...f.p,requestId:`start-${i}`});assert.equal(r.rewardEligible,i<=2);
  f.service.act(command(f.p,r,`leave-${i}`,{type:'ABANDON',confirmed:true}));
 }
 assert.equal(f.one('SELECT starts FROM rogue_daily WHERE owner=? AND day=?','2',dayKey(NOW)).starts,2);
 assert.equal(f.one('SELECT COUNT(*) AS n FROM rogue_best').n,0);
 assert.equal(f.service.start(f.p).runId,'1-run-1'); // old START request stays old
});
test('practice explicitly preserves both rewarded openings',()=>{
 const f=fixture();const r=f.service.start({...f.p,practice:true});
 assert.equal(r.rewardEligible,false);
 assert.equal(f.one('SELECT starts FROM rogue_daily WHERE owner=?','2'),undefined);
});
test('same active run returned by another START is remembered even after terminal',()=>{
 const f=fixture(),r=f.service.start(f.p),p2={...f.p,requestId:'start-other'};
 assert.equal(f.service.start(p2).runId,r.runId);
 f.service.act(command(f.p,r,'leave',{type:'ABANDON',confirmed:true}));
 assert.equal(f.service.start(p2).runId,r.runId);
});
test('actual existing total cap clips credit; repeated zero/partial receipt never repays',()=>{
 const f=fixture(),r=f.service.start(f.p);f.terminal(r);
 f.db.prepare('INSERT INTO tavern_daily VALUES(?,?,149)').run('2',dayKey(NOW));
 const p={...f.p,runId:r.runId},done=f.service.settle(p);
 assert.equal(done.receipt.amount,1);assert.equal(done.receipt.base_amount,30);
 assert.equal(f.service.settle({...p,now:NOW+86400000}).receipt.amount,1);
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,61);
 assert.equal(f.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?','2',dayKey(NOW)).earned,150);
 assert.equal(f.one('SELECT COUNT(*) AS n FROM tavern_ledger WHERE kind=?','rogue').n,1);
});
test('rogue 60 subcap applies to late runs; settlement uses current day instead of backdating',()=>{
 const f=fixture(),r=f.service.start(f.p);f.terminal(r);
 const tomorrow=NOW+86400000;
 f.setNow(tomorrow);
 f.db.prepare('INSERT INTO rogue_daily(owner,day,earned) VALUES(?,?,55)').run('2',dayKey(tomorrow));
 const done=f.service.settle({...f.p,runId:r.runId,now:tomorrow});
 assert.equal(done.receipt.amount,5);assert.equal(done.receipt.day,dayKey(tomorrow));
 assert.equal(f.one('SELECT earned FROM tavern_daily WHERE day=?',dayKey(NOW)),undefined);
 assert.equal(f.service.leaderboard({...f.p,day:dayKey(NOW)}).rows.length,1);
 assert.equal(f.service.leaderboard({...f.p,day:dayKey(tomorrow)}).rows.length,0);
});
test('wallet/receipt transaction rolls back on ledger failure, and can retry exactly once',()=>{
 const f=fixture(),r=f.service.start(f.p);f.terminal(r);f.setFault('INSERT INTO tavern_ledger');
 assert.throws(()=>f.service.settle({...f.p,runId:r.runId}));
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,60);
 assert.equal(f.one('SELECT COUNT(*) AS n FROM rogue_receipts').n,0);
 assert.equal(f.one('SELECT earned FROM tavern_daily WHERE day=?',dayKey(NOW)),undefined);
 f.setFault(null);assert.equal(f.service.settle({...f.p,runId:r.runId}).receipt.amount,30);
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,90);
});
test('ranking failure does not roll back already credited coins; outbox retries without double pay',()=>{
 const f=fixture(),r=f.service.start(f.p);f.terminal(r);f.setFault('INSERT INTO rogue_best');
 const paid=f.service.settle({...f.p,runId:r.runId});
 assert.equal(paid.receipt.amount,30);assert.equal(paid.rankPending,true);
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,90);
 assert.equal(f.one('SELECT COUNT(*) AS n FROM rogue_rank_outbox').n,1);
 f.setFault(null);const retry=f.service.resume({...f.p,runId:r.runId});
 assert.equal(retry.rankPending,false);
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,90);
 assert.equal(f.one('SELECT COUNT(*) AS n FROM rogue_rank_outbox').n,0);
});
test('daily best keeps only higher score; equal scores share rank; normal runs never enter board',()=>{
 const f=fixture();
 for(const [i,id,hp,mode] of [[1,'2',20,'challenge'],[2,'3',20,'challenge'],[3,'2',10,'challenge'],[4,'4',30,'normal']]){
  const r=f.service.start({...f.p,id,mode,requestId:`s-${i}`});const n=f.terminal(r);n.hp=hp;f.service.save(n);
  f.service.settle({...f.p,id,runId:r.runId});
 }
 const board=f.service.leaderboard(f.p).rows;
 assert.equal(board.length,2);assert.deepEqual(board.map(x=>x.rank),[1,1]);assert.deepEqual(board.map(x=>x.score),[3470,3470]);
});
test('72h idle expiry frees active slot without rewards and refresh does not extend it',()=>{
 const f=fixture(),r=f.service.start(f.p);
 f.service.resume({...f.p,runId:r.runId,now:NOW+100000});
 f.setNow(NOW+72*3600000);
 const done=f.service.resume({...f.p,runId:r.runId,now:NOW+72*3600000});
 assert.equal(done.result.type,'EXPIRED');assert.equal(done.receipt.amount,0);
 const next=f.service.start({...f.p,requestId:'new-after-expired',now:NOW+72*3600000+1});
 assert.notEqual(next.runId,r.runId);
});
test('client now is ignored and cannot select a different entitlement or payment day',()=>{
 const f=fixture(),r=f.service.start({...f.p,now:NOW+86400000});
 assert.equal(r.startDay,dayKey(NOW));f.terminal(r);
 assert.equal(f.service.settle({...f.p,runId:r.runId,now:NOW+86400000}).receipt.day,dayKey(NOW));
});
test('opening leaderboard drains older failed rank outbox after a new run starts',()=>{
 const f=fixture(),r=f.service.start(f.p);f.terminal(r);f.setFault('INSERT INTO rogue_best');
 f.service.settle({...f.p,runId:r.runId});
 f.service.start({...f.p,requestId:'new-run'});f.setFault(null);
 assert.equal(f.service.leaderboard(f.p).rows.length,1);
 assert.equal(f.one('SELECT COUNT(*) AS n FROM rogue_rank_outbox').n,0);
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,90);
});
test('terminal action stays frozen when payout fails; another run can start and later retries old result',()=>{
 const f=fixture(),r=f.service.start(f.p);
 const checkpoint={...r,phase:'CHECKPOINT',act:1,slot:3,completed:3,completedActs:1,hp:22,room:{type:'checkpoint',completedAct:1}};
 f.service.save(checkpoint);f.setFault('INSERT INTO tavern_ledger');
 const stopped=f.service.act(command(f.p,checkpoint,'retreat',{type:'RETREAT',confirmed:true}));
 assert.equal(stopped.result.type,'RETREAT');assert.equal(stopped.settlementPending,true);
 assert.equal(f.one('SELECT status FROM rogue_runs WHERE id=?',r.runId).status,'RESULT');
 assert.equal(f.one('SELECT COUNT(*) AS n FROM rogue_receipts').n,0);
 const second=f.service.start({...f.p,requestId:'second'});
 assert.notEqual(second.runId,r.runId);f.setFault(null);
 f.service.resume({...f.p,runId:second.runId});
 assert.equal(f.one('SELECT amount FROM rogue_receipts WHERE run_id=?',r.runId).amount,8);
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,68);
 assert.equal(f.service.act(command(f.p,checkpoint,'retreat',{type:'RETREAT',confirmed:true})).receipt.amount,8);
});

function expandedFixture(){const f=fixture();f.service=new RogueService(f.host,'1',{idFactory:(()=>{let n=0;return ()=>`v07-${++n}`})(),clock:f.clock});return f;}
test('v08 progress unlocks one rung per profession, survives restart, and ignores repeated settlement',()=>{
 const f=expandedFixture();let r=f.service.start({...f.p,mode:'normal',practice:true,professionId:'tamer',difficulty:0});f.terminal(r);f.service.settle({...f.p,runId:r.runId});
 assert.deepEqual(f.service.progressFor('2','tamer'),{professionId:'tamer',unlocked:1,clears:1});
 f.service.settle({...f.p,runId:r.runId});assert.equal(f.service.progressFor('2','tamer').clears,1);
 assert.equal(f.service.progressFor('2','forger').unlocked,0);assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,60);
 const restarted=new RogueService(f.host,'1',{clock:f.clock});assert.equal(restarted.homeInfo({guild:'1',id:'2'}).progress.find(x=>x.professionId==='tamer').unlocked,1);
 assert.throws(()=>f.service.start({...f.p,requestId:'locked',mode:'normal',professionId:'tamer',difficulty:2}),e=>e.code==='DIFFICULTY_LOCKED');
 r=f.service.start({...f.p,requestId:'level1',mode:'normal',practice:true,professionId:'tamer',difficulty:1});f.terminal(r);f.service.settle({...f.p,runId:r.runId});assert.equal(f.service.progressFor('2','tamer').unlocked,2);
 r=f.service.start({...f.p,requestId:'repeat0',mode:'normal',practice:true,professionId:'tamer',difficulty:0});f.terminal(r);f.service.settle({...f.p,runId:r.runId});assert.equal(f.service.progressFor('2','tamer').unlocked,2);assert.equal(f.service.progressFor('2','tamer').clears,3);
});
test('v08 progress and economy roll back together on SQL failure, then settle exactly once',()=>{
 const f=expandedFixture(),r=f.service.start({...f.p,mode:'normal',professionId:'forger',difficulty:0});f.terminal(r);
 f.setFault('INSERT INTO rogue_progress');assert.throws(()=>f.service.settle({...f.p,runId:r.runId}));
 assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,60);assert.equal(f.one('SELECT COUNT(*) n FROM rogue_receipts').n,0);assert.equal(f.service.progressFor('2','forger').unlocked,0);
 f.setFault(null);f.service.settle({...f.p,runId:r.runId});assert.equal(f.service.progressFor('2','forger').unlocked,1);assert.equal(f.one('SELECT balance FROM tavern_members WHERE id=?','2').balance,90);
});
test('daily v08 difficulty and profession are server controlled and seeded consistently',()=>{
 const f=expandedFixture(),r=f.service.start({...f.p,professionId:'forger',difficulty:10});assert.equal(r.professionId,f.service.challengeProfession());assert.equal(r.difficulty,f.service.challengeDifficulty());assert.match(r.seed,new RegExp(`difficulty-${r.difficulty}`));
 assert.throws(()=>f.service.homeInfo({guild:'9',id:'2'}));
});
test('all difficulty rungs including max can unlock without exceeding ten',()=>{
 const f=expandedFixture();for(let difficulty=0;difficulty<=10;difficulty++){
 const r=f.service.start({...f.p,mode:'normal',practice:true,requestId:`ladder-${difficulty}`,professionId:'warden',difficulty});f.terminal(r);f.service.settle({...f.p,runId:r.runId});assert.equal(f.service.progressFor('2','warden').unlocked,Math.min(10,difficulty+1));}
 assert.equal(f.service.progressFor('2','warden').clears,11);
});
test('zero-credit clear still unlocks and legacy confirmed clears inherit progress',()=>{
 const f=expandedFixture();f.service=new RogueService(f.host,'1',{idFactory:()=> 'legacy-clear',clock:f.clock,rulesVersion:RULE_VERSION});
 const old=f.service.start({...f.p,mode:'normal'});f.terminal(old);f.service.settle({...f.p,runId:old.runId});
 f.db.exec('DELETE FROM rogue_progress');
 const s=new RogueService(f.host,'1',{idFactory:()=> 'zero-credit',clock:f.clock});assert.equal(s.progressFor('2','traveler').unlocked,1);
 f.db.prepare('INSERT INTO tavern_daily VALUES(?,?,150) ON CONFLICT(user_id,day) DO UPDATE SET earned=150').run('2',dayKey(NOW));
 const r=s.start({...f.p,requestId:'zero-start',mode:'normal',professionId:'traveler',difficulty:1});f.terminal(r);const done=s.settle({...f.p,runId:r.runId});assert.equal(done.receipt.amount,0);assert.equal(s.progressFor('2','traveler').unlocked,2);
});

import {beginBattle as beginBattleV10} from './rogue-battle-v10.mjs';
import {CATALOG_V10} from './rogue-content-v10.mjs';
import {beginBattle as beginBattleV13} from './rogue-battle-v13.mjs';
test('default v11 service resumes frozen v10 combat with metrics and observation once per request',()=>{
 const f=fixture(),old=new RogueService(f.host,'1',{idFactory:()=> 'frozen-v10',clock:f.clock,rulesVersion:V10_RULE_VERSION});
 let r=old.start({...f.p,requestId:'frozen-v10-start',mode:'normal',professionId:'medic',difficulty:0});
 r=old.act(command(f.p,r,'frozen-v10-bless',{type:'BLESSING',relicId:r.room.candidates[0]}));
 r.phase='BATTLE';r.room={type:'battle',battleType:'normal',enemyId:CATALOG_V10.acts[0].normalPool[0],rewardGranted:false};
 r.battle=beginBattleV10({enemyId:r.room.enemyId,professionId:'medic',hp:29,seed:'metrics',relics:[],deck:Array.from({length:8},(_,uid)=>({uid,cardId:'field_wrap',upgraded:false}))});old.save(r);
 const current=new RogueService(f.host,'1',{clock:f.clock}),a=command(f.p,r,'frozen-v10-heal',{type:'PLAY',uid:r.battle.hand[0].uid});
 const n=current.act(a);assert.equal(n.ruleVersion,V10_RULE_VERSION);assert.equal(n.effectMetrics.healing,1);assert.equal(n.effectMetrics.overheal,2);
 assert.deepEqual(current.act(a),n);assert.deepEqual(current.resume({...f.p,runId:r.runId}),n);assert.ok(n.observation.entries.length>0);
});
test('v12 shop purchase is transactional and duplicate request cannot duplicate stock, debit or receipt',()=>{
 const f=fixture(),s=new RogueService(f.host,'1',{idFactory:()=> 'v12-shop',clock:f.clock,rulesVersion:'lantern-rules-v0.12'});
 const r=s.start({...f.p,requestId:'v12-shop-start',mode:'normal'});
 assert.equal(r.ruleVersion,'lantern-rules-v0.12');
 r.phase='ROOM';r.embers=20;r.room={type:'shop',stock:['slash'],itemStock:[],prices:{cardByEnergy:{1:10},upgrade:12,remove:8,item:8},services:{upgrade:false,remove:false}};s.save(r);
 const action=command(f.p,r,'v12-shop-buy',{type:'SHOP',choice:'buy',cardId:'slash'});
 f.setFault('INSERT INTO rogue_requests');assert.throws(()=>s.act(action),/injected/);f.setFault(null);
 const unchanged=s.resume({...f.p,runId:r.runId});assert.equal(unchanged.embers,20);assert.equal(unchanged.resourceLog.length,0);
 const n=s.act(action);assert.equal(n.embers,10);assert.equal(n.resourceLog.length,1);assert.equal(n.deck.length,r.deck.length+1);
 assert.deepEqual(s.act(action),n);assert.deepEqual(s.resume({...f.p,runId:r.runId}),n);
});
test('v13 service persists break progress once per successful request and consumes the break once',()=>{
 const f=fixture(),s=new RogueService(f.host,'1',{idFactory:()=> 'v13-break',clock:f.clock,rulesVersion:'lantern-rules-v0.13'});
 const r=s.start({...f.p,requestId:'v13-start',mode:'normal'});
 assert.equal(r.ruleVersion,'lantern-rules-v0.13');r.phase='BATTLE';r.room={type:'battle',battleType:'normal',enemyId:'a2_seam_duelist',rewardGranted:false};
 r.deck=Array.from({length:8},(_,uid)=>({uid,cardId:'slash',upgraded:false}));r.battle=beginBattleV13({enemyId:r.room.enemyId,deck:r.deck,relics:[],hp:30,seed:'request-break'});s.save(r);
 const action=command(f.p,r,'v13-play',{type:'PLAY',uid:r.battle.hand[0].uid});
 const n=s.act(action);assert.equal(n.battle.chargeDamage,5);assert.deepEqual(s.act(action),n);
 const second=s.act(command(f.p,n,'v13-play2',{type:'PLAY',uid:n.battle.hand[0].uid}));assert.equal(second.battle.chargeDamage,10);
 const end=command(f.p,second,'v13-end',{type:'END_TURN'}),resolved=s.act(end);
 assert.equal(resolved.battle.intent.kind,'attack');assert.equal(resolved.battle.intent.value,2);
 assert.equal(resolved.battle.log.filter(x=>x.includes('破势：')).length,1);assert.deepEqual(s.act(end),resolved);
});

test('v14 sergeant break progress and resolved reduction persist only once for duplicate SQL requests',async()=>{
 const {beginBattle}=await import('./rogue-battle-v14.mjs');
 const f=fixture(),s=new RogueService(f.host,'1',{idFactory:()=> 'v14-elite-break',clock:f.clock});
 const r=s.start({...f.p,requestId:'v14-elite-start',mode:'normal'});
 r.phase='BATTLE';r.room={type:'battle',battleType:'elite',enemyId:'cracked_sergeant',rewardGranted:false};
 r.deck=Array.from({length:8},(_,uid)=>({uid,cardId:'slash',upgraded:false}));
 r.battle=beginBattle({enemyId:r.room.enemyId,deck:r.deck,relics:[],hp:30,seed:'request-elite'});s.save(r);
 const charge=s.act(command(f.p,r,'v14-guard-end',{type:'END_TURN'}));
 assert.equal(charge.battle.enemyArmor,0);assert.equal(charge.battle.enemyShield,5);
 let n=charge;
 for(let i=0;i<3;i++){
  const action=command(f.p,n,`v14-elite-play-${i}`,{type:'PLAY',uid:n.battle.hand[0].uid});n=s.act(action);assert.deepEqual(s.act(action),n);
 }
 assert.equal(n.battle.turn,3);assert.equal(n.battle.intent.kind,'attack');assert.equal(n.battle.intent.value,6);
 assert.equal(n.battle.log.filter(x=>x.startsWith('破势：')).length,1);
 const end=command(f.p,n,'v14-elite-hit',{type:'END_TURN'}),resolved=s.act(end);assert.deepEqual(s.act(end),resolved);
 assert.equal(resolved.battle.intent.kind,'attack');assert.equal(resolved.battle.intent.value,5);
});
