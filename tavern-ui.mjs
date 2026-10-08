import {MENU,WELCOME_COINS,DAILY_REWARD_CAP,ROSTER_DAILY_LIMIT,SWEETNESS,TEMPERATURE,SEATS,MOODS,REWARDS,menuItem,displayText,validId} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';
const mentions={parse:[]};
const row=(...components)=>({type:1,components});
const key=(guild,id,action)=>`t:${guild}:${id}:${action}`;
const button=(guild,id,action,label,style=2)=>({type:2,custom_id:key(guild,id,action),label,style});
const choices=map=>Object.entries(map).map(([value,label])=>({name:label,value}));
export const tavernCommand={name:'酒馆',description:'红豆粉的小酒馆：点单、钱包和常客卡',type:1,integration_types:[0],contexts:[0],options:[
 {type:1,name:'菜单',description:'看看饮品与小食，打开自己的点单面板'},
 {type:1,name:'点单',description:'选饮品，确认后才扣酒馆币',options:[{type:3,name:'商品',description:'想点哪一份？',required:true,choices:MENU.map(p=>({name:`${p.name} · ${p.price}币`,value:p.id}))},{type:3,name:'甜度',description:'本单甜度；不选则沿用常客卡',choices:choices(SWEETNESS)},{type:3,name:'温度',description:'本单温度；热茶固定温热',choices:choices(TEMPERATURE)},{type:3,name:'心情',description:'心情特调的名字',choices:choices(MOODS)}]},
 {type:1,name:'钱包',description:'查看余额、今日游戏收入和最近流水'},
 {type:1,name:'常客卡',description:'设置口味、忌口和常坐的位置'},
 {type:1,name:'帮助',description:'查看赚币规则和点单说明'}
]};
export const TAVERN_HELP=`🍵 **红豆粉的小酒馆**\n\`/酒馆 菜单\` 看菜单；\`/酒馆 点单\` 选饮品；\`/酒馆 钱包\` 查流水；\`/酒馆 常客卡\` 保存口味。\n新客欢迎金 **${WELCOME_COINS}币**，每个服务器仅一次。同服务器跨频道共用钱包，不同服务器独立。\n${Object.values(REWARDS).map(r=>`${r.name}：完成 +${r.base}，胜者额外 +${r.bonus}（至少${r.minMs/1000}秒）`).join('\n')}\n奖励仅限更新后开始的全真人完成局，至少两人实际操作过；认输者、全程挂机者、取消局与电脑陪练不发币。每日收入上限${DAILY_REWARD_CAP}币，北京时间零点刷新；同一组玩家每天前${ROSTER_DAILY_LIMIT}个合格完成局发币，跨游戏累计。UNO积分赛按每个小局结算；德州筹码不兑换酒馆币。\n点单先预览，3分钟内本人确认才扣币；重复点击不重复扣款。每10秒可点一份，免费茶水每分钟一份。\n所有饮品均无酒精。确认后频道会显示上桌消息，余额、流水和忌口只在本人面板里显示。\n也可 @我说“看看菜单”“给我一杯红豆牛奶”；自然语言点单仍需要按钮确认。常坐位置只是场景偏好，不会把不同频道对话合并。`;
const navigation=(g,id)=>row(button(g,id,'menu','🍵 菜单',1),button(g,id,'wallet','🪙 钱包'),button(g,id,'card','🦋 常客卡'));
export function menuData(data,id,guild,publicView=false){
 const content=`🍵 **红豆粉的小酒馆 · 今日菜单**\n${MENU.map(p=>`${p.emoji} **${p.name}** · ${p.price?`${p.price}币`:'免费'}\n${p.description}`).join('\n')}\n${publicView?'选好后打开自己的点单面板。':`你的余额：**${data.member.balance}币** · 选好后还会再请你确认。`}\n全店无酒精饮品。`;
 const components=publicView?[row(button(guild,'any','menu','打开我的点单面板',1))]:[row({type:3,custom_id:key(guild,id,'pick'),placeholder:'今天想喝点什么？',options:MENU.map(p=>({label:p.name,value:p.id,description:`${p.price?`${p.price}币`:'免费'} · ${p.description}`,emoji:{name:p.emoji}}))}),navigation(guild,id)];
 return {content,components,allowed_mentions:mentions};
}
export function walletData(data,id,guild){return {content:`🪙 **我的酒馆钱包**\n余额：**${data.member.balance}币**\n今日小游戏收入：${data.earned} / ${data.cap}币（北京时间）\n\n最近流水：\n${data.ledger.map(l=>`${l.amount>=0?'+':''}${l.amount} · ${displayText(l.note)}`).join('\n')||'还没有流水。'}\n\n德州筹码与酒馆币分别计算。`,components:[navigation(guild,id)],allowed_mentions:mentions};}
const select=(guild,id,field,label,map,current)=>row({type:3,custom_id:key(guild,id,`pref~${field}`),placeholder:label,options:Object.entries(map).map(([value,label])=>({label,value,default:value===current}))});
export function cardData(data,id,guild,notice=''){
 const p=data.member,latest=data.orders[0],frequent=menuItem(data.frequent?.item);
 return {content:`🦋 **我的常客卡**${notice?`\n${notice}`:''}\n已确认上桌 ${data.count} 份\n口味：${SWEETNESS[p.sweetness]} · ${TEMPERATURE[p.temperature]}\n常坐：${SEATS[p.seat]}\n忌口 / 备注：${displayText(p.restrictions)||'未设置'}\n${frequent?`常点：${frequent.name}（${data.frequent.count}次，不代表已认定为最爱）`:'还没有常点饮品。'}\n${latest?`最近一份：${displayText(latest.details.itemName)}`:'第一次来，选一杯喜欢的吧。'}\n每次选择会立即保存；聊天时只给红豆粉提供你自己的偏好。`,components:[select(guild,id,'sweetness','我的甜度',SWEETNESS,p.sweetness),select(guild,id,'temperature','我的温度',TEMPERATURE,p.temperature),select(guild,id,'seat','常坐位置',SEATS,p.seat),row(button(guild,id,'notes','编辑忌口备注'),button(guild,id,'reset','清除口味偏好'),button(guild,id,'menu','返回菜单',1))],allowed_mentions:mentions};
}
export function draftData(d,id,guild,publicView=false){
 const p=menuItem(d.item),detail=d.details,expired=d.expires<=Date.now()||d.status!=='pending';
 return {content:`${p?.emoji||'🍵'} **点单预览 · ${displayText(detail.itemName)}**\n${SWEETNESS[detail.sweetness]} · ${TEMPERATURE[detail.temperature]}${d.item==='special'?` · 心情：${MOODS[detail.mood]}`:''}\n本单 **${d.price}币**${publicView?'':` · 当前余额 ${d.balance}币\n位置：${SEATS[detail.seat]}${detail.restrictions?`\n备注：${displayText(detail.restrictions)}`:''}`}\n${expired?'这张预览已经处理或过期，请重新打开菜单。':'尚未扣款；3分钟内由本人确认。确认后会在本频道显示上桌消息。'}`,
 components:expired?[navigation(guild,id)]:[row(button(guild,id,`${publicView?'review':'confirm'}~${d.id}`,publicView?'打开我的确认窗口':`确认点单 · ${d.price}币`,1)),...(!publicView?[navigation(guild,id)]:[])],allowed_mentions:mentions};
}
export function receiptData(answer,id,guild,served=true){const o=answer.order,p=menuItem(o.item);return {content:`${p?.emoji||'🍵'} **已上桌 · ${displayText(o.details.itemName)}**\n红豆粉${p?.serve||'把这一份送到你手边。'}\n${SWEETNESS[o.details.sweetness]} · ${TEMPERATURE[o.details.temperature]}\n本单 ${o.price}币 · 余额 **${answer.balance}币**${answer.repeated?'\n这份订单已经完成，没有再次扣款。':''}${!served?'\n订单已保存，频道上桌消息暂时未送达。':''}`,components:[navigation(guild,id)],allowed_mentions:mentions};}
export function tavernInteraction(i){return i.type===2&&i.data?.name==='酒馆'||[3,5].includes(i.type)&&i.data?.custom_id?.startsWith('t:');}
function interactionParts(i){
 const id=i.member?.user?.id,guild=i.guild_id;if(!validId(id)||!validId(guild)||!validId(i.channel_id))throw Error('请在服务器文字频道内使用。');
 if(i.type===2)return {id,guild,action:i.data.options?.[0]?.name};
 const parts=String(i.data?.custom_id||'').split(':');if(parts.length!==4||parts[1]!==guild)throw Error('这个酒馆面板已经失效，请重新打开。');
 if(parts[2]==='any'&&parts[3]==='menu')return {id,guild,action:'menu'};
 if(parts[2]!==id)throw Error('这是另一位来客的面板，请打开自己的 `/酒馆 菜单`。');
 const action=parts[3];if(i.type===3&&!(Number(i.message?.flags)&64)&&!action.startsWith('review~'))throw Error('请打开自己的私密面板后操作。');
 return {id,guild,action};
}
export function immediateTavernReply(i){
 let p;try{p=interactionParts(i);}catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
 if(i.type===3&&p.action==='notes')return {type:9,data:{custom_id:key(p.guild,p.id,'saveNotes'),title:'常客卡 · 忌口与备注',components:[row({type:4,custom_id:'restrictions',label:'忌口或饮品备注（留空会清除）',style:2,max_length:100,required:false})]}};
 return null;
}
async function sendServing(env,answer,name){
 if(answer.repeated)return true;
 const o=answer.order,p=menuItem(o.item);try{
  const r=await fetch(`https://discord.com/api/v10/channels/${o.channel}/messages`,{method:'POST',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({content:`${p?.emoji||'🍵'} **${displayText(name)||'来客'}的 ${displayText(o.details.itemName)}**\n红豆粉${p?.serve||'把这一份送上桌。'}`,allowed_mentions:mentions,nonce:o.id,enforce_nonce:true}),signal:AbortSignal.timeout(5000)});
  return r.ok;
 }catch{return false;}
}
export async function answerTavern(env,i){
 const {id,guild,action}=interactionParts(i),name=i.member.nick||i.member.user.global_name||i.member.user.username||'来客',base={guild,id,name,channel:i.channel_id};
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
 if(['菜单','menu'].includes(action))return menuData(data,id,guild);
 throw Error('请重新打开 `/酒馆 菜单`。');
}
export async function finishTavern(env,i){
 let data;try{data=await answerTavern(env,i);}catch(e){data={content:`🍵 ${e.message}`,components:[],allowed_mentions:mentions};}
 try{await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${encodeURIComponent(i.token)}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,embeds:[],attachments:[]}),signal:AbortSignal.timeout(6000)});}catch{}
}
export function parseTavernIntent(text){
 const s=String(text||'').trim().replace(/[。！!？?]+$/,'');
 if(/^(看看?|打开|给我看看)?(酒馆)?菜单$/.test(s))return {action:'menu'};
 if(/^(点单|我要点单|我想(喝|点).{0,20})$/.test(s))return {action:'menu'};
 // Negations, quoted examples and questions are conversation, never transaction requests.
 if(!/^(给我|帮我点|来|点|我要)/.test(s)||/[“”"「」？?]|不是|别给|不要点|取消|能不能|可以吗|多少钱|知道|介绍|如果|假如|比如|怎么|为什么/.test(s))return null;
 const item=MENU.find(p=>s.includes(p.name));
 if(!item){if(!/^(给我|帮我|来)(来)?一杯/.test(s)||!/(甜|热|冰|冷|常温|少糖|清爽|不加糖|不要酒精|无酒精|推荐)/.test(s))return null;return {action:'prepare',item:'milk',options:{sweetness:/少糖|不甜|不加糖/.test(s)?'light':/甜一点|甜点|偏甜/.test(s)?'sweet':'normal',temperature:/冰|冷/.test(s)?'cold':'warm'}};}
 const options={};if(/少糖|不甜|不加糖/.test(s))options.sweetness='light';else if(/甜一点|偏甜/.test(s))options.sweetness='sweet';if(/冰|冷/.test(s))options.temperature='cold';else if(/常温/.test(s))options.temperature='room';
 for(const [value,label]of Object.entries(MOODS))if(s.includes(label))options.mood=value;
 return {action:'prepare',item:item.id,options};
}
export async function handleNaturalTavern(env,message,text){
 if(!env.TABLES||!validId(message.guild_id)||!validId(message.author?.id)||!validId(message.id))return false;
 const intent=parseTavernIntent(text);if(!intent)return false;
 const base={guild:message.guild_id,id:message.author.id,name:message.member?.nick||message.author.global_name||message.author.username||'来客',channel:message.channel_id};
 let data;try{data=intent.action==='menu'?menuData(null,base.id,base.guild,true):draftData(await tavernRequest(env,{...base,...intent,requestKey:`m${message.id}`}),base.id,base.guild,true);}catch(e){data={content:`🍵 ${e.message}`,allowed_mentions:mentions};}
 try{await fetch(`https://discord.com/api/v10/channels/${message.channel_id}/messages`,{method:'POST',headers:{Authorization:`Bot ${env.BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({...data,message_reference:{message_id:message.id,fail_if_not_exists:false},nonce:`t${message.id}`,enforce_nonce:true}),signal:AbortSignal.timeout(6000)});}catch{}
 return true;
}
