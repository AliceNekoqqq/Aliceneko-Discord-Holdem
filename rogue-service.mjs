import {createRun,runAction,expireRun,RULE_VERSION,CURRENT_RULE_VERSION,V17_RULE_VERSION,V16_RULE_VERSION,V15_RULE_VERSION,SUPPORTED_RULE_VERSIONS} from './rogue-run.mjs';
import {scoreRun,rewardAmount,dailySeedGroup,REWARDED_STARTS,ECONOMY_VERSION} from './rogue-economy.mjs';
import {DAILY_REWARD_CAP,dayKey,validId} from './tavern-catalog.mjs';
import {PROFESSIONS} from './rogue-content-v09.mjs';
import {MAX_DIFFICULTY} from './rogue-difficulty-v08.mjs';
import {pruneObservation,recordObservation,summarizeObservation,summarizeObservationLines} from './rogue-observation.mjs';
import {mergeRunMetrics} from './rogue-effect-metrics.mjs';
const V14_RULE_VERSION='lantern-rules-v0.14';
const OBSERVATION_RULES=['lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13',V14_RULE_VERSION,V15_RULE_VERSION,V16_RULE_VERSION,V17_RULE_VERSION,CURRENT_RULE_VERSION];
const METRIC_RULES=['lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13',V14_RULE_VERSION,V15_RULE_VERSION,V16_RULE_VERSION,V17_RULE_VERSION,CURRENT_RULE_VERSION];
const EXPANDED_RULES=['lantern-rules-v0.7','lantern-rules-v0.8','lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13',V14_RULE_VERSION,V15_RULE_VERSION,V16_RULE_VERSION,V17_RULE_VERSION,CURRENT_RULE_VERSION];
const PROFESSION_IDS=Object.keys(PROFESSIONS);
const hashSeed=seed=>{let h=2166136261;for(const c of String(seed)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
const professionForSeed=seed=>PROFESSION_IDS[hashSeed(seed)%PROFESSION_IDS.length]??'traveler';

// Lives inside the already guild-bound TavernService's SQLite DO. No external
// I/O/await in transactionSync; wallet, snapshot and receipt commit together.
export class RogueServiceError extends Error{
 constructor(code,message){super(message);this.name='RogueServiceError';this.code=code;}
}
const fail=(code,message)=>{throw new RogueServiceError(code,message);};
const requestKey=r=>{
 if(typeof r!=='string'||r.length<1||r.length>100||!/^[\w:-]+$/.test(r))fail('REQUEST','操作标识无效。');
 return r;
};
const validTime=now=>{if(!Number.isSafeInteger(now)||now<0)fail('TIME','时间无效。');};
export class RogueService{
 constructor(host,guild,{idFactory=()=>crypto.randomUUID(),clock=()=>Date.now(),rulesVersion=CURRENT_RULE_VERSION}={}){
  if(!validId(guild))fail('GUILD','需要已绑定的服务器。');
  if(!(SUPPORTED_RULE_VERSIONS??[RULE_VERSION,CURRENT_RULE_VERSION]).includes(rulesVersion))fail('VERSION','不支持的规则版本。');
  this.host=host;this.storage=host.storage;this.sql=host.sql;this.guild=guild;this.idFactory=idFactory;this.clock=clock;this.rulesVersion=rulesVersion;
  this.storage.transactionSync(()=>{
   this.sql.exec('CREATE TABLE IF NOT EXISTS rogue_runs (id TEXT PRIMARY KEY,guild TEXT NOT NULL,owner TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL)');
   this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS rogue_one_active ON rogue_runs(guild,owner) WHERE status='ACTIVE'");
   this.sql.exec('CREATE TABLE IF NOT EXISTS rogue_requests (guild TEXT NOT NULL,owner TEXT NOT NULL,request_id TEXT NOT NULL,run_id TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(guild,owner,request_id))');
   this.sql.exec('CREATE TABLE IF NOT EXISTS rogue_daily (owner TEXT NOT NULL,day TEXT NOT NULL,starts INTEGER NOT NULL DEFAULT 0,earned INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,day))');
   this.sql.exec('CREATE TABLE IF NOT EXISTS rogue_receipts (run_id TEXT PRIMARY KEY,owner TEXT NOT NULL,guild TEXT NOT NULL,day TEXT NOT NULL,amount INTEGER NOT NULL,base_amount INTEGER NOT NULL,score INTEGER NOT NULL,economy_version TEXT NOT NULL,at INTEGER NOT NULL)');
   this.sql.exec('CREATE TABLE IF NOT EXISTS rogue_best (seed_group TEXT NOT NULL,owner TEXT NOT NULL,score INTEGER NOT NULL,run_id TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(seed_group,owner))');
   this.sql.exec('CREATE TABLE IF NOT EXISTS rogue_rank_outbox (run_id TEXT PRIMARY KEY)');
   this.sql.exec('CREATE TABLE IF NOT EXISTS rogue_progress (owner TEXT NOT NULL,profession TEXT NOT NULL,unlocked INTEGER NOT NULL DEFAULT 0,clears INTEGER NOT NULL DEFAULT 0,last_run_id TEXT,PRIMARY KEY(owner,profession))');
  });
 }
 one(q,...args){return this.sql.exec(q,...args).toArray()[0]||null;}
 guard(p){
  if(p?.guild!==this.guild)fail('GUILD','这局属于另一个服务器。');
  if(!validId(p.id))fail('OWNER','请打开自己的冒险。');
 }
 load(p){
  this.guard(p);
  const row=this.one('SELECT * FROM rogue_runs WHERE id=?',p.runId);
  if(!row||row.guild!==this.guild||row.owner!==p.id)fail('OWNER','不能操作这局冒险。');
  const run=JSON.parse(row.snapshot);
  if(run.guild!==this.guild||run.owner!==p.id||run.runId!==row.id)fail('SNAPSHOT','冒险记录不匹配。');
  if(OBSERVATION_RULES.includes(run.ruleVersion)){
   const stored=run.observation,clean=pruneObservation(stored,this.clock());run.observation=clean;
   if(JSON.stringify(stored??null)!==JSON.stringify(clean))this.sql.exec('UPDATE rogue_runs SET snapshot=? WHERE id=? AND guild=? AND owner=?',JSON.stringify(run),row.id,this.guild,p.id);
  }
  if(run.phase!=='RESULT'&&!(SUPPORTED_RULE_VERSIONS??[RULE_VERSION,CURRENT_RULE_VERSION]).includes(run.ruleVersion))fail('VERSION','这局需要原规则版本，不能替换存档。');
  return run;
 }
 save(run){
  if(OBSERVATION_RULES.includes(run.ruleVersion))run={...run,observation:pruneObservation(run.observation,this.clock())};
  const snapshot=run.phase==='RESULT'&&!run.settlement?{...run,settlement:{...scoreRun(run),economyVersion:ECONOMY_VERSION}}:run;
  this.sql.exec('INSERT INTO rogue_runs VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,version=excluded.version,snapshot=excluded.snapshot',snapshot.runId,snapshot.guild,snapshot.owner,snapshot.phase==='RESULT'?'RESULT':'ACTIVE',snapshot.version,JSON.stringify(snapshot));
 }
 remember(p,runId,kind){this.sql.exec('INSERT INTO rogue_requests VALUES(?,?,?,?,?)',this.guild,p.id,requestKey(p.requestId),runId,kind);}
 prior(p,kind){
  const row=this.one('SELECT * FROM rogue_requests WHERE guild=? AND owner=? AND request_id=?',this.guild,p.id,requestKey(p.requestId));
  if(row&&(row.kind!==kind||(p.runId&&row.run_id!==p.runId)))fail('REQUEST','操作标识已用于另一个请求。');
  return row;
 }
 // All counts are settlement-day based. A delayed old run cannot credit an old
 // daily bucket and bypass today's total ceiling. Zero amounts also get receipts.
 settleInside(run,now){
  if(run.phase!=='RESULT')fail('PHASE','冒险尚未结束。');
  const prior=this.one('SELECT * FROM rogue_receipts WHERE run_id=?',run.runId);
  if(prior)return {...run,receipt:prior};
  const tally=run.settlement??scoreRun(run),day=dayKey(now);
  const total=this.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?',run.owner,day)?.earned||0;
  const used=this.one('SELECT earned FROM rogue_daily WHERE owner=? AND day=?',run.owner,day)?.earned||0;
  const amount=rewardAmount(run,{totalEarned:total,rogueEarned:used,totalCap:DAILY_REWARD_CAP});
  this.host.member(run.owner,'',now,true);
  if(amount){
   this.sql.exec('UPDATE tavern_members SET balance=balance+? WHERE id=?',amount,run.owner);
   this.sql.exec('INSERT INTO tavern_daily VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET earned=earned+excluded.earned',run.owner,day,amount);
   this.sql.exec('INSERT INTO rogue_daily(owner,day,earned) VALUES(?,?,?) ON CONFLICT(owner,day) DO UPDATE SET earned=earned+excluded.earned',run.owner,day,amount);
  }
  this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`rogue:${run.runId}`,run.owner,amount,'rogue',`灯下迷城 ${run.result.type}`,now);
  const receipt={run_id:run.runId,owner:run.owner,guild:this.guild,day,amount,base_amount:tally.baseCoins,score:tally.score,economy_version:tally.economyVersion??ECONOMY_VERSION,at:now};
  this.advanceProgress(run);
  this.sql.exec('INSERT INTO rogue_receipts VALUES(?,?,?,?,?,?,?,?,?)',receipt.run_id,receipt.owner,receipt.guild,receipt.day,receipt.amount,receipt.base_amount,receipt.score,receipt.economy_version,receipt.at);
  if(tally.ranked)this.sql.exec('INSERT INTO rogue_rank_outbox VALUES(?)',run.runId);
  const done={...run,receipt};this.save(done);return done;
 }
 publishRank(run){
  if(!run||run.phase!=='RESULT')return run;
  try{
   this.storage.transactionSync(()=>{
    if(!this.one('SELECT run_id FROM rogue_rank_outbox WHERE run_id=?',run.runId))return;
    const receipt=this.one('SELECT * FROM rogue_receipts WHERE run_id=?',run.runId);
    if(!receipt)fail('RECEIPT','结果尚未完成入账。');
    const group=dailySeedGroup(this.guild,run.startDay,run.ruleVersion,run.difficulty??0);
    this.sql.exec('INSERT INTO rogue_best VALUES(?,?,?,?,?) ON CONFLICT(seed_group,owner) DO UPDATE SET score=excluded.score,run_id=excluded.run_id,at=excluded.at WHERE excluded.score>rogue_best.score',group,run.owner,receipt.score,run.runId,receipt.at);
    this.sql.exec('DELETE FROM rogue_rank_outbox WHERE run_id=?',run.runId);
   });
   return {...run,rankPending:false};
  }catch{return {...run,rankPending:true};} // paid receipt is already durable
 }
 drainRanks(exclude=''){
  // Bounded on-demand repair; reading today's board also repairs older runs.
  const pending=this.sql.exec('SELECT r.snapshot FROM rogue_rank_outbox q JOIN rogue_runs r ON r.id=q.run_id WHERE r.guild=? AND r.id<>? ORDER BY q.rowid LIMIT 20',this.guild,exclude).toArray();
  for(const row of pending)this.publishRank(JSON.parse(row.snapshot));
 }
 payPending(run,now){
  if(!run||run.phase!=='RESULT')return run;
  try{return this.storage.transactionSync(()=>this.settleInside(this.load({guild:this.guild,id:run.owner,runId:run.runId}),now));}
  catch{return {...run,settlementPending:true};}
 }
 drainSettlements(owner,now,exclude=''){
  const pending=this.sql.exec("SELECT r.snapshot FROM rogue_runs r LEFT JOIN rogue_receipts p ON p.run_id=r.id WHERE r.guild=? AND r.owner=? AND r.status='RESULT' AND p.run_id IS NULL AND r.id<>? ORDER BY r.rowid LIMIT 3",this.guild,owner,exclude).toArray();
  for(const row of pending)this.payPending(JSON.parse(row.snapshot),now);
 }
 respond(run){
  const now=this.clock(),paid=this.payPending(run,now),result=this.publishRank(paid);
  if(run)this.drainSettlements(run.owner,now,run.runId);
  this.drainRanks(run?.runId??'');return result;
 }
 expireInside(run,now){
  const next=expireRun(run,now);
  if(next.phase==='RESULT'&&run.phase!=='RESULT')this.save(next);
  return next;
 }
 start(p){
  this.guard(p);const now=this.clock();validTime(now);
  if(!['normal','challenge'].includes(p.mode??'normal'))fail('MODE','请选择普通冒险或每日挑战。');
  const result=this.storage.transactionSync(()=>{
   const previous=this.prior(p,'START');if(previous)return this.load({...p,runId:previous.run_id});
   const active=this.one("SELECT id FROM rogue_runs WHERE guild=? AND owner=? AND status='ACTIVE'",this.guild,p.id);
   if(active){const found=this.expireInside(this.load({...p,runId:active.id}),now);if(found.phase!=='RESULT'){this.remember(p,found.runId,'START');return found;}}
   this.host.member(p.id,p.name||'',now,true);
   const day=dayKey(now),daily=this.one('SELECT starts FROM rogue_daily WHERE owner=? AND day=?',p.id,day);
   const rewardEligible=p.practice!==true&&(daily?.starts||0)<REWARDED_STARTS;
   if(rewardEligible)this.sql.exec('INSERT INTO rogue_daily(owner,day,starts) VALUES(?,?,1) ON CONFLICT(owner,day) DO UPDATE SET starts=starts+1',p.id,day);
   const runId=this.idFactory(),mode=p.mode??'normal';
   if(this.one('SELECT id FROM rogue_runs WHERE id=?',runId))fail('RUN_ID','冒险标识重复，请重试。');
   const ruleVersion=this.rulesVersion;
   const expanded=EXPANDED_RULES.includes(ruleVersion);
   const difficulty=expanded?(mode==='challenge'?this.challengeDifficulty():p.difficulty??0):0;
   if(!Number.isInteger(difficulty)||difficulty<0||difficulty>MAX_DIFFICULTY)fail('DIFFICULTY','请选择有效进阶等级。');
   const seed=mode==='challenge'?dailySeedGroup(this.guild,day,ruleVersion,difficulty):`${runId}/normal`;
   if(mode!=='challenge'&&p.professionId!=null&&!PROFESSION_IDS.includes(p.professionId))fail('INVALID_PROFESSION','请选择有效职业。');
   const professionId=mode==='challenge'?professionForSeed(`${this.guild}|${day}|${ruleVersion}`):(p.professionId??PROFESSION_IDS[0]);
   if(expanded&&mode==='normal'&&difficulty>this.progressFor(p.id,professionId).unlocked)fail('DIFFICULTY_LOCKED','请先通关已解锁的进阶等级。');
   const run=createRun({runId,owner:p.id,guild:this.guild,mode,seed,startDay:day,rewardEligible,now,ruleVersion,professionId,difficulty,inventory:[]});
   this.save(run);this.remember(p,runId,'START');return run;
  });
  return this.respond(result);
 }
 resume(p){
  this.guard(p);const now=this.clock();validTime(now);
  const result=this.storage.transactionSync(()=>{
   let runId=p.runId;
   if(!runId)runId=this.one("SELECT id FROM rogue_runs WHERE guild=? AND owner=? ORDER BY (status='ACTIVE') DESC,rowid DESC LIMIT 1",this.guild,p.id)?.id;
   if(!runId)return null;
   return this.expireInside(this.load({...p,runId}),now);
  });
  return this.respond(result);
 }
 act(p){
  this.guard(p);const now=this.clock();validTime(now);
  const result=this.storage.transactionSync(()=>{
   let run=this.load(p);const prior=this.prior(p,'ACT');if(prior)return run;
   run=this.expireInside(run,now);
   if(run.phase==='RESULT')return run;
   if(!Number.isInteger(p.version)||p.version!==run.version)fail('STALE','这个按钮已过期，请查看当前冒险。');
   let next=runAction(run,p.action,now);
   if(METRIC_RULES.includes(run.ruleVersion))next=mergeRunMetrics(run,next,p.action);
   if(OBSERVATION_RULES.includes(run.ruleVersion))next.observation=recordObservation(run,next,now,p.action);
   this.save(next);this.remember(p,run.runId,'ACT');
   return next;
  });
  return this.respond(result);
 }
 settle(p){
  this.guard(p);const now=this.clock();validTime(now);
  const result=this.storage.transactionSync(()=>this.settleInside(this.load(p),now));
  return this.respond(result);
 }
 leaderboard(p){
  this.guard(p);const day=p.day??dayKey(this.clock());
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))fail('DAY','榜单日期无效。');
  const seedGroup=dailySeedGroup(this.guild,day,this.rulesVersion,this.challengeDifficulty());
  this.drainRanks();
  return {day,seedGroup,difficulty:this.challengeDifficulty(),rows:this.sql.exec('SELECT b.owner,m.name,b.score,b.run_id,b.at,RANK() OVER (ORDER BY b.score DESC) AS rank FROM rogue_best b LEFT JOIN tavern_members m ON m.id=b.owner WHERE b.seed_group=? ORDER BY b.score DESC,b.at ASC,b.owner ASC LIMIT 20',seedGroup).toArray()};
 }
 observationSummary(p){
  this.guard(p);const now=this.clock();validTime(now);
  const run=this.storage.transactionSync(()=>this.load(p));
  if(!OBSERVATION_RULES.includes(run.ruleVersion))fail('VERSION','这个旧规则版本没有复盘记录。');
  return {...summarizeObservation(run,now),lines:summarizeObservationLines(run,now)};
 }
 progressFor(owner,professionId){
  const row=this.one('SELECT * FROM rogue_progress WHERE owner=? AND profession=?',owner,professionId);
  if(row)return {professionId,unlocked:row.unlocked,clears:row.clears};
  const legacy=this.one("SELECT COUNT(*) AS clears FROM rogue_runs r JOIN rogue_receipts p ON p.run_id=r.id WHERE r.guild=? AND r.owner=? AND json_extract(r.snapshot,'$.result.type')='CLEAR' AND COALESCE(json_extract(r.snapshot,'$.professionId'),'traveler')=?",this.guild,owner,professionId);
  return {professionId,unlocked:legacy?.clears>0?1:0,clears:legacy?.clears??0};
 }
 advanceProgress(run){
  if(run.result?.type!=='CLEAR')return;
  const professionId=run.professionId??'traveler';if(!PROFESSION_IDS.includes(professionId))return;
  const old=this.progressFor(run.owner,professionId),level=run.difficulty??0;
  // Daily challenges may be above normal unlock; they never skip the ladder.
  const unlocked=level===old.unlocked?Math.min(MAX_DIFFICULTY,old.unlocked+1):Math.max(old.unlocked,level===0?1:old.unlocked);
  this.sql.exec('INSERT INTO rogue_progress VALUES(?,?,?,?,?) ON CONFLICT(owner,profession) DO UPDATE SET unlocked=excluded.unlocked,clears=excluded.clears,last_run_id=excluded.last_run_id',run.owner,professionId,unlocked,old.clears+1,run.runId);
 }
 homeInfo(p){this.guard(p);return {rulesVersion:this.rulesVersion,progress:PROFESSION_IDS.map(id=>this.progressFor(p.id,id)),challengeProfession:this.challengeProfession(),challengeDifficulty:this.challengeDifficulty()};}
 challengeDifficulty(){return EXPANDED_RULES.includes(this.rulesVersion)?hashSeed(`${this.guild}|${dayKey(this.clock())}|${this.rulesVersion}|difficulty`)%4:0;}
 challengeProfession(p={}){const day=dayKey(this.clock());return professionForSeed(`${this.guild}|${day}|${this.rulesVersion}`);}
}
