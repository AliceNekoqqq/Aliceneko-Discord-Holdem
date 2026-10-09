import {validId,dayKey,cleanText,DAILY_REWARD_CAP} from './tavern-catalog.mjs';
import {PETS,HABITS,ITEMS,petCoat,MATERIAL_NAMES,MATERIAL_GATHER_CAP,MATERIAL_BUY_CAP,MATERIAL_BUNDLE} from './pet-catalog.mjs';
import {createPet,createWalk,walkView,actWalk,redirectWalk,finishWalk,setPetHabits} from './pet-engine.mjs';

export const PET_REWARD_CAP=20;
export const PET_DAILY_RUNS=2;
const LIFE=7*86400000;
const safeName=value=>cleanText(String(value||''),24).replace(/[@<>]/g,'').trim();
const merge=(a=[],b=[])=>[...new Map([...a,...b].map(x=>[typeof x==='object'?x.id||`${x.category}:${x.event}`:x,x])).values()].slice(-80);
const MATERIALS=new Set(Object.keys(MATERIAL_NAMES));
function chooseCoat(species,value){
 const pet=PETS.find(p=>p.id===species);if(!pet)throw Error('请选择酒馆里的伙伴。');
 if(value===undefined||value==='')return pet.coats[0].id;
 if(value==='random'){
  const bytes=new Uint32Array(1),bound=Math.floor(4294967296/pet.coats.length)*pet.coats.length;
  do{crypto.getRandomValues(bytes);}while(bytes[0]>=bound);
  return pet.coats[bytes[0]%pet.coats.length].id;
 }
 if(!petCoat(species,value))throw Error('请选择这位伙伴已有的形象。');
 return value;
}


export class PetService{
 constructor(host){
  this.host=host;this.storage=host.storage;this.sql=host.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS pet_profiles(owner TEXT PRIMARY KEY,body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS pet_walks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,body TEXT NOT NULL,day TEXT NOT NULL,phase TEXT NOT NULL,started INTEGER NOT NULL,expires INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS pet_walks_owner ON pet_walks(owner,started DESC)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS pet_daily(owner TEXT NOT NULL,day TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,earned INTEGER NOT NULL DEFAULT 0,xp INTEGER NOT NULL DEFAULT 0,care INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,day))');
  const columns=new Set(this.sql.exec('PRAGMA table_info(pet_daily)').toArray().map(c=>c.name));
  this.storage.transactionSync(()=>{for(const col of ['gathered','bought'])if(!columns.has(col))this.sql.exec(`ALTER TABLE pet_daily ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);});
  this.sql.exec('CREATE TABLE IF NOT EXISTS pet_actions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,notice TEXT NOT NULL,at INTEGER NOT NULL)');
 }
 one(q,...args){return this.host.one(q,...args);}
 profile(id){
  const row=this.one('SELECT body,version FROM pet_profiles WHERE owner=?',id);if(!row)return null;
  const pet={...JSON.parse(row.body),version:row.version};
  if(!petCoat(pet.species,pet.coat)){
   pet.coat=chooseCoat(pet.species);this.save(id,pet);pet.version++;
  }
  return pet;
 }

 save(id,pet){this.sql.exec('UPDATE pet_profiles SET body=?,version=version+1 WHERE owner=?',JSON.stringify(pet),id);}
 daily(id,day){return this.one('SELECT * FROM pet_daily WHERE owner=? AND day=?',id,day)||{used:0,earned:0,xp:0,care:0,gathered:0,bought:0};}
 active(id,now){const r=this.one("SELECT * FROM pet_walks WHERE owner=? AND phase='playing' ORDER BY started DESC LIMIT 1",id);if(!r)return null;return r.expires<=now?null:JSON.parse(r.body);}
 view(id,now=Date.now(),notice='',receipt=null){
  const pet=this.profile(id),walk=this.active(id,now),daily=this.daily(id,dayKey(now));
  const member=this.one('SELECT balance FROM tavern_members WHERE id=?',id);
  const earned=this.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?',id,dayKey(now))?.earned||0;
  if(!walk&&!receipt){const last=this.one("SELECT body FROM pet_walks WHERE owner=? AND phase='done' ORDER BY started DESC LIMIT 1",id);if(last)receipt=JSON.parse(last.body).receipt||null;}
  return {materialBudget:{gathered:daily.gathered,gatherCap:MATERIAL_GATHER_CAP,bought:daily.bought,buyCap:MATERIAL_BUY_CAP},pet,walk,walkView:walk&&pet?walkView(walk,pet):null,reward:{used:daily.used,cap:PET_REWARD_CAP,earned:daily.earned,growthEarned:daily.xp,careDone:!!daily.care,totalEarned:earned,totalCap:DAILY_REWARD_CAP},balance:member?.balance??null,items:pet?.items||[],materials:pet?.materials||{},decor:pet?.decor||{},notice,receipt};
 }
 dispatch(p,now=Date.now()){
  if(!validId(p.id)||!validId(p.guild)||!validId(p.channel))throw Error('请在服务器内使用自己的伙伴面板。');
  if(p.action==='petView')return this.view(p.id,now);
  if(!/^[\w-]{1,100}$/.test(p.requestKey||''))throw Error('本次操作凭证无效，请重新打开伙伴面板。');
  const key=`${p.id}:${p.requestKey}`;let notice='',receipt=null;
  this.storage.transactionSync(()=>{
   const prior=this.one('SELECT * FROM pet_actions WHERE id=?',key);
   if(prior){if(prior.owner!==p.id||prior.kind!==p.action)throw Error('操作凭证不匹配。');notice=prior.notice+'（这次操作已处理，没有重复扣款或领奖。）';return;}
   let pet=this.profile(p.id);const today=dayKey(now);
   if(p.action==='petAdopt'){
    if(pet)throw Error('你已经有一位伙伴了，每人暂时只能领养一只。');
    if(!PETS.some(x=>x.id===p.species))throw Error('请选择酒馆里的伙伴。');
    const name=safeName(p.petName);if(!name)throw Error('给伙伴起一个1～24字的名字吧。');
    pet={...createPet(p.species,name,now),coat:chooseCoat(p.species,p.coat),items:['bed'],materials:{},decor:{sleep:'bed'}};
    this.host.member(p.id,p.name,now,true);
    this.sql.exec('INSERT INTO pet_profiles(owner,body,version) VALUES(?,?,0)',p.id,JSON.stringify(pet));
    notice=`${name}已经住进你的小窝。基础照护免费，每人暂时只领养一只。`;
   }else{
    if(!pet)throw Error('先领养一位伙伴吧。');
    if(p.action==='petStart'){
     const live=this.active(p.id,now);if(live){notice='继续上次的同行，路线和奖励机会保留。';this.sql.exec('INSERT INTO pet_actions VALUES(?,?,?,?,?)',key,p.id,p.action,notice,now);return;}
     this.sql.exec("UPDATE pet_walks SET phase='expired' WHERE owner=? AND phase='playing' AND expires<=?",p.id,now);
     const daily=this.daily(p.id,today),rewarded=daily.used<PET_DAILY_RUNS;
     const material=p.material||'paper';if(!MATERIALS.has(material))throw Error('请选择同行结算的基础材料。');
     const id=crypto.randomUUID().replaceAll('-','').slice(0,22),bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
     const walk=createWalk(pet,{id,seed:bytes[0],day:today,rewarded,now});
     walk.material=material;
     this.sql.exec('INSERT INTO pet_walks VALUES(?,?,?,?,?,?,?)',id,p.id,JSON.stringify(walk),today,walk.phase,now,now+LIFE);
     if(rewarded)this.sql.exec('INSERT INTO pet_daily(owner,day,used) VALUES(?,?,1) ON CONFLICT(owner,day) DO UPDATE SET used=used+1',p.id,today);
     notice=rewarded?'同行开始：本次有奖励资格，结算计入今日小游戏总额度。':'练习同行：没有金币、材料或成长点奖励，仍能发现路线与纪念。';
    }else if(['petAct','petRedirect'].includes(p.action)){
     const row=this.one('SELECT * FROM pet_walks WHERE id=? AND owner=?',p.walkId,p.id);
     if(!row)throw Error('这不是你的同行。');
     if(row.phase!=='playing')throw Error('这趟同行已经结束，请重新打开伙伴面板。');
     if(row.expires<=now)throw Error('这趟同行的保存期已结束，请开始新的散步。');
     const old=JSON.parse(row.body);
     if(!Number.isSafeInteger(p.version)||p.version!==old.version)throw Error('路线已经变化，请刷新后继续。');
     const walk=p.action==='petAct'?actWalk(old,pet,p.choice):redirectWalk(old,pet,p.intent);
     if(walk.phase==='done'){
      const completed=finishWalk(walk,pet),daily=this.daily(p.id,walk.day);
      let amount=0,xp=0,materials=0;
      if(walk.rewarded){
       const earned=this.one('SELECT earned FROM tavern_daily WHERE user_id=? AND day=?',p.id,walk.day)?.earned||0;
       amount=Math.max(0,Math.min(6+completed.stars*2,PET_REWARD_CAP-daily.earned,DAILY_REWARD_CAP-earned));
       xp=Math.max(0,Math.min(10,25-daily.xp));materials=completed.stars>0?2:1;
       if(amount){
        this.sql.exec('UPDATE tavern_members SET balance=balance+? WHERE id=?',amount,p.id);
        this.sql.exec('INSERT INTO tavern_daily(user_id,day,earned) VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET earned=earned+excluded.earned',p.id,walk.day,amount);
        this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`pet:${walk.id}`,p.id,amount,'pet','伙伴同行奖励',now);
       }
       this.sql.exec('UPDATE pet_daily SET earned=earned+?,xp=xp+? WHERE owner=? AND day=?',amount,xp,p.id,walk.day);
       pet.growth+=xp;const material=walk.material||'paper';pet.materials[material]=(pet.materials[material]||0)+materials;
      }
      pet.memories=merge(pet.memories,completed.memories).filter((m,index,list)=>list.findIndex(x=>x.kind===m.kind)===index);pet.experiences=merge(pet.experiences,completed.experiences);
      pet.unlockedHabits=merge(pet.unlockedHabits,completed.unlockedHabits);
      if(completed.experiences.some(e=>e.category==='craft')&&!pet.firstWindmill){if(!pet.items.includes('paper-pinwheel'))pet.items.push('paper-pinwheel');pet.firstWindmill=true;}
      receipt={stars:completed.stars,coins:amount,growth:xp,materials,material:walk.material||'paper',rewarded:walk.rewarded,day:walk.day};
      walk.receipt=receipt;this.save(p.id,pet);
      notice=`同行完成：${completed.stars}颗目标星，${amount}金币、${xp}成长点、${materials}份材料。${walk.rewarded&&amount===0?'今日小游戏金币总额度已满。':''}`;
     }else notice=p.action==='petRedirect'?'已温和改变这次意图；地点和奖励没有重抽。':'这一站已记录，继续下一站。';
     this.sql.exec('UPDATE pet_walks SET body=?,phase=? WHERE id=?',JSON.stringify(walk),walk.phase,walk.id);
    }else if(p.action==='petCare'){
     const daily=this.daily(p.id,today),xp=daily.care?0:Math.max(0,Math.min(5,25-daily.xp));
     if(!daily.care){pet.growth+=xp;pet.materials.cloth=(pet.materials.cloth||0)+1;this.sql.exec('INSERT INTO pet_daily(owner,day,xp,care) VALUES(?,?,?,1) ON CONFLICT(owner,day) DO UPDATE SET xp=xp+excluded.xp,care=1',p.id,today,xp);this.save(p.id,pet);}
     notice=xp?'你们一起整理小窝，获得5成长点和1份布料。':'伙伴靠在你身边；今天的陪伴成长已经记录，可以继续免费陪伴。';
    }else if(p.action==='petCoat'){
     pet.coat=chooseCoat(pet.species,p.coat);this.save(p.id,pet);notice=`已换成${petCoat(pet.species,pet.coat).name}；之后会一直保持，直到你再次更改。`;
    }else if(p.action==='petGather'){
     if(!MATERIALS.has(p.material))throw Error('请选择有效的基础材料。');
     const daily=this.daily(p.id,today);if(daily.gathered>=MATERIAL_GATHER_CAP)throw Error('今天的3次采集已完成，明天再来或去材料铺看看。');
     pet.materials[p.material]=(pet.materials[p.material]||0)+1;
     this.sql.exec('INSERT INTO pet_daily(owner,day,gathered) VALUES(?,?,1) ON CONFLICT(owner,day) DO UPDATE SET gathered=gathered+1',p.id,today);
     this.save(p.id,pet);notice=`免费采集到1份${MATERIAL_NAMES[p.material]}；今天还可采集${MATERIAL_GATHER_CAP-daily.gathered-1}次。`;
    }else if(p.action==='petMaterialBuy'){
     if(!MATERIALS.has(p.material))throw Error('请选择有效的基础材料。');
     const offer=MATERIAL_BUNDLE;
     if(p.expectedPrice!==offer.price||p.expectedQuantity!==offer.quantity||p.expectedShopVersion!==offer.version)throw Error('材料预览已变化，请重新打开材料铺确认。');
     const daily=this.daily(p.id,today);if(daily.bought+offer.quantity>MATERIAL_BUY_CAP)throw Error('今天购入材料已达6份上限，明天再来。');
     const member=this.host.member(p.id,p.name,now,true);if(member.balance<offer.price)throw Error(`还差${offer.price-member.balance}酒馆币；也可以先免费采集。`);
     pet.materials[p.material]=(pet.materials[p.material]||0)+offer.quantity;
     this.sql.exec('UPDATE tavern_members SET balance=balance-? WHERE id=?',offer.price,p.id);
     this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`pet-material:${key}`,p.id,-offer.price,'pet_material',`${MATERIAL_NAMES[p.material]}×${offer.quantity}`,now);
     this.sql.exec('INSERT INTO pet_daily(owner,day,bought) VALUES(?,?,?) ON CONFLICT(owner,day) DO UPDATE SET bought=bought+excluded.bought',p.id,today,offer.quantity);
     this.save(p.id,pet);notice=`${offer.price}酒馆币购入${offer.quantity}份${MATERIAL_NAMES[p.material]}；今日还可购入${MATERIAL_BUY_CAP-daily.bought-offer.quantity}份。`;
    }else if(p.action==='petName'){
     const name=safeName(p.petName);if(!name)throw Error('名字需要1～24字。');pet.name=name;this.save(p.id,pet);notice='伙伴的新名字已保存。';
    }else if(p.action==='petHabit'){
     if(this.active(p.id,now))throw Error('同行结束后再调整习惯，本局配置已经固定。');
     const selected=p.habit==='none'?[]:Array.isArray(p.habits)?p.habits:Array.isArray(p.habit)?p.habit:[p.habit];
     pet=setPetHabits(pet,selected);this.save(p.id,pet);notice='习惯已免费调整。';
    }else if(p.action==='petBuy'){
     const item=ITEMS.find(x=>x.id===p.item);if(!item)throw Error('这个小窝物品不存在。');
     if(p.expectedPrice!==item.price||p.expectedShopVersion!=='v1')throw Error('这张购买预览已变化，请重新打开商店确认价格与材料。');
     if(pet.items.includes(item.id))throw Error('你已经拥有这件物品了，可以直接摆放。');
     const member=this.host.member(p.id,p.name,now,true);
     if(member.balance<item.price)throw Error(`还差${item.price-member.balance}金币，先一起去散步吧。`);
     for(const [material,count]of Object.entries(item.materials||{}))if((pet.materials[material]||0)<count)throw Error('制作材料还没有备齐。');
     for(const [material,count]of Object.entries(item.materials||{}))pet.materials[material]-=count;
     this.sql.exec('UPDATE tavern_members SET balance=balance-? WHERE id=?',item.price,p.id);
     this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`pet-buy:${key}`,p.id,-item.price,'pet_shop',item.name,now);
     pet.items.push(item.id);this.save(p.id,pet);notice=`${item.name}已放入小窝收藏，扣款${item.price}金币。`;
    }else if(p.action==='petEquip'){
     const item=ITEMS.find(x=>x.id===p.item)||{id:'bed',slot:'sleep',name:'基础睡垫'};
     if(!pet.items.includes(p.item)||item.id!==p.item)throw Error('只能摆放你已经拥有的物品。');
     pet.decor[item.slot||'play']=item.id;this.save(p.id,pet);notice=`${item.name}已经摆好了。`;
    }else throw Error('这个伙伴操作暂不可用。');
   }
   this.sql.exec('INSERT INTO pet_actions VALUES(?,?,?,?,?)',key,p.id,p.action,notice,now);
  });
  return this.view(p.id,now,notice,receipt);
 }
}
