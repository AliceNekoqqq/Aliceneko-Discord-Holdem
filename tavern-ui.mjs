import {MENU,WELCOME_COINS,DAILY_REWARD_CAP,ROSTER_DAILY_LIMIT,SWEETNESS,TEMPERATURE,SEATS,MOODS,REWARDS,menuItem,displayText,validId} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';
import {renderMenu,renderDishDetails,MENU_CATEGORIES} from './tavern-menu-view.mjs';
import {artEmbed} from './tavern-art.mjs';
import {renoCommandOptions, tavernRenovationInteraction, immediateRenovationReply, answerRenovation, tavernDeferredReply as renovationDeferredReply} from './tavern-renovation-ui.mjs';
import {lobbyCommandOption,tavernLobbyInteraction,tavernLobbyCommand,immediateLobbyReply,lobbyDeferredReply,answerLobby,tavernLobbyData,tavernSceneEmbed} from './tavern-lobby.mjs';
import {operationsInteraction,immediateOperationsReply,operationsDeferredReply,answerOperations} from './tavern-operations-ui.mjs';
import {petCommandOption} from './pet-ui.mjs';
const mentions={parse:[]};
const row=(...components)=>({type:1,components});
const key=(guild,id,action)=>`t:${guild}:${id}:${action}`;
const button=(guild,id,action,label,style=2)=>({type:2,custom_id:key(guild,id,action),label,style});
const choices=map=>Object.entries(map).map(([value,label])=>({name:label,value}));
export const tavernCommand={name:'酒馆',description:'红豆粉的小酒馆：点单、钱包和常客卡',type:1,integration_types:[0],contexts:[0],options:[
 {type:1,name:'菜单',description:'看看饮品与小食，打开自己的点单面板'},
 {type:1,name:'点单',description:'选餐饮，确认后才扣酒馆币',options:[{type:3,name:'商品',description:'想点哪一份？',required:true,choices:MENU.filter(p=>!p.requiresEquipment).map(p=>({name:`${p.name} · ${p.price}币`,value:p.id}))},{type:3,name:'甜度',description:'本单甜度；不选则沿用常客卡',choices:choices(SWEETNESS)},{type:3,name:'温度',description:'饮品温度；固定温度餐饮按菜品供应',choices:choices(TEMPERATURE)},{type:3,name:'心情',description:'心情特调的名字',choices:choices(MOODS)}]},
 {type:1,name:'钱包',description:'查看余额、今日游戏收入和最近流水'},
 {type:1,name:'常客卡',description:'设置口味、忌口和常坐的位置'},
 {type:1,name:'帮助',description:'查看赚币规则和点单说明'}
]};
tavernCommand.options.push(...renoCommandOptions);
tavernCommand.options.unshift(lobbyCommandOption);
tavernCommand.options.push(petCommandOption);
export const TAVERN_HELP=`🍵 **红豆粉的小酒馆**\n先用大厅按钮：吧台点单、钱包、常客卡、店内、共同装修、捐赠档案、贡献榜、小游戏、今日经营、季节菜单、共同活动和刷新。自然语言也可说“打开酒馆”或“走进酒馆”。\n快捷入口：\`/酒馆 大厅\`、\`/酒馆 菜单\`、\`/酒馆 点单\`、\`/酒馆 钱包\`、\`/酒馆 常客卡\`；装修也可用\`/酒馆 店内\`、\`/酒馆 装修\`、\`/酒馆 贡献榜\`、\`/酒馆 捐赠档案\`。\n每服务器独立共用一家店，跨频道共用装修。确认餐饮消费和主动出资按1币=1建设值，消费不再扣一次；装修先预览，3分钟内本人在原频道确认才扣款，余额流水仅本人可见。设备页购置咖啡机、烤箱、搅拌机与冰淇淋机，永久解锁本服务器公共菜单；新品从菜单分类里点单。\n新客欢迎金 **${WELCOME_COINS}币**，每服务器一次。${Object.values(REWARDS).map(r=>`${r.name} +${r.base}，胜者另 +${r.bonus}`).join('；')}。钱包内可手动领取每日到店礼20币，每天一次，北京时间零点刷新；与游戏奖励共用每日${DAILY_REWARD_CAP}币上限。至少两位真人实际行动才算合格；抽鬼牌/德州/UNO/骗子酒馆需分别达到15/30/45/60秒。同组每日前${ROSTER_DAILY_LIMIT}局跨游戏累计，奖励依次为全额、半额、四分之一（向下取整），之后为零。挂机、陪练局、取消局不发币，也没有按聊天条数发币。UNO按小局结算；德州筹码不兑换酒馆币。饮品无酒精；自然语言点单仍需按钮确认。`;
const navigation=(g,id)=>row(button(g,id,'lobby','🏡 大厅'),button(g,id,'menu','🍵 菜单'),button(g,id,'wallet','🪙 钱包'),button(g,id,'card','🦋 常客卡'),button(g,id,'reno','🔧 装修'));
export function menuData(data,id,guild,publicView=false,category='all'){
 const view=renderMenu(data,id,guild,publicView,category);
 if(category==='all'){view.embeds=artEmbed('room');view.content+='\n🖼️ 窗边的一盏灯 · 酒馆氛围插画';}
 return view;
}

export function walletData(data,id,guild,notice=''){
 const remaining=Math.max(0,data.cap-data.earned),gift=data.dailyGiftAvailable||0;
 const claim=button(guild,id,'claimDaily',data.dailyGiftClaimed?'今日到店礼已领取':gift?'领取今日到店礼':'今日收入已达上限',gift&&!data.dailyGiftClaimed?1:2);
 if(!gift||data.dailyGiftClaimed)claim.disabled=true;
 return {content:`🪙 **我的酒馆钱包**${notice?`\n${notice}`:''}\n余额：**${data.member.balance}币**\n今日总收入：${data.earned} / ${data.cap}币（北京时间）· 还可赚 ${remaining}币\n到店礼：${data.dailyGiftClaimed?'今日已领取':gift?`可手动领取 ${gift}币`:'今日收入上限已满'}（与游戏奖励共用每日上限）\n\n最近流水：\n${data.ledger.map(l=>`${l.amount>=0?'+':''}${l.amount} · ${displayText(l.note)}`).join('\n')||'还没有流水。'}\n\n德州筹码与酒馆币分别计算。首次欢迎金${WELCOME_COINS}币独立发放一次。`,components:[row(claim),navigation(guild,id)],allowed_mentions:mentions};
}
const select=(guild,id,field,label,map,current)=>row({type:3,custom_id:key(guild,id,`pref~${field}`),placeholder:label,options:Object.entries(map).map(([value,label])=>({label,value,default:value===current}))});
export function cardData(data,id,guild,notice=''){
 const p=data.member,latest=data.orders[0],frequent=menuItem(data.frequent?.item);
 return {content:`🦋 **我的常客卡**${notice?`\n${notice}`:''}\n已确认上桌 ${data.count} 份\n口味：${SWEETNESS[p.sweetness]} · ${TEMPERATURE[p.temperature]}\n常坐：${SEATS[p.seat]}\n忌口 / 备注：${displayText(p.restrictions)||'未设置'}\n${frequent?`常点：${frequent.name}（${data.frequent.count}次，不代表已认定为最爱）`:'还没有常点饮品。'}\n${latest?`最近一份：${displayText(latest.details.itemName)}`:'第一次来，选一杯喜欢的吧。'}\n每次选择会立即保存；座位选择也会同步大厅地图，牌局中仍优先显示桌边。聊天时只提供你自己的偏好。`,components:[select(guild,id,'sweetness','我的甜度',SWEETNESS,p.sweetness),select(guild,id,'temperature','我的温度',TEMPERATURE,p.temperature),select(guild,id,'seat','常坐位置 · 同步地图',SEATS,p.seat),row(button(guild,id,'notes','编辑忌口备注'),button(guild,id,'reset','清除口味偏好'),button(guild,id,'menu','返回菜单',1),button(guild,id,'lobby','🏡 大厅'))],allowed_mentions:mentions};
}
const orderTaste=detail=>`${detail.category==='savory'?'按菜品原味':detail.category==='desserts'?'手作甜度':SWEETNESS[detail.sweetness]} · ${TEMPERATURE[detail.temperature]}`;
export function draftData(d,id,guild,publicView=false){
 const p=menuItem(d.item),detail=d.details,expired=d.expires<=Date.now()||d.status!=='pending';
 return {content:`${p?.emoji||d.details.emoji||'🍵'} **点单预览 · ${displayText(detail.itemName)}**\n${renderDishDetails({...detail,...p,name:detail.itemName}).split('\n').slice(1).join('\n')}\n${orderTaste(detail)}${d.item==='special'?` · 心情：${MOODS[detail.mood]}`:''}\n本单 **${d.price}币**${publicView?'':` · 当前余额 ${d.balance}币\n位置：${SEATS[detail.seat]}${detail.restrictions?`\n备注：${displayText(detail.restrictions)}`:''}`}\n${expired?'这张预览已经处理或过期，请重新打开菜单。':'尚未扣款；3分钟内由本人确认。确认后会在本频道显示上桌消息。'}`,
 embeds:artEmbed(d.item),components:expired?[navigation(guild,id)]:[row(button(guild,id,`${publicView?'review':'confirm'}~${d.id}`,publicView?'打开我的确认窗口':`确认点单 · ${d.price}币`,1)),...(!publicView?[navigation(guild,id)]:[])],allowed_mentions:mentions};
}
export function receiptData(answer,id,guild,served=true){const o=answer.order,p=menuItem(o.item)||o.details;return {content:`${p?.emoji||'🍵'} **已上桌 · ${displayText(o.details.itemName)}**\n红豆粉${p?.serve||'把这一份送到你手边。'}\n${orderTaste(o.details)}\n本单 ${o.price}币 · 余额 **${answer.balance}币**${answer.repeated?'\n这份订单已经完成，没有再次扣款。':''}${!served?'\n订单已保存，频道上桌消息暂时未送达。':''}`,embeds:artEmbed(o.item),components:[navigation(guild,id)],allowed_mentions:mentions};}
export function tavernInteraction(i){const action=String(i.data?.custom_id||'').split(':')[3]||'';return i.type===2&&i.data?.name==='酒馆'||[3,5].includes(i.type)&&i.data?.custom_id?.startsWith('t:')&&!action.startsWith('lobbyPlay~');}
function interactionParts(i){
 const id=i.member?.user?.id,guild=i.guild_id;if(!validId(id)||!validId(guild)||!validId(i.channel_id))throw Error('请在服务器文字频道内使用。');
 if(i.type===2)return {id,guild,action:i.data.options?.[0]?.name};
 const parts=String(i.data?.custom_id||'').split(':');if(parts.length!==4||parts[1]!==guild)throw Error('这个酒馆面板已经失效，请重新打开。');
 if(parts[2]==='any'&&(parts[3]==='menu'||parts[3].startsWith('menuCat~')))return {id,guild,action:parts[3]};
 if(parts[2]!==id)throw Error('这是另一位来客的面板，请打开自己的 `/酒馆 菜单`。');
 const action=parts[3];if(i.type===3&&!(Number(i.message?.flags)&64)&&!action.startsWith('review~'))throw Error('请打开自己的私密面板后操作。');
 return {id,guild,action};
}
export function immediateTavernReply(i){
 if(operationsInteraction(i))return immediateOperationsReply(i);
 if(tavernLobbyInteraction(i)||tavernLobbyCommand(i))return immediateLobbyReply(i);
 if(tavernRenovationInteraction(i))return immediateRenovationReply(i);
 let p;try{p=interactionParts(i);}catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
 if(i.type===3&&p.action==='notes')return {type:9,data:{custom_id:key(p.guild,p.id,'saveNotes'),title:'常客卡 · 忌口与备注',components:[row({type:4,custom_id:'restrictions',label:'忌口或饮品备注（留空会清除）',style:2,max_length:100,required:false})]}};
 return null;
}
async function sendServing(env,answer,name){
 if(answer.repeated)return true;
 const o=answer.order,p=menuItem(o.item)||o.details;try{
  const r=await fetch(`https://discord.com/api/v10/channels/${o.channel}/messages`,{method:'POST',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({content:`${p?.emoji||'🍵'} **${displayText(name)||'来客'}的 ${displayText(o.details.itemName)}**\n红豆粉${p?.serve||'把这一份送上桌。'}`,embeds:artEmbed(o.item),allowed_mentions:mentions,nonce:o.id,enforce_nonce:true}),signal:AbortSignal.timeout(5000)});
  return r.ok;
 }catch{return false;}
}
export async function answerTavern(env,i){
 if(operationsInteraction(i))return answerOperations(env,i);
 if(tavernLobbyInteraction(i)||tavernLobbyCommand(i)){
  const action=tavernLobbyCommand(i)?'lobby':String(i.data.custom_id).split(':')[3],id=i.member?.user?.id,guild=i.guild_id,name=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客';
  if(['lobbyMenu','lobbyWallet','lobbyCard'].includes(action)){
   const data=await tavernRequest(env,{guild,id,name,action:'view'});
   if(action==='lobbyMenu'){await tavernRequest(env,{guild,id,name,channel:i.channel_id,action:'mapMove',area:'bar'});return menuData(data,id,guild);}
   if(action==='lobbyWallet')return walletData(data,id,guild);
   return cardData(data,id,guild);
  }
  return answerLobby(env,i);
 }
 if(tavernRenovationInteraction(i))return answerRenovation(env,i);
 if(i.type===2&&i.data?.name==='酒馆'&&renoCommandOptions.some(o=>o.name===i.data.options?.[0]?.name))return answerRenovation(env,i);
 const {id,guild,action}=interactionParts(i),name=i.member.nick||i.member.user.global_name||i.member.user.username||'来客',base={guild,id,name,channel:i.channel_id};
 if(action==='claimDaily'){
  const result=await tavernRequest(env,{...base,action:'claimDaily'}),gift=result.dailyGift;
  const notice=gift.repeated?'今天的到店礼已经领过了。':gift.amount?`今日到店礼已到账 **${gift.amount}币**。`:'今日共享收入上限已满，暂时无法领取到店礼。';
  return walletData(result,id,guild,notice);
 }
 if(action.startsWith('menuCat~')){
  const category=action.slice(8);if(!MENU_CATEGORIES.some(c=>c.id===category))throw Error('请从菜单分类中选择。');
  const publicView=String(i.data.custom_id).split(':')[2]==='any';
  const data=publicView?await tavernRequest(env,{...base,action:'opsMenuStatus'}):await tavernRequest(env,{...base,action:'view'});
  await tavernRequest(env,{...base,action:'mapMove',area:'bar'});
  return menuData(data,id,guild,publicView,category);
 }
 if(['帮助','help'].includes(action))return {content:TAVERN_HELP,components:[navigation(guild,id)],allowed_mentions:mentions};
 if(action==='点单'||action==='pick'){
  const options=i.data.options?.[0]?.options||[],item=action==='pick'?i.data.values?.[0]:options.find(o=>o.name==='商品')?.value;
  const details={};for(const [option,k]of [['甜度','sweetness'],['温度','temperature'],['心情','mood']]){const value=options.find(o=>o.name===option)?.value;if(value!==undefined)details[k]=value;}
  return draftData(await tavernRequest(env,{...base,action:'prepare',item,options:details,requestKey:`i${i.id}`}),id,guild);
 }
 if(action.startsWith('review~')){
  // Read an existing draft; never create a second purchase from a public preview.
  const draftId=action.slice(7),d=await tavernRequest(env,{...base,action:'draft',draftId});return draftData(d,id,guild);
 }
 if(action.startsWith('confirm~')){
  const answer=await tavernRequest(env,{...base,action:'confirm',draftId:action.slice(8)}),served=await sendServing(env,answer,name);return receiptData(answer,id,guild,served);
 }
 if(action.startsWith('pref~')||action==='reset'||action==='saveNotes'){
  const field=action.startsWith('pref~')?action.slice(5):action==='reset'?'reset':'restrictions',value=action==='saveNotes'?i.data.components?.flatMap(r=>r.components||[]).find(c=>c.custom_id==='restrictions')?.value||'':i.data.values?.[0];
  const data=await tavernRequest(env,{...base,action:'profile',key:field,value});return cardData(data,id,guild,action==='reset'?'口味偏好已清除，钱包和订单保留。':'已保存。');
 }
 const data=await tavernRequest(env,{...base,action:'view'});
 if(['钱包','wallet'].includes(action))return walletData(data,id,guild);
 if(['常客卡','card'].includes(action))return cardData(data,id,guild);
 if(['菜单','menu'].includes(action)){await tavernRequest(env,{...base,action:'mapMove',area:'bar'});return menuData(data,id,guild);}
 throw Error('请重新打开 `/酒馆 菜单`。');
}
export function tavernDeferredReply(i){if(i.type===3&&String(i.data?.custom_id||'').split(':')[3]?.startsWith('menuCat~'))return {type:6};return operationsDeferredReply(i)||lobbyDeferredReply(i)||renovationDeferredReply(i);}
export async function finishTavern(env,i){
 let data;try{data=await answerTavern(env,i);}catch(e){data={content:`🍵 ${e.message}`,components:[],allowed_mentions:mentions};}
 const announcement=data._renovationAnnouncement;delete data._renovationAnnouncement;
 if(announcement){let sent=false;try{const r=await fetch(`https://discord.com/api/v10/channels/${i.channel_id}/messages`,{method:'POST',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({content:announcement.content,embeds:announcement.embeds||[],allowed_mentions:mentions,nonce:announcement.nonce,enforce_nonce:true}),signal:AbortSignal.timeout(5000)});sent=r.ok;}catch{}
  if(!sent)data.content+=`\n\n📨 频道公告未能送达；这张收据仍有效，出资没有回滚。`;
 }
 const mapImage=data._mapImage;delete data._mapImage;
 const mapScene=data._mapScene;delete data._mapScene;
 const mapEmbed=data._mapEmbed;delete data._mapEmbed;
 const scene=mapScene?.bytes?mapScene:mapImage?{bytes:mapImage,filename:'tavern-map.png',mime:'image/png'}:null;
 const payload={...data,embeds:mapEmbed?[tavernSceneEmbed(mapEmbed)]:data.embeds||[],attachments:[]};let body=JSON.stringify(payload),headers={'Content-Type':'application/json'};
 if(scene){payload.attachments=[{id:0,filename:scene.filename,description:'酒馆近期来客与公开牌桌实况；动态河光与暖灯'}];payload.embeds=[mapEmbed?tavernSceneEmbed(mapEmbed,scene.filename):{...(payload.embeds[0]||{}),image:{url:`attachment://${scene.filename}`}}];const form=new FormData();form.append('payload_json',JSON.stringify(payload));form.append('files[0]',new Blob([scene.bytes],{type:scene.mime}),scene.filename);body=form;headers={};}
 try{const r=await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${encodeURIComponent(i.token)}/messages/@original`,{method:'PATCH',headers,body,signal:AbortSignal.timeout(6000)});
  const action=i.type===2?i.data.options?.[0]?.name:String(i.data?.custom_id||'').split(':')[3];
  if(r.ok&&['大厅','lobby'].includes(action)&&!(Number(i.message?.flags)&64)){
   const message=await r.json();if(validId(message.id)&&!(Number(message.flags)&64))await tavernRequest(env,{guild:i.guild_id,action:'opsBindLobby',channel:i.channel_id,message:message.id});
  }else if(r.ok&&i.type===3&&validId(i.message?.id)&&!(Number(i.message.flags)&64)&&tavernDeferredReply(i)?.type===6){
   await tavernRequest(env,{guild:i.guild_id,action:'opsUnbindLobby',channel:i.channel_id,message:i.message.id});
  }
 }catch{}
}
export function parseTavernIntent(text,menu=MENU){
 const original=String(text||'').trim();
 const s=original.replace(/[。！!]+$/,'');
 // Cancellation and question marks must be checked before broad menu/order phrases.
 if(/不要了|算了|取消/.test(original)||/[？?]/.test(original))return null;
 const imageRequest=/^(?:看看|给我看看|给我看|展示)(.+?)(?:的)?(?:图片|照片|菜品图)$/.exec(s);
 if(imageRequest){const name=imageRequest[1].replace(/的$/,'').trim(),item=menu.find(p=>p.name===name);return item?{action:'dish',item:item.id}:null;}
 if(/^(打开酒馆|打开小酒馆|走进酒馆|进酒馆|小酒馆)$/.test(s))return {action:'lobby'};
 if(/^(看看?|打开|给我看看)?(酒馆)?菜单$/.test(s))return {action:'menu'};
 if(/^(点单|我要点单|我想(喝|点).{0,20})$/.test(s))return {action:'menu'};
 // Negations, quoted examples and questions are conversation, never transaction requests.
 if(!/^(给我|帮我点|来|点|我要)/.test(s)||/[“”"「」？?]|不是|别给|不要点|取消|能不能|可以吗|多少钱|知道|介绍|如果|假如|比如|怎么|为什么/.test(s))return null;
 const item=menu.find(p=>s.includes(p.name));
 if(!item){if(!/^(给我|帮我|来)(来)?一杯/.test(s)||!/(甜|热|冰|冷|常温|少糖|清爽|不加糖|不要酒精|无酒精|推荐)/.test(s))return null;return {action:'prepare',item:'milk',options:{sweetness:/少糖|不甜|不加糖/.test(s)?'light':/甜一点|甜点|偏甜/.test(s)?'sweet':'normal',temperature:/冰|冷/.test(s)?'cold':'warm'}};}
 const options={};if(/少糖|不甜|不加糖/.test(s))options.sweetness='light';else if(/甜一点|偏甜/.test(s))options.sweetness='sweet';if(/冰|冷/.test(s))options.temperature='cold';else if(/常温/.test(s))options.temperature='room';
 for(const [value,label]of Object.entries(MOODS))if(s.includes(label))options.mood=value;
 return {action:'prepare',item:item.id,options};
}
export async function handleNaturalTavern(env,message,text){
 if(!env.TABLES||message.author?.bot||!validId(message.guild_id)||!validId(message.author?.id)||!validId(message.id))return false;
 const base={guild:message.guild_id,id:message.author.id,name:message.member?.nick||message.author.global_name||message.author.username||'来客',channel:message.channel_id};
 let intent=parseTavernIntent(text),menu;
 if((!intent||intent.action==='prepare'&&!MENU.some(p=>String(text||'').includes(p.name)))&&/^(给我|帮我点|来|点|我要)/.test(String(text||''))&&!/[？?“”"「」]|不要了|算了|取消|如果|多少钱|介绍/.test(text)){
  try{menu=await tavernRequest(env,{guild:base.guild,action:'opsMenu'});intent=parseTavernIntent(text,menu);}catch{}
 }
 if(!intent)return false;
 let data;try{
  if(intent.action==='lobby'){
   const [board,operations]=await Promise.all([tavernRequest(env,{guild:base.guild,action:'renoBoard'}),tavernRequest(env,{...base,action:'opsBoard'})]);
   const live=await tavernRequest(env,{...base,action:'mapRender',scene:true}).catch(()=>null);
   data=tavernLobbyData(board,base.guild,'any',operations,live);
  }
  else if(intent.action==='menu'){const status=await tavernRequest(env,{...base,action:'opsMenuStatus'});await tavernRequest(env,{...base,action:'mapMove',area:'bar'});data=menuData(status,base.id,base.guild,true);}
  else if(intent.action==='dish'){
   const item=(menu||MENU).find(p=>p.id===intent.item),embeds=artEmbed(item.id);
   data={content:`${renderDishDetails(item)}\n${item.price?`${item.price}酒馆币`:'免费'}${embeds.length?'':'\n这道菜还在补图清单里。'}`,embeds,components:[row(button(base.guild,'any','menu','打开我的点单面板',1))],allowed_mentions:mentions};
  }
  else data=draftData(await tavernRequest(env,{...base,...intent,requestKey:`m${message.id}`}),base.id,base.guild,true);
 }catch(e){data={content:`🍵 ${e.message}`,allowed_mentions:mentions};}
 const scene=data._mapScene,meta=data._mapEmbed;delete data._mapScene;delete data._mapEmbed;
 const payload={...data,message_reference:{message_id:message.id,fail_if_not_exists:false},nonce:`t${message.id}`,enforce_nonce:true};
 if(meta)payload.embeds=[tavernSceneEmbed(meta)];
 let body=JSON.stringify(payload),headers={Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'};
 if(scene){payload.attachments=[{id:0,filename:scene.filename,description:'红豆粉小酒馆近期实况'}];payload.embeds=[tavernSceneEmbed(meta,scene.filename)];const form=new FormData();form.set('payload_json',JSON.stringify(payload));form.set('files[0]',new Blob([scene.bytes],{type:scene.mime}),scene.filename);body=form;headers={Authorization:`Bot ${env.BOT_TOKEN}`};}
 try{const r=await fetch(`https://discord.com/api/v10/channels/${message.channel_id}/messages`,{method:'POST',headers,body,signal:AbortSignal.timeout(6000)});
  if(r.ok&&intent.action==='lobby'){const out=await r.json();if(validId(out.id)&&!(Number(out.flags)&64))await tavernRequest(env,{guild:base.guild,action:'opsBindLobby',channel:base.channel,message:out.id});}
 }catch{}
 return true;
}


