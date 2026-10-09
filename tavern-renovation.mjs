import {RENOVATION_ITEMS,SHOP_STAGES,renovationItem,shopStage} from './tavern-renovation-catalog.mjs';
import {validId,cleanText} from './tavern-catalog.mjs';

const now=()=>Date.now();
function safeName(value,fallback){
 let s=cleanText(typeof value==='string'?value:'',100).replace(/<[@#&]!?\d+>/g,'').replace(/[<>]/g,'').replace(/([\\`*_~|#\[\](){}!])/g,'').replace(/@/g,'＠').replace(/\s+/g,' ').trim();
 if([...s].length<2||/^[\p{P}\p{S}\s]+$/u.test(s))return fallback;
 return s;
}
function snapshotName(value,fallback='来客'){
 const cleaned=safeName(value,'');return [...(cleaned||fallback)].slice(0,32).join('');
}
function defaultTitle(donor,item,upgrade){
 const suffix=upgrade?`的${item.name}升级`:`的${item.name}`;
 const room=Math.max(1,24-[...suffix].length);
 return `${[...donor].slice(0,room).join('')}${suffix}`;
}

export class TavernRenovation {
 constructor(host){this.host=host;this.storage=host.storage;this.sql=host.sql;this._initialize();}
 rows(q,...a){return this.host.rows(q,...a)} one(q,...a){return this.host.one(q,...a)}
 _initialize(){
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_reno_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_reno_consumption (order_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, donor_name TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0), at INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_reno_consumption_user ON tavern_reno_consumption(user_id,at DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_reno_direct (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, donor_name TEXT NOT NULL, item TEXT NOT NULL, level INTEGER NOT NULL, before_level INTEGER NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0), kind TEXT NOT NULL, at INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_reno_direct_item ON tavern_reno_direct(item,at DESC)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_reno_direct_user ON tavern_reno_direct(user_id,at DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_reno_assets (item TEXT PRIMARY KEY, level INTEGER NOT NULL, name TEXT NOT NULL, founder_id TEXT NOT NULL, founder_name TEXT NOT NULL, updated_id TEXT NOT NULL, updated_name TEXT NOT NULL, at INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_reno_drafts (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, donor_name TEXT NOT NULL, channel TEXT NOT NULL, item TEXT NOT NULL, level INTEGER NOT NULL, before_level INTEGER NOT NULL, price INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT \'pending\')');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_reno_drafts_user ON tavern_reno_drafts(user_id,status,expires)');
  if(!this.one("SELECT value FROM tavern_reno_meta WHERE key='legacy_backfill_v1'")){
   this.storage.transactionSync(()=>{
    if(this.one("SELECT value FROM tavern_reno_meta WHERE key='legacy_backfill_v1'"))return;
    for(const o of this.rows('SELECT id,user_id,details,price,at FROM tavern_orders WHERE price>0')){
     this.recordConsumption({id:o.id,user_id:o.user_id,details:o.details,at:o.at,price:o.price},true);
    }
    this.sql.exec("INSERT INTO tavern_reno_meta(key,value) VALUES('legacy_backfill_v1','1')");
   });
  }
  if(!this.one("SELECT value FROM tavern_reno_meta WHERE key='economy_v2_stage_floor'")){
   this.storage.transactionSync(()=>{
    if(this.one("SELECT value FROM tavern_reno_meta WHERE key='economy_v2_stage_floor'"))return;
    const {consumption,direct}=this._totals(),total=consumption+direct;
    const floor=total>=6000?4:total>=2500?3:total>=1000?2:total>=300?1:0;
    this.sql.exec("INSERT INTO tavern_reno_meta(key,value) VALUES('economy_v2_stage_floor',?)",String(floor));
   });
  }
  this.stageFloor=Number(this.one("SELECT value FROM tavern_reno_meta WHERE key='economy_v2_stage_floor'")?.value)||0;
 }
 _stage(total){return SHOP_STAGES[Math.max(shopStage(total).level,this.stageFloor)]||SHOP_STAGES.at(-1)}
 recordConsumption(order,insideTransaction=false){
  if(!order||!order.id||!order.user_id||!(Number(order.price)>0))return false;
  const write=()=>{
   if(this.one('SELECT order_id FROM tavern_reno_consumption WHERE order_id=?',order.id))return false;
   const member=this.one('SELECT name FROM tavern_members WHERE id=?',order.user_id);
   this.sql.exec('INSERT INTO tavern_reno_consumption VALUES(?,?,?,?,?)',order.id,order.user_id,snapshotName(member?.name),Math.floor(Number(order.price)),Number(order.at)||now());
   return true;
  };
  return insideTransaction?write():(this.storage.transactionSync(write));
 }
 equipmentLevels(){return new Map(this.rows('SELECT item,level FROM tavern_reno_assets').map(a=>[a.item,a.level]));}
 _totals(){return {consumption:this.one('SELECT COALESCE(SUM(amount),0) AS n FROM tavern_reno_consumption')?.n||0,direct:this.one('SELECT COALESCE(SUM(price),0) AS n FROM tavern_reno_direct')?.n||0}}
 board(id,name){
  if(id)this.host.member(id,name);
  const totals=this._totals(),total=totals.consumption+totals.direct,stage=this._stage(total),si=stage.level;
  const next=SHOP_STAGES[si+1]||null;
  const storedAssets=this.rows('SELECT * FROM tavern_reno_assets ORDER BY item');
  const levelNames=new Map();for(const r of this.rows('SELECT item,level,name FROM tavern_reno_direct ORDER BY at DESC,id DESC')){const key=`${r.item}:${r.level}`;if(!levelNames.has(key))levelNames.set(key,r.name);}
  const assetMap=new Map(storedAssets.map(a=>[a.item,a]));
  const assets=storedAssets.map(a=>{const item=renovationItem(a.item);return item?{item:item.id,level:a.level,name:a.name,levelName:levelNames.get(`${a.item}:${a.level}`)||a.name,founder:{id:a.founder_id,name:a.founder_name},updatedBy:{id:a.updated_id,name:a.updated_name},at:a.at}:null}).filter(Boolean);
  const catalog=RENOVATION_ITEMS.map(item=>{
   const a=assetMap.get(item.id),ownedLevel=a?.level||0,nextLevel=item.kind==='object'?(ownedLevel?null:1):(ownedLevel<3?ownedLevel+1:null),level=nextLevel?item.levels[nextLevel-1]:null;
   let lockReason=null;if(!level)lockReason='已达到最高等级';else if(si<level.stage)lockReason=`店铺达到${SHOP_STAGES[level.stage].name}后解锁`;
   return {...item,ownedLevel,nextLevel,nextPrice:level?.price??null,available:!!level&&si>=level.stage,lockReason};
  });
  const recent=this.rows('SELECT id,user_id,donor_name,item,level,name,price,kind,at FROM tavern_reno_direct ORDER BY at DESC,id DESC LIMIT 5').map(r=>{const it=renovationItem(r.item);return {...r,item_name:it?.name||r.item,levelName:r.name};});
  const leaders=this.rows(`SELECT user_id AS id, donor_name AS name,
   COALESCE((SELECT SUM(amount) FROM tavern_reno_consumption c WHERE c.user_id=x.user_id),0) AS consumption,
   COALESCE((SELECT SUM(price) FROM tavern_reno_direct d WHERE d.user_id=x.user_id),0) AS direct
   FROM (SELECT user_id,MAX(donor_name) AS donor_name FROM (SELECT user_id,donor_name FROM tavern_reno_consumption UNION ALL SELECT user_id,donor_name FROM tavern_reno_direct) GROUP BY user_id) x
   ORDER BY (consumption+direct) DESC,direct DESC,id LIMIT 10`).map(x=>({...x,total:x.consumption+x.direct}));
  const result={source:'program_confirmed_renovation',...totals,total,stage,next,assets,catalog,recent,leaders};
  if(id){const c=this.one('SELECT COALESCE(SUM(amount),0) AS n FROM tavern_reno_consumption WHERE user_id=?',id)?.n||0,d=this.one('SELECT COALESCE(SUM(price),0) AS n FROM tavern_reno_direct WHERE user_id=?',id)?.n||0;result.mine={consumption:c,direct:d,total:c+d};result.balance=this.one('SELECT balance FROM tavern_members WHERE id=?',id)?.balance||0;}
  return result;
 }
 scene(){
  const totals=this._totals(),total=totals.consumption+totals.direct,stage=this._stage(total);
  const latest=this.rows('SELECT * FROM tavern_reno_assets ORDER BY at DESC,item DESC LIMIT 12');
  const levels=new Map();for(const r of this.rows('SELECT item,level,name FROM tavern_reno_direct ORDER BY at DESC,id DESC')){const key=`${r.item}:${r.level}`;if(!levels.has(key))levels.set(key,r.name);}
  const assets=latest.map(a=>{const i=renovationItem(a.item),lvl=i?.levels[a.level-1];return i?{item:i.name,name:a.name,level:a.level,levelName:levels.get(`${a.item}:${a.level}`)||a.name,scene:lvl?.scene||i.description,founder:a.founder_name,updatedBy:a.updated_name}:null}).filter(Boolean);
  return {source:'program_confirmed_renovation',stage,total,consumption:totals.consumption,direct:totals.direct,assets};
 }
 history(item,page=0){
  if(item&&!renovationItem(item))throw Error('档案物件不存在。');const where=item?'WHERE item=?':'';const args=item?[item]:[];
  const total=this.one(`SELECT COUNT(*) AS n FROM tavern_reno_direct ${where}`,...args)?.n||0,maxPage=Math.max(0,Math.ceil(total/8)-1),raw=Number(page);page=Number.isSafeInteger(raw)?Math.min(maxPage,Math.max(0,raw)):0;
  const entries=this.rows(`SELECT id,user_id,donor_name,item,level,name,price,kind,at FROM tavern_reno_direct ${where} ORDER BY at DESC,id DESC LIMIT 9 OFFSET ?`,...args,page*8).map(r=>{const it=renovationItem(r.item);return {...r,item_name:it?.name||r.item,levelName:it?.kind==='facility'?it.levels[r.level-1].label:it?.name};});
  return {entries:entries.slice(0,8),page,hasMore:page<maxPage};
 }
 prepare(p,at=now()){
  if(!validId(p.channel)||typeof p.requestKey!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(p.requestKey))throw Error('装修预览无效，请重新打开目录。');
  const item=renovationItem(p.item);if(!item)throw Error('这件物品不在装修目录。');
  const member=this.host.member(p.id,p.name,at);let old=this.one('SELECT * FROM tavern_reno_drafts WHERE request_key=?',p.requestKey);
  if(old){if(old.user_id!==p.id||old.channel!==p.channel)throw Error('装修预览不属于你。');const original=renovationItem(old.item);return {...old,beforeLevel:old.before_level,balance:member.balance,levelName:original.kind==='facility'?original.levels[old.level-1].label:original.name};}
  if((this.one("SELECT COUNT(*) AS n FROM tavern_reno_drafts WHERE user_id=? AND status='pending' AND expires>?",p.id,at)?.n||0)>=8)throw Error('还有几份装修预览没确认，先处理一份吧。');
  const board=this.board(),asset=this.one('SELECT * FROM tavern_reno_assets WHERE item=?',item.id),before=asset?.level||0,level=item.kind==='object'?1:before+1;
  if((item.kind==='object'&&before)||level>item.levels.length)throw Error('这件物品已经购置或达到最高等级。');
  const spec=item.levels[level-1];if(board.stage.level<spec.stage)throw Error(`店铺成长至${SHOP_STAGES[spec.stage].name}后才能购置。`);
  const price=spec.price,kind=before?'upgrade':'purchase',donor=snapshotName(p.name),blankTitle=typeof p.title!=='string'||p.title.trim()==='';
  let title;if(blankTitle)title=defaultTitle(donor,item,kind==='upgrade');else {title=safeName(p.title,'');if(!title||[...title].length<2||[...title].length>24||/^[\p{P}\p{S}\s]+$/u.test(title))throw Error('冠名需为2～24字，且不能只有符号。');}
  const draft={id:crypto.randomUUID().replaceAll('-','').slice(0,24),request_key:p.requestKey,user_id:p.id,donor_name:donor,channel:p.channel,item:item.id,level,before_level:before,price,name:title,kind,expires:at+180000,status:'pending'};
  this.sql.exec('INSERT INTO tavern_reno_drafts(id,request_key,user_id,donor_name,channel,item,level,before_level,price,name,kind,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',draft.id,draft.request_key,draft.user_id,draft.donor_name,draft.channel,draft.item,draft.level,draft.before_level,draft.price,draft.name,draft.kind,draft.expires);
  return {...draft,beforeLevel:draft.before_level,balance:member.balance,levelName:item.kind==='facility'?item.levels[level-1].label:item.name};
 }
 draft(id,user,channel){const d=this.one('SELECT * FROM tavern_reno_drafts WHERE id=?',id);if(!d||d.user_id!==user||d.channel!==channel)throw Error('这不是你的装修预览。');return d;}
 confirm(user,draftId,channel,at=now()){
  let answer;this.storage.transactionSync(()=>{
   const d=this.draft(draftId,user,channel),prior=this.one('SELECT * FROM tavern_reno_direct WHERE id=?',draftId);
   const member=this.host.member(user,'',at,true);
   if(prior){const board=this.board(user);answer={contribution:this._publicContribution(prior),asset:this._publicAsset(this.one('SELECT * FROM tavern_reno_assets WHERE item=?',prior.item)),balance:member.balance,repeated:true,total:board.total,stage:board.stage};return;}
   if(d.status!=='pending'||d.expires<=at)throw Error('装修预览已过期，请重新选择。');
   const item=renovationItem(d.item);if(!item)throw Error('装修目录已更新。');
   const current=this.one('SELECT * FROM tavern_reno_assets WHERE item=?',d.item),before=current?.level||0,level=item.kind==='object'?1:before+1,spec=item.levels[level-1];
   if(before!==d.before_level||level!==d.level||!spec||spec.price!==d.price||level>item.levels.length)throw Error('这件物品已被其他常客更新，请重新预览。');
   const totals=this._totals(),stage=this._stage(totals.consumption+totals.direct);if(stage.level<spec.stage)throw Error(`店铺成长至${SHOP_STAGES[spec.stage].name}后才能购置。`);
   if(member.balance<d.price)throw Error(`酒馆币不足，还差${d.price-member.balance}币。`);
   this.sql.exec('UPDATE tavern_members SET balance=balance-? WHERE id=?',d.price,user);
   this.sql.exec('INSERT INTO tavern_reno_direct VALUES(?,?,?,?,?,?,?,?,?,?)',d.id,user,d.donor_name,d.item,level,before,d.name,d.price,d.kind,at);
   if(!before)this.sql.exec('INSERT INTO tavern_reno_assets VALUES(?,?,?,?,?,?,?,?)',d.item,level,d.name,user,d.donor_name,user,d.donor_name,at);
   else this.sql.exec('UPDATE tavern_reno_assets SET level=?,updated_id=?,updated_name=?,at=? WHERE item=?',level,user,d.donor_name,at,d.item);
   this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`reno:${d.id}`,user,-d.price,'renovation',`${item.name} ${spec.label} · ${d.name}`,at);
   this.sql.exec("UPDATE tavern_reno_drafts SET status='confirmed' WHERE id=?",d.id);
   const board=this.board(user);answer={contribution:this._publicContribution(this.one('SELECT * FROM tavern_reno_direct WHERE id=?',d.id)),asset:this._publicAsset(this.one('SELECT * FROM tavern_reno_assets WHERE item=?',d.item)),balance:member.balance-d.price,repeated:false,total:board.total,stage:board.stage};
  });return answer;
 }
 _publicContribution(r){const it=renovationItem(r.item);return {...r,item_name:it?.name||r.item,levelName:r.name};}
 _publicAsset(a){if(!a)return null;const it=renovationItem(a.item),levelName=this.one('SELECT name FROM tavern_reno_direct WHERE item=? AND level=? ORDER BY at DESC,id DESC LIMIT 1',a.item,a.level)?.name||a.name;return {...a,item_name:it?.name||a.item,levelName,founder:{id:a.founder_id,name:a.founder_name},updatedBy:{id:a.updated_id,name:a.updated_name}};}
 async dispatch(p){
  if(p.action==='renoBoard')return p.privateView===true?this.board(p.id,p.name):this.board();
  if(p.action==='renoScene')return this.scene();if(p.action==='renoHistory')return this.history(p.item,p.page);
  if(!validId(p.id))throw Error('无效来客。');
  if(p.action==='renoPrepare')return this.prepare(p);
  if(p.action==='renoDraft'){const d=this.draft(p.draftId,p.id,p.channel),member=this.host.member(p.id,p.name),it=renovationItem(d.item);return {...d,beforeLevel:d.before_level,balance:member.balance,levelName:it.kind==='facility'?it.levels[d.level-1].label:it.name};}
  if(p.action==='renoConfirm')return this.confirm(p.id,p.draftId,p.channel);
  throw Error('未知装修操作。');
 }
}
