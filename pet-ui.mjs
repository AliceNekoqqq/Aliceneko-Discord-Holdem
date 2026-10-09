import { tavernRequest } from './tavern-service.mjs';
import { petHomeRequest } from './pet-registry.mjs';
import { PETS, HABITS, ITEMS, STAGES } from './pet-catalog.mjs';

const mentions = { parse: [] };
const row = (...components) => ({ type: 1, components });
const valid = (s) => /^\d{1,20}$/.test(String(s || ''));
const key = (g, u, a) => `p:${g}:${u}:${a}`;
const button = (g,u,a,label,style=2,disabled=false) => ({type:2,custom_id:key(g,u,a),label:String(label).slice(0,80),style,disabled});
const species = (id) => PETS.find((p) => p.id === id);
const item = (id) => ITEMS.find((p) => p.id === id);
const clean = (s,max=32) => [...String(s||'').replace(/<@!?\d+>/g,'＠').replace(/@/g,'＠').replace(/[<>`*_~|]/g,'').trim()].slice(0,max).join('');
const materialNames={paper:'纸片',thread:'细绳',flower:'小花',metal:'金属片',cloth:'布料',wood:'木片'};
const MATERIALS=Object.keys(materialNames);
const bounded=(s,max=1900)=>[...String(s||'')].slice(0,max).join('');
const nextSlot=pet=>pet.growth<50?50:pet.growth<175?175:null;

export const petCommandOption = {type:1,name:'伙伴',description:'领养并照顾一位小伙伴'};

function readContext(i) {
 const id=i.member?.user?.id,guild=i.guild_id,channel=i.channel_id;
 if(!valid(id)||!valid(guild)||!valid(channel)) throw Error('请在服务器文字频道内使用伙伴面板。');
 if(i.type===2)return {id,guild,channel,action:'view',command:true};
 const parts=String(i.data?.custom_id||'').split(':');
 if(parts[0]==='t'&&parts.length===4&&parts[1]===guild&&parts[2]==='any'&&parts[3]==='lobbyPet')return {id,guild,channel,action:'view',public:true};
 if(parts[0]!=='p'||parts.length!==4||parts[1]!==guild)throw Error('伙伴面板已失效，请重新打开。');
 if(parts[2]!==id)throw Error('这是另一位来客的伙伴面板。');
 const action=parts[3];
 if(i.type===5&&!(Number(i.message?.flags)&64))throw Error('命名窗口来源不是自己的私密面板，请重新打开伙伴面板。');
 if(i.type===3&&!(Number(i.message?.flags)&64)) {
   if(action!=='open')throw Error('请先打开自己的私密伙伴面板。');
 }
 return {id,guild,channel,action};
}

export function petInteraction(i){
 if(i?.type===2&&i.data?.name==='酒馆'&&i.data.options?.[0]?.name==='伙伴')return true;
 const c=String(i?.data?.custom_id||'');
 return [3,5].includes(i?.type)&&(c.startsWith('p:')||c.startsWith('t:')&&c.split(':')[3]==='lobbyPet');
}

export function immediatePetReply(i){
 if(!petInteraction(i))return null;
 try {
  const p=readContext(i);
  if(i.type===3&&(p.action.startsWith('name~')||p.action==='rename')){
   const petId=p.action.startsWith('name~')?p.action.slice(5):'rename';if(petId!=='rename'&&!species(petId))throw Error('这只伙伴不可领养。');
   return {type:9,data:{custom_id:key(p.guild,p.id,`save~${petId}`),title:petId==='rename'?'给伙伴改名':'给伙伴取个名字',components:[row({type:4,custom_id:'petName',label:'名字 · 1到24字',style:1,min_length:1,max_length:24,required:true,placeholder:'例如：团团'})]}};
  }
  if(i.type===5){const parts=String(i.data.custom_id).split(':');if(parts.length===4&&parts[0]==='p'&&parts[1]===i.guild_id&&parts[2]===p.id&&parts[3].startsWith('save~')&&Number(i.message?.flags)&64)return null;}
  return null;
 }catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
}

export function petDeferredReply(i){
 if(!petInteraction(i))return null;
 if(i.type===2)return {type:5,data:{flags:64}};
 const c=String(i.data?.custom_id||'');
 if(c.startsWith('t:')||c.startsWith('p:')&&c.split(':')[3]==='open')return {type:5,data:{flags:64}};
 if(i.type===5)return {type:5,data:{flags:64}};
 return {type:6};
}

function panel(view,g,u,notice=''){
 const pet=view.pet;
 if(!pet){
  return {content:`🐾 **领养一位小伙伴**${notice?`\n${notice}`:''}\n选择物种预览，再给TA取一个名字。领养免费，每位来客限一只。`,components:PETS.map(p=>row(button(g,u,`preview~${p.id}`,`${p.emoji} ${p.name}`))),allowed_mentions:mentions};
 }
 const s=species(pet.species),walk=view.walk,walkView=view.walkView;
 const routeText=walkView?.choices?.length?`\n${walkView.choices.map(c=>`· ${c.label}（${c.cost}脚力${c.preferred?' · 顺心':''}）：${c.effect}${c.disabled?`（${c.reason||'暂不可选'}）`:''}`).join('\n')}`:'';
 const goals=walkView?.goalProgress||[];
 const goalText=goals.length?`\n旅途目标：${goals.map(x=>`${x.complete?'✅':'▫️'}${x.name}`).join(' · ')}`:'';
 const slot=nextSlot(pet),growthText=slot?`下一习惯位 ${pet.growth||0}/${slot}成长点`:'习惯位已全部解锁';
 const used=view.reward?.used||0,remaining=Math.max(0,2-used),total=view.reward?.totalEarned??view.reward?.earned??0,totalCap=view.reward?.totalCap??view.reward?.cap??20;
 const receipt=view.receipt;
 const receiptMaterial=receipt?.material?materialNames[receipt.material]||receipt.material:Object.entries(view.materials||{}).filter(([,n])=>n>0).map(([id,n])=>`${materialNames[id]||id}×${n}`).join('、');
 const receiptText=receipt?`\n📜 本趟结算：${receipt.coins||0}金币 · ${receipt.growth||0}成长点 · 材料 ${receipt.materials||0}份${receiptMaterial?`（${receipt.material?`${receiptMaterial}+${receipt.materials||0}`:`现有${receiptMaterial}`}）`:''}${receipt.rewarded===false?' · 练习局':''}`:'';
 const content=bounded(`${s?.emoji||'🐾'} **${clean(pet.name)}的伙伴小窝**${notice||view.notice?`\n${clean(notice||view.notice,180)}`:''}${receiptText}\n${s?.name||'小伙伴'} · 成长 ${pet.growth||0} · ${growthText} · 🪙 ${view.balance??'—'}\n${walk?`\n🗺️ 同行：${walkView?.location||'进行中'} · 心意「${walkView?.intentName||walkView?.intent||'探索'}」 · 第${(walk.version||0)+1}步 · 脚力 ${walk.energy} · 纪念物 ${walk.bag?.length||0}/${walk.bagCapacity}${goalText}${routeText}`:'\n今天还没有出门同行。'}\n今日可领奖同行 ${remaining}/2 次 · 伙伴收入 ${view.reward?.earned||0}/${view.reward?.cap??20}币 · 全游戏收入 ${total}/${totalCap}币\n陪伴免费；无奖励次数时仍可开始练习同行。`);
 const components=[];
 if(!walk||walk.phase!=='playing'){
   components.push(row({type:3,custom_id:key(g,u,'startMaterial'),placeholder:'选本局基础材料，再开始同行',min_values:1,max_values:1,options:MATERIALS.map(id=>({label:`${materialNames[id]} · 持有${view.materials?.[id]||0}`,value:id,description:'奖励资格有效时，每局基础获得1份'}))}));
   components.push(row(button(g,u,'care','🫶 免费陪伴'),button(g,u,'home','🛏️ 小窝商店')));
 }
 else {
   const choices=walkView?.choices||[];
   for(let n=0;n<choices.length;n+=5)components.push(row(...choices.slice(n,n+5).map(c=>button(g,u,`act~${walk.id}~${walk.version}~${c.id}`,`${c.label} · ${c.cost}`,1,c.disabled))));
   components.push(row(button(g,u,`redirect~${walk.id}~${walk.version}`,'调整心意'),button(g,u,'home','小窝与商店')));
 }
 components.push(row(button(g,u,'habits','🌱 习惯'),button(g,u,'journal','📖 经历册'),button(g,u,'rename','✏️ 改名')));
 return {content,components:components.slice(0,5),allowed_mentions:mentions};
}

function homeData(view,g,u){
 const own=new Set(view.items||[]), lines=ITEMS.map(x=>`${own.has(x.id)?'✅':'▫️'} **${x.name}** · ${x.price}币${Object.keys(x.materials||{}).length?` + ${Object.entries(x.materials).map(([a,n])=>`${materialNames[a]||a}×${n}`).join(' ')}`:''}\n${x.description}`);
 const buttons=ITEMS.map(x=>own.has(x.id)?button(g,u,`equip~${x.id}`,`摆放 · ${x.name}`):button(g,u,`buyPreview~${x.id}`,`预览 · ${x.name}`));
 return {content:bounded(`🛏️ **小窝与商店**\n余额 ${view.balance??'—'}币 · 材料：${Object.entries(view.materials||{}).map(([a,n])=>`${materialNames[a]||a}×${n}`).join('、')||'暂无'}\n🛏️ 基础睡垫：免费提供，可随时摆放。\n${lines.join('\n')}`),components:[...buttons.map(b=>row(b)),row(button(g,u,'equip~bed','摆放基础睡垫'),button(g,u,'view','返回伙伴'))],allowed_mentions:mentions};
}

export async function answerPet(env,i){
 const p=readContext(i),name=clean(i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客',64);
 const modal=i.type===5;
 let action=p.action, petName, speciesId;
 if(modal){const parts=String(i.data.custom_id||'').split(':');if(parts.length!==4||parts[0]!=='p'||parts[1]!==p.guild||parts[2]!==p.id||!parts[3].startsWith('save~'))throw Error('命名窗口已失效。');speciesId=parts[3].slice(5);petName=i.data.components?.flatMap(r=>r.components||[]).find(c=>c.custom_id==='petName')?.value?.trim();if(!petName||[...petName].length>24)throw Error('名字需要是1到24个字符。');action=speciesId==='rename'?'petName':'adopt';if(action==='adopt'&&!species(speciesId))throw Error('物种信息已失效。');}
 if(action.startsWith('preview~')){const id=action.slice(8),s=species(id);if(!s)throw Error('物种信息已失效。');return {content:`${s.emoji} **${s.name}**\n${s.description}\n\n领养免费，每人一只。确认后为TA取名。`,components:[row(button(p.guild,p.id,`name~${id}`,'确认领养并取名',1)),row(button(p.guild,p.id,'view','返回物种选择'))],allowed_mentions:mentions};}
 if(action.startsWith('buyPreview~')){const id=action.slice(11),x=item(id);if(!x)throw Error('商品信息已失效。');const materials=Object.entries(x.materials||{}).map(([k,v])=>`${materialNames[k]||k}×${v}`).join('、')||'无需材料';return {content:bounded(`🛍️ **购买预览 · ${x.name}**\n${x.description}\n价格：${x.price}币 · 材料：${materials}\n这是预览，尚未扣款。`),components:[row(button(p.guild,p.id,`buy~${id}~${x.price}~v1`,'确认购买',1)),row(button(p.guild,p.id,'home','返回商店'))],allowed_mentions:mentions};}
 if(action.startsWith('redirect~')){const [,walkId,version]=action.split('~');return {content:'💭 **调整伙伴心意**\n改主意会消耗一次机会；选择顺心的路线能获得额外情境效果。',components:[row(button(p.guild,p.id,`redirectIntent~${walkId}~${version}~sniff`,'闻一闻',1),button(p.guild,p.id,`redirectIntent~${walkId}~${version}~friend`,'交朋友'),button(p.guild,p.id,`redirectIntent~${walkId}~${version}~fetch`,'叼回家')),row(button(p.guild,p.id,'view','返回伙伴'))],allowed_mentions:mentions};}
 const claim=action==='adopt';
 const registry=await petHomeRequest(env,{id:p.id,guild:p.guild,claim});
 if(registry?.guild&&registry.guild!==p.guild)throw Error(`你已在服务器 ${registry.guild} 领养伙伴，请回到所属服务器继续照顾。`);
 if(action==='open'||action==='view')action='petView';
 else if(action.startsWith('name~'))action='petView';
 else if(action.startsWith('act~')){const [,walkId,version,choice]=action.split('~');action='petAct';p.walkId=walkId;p.version=Number(version);p.choice=choice;}
 else if(action.startsWith('redirectIntent~')){const [,walkId,version,intent]=action.split('~');action='petRedirect';p.walkId=walkId;p.version=Number(version);p.intent=intent;}
 else if(action.startsWith('buy~')){const [,id,price,version]=action.split('~'),expectedPrice=Number(price);const product=item(id);if(!product||!/^(0|[1-9]\d*)$/.test(price||'')||!Number.isSafeInteger(expectedPrice)||version!=='v1')throw Error('购买预览版本已失效，请重新查看商品价格。');p.item=id;p.expectedPrice=expectedPrice;p.expectedShopVersion=version;action='petBuy';}
 else if(action==='startMaterial'){p.material=i.data.values?.[0];if(!MATERIALS.includes(p.material))throw Error('请选择一种有效材料。');action='petStart';}
 else if(action==='start') {p.material='paper';action='petStart';}
 else if(action.startsWith('equip~')){p.item=action.slice(6);action='petEquip';}
 else if(action==='care')action='petCare';else if(action==='home'){
   const v=await tavernRequest(env,{guild:p.guild,id:p.id,name,channel:p.channel,requestKey:i.id,action:'petView'});return homeData(v,p.guild,p.id);
 } else if(action==='habits'){
   const v=await tavernRequest(env,{guild:p.guild,id:p.id,name,channel:p.channel,requestKey:i.id,action:'petView'});const pet=v.pet,available=(pet?.unlockedHabits||[]).map(id=>HABITS.find(h=>h.id===id)).filter(Boolean);return {content:bounded(`🌱 **伙伴习惯**\n已发现：${available.map(h=>`${h.name}：${h.description}`).join('\n')||'同行中发现'}\n当前装备：${(pet?.habits||[]).map(id=>HABITS.find(h=>h.id===id)?.name||id).join('、')||'无'}\n成长解锁装备位；选择后立即保存。`),components:[...(available.length?[row({type:3,custom_id:key(p.guild,p.id,'habit'),placeholder:'选择要装备的习惯',min_values:0,max_values:Math.min(2,available.length),options:available.map(h=>({label:h.name,value:h.id,default:(pet?.habits||[]).includes(h.id)}))})]:[]),row(button(p.guild,p.id,'view','返回伙伴'))],allowed_mentions:mentions};
 } else if(action==='journal'){
   const v=await tavernRequest(env,{guild:p.guild,id:p.id,name,channel:p.channel,requestKey:i.id,action:'petView'});const pet=v.pet,entries=[...(pet?.memories||[]).map(m=>m.text),...(pet?.experiences||[]).map(e=>e.event)].slice(-8);return {content:bounded(`📖 **经历册 · ${clean(pet?.name)}**\n${entries.map(x=>`• ${clean(x,140)}`).join('\n')||'还没有同行回忆。'}`),components:[row(button(p.guild,p.id,'view','返回伙伴'))],allowed_mentions:mentions};
 } else if(action==='habit'){p.habits=i.data.values||[];action='petHabit';}
 else if(action==='adopt')action='petAdopt';
 else if(action==='petView'||action==='petName'){} else throw Error('这个伙伴操作暂不可用。');
 const body={guild:p.guild,id:p.id,name,channel:p.channel,requestKey:i.id,action,...(claim?{species:speciesId,petName}:{}),...(action==='petName'?{petName}:{}),...(p.walkId?{walkId:p.walkId}:{}),...(p.version!==undefined?{version:p.version}:{}),...(p.choice?{choice:p.choice}:{}),...(p.intent?{intent:p.intent}:{}),...(p.item?{item:p.item}:{}),...(p.expectedPrice!==undefined?{expectedPrice:p.expectedPrice}:{}),...(p.expectedShopVersion?{expectedShopVersion:p.expectedShopVersion}:{}),...(p.habits?{habits:p.habits}:{}),...(p.material?{material:p.material}:{})};
 const view=await tavernRequest(env,body);
 if(action==='petAdopt'&&view?.pet)return panel(view,p.guild,p.id,`欢迎${view.pet.name}来到小窝！`);
 if(action==='petBuy')return panel(view,p.guild,p.id,view.notice||'购买结果已更新。');
 return panel(view,p.guild,p.id);
}

export async function finishPet(env,i){
 let data;
 try{data=await answerPet(env,i);}catch(e){
  let p;try{p=readContext(i);}catch{}
  data={content:bounded(`🐾 ${clean(e?.message||'伙伴操作暂时失败，请稍后重试。',1800)}`),allowed_mentions:mentions};
  if(p)data.components=[row(button(p.guild,p.id,'view','返回伙伴面板'))];
 }
 const url=`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`;
 const response=await fetch(url,{method:'PATCH',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({...data,allowed_mentions:mentions}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error(`伙伴面板更新失败：${response.status}`);return data;
}
