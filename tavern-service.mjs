import {TavernMapService} from './tavern-map-service.mjs';
import {WELCOME_COINS,DAILY_REWARD_CAP,DAILY_GIFT_COINS,ROSTER_DAILY_LIMIT,rosterRewardRate,ORDER_TTL,REWARDS,validId,dayKey,cleanText,menuItem,makeOrderDetails,SWEETNESS,TEMPERATURE,SEATS} from './tavern-catalog.mjs';
import {TavernRenovation} from './tavern-renovation.mjs';
import {TavernOperations} from './tavern-operations.mjs';
import {PetService} from './pet-service.mjs';
import {UGCService} from './tavern-ugc-service.mjs';

export class TavernService {
 constructor(storage){
  this.storage=storage;this.sql=storage.sql;
  this.sql.exec("CREATE TABLE IF NOT EXISTS tavern_members (id TEXT PRIMARY KEY, name TEXT NOT NULL, balance INTEGER NOT NULL CHECK(balance>=0), joined_at INTEGER NOT NULL, sweetness TEXT NOT NULL DEFAULT 'normal', temperature TEXT NOT NULL DEFAULT 'warm', seat TEXT NOT NULL DEFAULT 'any', restrictions TEXT NOT NULL DEFAULT '')");
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_ledger_user ON tavern_ledger(user_id,at DESC)');
  this.sql.exec("CREATE TABLE IF NOT EXISTS tavern_drafts (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, channel TEXT NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL, details TEXT NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending')");
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_drafts_pending ON tavern_drafts(user_id,status,expires)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL, details TEXT NOT NULL, at INTEGER NOT NULL, shared_message TEXT)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_orders_user ON tavern_orders(user_id,at DESC)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS tavern_orders_channel ON tavern_orders(channel,at DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_results (id TEXT PRIMARY KEY, at INTEGER NOT NULL, outcome TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_daily (user_id TEXT NOT NULL, day TEXT NOT NULL, earned INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,day))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_rosters (roster TEXT NOT NULL, day TEXT NOT NULL, played INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(roster,day))');
 }
 get renovation(){return this._renovation??=new TavernRenovation(this);}
 get map(){return this.mapService??=new TavernMapService(this);}
 get operations(){return this._operations??=new TavernOperations(this);}
 get pets(){return this._pets??=new PetService(this);}
 get ugc(){return this._ugc??=new UGCService(this);}
 rows(q,...args){return this.sql.exec(q,...args).toArray();}
 one(q,...args){return this.rows(q,...args)[0]||null;}
 member(id,name='',now=Date.now(),insideTransaction=false){
  if(!validId(id))throw Error('请在服务器内打开自己的酒馆菜单。');
  let p=this.one('SELECT * FROM tavern_members WHERE id=?',id);
  if(!p){const create=()=>{
   this.sql.exec('INSERT INTO tavern_members(id,name,balance,joined_at) VALUES(?,?,?,?)',id,cleanText(name,32)||'来客',WELCOME_COINS,now);
   this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`welcome:${id}`,id,WELCOME_COINS,'welcome','首次入店欢迎金',now);
  };if(insideTransaction)create();else this.storage.transactionSync(create);p=this.one('SELECT * FROM tavern_members WHERE id=?',id);}
  else if(name&&cleanText(name,32)!==p.name){this.sql.exec('UPDATE tavern_members SET name=? WHERE id=?',cleanText(name,32),id);p.name=cleanText(name,32);}
  return p;
 }
 view(id,name,now=Date.now()){
  const member=this.member(id,name,now),daily=this.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?',id,dayKey(now));
  const dailyGiftClaimed=!!this.one('SELECT id FROM tavern_ledger WHERE id=?',`dailyGift:${id}:${dayKey(now)}`);
  this.operations.visit(id,member.name,now);
  return {member,menu:this.operations.menu(now),lockedMenu:this.operations.lockedMenu(),dailyGiftClaimed,dailyGiftAvailable:dailyGiftClaimed?0:Math.max(0,Math.min(DAILY_GIFT_COINS,DAILY_REWARD_CAP-(daily?.earned||0))),earned:daily?.earned||0,cap:DAILY_REWARD_CAP,orders:this.rows('SELECT * FROM tavern_orders WHERE user_id=? OR json_extract(details,\'$.recipientId\')=? ORDER BY at DESC LIMIT 5',id,id).map(o=>({...o,details:JSON.parse(o.details)})),ledger:this.rows('SELECT amount,kind,note,at FROM tavern_ledger WHERE user_id=? ORDER BY at DESC LIMIT 6',id),frequent:this.one('SELECT item,COUNT(*) AS count FROM tavern_orders WHERE user_id=? AND price>0 AND json_extract(details,\'$.recipientId\') IS NULL GROUP BY item ORDER BY count DESC,MAX(at) DESC LIMIT 1',id),count:this.one('SELECT COUNT(*) AS n FROM tavern_orders WHERE user_id=? OR json_extract(details,\'$.recipientId\')=?',id,id)?.n||0};
 }
 claimDaily(id,name,now=Date.now()){
  if(!validId(id))throw Error('请打开自己的酒馆钱包。');
  const day=dayKey(now),key=`dailyGift:${id}:${day}`;let dailyGift;
  this.storage.transactionSync(()=>{
   const prior=this.one('SELECT amount FROM tavern_ledger WHERE id=?',key);
   if(prior){dailyGift={amount:prior.amount,repeated:true};return;}
   this.member(id,name,now,true);
   const earned=this.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?',id,day)?.earned||0;
   const amount=Math.max(0,Math.min(DAILY_GIFT_COINS,DAILY_REWARD_CAP-earned));
   dailyGift={amount,repeated:false};if(!amount)return;
   this.sql.exec('UPDATE tavern_members SET balance=balance+? WHERE id=?',amount,id);
   this.sql.exec('INSERT INTO tavern_daily VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET earned=earned+excluded.earned',id,day,amount);
   this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',key,id,amount,'daily_gift','每日到店礼',now);
  });
  return {...this.view(id,name,now),dailyGift};
 }
 profile(id,name,key,value){
  this.member(id,name);
  const choices={sweetness:SWEETNESS,temperature:TEMPERATURE,seat:SEATS};
  if(key==='reset'){this.sql.exec("UPDATE tavern_members SET sweetness='normal',temperature='warm',seat='any',restrictions='' WHERE id=?",id);}
  else if(key==='restrictions'){if(typeof value!=='string'||value.length>100)throw Error('忌口备注最多100字。');this.sql.exec('UPDATE tavern_members SET restrictions=? WHERE id=?',cleanText(value),id);}
  else {if(!Object.hasOwn(choices,key)||!Object.hasOwn(choices[key],value))throw Error('请选择常客卡里的选项。');this.sql.exec(`UPDATE tavern_members SET ${key}=? WHERE id=?`,value,id);}
  return this.view(id);
 }
 prepare(p,now=Date.now()){
  if(!validId(p.channel)||typeof p.requestKey!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(p.requestKey))throw Error('点单窗口无效，请重新打开菜单。');
  const item=this.operations.item(p.item,now);if(!item){const locked=this.operations.lockedMenu().find(x=>x.id===p.item);throw Error(locked?`${locked.name}尚未解锁；${locked.lockReason}。`:'这款商品不在当前菜单。');}
  const member=this.member(p.id,p.name,now);
  const quantity=p.quantity??1;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10)throw Error('每单可点同一种商品1至10份。');
  if(p.recipient&&(!validId(p.recipient.id)||p.recipient.bot))throw Error('请选择本服务器的一位真实成员。');
  let draft=this.one('SELECT * FROM tavern_drafts WHERE request_key=?',p.requestKey);
  if(draft){if(draft.user_id!==p.id||draft.channel!==p.channel)throw Error('点单窗口不属于你。');return {...draft,details:JSON.parse(draft.details),balance:member.balance};}
  if((this.one("SELECT COUNT(*) AS n FROM tavern_drafts WHERE user_id=? AND status='pending' AND expires>?",p.id,now)?.n||0)>=8)throw Error('还有几份点单预览没确认，先选一份吧。');
  const details={...makeOrderDetails(item,member,p.options),quantity,unitPrice:item.price,emoji:item.emoji,serve:item.serve,...(p.recipient&&p.recipient.id!==p.id?{recipientId:p.recipient.id,recipientName:cleanText(p.recipient.name,32)||'来客',payerName:member.name}:{}),...(item.source==='ugc'?{source:'ugc',dishId:item.id,recipeRevision:item.recipeRevision,assetKey:item.assetKey,author:item.author||item.author_name,description:item.description,appearance:item.appearance,method:item.method}: {})};
  draft={id:crypto.randomUUID().replaceAll('-','').slice(0,24),request_key:p.requestKey,user_id:p.id,channel:p.channel,item:item.id,price:item.price*quantity,details,expires:now+ORDER_TTL,status:'pending'};
  this.sql.exec('INSERT INTO tavern_drafts(id,request_key,user_id,channel,item,price,details,expires) VALUES(?,?,?,?,?,?,?,?)',draft.id,p.requestKey,p.id,p.channel,item.id,draft.price,JSON.stringify(details),draft.expires);
  return {...draft,balance:member.balance};
 }
 setRecipient(p,now=Date.now()){
  let result;
  this.storage.transactionSync(()=>{
   const d=this.one('SELECT * FROM tavern_drafts WHERE id=?',p.draftId);
   if(!d||d.user_id!==p.id||d.channel!==p.channel)throw Error('这不是你的点单窗口。');
   if(d.status!=='pending'||d.expires<=now)throw Error('这份点单已完成或过期。');
   if(!p.recipient||!validId(p.recipient.id)||p.recipient.bot)throw Error('请选择本服务器的一位真实成员。');
   const details=JSON.parse(d.details);delete details.recipientId;delete details.recipientName;delete details.payerName;
   if(p.recipient.id!==p.id)Object.assign(details,{recipientId:p.recipient.id,recipientName:cleanText(p.recipient.name,32)||'来客',payerName:this.member(p.id,'',now,true).name});
   this.sql.exec('UPDATE tavern_drafts SET details=? WHERE id=?',JSON.stringify(details),d.id);
   result={...d,details,balance:this.member(p.id,'',now,true).balance};
  });return result;
 }
 confirm(id,draftId,channel,now=Date.now(),expectedRecipientId){
  // Schema creation and one-time legacy order backfill must happen outside this
  // order transaction; new consumption is added atomically with the order.
  const renovation=this.renovation,operations=this.operations;
  let answer;
  this.storage.transactionSync(()=>{
   const d=this.one('SELECT * FROM tavern_drafts WHERE id=?',draftId);
   if(!d||d.user_id!==id||d.channel!==channel)throw Error('这不是你的点单窗口，请重新打开菜单。');
   const prior=this.one('SELECT * FROM tavern_orders WHERE id=?',draftId);
   if(prior){answer={order:{...prior,details:JSON.parse(prior.details)},balance:this.member(id,'',now,true).balance,repeated:true};return;}
   if(d.status!=='pending'||d.expires<=now)throw Error('点单确认已过期，请重新选一杯。');
   const details=JSON.parse(d.details),quantity=details.quantity??1;
   if(expectedRecipientId!==undefined&&(details.recipientId||id)!==expectedRecipientId)throw Error('收礼人刚刚发生变化，请重新核对点单卡后确认。');
   const item=operations.item(d.item,now);if(!item||!Number.isSafeInteger(quantity)||quantity<1||quantity>10||d.price!==item.price*quantity)throw Error('菜单已更新，请重新点单。');
   const member=this.member(id,'',now,true);
   if(member.balance<d.price)throw Error(`酒馆币不足，还差${d.price-member.balance}币。可以先点免费茶水。`);
   if(this.one('SELECT id FROM tavern_orders WHERE user_id=? AND at>? LIMIT 1',id,now-10000))throw Error('上一份刚刚上桌，10秒后再点下一份。');
   if(d.price===0&&this.one('SELECT id FROM tavern_orders WHERE user_id=? AND price=0 AND at>? LIMIT 1',id,now-60000))throw Error('免费茶水每分钟可点一次，先慢慢喝。');
   this.sql.exec('UPDATE tavern_members SET balance=balance-? WHERE id=?',d.price,id);
   this.sql.exec('INSERT INTO tavern_orders(id,user_id,channel,item,price,details,at) VALUES(?,?,?,?,?,?,?)',d.id,id,channel,d.item,d.price,d.details,now);
   renovation.recordConsumption({id:d.id,user_id:id,details:d.details,price:d.price,at:now},true);
   operations.recordOrder({id:d.id,user_id:id,name:member.name,price:d.price,at:now},true);
   this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`order:${d.id}`,id,-d.price,details.recipientId?'gift_order':'order',details.recipientId?`${details.itemName} ×${quantity} · 赠给${details.recipientName}`:details.itemName,now);
   this.sql.exec("UPDATE tavern_drafts SET status='confirmed' WHERE id=?",d.id);
   answer={order:{id:d.id,user_id:id,channel,item:d.item,price:d.price,details:JSON.parse(d.details),at:now},balance:member.balance-d.price,repeated:false};
  });return answer;
 }
 reward(guild,r,now=Date.now()){
  const rule=REWARDS[r?.game];
  if(!rule||r.guild!==guild||!validId(r.channel)||!/^[-a-zA-Z0-9]+:\d+$/.test(r.id||'')||!Number.isSafeInteger(r.at)||!Number.isSafeInteger(r.startedAt)||r.at<r.startedAt||r.at>now+60000||now-r.at>86400000||!Array.isArray(r.players)||r.players.length<2||r.players.length>10||r.players.some(p=>!validId(p.id)||p.bot)||new Set(r.players.map(p=>p.id)).size!==r.players.length||r.game!=='poker'&&!r.players.some(p=>p.won&&!p.surrendered))return {counted:false,reason:'invalid_result'};
  const operations=this.operations,key=`${r.game}:${r.id}`;let outcome;
  this.storage.transactionSync(()=>{
   const prior=this.one('SELECT outcome FROM tavern_results WHERE id=?',key);if(prior){outcome={...JSON.parse(prior.outcome),repeated:true};return;}
   outcome={counted:false,rewards:[],reason:'completed'};
   const actors=r.players.filter(p=>Number.isSafeInteger(p.actions)&&p.actions>0&&!p.surrendered);
   if(r.at-r.startedAt<rule.minMs||actors.length<2){outcome.reason='too_short_or_inactive';}
   else {
    const day=dayKey(r.at),roster=r.players.map(p=>p.id).sort().join(','),count=this.one('SELECT played FROM tavern_rosters WHERE roster=? AND day=?',roster,day)?.played||0;
    if(count>=ROSTER_DAILY_LIMIT)outcome.reason='roster_limit';
    else {
     this.sql.exec('INSERT INTO tavern_rosters VALUES(?,?,1) ON CONFLICT(roster,day) DO UPDATE SET played=played+1',roster,day);
     for(const p of actors){
      this.member(p.id,p.name,now,true);
      const earned=this.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?',p.id,day)?.earned||0;
      const amount=Math.max(0,Math.min(Math.floor((rule.base+(p.won?rule.bonus:0))*rosterRewardRate(count)),DAILY_REWARD_CAP-earned));if(!amount)continue;
      this.sql.exec('UPDATE tavern_members SET balance=balance+? WHERE id=?',amount,p.id);
      this.sql.exec('INSERT INTO tavern_daily VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET earned=earned+excluded.earned',p.id,day,amount);
      this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`reward:${key}:${p.id}`,p.id,amount,'game',`${rule.name}${p.won?'胜利':'完成'}奖励`,r.at);
      outcome.rewards.push({id:p.id,amount});
     }
     outcome.counted=outcome.rewards.length>0;if(!outcome.counted)outcome.reason='daily_cap';
     operations.recordGame(key,r,actors,true);
    }
   }
   this.sql.exec('INSERT INTO tavern_results VALUES(?,?,?)',key,r.at,JSON.stringify(outcome));
  });return outcome;
 }
 context(id,channel,now=Date.now()){
  const p=this.one('SELECT * FROM tavern_members WHERE id=?',id);if(!p)return null;
  const latest=this.one('SELECT item,details,at FROM tavern_orders WHERE (user_id=? AND json_extract(details,\'$.recipientId\') IS NULL OR json_extract(details,\'$.recipientId\')=?) AND channel=? AND at>? ORDER BY at DESC LIMIT 1',id,id,channel,now-7200000);
  const frequent=this.one('SELECT item,COUNT(*) AS count FROM tavern_orders WHERE user_id=? AND price>0 AND json_extract(details,\'$.recipientId\') IS NULL GROUP BY item ORDER BY count DESC LIMIT 1',id);
  const frequentName=frequent?(menuItem(frequent.item)?.name||JSON.parse(this.one('SELECT details FROM tavern_orders WHERE user_id=? AND item=? ORDER BY at DESC LIMIT 1',id,frequent.item)?.details||'{}').itemName):null;
  return {source:'program_confirmed_tavern',owner:'currentSpeaker',balance:p.balance,preferences:{sweetness:SWEETNESS[p.sweetness],temperature:TEMPERATURE[p.temperature],seat:SEATS[p.seat],restrictions:p.restrictions||'未设置'},frequent:frequent?{item:frequentName,count:frequent.count}:null,currentOrder:latest?{...JSON.parse(latest.details),orderedAt:latest.at}:null};
 }
 async dispatch(p){
  if(!validId(p.guild))throw Error('无效服务器。');
  const bound=await this.storage.get('tavernGuild');if(bound&&bound!==p.guild)throw Error('服务器不匹配。');if(!bound)await this.storage.put('tavernGuild',p.guild);
  if(p.action?.startsWith('ugc'))return this.ugc.dispatch(p);
  if(p.action?.startsWith('map'))return this.map.dispatch(p);
  if(p.action?.startsWith('pet'))return this.pets.dispatch(p);
  if(p.action==='context'&&p.recordVisit===true&&validId(p.id)&&validId(p.channel)){try{this.map.touch({id:p.id,name:p.name,channel:p.channel,kind:'visit'});}catch{}}
  if(validId(p.id)&&validId(p.channel)&&!['context','confirm'].includes(p.action)){try{this.map.touch({id:p.id,name:p.name,channel:p.channel,kind:'visit'});}catch{}}
  if(p.action==='reward')return this.reward(p.guild,p.result);
  if(p.action?.startsWith('ops'))return this.operations.dispatch(p);
  if(p.action?.startsWith('reno'))return this.renovation.dispatch(p);
  if(!validId(p.id))throw Error('无效来客。');
  if(p.action==='context')return this.context(p.id,p.channel);
  if(p.action==='draft'){const d=this.one('SELECT * FROM tavern_drafts WHERE id=?',p.draftId);if(!d||d.user_id!==p.id||d.channel!==p.channel)throw Error('这不是你的点单窗口。');return {...d,details:JSON.parse(d.details),balance:this.member(p.id,p.name).balance};}
  if(p.action==='prepare'){const draft=this.prepare(p);try{this.map.move({id:p.id,area:'bar'});}catch{}return draft;}
  if(p.action==='giftRecipient')return this.setRecipient(p);
  if(p.action==='confirm'){const answer=this.confirm(p.id,p.draftId,p.channel,Date.now(),p.expectedRecipientId);if(!answer.repeated){try{this.map.touch({id:p.id,name:p.name,channel:p.channel,kind:'order'});this.map.move({id:p.id,area:'bar'});}catch{}}return answer;}
  if(p.action==='claimDaily')return this.claimDaily(p.id,p.name);
  if(p.action==='profile'){
   const data=this.profile(p.id,p.name,p.key,p.value);
   if(p.key==='seat'&&validId(p.channel)){const area={counter:'bar',window:'window',sofa:'commons',quiet:'quiet',any:'commons'}[p.value];if(area)try{this.map.move({id:p.id,area});}catch{}}
   return data;
  }
  return this.view(p.id,p.name);
 }
}
export const tavernStub=(env,guild)=>env.TABLES.get(env.TABLES.idFromName(`tavern:${guild}`));
export async function tavernRequest(env,p){const r=await tavernStub(env,p.guild).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'tavern',...p})});if(!r.ok)throw Error('酒馆暂时繁忙，请稍后重试。');const data=await r.json();if(data?.error)throw Error(data.error);return data;}


