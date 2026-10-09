import {RENOVATION_ITEMS,RENOVATION_CATEGORIES,SHOP_STAGES} from './tavern-renovation-catalog.mjs';
import {cleanText} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';
import {equipmentArtEmbed} from './equipment-art.mjs';
const mentions={parse:[]};
const row=(...components)=>({type:1,components});
const id=(g,u,a)=>`t:${g}:${u}:${a}`;
const btn=(g,u,a,label,style=2,disabled=false)=>({type:2,custom_id:id(g,u,a),label:String(label).slice(0,80),style,disabled});
const valid=s=>/^\d{1,20}$/.test(String(s||''));
const safe=(s,max=64)=>[...cleanText(String(s||''),max*2).replace(/<@!?&?\d+>/g,'＠').replace(/@/g,'＠').replace(/[<>]/g,'').replace(/[\\`*_~|#\[\](){}!]/g,'')].slice(0,max).join('')||'未命名';
const fmt=xs=>xs?.length?xs.join('\n'):'暂无记录。';
export const renoCommandOptions=[
 {type:1,name:'店内',description:'公开查看红豆粉小酒馆的共同装修'},
 {type:1,name:'装修',description:'查看装修目录并为小酒馆出资'},
 {type:1,name:'贡献榜',description:'查看餐饮消费与装修出资贡献'},
 {type:1,name:'捐赠档案',description:'查看物件购置和升级履历'}
];
export function tavernRenovationInteraction(i){return [3,5].includes(i.type)&&i.data?.custom_id?.startsWith('t:')&&String(i.data.custom_id).split(':')[3]?.startsWith('reno');}
export function tavernDeferredReply(i){
 const custom=String(i.data?.custom_id||''),customParts=custom.split(':');
 if(customParts[0]==='t'&&['lobbyMenu','lobbyWallet','lobbyCard'].includes(customParts[3]))return {type:5,data:{flags:64}};
 if(customParts[0]==='t'&&String(customParts[3]||'').startsWith('lobbyPlay~'))return null;
 if(customParts[0]==='t'&&['lobby','lobbyGames','lobbyRoom'].includes(customParts[3]))return i.type===3?{type:6}:{type:5};
 if(i.data?.custom_id?.startsWith('t:')&&!String(i.data.custom_id).split(':')[3]?.startsWith('reno')){
  const parts=String(i.data.custom_id).split(':');
  const own=parts.length===4&&parts[1]===i.guild_id&&parts[2]===i.member?.user?.id;
  if(i.type===3&&own&&Number(i.message?.flags)&64)return {type:6};
  return {type:5,data:{flags:64}};
 }
 if(i.type===2&&i.data?.name==='酒馆'){
  const a=i.data.options?.[0]?.name;
  return {type:5,...(['大厅','店内','贡献榜','捐赠档案'].includes(a)?{}:{data:{flags:64}})};
 }
 if(!tavernRenovationInteraction(i))return null;
 const parts=String(i.data.custom_id).split(':');
 const own=parts.length===4&&parts[1]===i.guild_id&&parts[2]===i.member?.user?.id;
 if(i.type===3&&own&&Number(i.message?.flags)&64)return {type:6};
 // Public pages and public browsing return only public data. `enter` deliberately opens a private panel.
 if(parts[2]==='any'&&parts[3]==='renoEnter')return {type:5,data:{flags:64}};
 if(i.type===3&&parts[2]==='any'&&['renoBoard','renoLeaders','renoHistory','renoScene'].some(a=>parts[3]===a||parts[3].startsWith(`${a}~`)))return {type:6};
 if(i.type===5)return {type:5,data:{flags:64}};
 return {type:5};
}
function validate(i){
 const g=i.guild_id,u=i.member?.user?.id,ch=i.channel_id;
 if(!valid(g)||!valid(u)||!valid(ch))throw Error('请在服务器文字频道内使用装修功能。');
 if(i.type===2)return {g,u,ch,a:i.data.options?.[0]?.name};
 const ps=String(i.data?.custom_id||'').split(':');
 if(ps.length!==4||ps[0]!=='t'||ps[1]!==g)throw Error('装修面板已失效，请重新打开。');
 let [,,target,a]=ps;
 if(target==='any'){
  if(!['renoBoard','renoLeaders','renoHistory','renoEnter','renoScene'].includes(a)&&!a.startsWith('renoHistory~')&&!a.startsWith('renoBoard~'))throw Error('公开面板只允许查看店内、贡献榜、捐赠档案或打开自己的私密装修面板。');
  if(a==='renoEnter')a='装修';
 }else if(target!==u)throw Error('这是另一位来客的装修面板，请打开自己的私密装修面板。');
 const priv=!!(Number(i.message?.flags)&64);
 if(i.type===3&&!priv&&!['renoBoard','renoLeaders','renoHistory','renoScene','renoEnter'].includes(ps[3])&&!ps[3].startsWith('renoHistory~')&&!ps[3].startsWith('renoBoard~'))throw Error('请打开自己的私密装修面板后操作。');
 if(['title','prepare','confirm'].some(x=>a.startsWith(x))&&!priv&&i.type!==5)throw Error('装修出资只能在本人私密面板操作。');
 return {g,u,ch,a,priv,raw:ps[3]};
}
export function immediateRenovationReply(i){
 if(!tavernRenovationInteraction(i))return null;
 try{
  const p=validate(i);if(i.type===3&&String(i.data.custom_id).includes(':renoTitle~')){
   const item=String(i.data.custom_id).split(':')[3].split('~')[1];
   if(!RENOVATION_ITEMS.some(x=>x.id===item))throw Error('物件目录已更新，请重新选择。');
   return {type:9,data:{custom_id:id(p.g,p.u,`renoSubmit~${p.ch}~${item}`),title:'为本次出资冠名',components:[row({type:4,custom_id:'title',label:'2～24字，留空使用默认冠名',style:1,min_length:0,max_length:24,required:false})]}};
  }
 }catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
 return null;
}
function stageText(board){return `🏮 **${board.stage.name}** · 建设值 ${board.total}（餐饮 ${board.consumption} + 装修 ${board.direct}）${board.next?`\n下一级：${board.next.name} · 还差 ${Math.max(0,board.next.threshold-board.total)}`:''}`;}
function rootBoard(b,g,u,page=0){
 const assets=b.assets||[],pages=Math.max(1,Math.ceil(assets.length/6)),current=Math.min(Math.max(0,page),pages-1),shown=assets.slice(current*6,current*6+6);
 const lines=shown.map(a=>{const item=typeof a.item==='string'?RENOVATION_ITEMS.find(x=>x.id===a.item):a.item;const founder=typeof a.founder==='string'?a.founder:a.founder?.name,updated=typeof a.updatedBy==='string'?a.updatedBy:a.updatedBy?.name;const initial=safe(a.name,24),levelTitle=safe(a.levelName||a.name,24);return `${item?.emoji||'🪑'} **${safe(item?.name||a.item,32)}** · Lv.${a.level} 当前「${levelTitle}」 · 原始「${initial}」 · ${safe(founder,32)}${updated&&updated!==founder?` / ${safe(updated,32)}`:''}`;});
 const nav=[];if(current>0)nav.push(btn(g,'any',`renoBoard~${current-1}`,'上一页'));if(current+1<pages)nav.push(btn(g,'any',`renoBoard~${current+1}`,'下一页'));nav.push(btn(g,'any','renoLeaders','🏅 贡献榜'),btn(g,'any','renoHistory~0','📜 捐赠档案'),btn(g,'any','renoEnter','🔧 装修',1),btn(g,'any','lobby','🏡 大厅'));
 const components=[row(...nav.slice(0,5))];if(nav.length>5)components.push(row(...nav.slice(5)));
 return {content:`🍵 **红豆粉的小酒馆 · 店内**\n${stageText(b)}\n${b.stage.description||''}\n\n**已经落地的装修 · ${current+1}/${pages}**\n${fmt(lines)}`,components,allowed_mentions:mentions};
}
function boardData(b,g,u){
 const leaders=(b.leaders||[]).map((p,n)=>`${n+1}. **${safe(p.name)}** · 餐饮 ${p.consumption} + 装修 ${p.direct} = ${p.total}`);
 return {content:`🏅 **共同建设贡献榜**\n${stageText(b)}\n1币=1建设值；排行不是个人钱包余额。\n\n${fmt(leaders)}`,components:[row(btn(g,'any','renoBoard~0','🏮 查看店内'),btn(g,'any','renoHistory~0','📜 捐赠档案'),btn(g,'any','lobby','🏡 大厅'))],allowed_mentions:mentions};
}
function historyData(h,g,u,item=''){
 const lines=(h.entries||[]).map(e=>`${safe(e.donor_name,32)} · ${safe(e.item?.name||e.item_name||e.item,32)} Lv.${e.level} · ${e.kind==='upgrade'?'升级':'购置'}「${safe(e.name,24)}」 · ${e.price}币`);
 const buttons=[];if(h.page>0)buttons.push(btn(g,'any',`renoHistory~${h.page-1}${item?`~${item}`:''}`,'上一页'));if(h.hasMore)buttons.push(btn(g,'any',`renoHistory~${h.page+1}${item?`~${item}`:''}`,'下一页'));
 buttons.push(btn(g,'any','renoBoard~0','返回店内'),btn(g,'any','lobby','🏡 大厅'));
 return {content:`📜 **捐赠档案**${item?` · ${safe(RENOVATION_ITEMS.find(x=>x.id===item)?.name||item)}升级履历`:''}\n第 ${h.page+1} 页\n\n${fmt(lines)}`,components:[row(...buttons.slice(0,5))],allowed_mentions:mentions};
}
function unlockText(item){return item?.menuUnlocks?.length?`\n解锁新品：${item.menuUnlocks.join('、')}（本服务器永久加入公共菜单）`:'';}
function catalogData(b,g,u,category=''){
 const rows=(b.catalog||[]).filter(x=>!category||x.category===category).map(x=>{const item=RENOVATION_ITEMS.find(it=>it.id===x.id);return `${x.emoji||'🪑'} **${safe(x.name,32)}** · ${x.ownedLevel?`已拥有 Lv.${x.ownedLevel}${x.nextLevel?x.available?` · 升至${x.nextLevel}级 ${x.nextPrice}币`:` · ${safe(x.lockReason||'尚未解锁',32)}`:' · 已满级'}`:x.available?`可购 ${x.nextPrice}币`:`🔒 ${safe(x.lockReason||'尚未解锁',32)}`}${unlockText(item)}`;});
 const cats=Object.entries(RENOVATION_CATEGORIES);
 const categoryOptions=[{label:'全部类别',value:'all'},...cats.map(([value,label])=>({label,value}))];
 let comps=[row({type:3,custom_id:id(g,u,'renoCategory'),placeholder:'按类别筛选目录',options:categoryOptions})];
 const available=(b.catalog||[]).filter(x=>(!category||x.category===category)&&x.available);
 if(available.length)comps.push(row({type:3,custom_id:id(g,u,`renoPick~${category||'all'}`),placeholder:'选择一个可购置或升级的项目',options:available.slice(0,25).map(x=>({label:`${x.emoji||'🪑'} ${x.name}`.slice(0,100),value:x.id,description:`${x.nextPrice}币 · ${x.ownedLevel?`升至等级${x.nextLevel}`:'首次购置'}`.slice(0,100)}))}));
 const inspect=(b.catalog||[]).filter(x=>!category||x.category===category);
 if(inspect.length)comps.push(row({type:3,custom_id:id(g,u,`renoInspect~${category||'all'}`),placeholder:'查看任意项目详情（含锁定项目）',options:inspect.slice(0,25).map(x=>({label:`${x.emoji||'🪑'} ${x.name}`.slice(0,100),value:x.id,description:(x.available?`可出资 ${x.nextPrice}币`:x.lockReason||'查看状态与级别效果').slice(0,100)}))}));
 comps.push(row(btn(g,'any','lobby','🏡 返回大厅')));
 return {content:`🔧 **共同装修目录**\n${stageText(b)}\n分类：${category?safe(RENOVATION_CATEGORIES[category]||category):'全部'}\n${rows.join('\n')||'这个分类暂时没有项目。'}\n\n设备购置后会永久解锁本服务器公共菜单新品。\n私密余额：**${b.balance??0}币** · 预览不会扣款，确认时才出资。`,components:comps,allowed_mentions:mentions};
}
function detailData(b,g,u,itemId,history){
 const it=RENOVATION_ITEMS.find(x=>x.id===itemId),entry=(b.assets||[]).find(x=>x.item===itemId||x.item?.id===itemId),cat=(b.catalog||[]).find(x=>x.id===itemId);
 if(!it)return {content:'物件目录已更新，请重新打开装修目录。',components:[row(btn(g,u,'reno','返回目录'))],allowed_mentions:mentions};
 const levels=it.levels.map(l=>`${l.level}. ${safe(l.label)} · ${l.price}币 · ${safe(SHOP_STAGES[l.stage]?.name||'当前即可')}解锁 · ${safe(l.scene,80)}`);
 const past=(history?.entries||[]).map(x=>`${safe(x.donor_name,32)}：Lv.${x.level}「${safe(x.name,24)}」 · ${x.price}币`);
 return {content:`${it.emoji||'🪑'} **${safe(it.name)}**\n${safe(it.description,80)}\n类别：${safe(RENOVATION_CATEGORIES[it.category]||it.category)}${unlockText(it)}\n\n**各级效果、价格与解锁**\n${fmt(levels)}\n\n**当前状态**\n${entry?`Lv.${entry.level} · 最初冠名「${safe(entry.name,24)}」，创始者 ${safe(entry.founder?.name,32)}；本级冠名「${safe(entry.levelName||entry.name,24)}」，最近出资者 ${safe(entry.updatedBy?.name,32)}。`:cat?.lockReason?`尚未购置。${safe(cat.lockReason)}`:'尚未购置。'}\n\n**出资记录**\n${fmt(past)}`,embeds:equipmentArtEmbed(it.artId),components:[row(btn(g,u,`renoTitle~${itemId}`,cat?.available?'填写冠名并预览':'暂不可购置',1,!cat?.available),btn(g,'any',`renoHistory~0~${itemId}`,'查看此物件完整履历'),btn(g,u,'reno','返回目录')),row(btn(g,'any','lobby','🏡 返回大厅'))],allowed_mentions:mentions};
}
function draftData(d,g,u){
 const it=RENOVATION_ITEMS.find(x=>x.id===d.item);
 return {content:`🧾 **装修出资预览**\n${it?.emoji||'🪑'} ${safe(it?.name)} · Lv.${d.level}「${safe(d.name,24)}」${it?.menuUnlocks?.length&&d.kind!=='upgrade'?unlockText(it):''}\n本次：${d.kind==='upgrade'?'升级':'购置'} · **${d.price}币**\n当前余额：**${d.balance}币**\n\n${d.expires<=Date.now()||d.status!=='pending'?'预览已处理或过期，请重新打开目录。':'现在尚未扣款；3分钟内只能由你在这个频道确认。确认后不可撤销，名称与出资者会进入公开档案。'}`,embeds:equipmentArtEmbed(it?.artId),components:d.expires<=Date.now()||d.status!=='pending'?[row(btn(g,u,'reno','返回目录'),btn(g,'any','lobby','🏡 大厅'))]:[row(btn(g,u,`renoConfirm~${d.id}`,`确认出资 · ${d.price}币`,1),btn(g,u,'reno','返回目录'),btn(g,'any','lobby','🏡 大厅'))],allowed_mentions:mentions};
}
async function call(env,p){return tavernRequest(env,{...p,action:p.action});}
async function answerRenovationInternal(env,i){
 const p=validate(i),{g,u,ch}=p,name=i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客',base={guild:g,id:u,name,channel:ch};
 let a=p.a;
 if(i.type===2){if(a==='装修')a='reno';else if(a==='店内')a='renoBoard';else if(a==='贡献榜')a='renoLeaders';else if(a==='捐赠档案')a='renoHistory~0';}
 if(a==='submit'||a.startsWith('renoSubmit~')){
  const parts=p.raw.split('~'),channel=parts[1],item=parts[2];if(channel!==ch)throw Error('冠名窗口必须在原频道提交。');
  const title=i.data.components?.flatMap(x=>x.components||[]).find(x=>x.custom_id==='title')?.value||'';
  const key=`r${i.id}`;
  const d=await call(env,{...base,action:'renoPrepare',item,title,requestKey:key});return draftData(d,g,u);
 }
 if(a.startsWith('renoConfirm~')){
  const draftId=a.slice(12),answer=await call(env,{...base,action:'renoConfirm',draftId});
  const c=answer.contribution,it=RENOVATION_ITEMS.find(x=>x.id===c?.item),kind=c?.kind==='upgrade'?'升级':'购置',level=c?.level||answer.asset?.level||1,title=safe(c?.name||answer.asset?.levelName||answer.asset?.name,24),donor=safe(c?.donor_name||name,32);
  const success=`🏮 **小酒馆${kind}了新装修**\n${it?.emoji||'🪑'} ${safe(it?.name||answer.asset?.item_name||c?.item,32)} · Lv.${level}「${title}」\n感谢 ${donor} 的共同出资。`;
  const unlocks=it?.menuUnlocks?.length&&c?.kind!=='upgrade'?unlockText(it):'';
  return {content:`✅ **出资收据 · ${kind}**\n${it?.emoji||'🪑'} ${safe(it?.name||answer.asset?.item_name||c?.item,32)} · Lv.${level}「${title}」${unlocks}\n捐赠者：${donor} · 本次 ${c?.price||0}币\n余额 ${answer.balance}币 · 建设值 ${answer.total}${answer.repeated?'\n这是已完成出资的收据，没有再次扣款。':''}\n已保存；若频道公告未能送达，出资不会回滚。`,embeds:equipmentArtEmbed(it?.artId),components:[row(btn(g,'any','renoBoard~0','查看店内'),btn(g,u,'reno','继续装修'),btn(g,'any','lobby','🏡 大厅'))],allowed_mentions:mentions,_renovationAnnouncement:answer.repeated?null:{nonce:c?.id,content:success+unlocks,embeds:equipmentArtEmbed(it?.artId)}};
 }
 if(a==='reno'||a==='renoEnter'||a==='装修')return catalogData(await call(env,{...base,action:'renoBoard',privateView:true}),g,u);
 if(a==='renoBoard'||a.startsWith('renoBoard~')){const parsed=Number(a.split('~')[1]||0),page=Number.isSafeInteger(parsed)&&parsed>=0?parsed:0,board=await call(env,{...base,action:'renoBoard'});return rootBoard(board,g,u,page);}
 if(a==='renoScene')return rootBoard(await call(env,{...base,action:'renoBoard'}),g,u,0);
 if(a==='renoLeaders')return boardData(await call(env,{...base,action:'renoBoard'}),g,u);
 if(a==='renoHistory'||a.startsWith('renoHistory~')){const [,pg='0',item='']=a.split('~'),h=await call(env,{...base,action:'renoHistory',page:Number(pg),...(item?{item}:{})});return historyData(h,g,u,item);}
 if(a==='renoCategory'){const category=i.data.values?.[0];if(category!=='all'&&!Object.hasOwn(RENOVATION_CATEGORIES,category))throw Error('请选择装修目录中的类别。');return catalogData(await call(env,{...base,action:'renoBoard',privateView:true}),g,u,category==='all'?'':category);}
 if(a.startsWith('renoCat~'))return catalogData(await call(env,{...base,action:'renoBoard',privateView:true}),g,u,a.slice(8));
 if(a.startsWith('renoPick~')||a.startsWith('renoInspect~')){
  const item=i.data.values?.[0];if(!RENOVATION_ITEMS.some(x=>x.id===item))throw Error('请选择目录中的物件。');
  const [b,h]=await Promise.all([call(env,{...base,action:'renoBoard',privateView:true}),call(env,{...base,action:'renoHistory',item,page:0})]);return detailData(b,g,u,item,h);
 }
 if(a.startsWith('renoTitle~')){const item=a.slice(10);if(!RENOVATION_ITEMS.some(x=>x.id===item))throw Error('请选择目录中的物件。');return null;}
 if(a==='renoDraft~'||a.startsWith('renoDraft~')){const d=await call(env,{...base,action:'renoDraft',draftId:a.slice(10)});return draftData(d,g,u);}
 throw Error('请重新打开 `/酒馆 装修`。');
}
export async function answerRenovation(env,i){return answerRenovationInternal(env,i);}
