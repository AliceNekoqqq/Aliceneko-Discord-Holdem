import {tavernRequest} from './tavern-service.mjs';
import {validId} from './tavern-catalog.mjs';
import {AUCTION_BUDGET,AUCTION_FEE,AUCTION_ROLES,AUCTION_QUALITIES} from './tavern-auction.mjs';
import {AUCTION_ITEMS,AUCTION_NPCS} from './tavern-auction-data.mjs';
import {renderAuctionImage} from './tavern-auction-image.mjs';
const mentions={parse:[]},row=(...components)=>({type:1,components});
const button=(g,id,action,label,style=2,disabled=false)=>({type:2,custom_id:`t:${g}:${id}:${action}`,label,style,disabled});
const names=['你',...AUCTION_NPCS];
export const auctionCommandOption={type:1,name:'仓库盲拍',description:'单人对战三位NPC，以线索估价并参与五轮暗标'};
export function auctionInteraction(i){return i.type===2&&i.data?.name==='酒馆'&&i.data.options?.[0]?.name==='仓库盲拍'||[3,5].includes(i.type)&&String(i.data?.custom_id||'').startsWith('t:')&&String(i.data.custom_id).split(':')[3]?.startsWith('auction');}
function parts(i){
 const guild=i.guild_id,id=i.member?.user?.id,channel=i.channel_id;
 if(!validId(guild)||!validId(id)||!validId(channel)||i.member.user.bot)throw Error('请在服务器频道打开自己的仓库盲拍。');
 if(i.type===2&&auctionInteraction(i))return {guild,id,channel,action:'auction'};
 const p=String(i.data?.custom_id||'').split(':');
 if(p.length!==4||p[1]!==guild)throw Error('竞拍面板已失效，请重新打开。');
 const action=p[3],menu=/^auction(?:$|Rules$|Catalog$)/.test(action),start=/^auctionStart~[a-f0-9]{16}~(?:sophie|gabriella|viktor)$/.test(action),offer=/^auctionOffer~[a-f0-9]{16}~[1-5]$/.test(action),leave=/^auctionLeave~[a-f0-9]{16}~[1-5]$/.test(action),bid=/^auctionBid~[a-f0-9]{16}~[1-5](?:~(?:0|[1-9][0-9]?|1[0-9]{2}|200))?$/.test(action);
 if(!menu&&!start&&!offer&&!leave&&!bid||i.type===5&&(!bid||action.split('~').length!==3)||i.type===3&&bid&&action.split('~').length!==4)throw Error('无效竞拍操作，请刷新。');
 if(i.type===3&&p[2]==='any'&&action==='auction')return {guild,id,channel,action,publicEntry:true};
 if(p[2]!==id||i.type===3&&!(Number(i.message?.flags)&64))throw Error('请从本人私密竞拍面板操作。');
 if(i.type===5&&i.message&&!(Number(i.message.flags)&64))throw Error('请从本人私密竞拍面板操作。');
 return {guild,id,channel,action};
}
function modalBid(i){
 const fields=i.data?.components?.flatMap(r=>r.components||[])||[],input=fields.filter(x=>x.custom_id==='bid');
 const raw=input.length===1?String(input[0].value??'').trim():'';
 if(!/^(?:0|[1-9][0-9]?|1[0-9]{2}|200)$/.test(raw))throw Error('报价须为0至200的整数，0表示本轮不出价。');return Number(raw);
}
export function immediateAuctionReply(i){
 if(!auctionInteraction(i))return null;
 try{
  const p=parts(i);
  if(i.type===5)modalBid(i);
  if(p.action.startsWith('auctionOffer~'))return {type:9,data:{custom_id:`t:${p.guild}:${p.id}:${p.action.replace('auctionOffer','auctionBid')}`,title:'提交本轮暗标',components:[row({type:4,custom_id:'bid',style:1,label:'本轮报价（0至200币，0表示不出价）',placeholder:'例如 125',required:true,min_length:1,max_length:3})]}};
  return null;
 }catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
}
export function auctionDeferredReply(i){
 if(!auctionInteraction(i))return null;const p=parts(i);
 return (i.type===3&&!p.publicEntry||i.type===5&&i.message)?{type:6}:{type:5,data:{flags:64}};
}
const nav=(g,id)=>row(button(g,id,'auction','刷新 / 恢复'),button(g,id,'auctionRules','玩法规则'),button(g,id,'auctionCatalog','藏品图鉴'),button(g,id,'wallet','我的钱包'));
export function auctionRules(g,id){return {content:`📦 **仓库盲拍 · 酒馆单人改编**\n你与3位NPC竞拍同一仓库，每库8件藏品，共5轮。每轮重新报一个**总价**，不累加，可下调；0表示本轮不出价。NPC先封存报价，提交后同时公开当轮4人出价。\n\n**提前成交**：最高价须严格大于第二名的2 / 1.6 / 1.3 / 1.1倍（第1至4轮）。第5轮由最高正价成交；同价按开局公布的抽签顺序优先，全部为0则流拍。\n\n**钱包**：开始时扣10币入场费，暂存200币预算；报价不另扣款。你拍中时从暂存预算付成交价，藏品按本局固定价值自动结算；剩余预算退回。没拍中则退回200币，净支出10币。\n例：150币拍中总值180币的仓库，退50币预算并结算180币，净赚20币。最高付款含入场费210币，藏品结算后本版最多净亏178币。无分红，无动态市场价。\n\n**线索**：品质、轮廓、占格、类别和名称分别记录；未获知的信息保持隐藏。\n${Object.values(AUCTION_ROLES).map(r=>`• ${r.name}：${r.skill}`).join('\n')}\n\nNPC分别使用上述三种能力及不同出价风格，根据自己的已知线索估价。\n30分钟内可继续；主动离场或超时后，剩余各轮按不出价处理，下次恢复时完成结算并退回未用预算。每人每服同时一局，需在开局频道操作。\n\n这是参考《竞拍之王》的单人版本；200币预算、费用、NPC、物品、平局和结算规则均为酒馆改编。`,components:[nav(g,id)],allowed_mentions:mentions};}
export function auctionCatalog(g,id){return {content:`📚 **仓库盲拍 · 24件酒馆藏品**\n结算价在开局时固定，不受出价或输赢影响。每库独立生成8件，允许重复。\n品质抽取比例：白30% / 绿25% / 蓝20% / 紫13% / 金8% / 红4%；同品质4件等概率。\n\n${AUCTION_QUALITIES.map((q,i)=>`**${q}品质**\n${AUCTION_ITEMS.filter(x=>x.quality===i).map(x=>`${x.name} · ${x.width}×${x.height} · ${x.category} · ${x.value}币`).join('\n')}`).join('\n\n')}\n\n轮廓为宽×高，占格为两者相乘。可结合已知品质与轮廓对照估价。以上为原创酒馆物品和数值。`,components:[nav(g,id)],allowed_mentions:mentions};}
export function auctionData(data,g,id,notice=''){
 const s=data.session,active=s?.status==='active';let content=`📦 **酒馆仓库盲拍**\n单人 · 当前钱包 **${data.balance}币**`,components=[];
 if(s){
  content+=`\n${active?`第 **${s.round} / 5** 轮 · 已暂存200币预算`:'本局已结算'} · 能力：${AUCTION_ROLES[s.role].name}`;
  if(active){
   content+=`\n${AUCTION_ROLES[s.role].skill}\n${s.info.highCount===null?'':`紫、金、红品质合计 **${s.info.highCount}件**\n`}\n**你的仓库线索**\n${s.info.items.map((x,i)=>`${i+1}. ${x.quality===null?'品质未知':AUCTION_QUALITIES[x.quality]+'品质'} · ${x.width===null?'轮廓未知':`${x.width}×${x.height} / ${x.width*x.height}格`}`).join('\n')}`;
   content+=`\n\n${s.readOnly?`请回到 <#${s.channel}> 继续本局。`:`本轮暗标尚未提交；0表示本轮不出价。截止 <t:${Math.floor(s.expires/1000)}:R>`}`;
   const a=`${s.token}~${s.round}`;
   components.push(row(...[0,50,100,150].map(b=>button(g,id,`auctionBid~${a}~${b}`,b===0?'本轮不出价':`${b}币`,b?1:2,s.readOnly)),button(g,id,`auctionOffer~${a}`,'自填报价',1,s.readOnly)));
   components.push(row(button(g,id,`auctionLeave~${a}`,'放弃余下竞拍',4,s.readOnly)));
  }else{
   const r=s.result,won=r.winner===0;
   content+=`\n\n${r.winner===null?'本局流拍':`${names[r.winner]}以 **${r.price}币** 拍中`} · 仓库总值 **${r.total}币**\n退回预算 ${r.refund}币 · 藏品结算 ${r.resale}币\n本局净变化 **${r.net>0?'+':''}${r.net}币**（含10币入场费）\n结算后余额 ${r.balanceAfter}币${r.reason==='expired'?'\n本局已超时，余下各轮按不出价处理。':r.reason==='leave'?'\n已离场，余下各轮按不出价处理。':''}\n\n**开仓清单**\n${s.items.map((x,i)=>`${i+1}. ${x.name} · ${AUCTION_QUALITIES[x.quality]} · ${x.width*x.height}格 · ${x.value}币`).join('\n')}`;
   if(won)content+='\n藏品已自动折算为酒馆币。';
  }
  content+=`\n\n同价优先：${s.priority.map(i=>names[i]).join(' → ')}`;
  if(s.history.length)content+=`\n**已揭晓报价**（你 / 阿吉 / 老猫 / 掌柜）\n${s.history.map(h=>`第${h.round}轮：${h.bids.join(' / ')}${h.done?' · 成交判定':''}`).join('\n')}`;
 }
 if(!active){
  content+=`\n\n选择信息能力开启${s?'下一':'一'}局：**10币入场费 + 暂存200币预算**。未花掉的预算结算时退回。`;
  if(!s)content+=`\n${Object.values(AUCTION_ROLES).map(r=>`• ${r.name}：${r.skill}`).join('\n')}`;
  components.push(row(...Object.entries(AUCTION_ROLES).map(([role,r])=>button(g,id,`auctionStart~${data.offerToken}~${role}`,`${r.name} · 开局`,1,data.balance<AUCTION_BUDGET+AUCTION_FEE))));
 }
 if(notice)content+=`\n\n${notice}`;
 if(data.repeated)content+='\n重复操作已忽略，报价和钱包没有再次变动。';
 content+=`\n累计 ${data.stats.plays}局 · 净变化 ${data.stats.net>0?'+':''}${data.stats.net}币`;
 components.push(nav(g,id));
 return {content,embeds:[{color:0xb68b65,title:active?'仓库线索':'酒馆拍卖行',footer:{text:'参考《竞拍之王》的单人改编 · 全程仅使用酒馆币'}}],components,allowed_mentions:mentions};
}
export async function answerAuction(env,i){
 const p=parts(i);if(p.action==='auctionRules')return auctionRules(p.guild,p.id);if(p.action==='auctionCatalog')return auctionCatalog(p.guild,p.id);
 const base={guild:p.guild,id:p.id,channel:p.channel,name:i.member.nick||i.member.user.global_name||i.member.user.username||'来客'};
 const [action,token,value,last]=p.action.split('~');let data,notice='';
 try{
  if(action==='auctionStart')data=await tavernRequest(env,{...base,action,token,role:value});
  else if(action==='auctionBid')data=await tavernRequest(env,{...base,action,token,round:Number(value),bid:i.type===5?modalBid(i):Number(last)});
  else if(action==='auctionLeave')data=await tavernRequest(env,{...base,action,token,round:Number(value)});
  else data=await tavernRequest(env,{...base,action:'auctionView'});
 }catch(e){data=await tavernRequest(env,{...base,action:'auctionView'});notice=e.message;}
 const view=auctionData(data,p.guild,p.id,notice);
 if(data.session)try{view._mapScene={bytes:await renderAuctionImage(data.session,env),filename:'tavern-auction.png',mime:'image/png',description:'仓库盲拍：仅展示本人的已知线索；结束后展示开仓清单'};}catch{view.content+='\n配图暂未加载，以上文字线索和结算仍有效。';}
 return view;
}
