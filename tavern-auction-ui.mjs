import {tavernRequest} from './tavern-service.mjs';
import {validId} from './tavern-catalog.mjs';
import {AUCTION_BUDGET,AUCTION_MAX_BUDGET,AUCTION_TIERS,AUCTION_ROLES,AUCTION_QUALITIES} from './tavern-auction.mjs';
import {AUCTION_ITEMS,AUCTION_NPCS} from './tavern-auction-data.mjs';
import {renderAuctionImage,renderAuctionCatalogImage} from './tavern-auction-image.mjs';
import {AUCTION_RATE,auctionAmount as f} from './tavern-auction-currency.mjs';
import {currencyInteraction,immediateCurrencyReply,currencyDeferredReply,answerCurrency} from './tavern-auction-currency-ui.mjs';
const mentions={parse:[]},row=(...components)=>({type:1,components});
const button=(g,id,action,label,style=2,disabled=false)=>({type:2,custom_id:`t:${g}:${id}:${action}`,label,style,disabled});
const names=['你',...AUCTION_NPCS];
const tierPattern='(?:small|standard|high|collection)';
export const auctionCommandOption={type:1,name:'仓库盲拍',description:'单人对战三位NPC，以竞拍币参与五轮仓库暗标'};
export function auctionInteraction(i){return currencyInteraction(i)||i.type===2&&i.data?.name==='酒馆'&&i.data.options?.[0]?.name==='仓库盲拍'||[3,5].includes(i.type)&&String(i.data?.custom_id||'').startsWith('t:')&&String(i.data.custom_id).split(':')[3]?.startsWith('auction');}
function parts(i){
 const guild=i.guild_id,id=i.member?.user?.id,channel=i.channel_id;
 if(!validId(guild)||!validId(id)||!validId(channel)||i.member.user.bot)throw Error('请在服务器频道打开自己的仓库盲拍。');
 if(i.type===2&&auctionInteraction(i))return {guild,id,channel,action:'auction'};
 const p=String(i.data?.custom_id||'').split(':');
 if(p.length!==4||p[1]!==guild)throw Error('竞拍面板已失效，请重新打开。');
 const action=p[3],menu=/^auction(?:$|Rules$|Catalog$)/.test(action),start=new RegExp(`^auctionStart~[a-f0-9]{16}~(?:sophie|gabriella|viktor)(?:~${tierPattern})?$`).test(action),tier=new RegExp(`^auctionTier~${tierPattern}$`).test(action),offer=/^auctionOffer~[a-f0-9]{16}~[1-5](?:~(?:legacy|[1-9][0-9]{0,8}))?$/.test(action),leave=/^auctionLeave~[a-f0-9]{16}~[1-5]$/.test(action),bid=/^auctionBid~[a-f0-9]{16}~[1-5](?:~(?:0|[1-9][0-9]{0,8}))?$/.test(action);
 const reveal=/^auctionReveal~[a-f0-9]{16}~[0-8]~(?:next|all)$/.test(action);
 if(!menu&&!start&&!tier&&!offer&&!leave&&!bid&&!reveal||i.type===5&&(!bid||action.split('~').length!==3)||i.type===3&&bid&&(action.split('~').length!==4||Number(action.split('~')[3])>AUCTION_MAX_BUDGET))throw Error('无效竞拍操作，请刷新。');
 if(i.type===3&&p[2]==='any'&&action==='auction')return {guild,id,channel,action,publicEntry:true};
 if(p[2]!==id||i.type===3&&!(Number(i.message?.flags)&64))throw Error('请从本人私密竞拍面板操作。');
 if(i.type===5&&i.message&&!(Number(i.message.flags)&64))throw Error('请从本人私密竞拍面板操作。');
 return {guild,id,channel,action};
}
function modalBid(i){
 const fields=i.data?.components?.flatMap(r=>r.components||[])||[],input=fields.filter(x=>x.custom_id==='bid');
 const raw=input.length===1?String(input[0].value??'').trim():'';
 if(!/^(?:0|[1-9][0-9]{0,8})$/.test(raw)||Number(raw)>AUCTION_MAX_BUDGET)throw Error('报价须为本局预算内的整数，最高200,000,000；0表示本轮不出价。');return Number(raw);
}
export function immediateAuctionReply(i){
 if(currencyInteraction(i))return immediateCurrencyReply(i);if(!auctionInteraction(i))return null;
 try{
  const p=parts(i);if(i.type===5)modalBid(i);
  if(p.action.startsWith('auctionOffer~')){const [,token,round,limit]=p.action.split('~'),legacy=limit==='legacy',max=legacy?200:Math.min(Number(limit)||AUCTION_BUDGET,AUCTION_MAX_BUDGET);return {type:9,data:{custom_id:`t:${p.guild}:${p.id}:auctionBid~${token}~${round}`,title:'提交本轮暗标',components:[row({type:4,custom_id:'bid',style:1,label:`${legacy?'酒馆币':'竞拍币'}报价（0至${max}，不含逗号）`,placeholder:'整数总价；0表示本轮不出价',required:true,min_length:1,max_length:String(max).length})]}};}
  return null;
 }catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
}
export function auctionDeferredReply(i){
 if(currencyInteraction(i))return currencyDeferredReply(i);if(!auctionInteraction(i))return null;const p=parts(i);
 return (i.type===3&&!p.publicEntry||i.type===5&&i.message)?{type:6}:{type:5,data:{flags:64}};
}
const nav=(g,id)=>row(button(g,id,'auction','刷新 / 恢复'),button(g,id,'auctionExchange','竞拍币双向兑换',1),button(g,id,'auctionRules','玩法规则'),button(g,id,'auctionCatalog','藏品图鉴'),button(g,id,'wallet','酒馆钱包'));
export function auctionRules(g,id){return {content:`📦 **仓库盲拍 · 酒馆单人改编**\n你与3位NPC竞拍同一仓库，每库8件藏品，共5轮。每轮报一个**总价**，不累加，可下调；0表示本轮不出价。NPC先封存报价，提交后同时公开当轮4人出价。\n\n**提前成交**：最高价须严格大于第二名的2 / 1.6 / 1.3 / 1.1倍（第1至4轮）。第5轮由最高正价成交；同价按开局公布的抽签顺序优先，全部为0则流拍。\n\n**竞拍币钱包**：先用酒馆币兑换，**1酒馆币 ⇄ 100,000竞拍币**，双向免手续费。兑换按整数酒馆币计算，不足100,000的竞拍币保留。\n开局前可选小额/常规/高额/典藏档，预算500万/2000万/6000万/2亿，入场费25万/100万/300万/1000万；货值和NPC报价同比缩放。常规档暂存2,000万预算并扣100万费用；报价不另扣款。你拍中时从预算付成交价，藏品按本局固定价值自动折算竞拍币；剩余预算退回竞拍币钱包。没拍中则退回2,000万，净支出100万竞拍币。\n例：1,500万拍中总值1,800万的仓库，退500万预算并结算1,800万，净赚200万竞拍币，可换回20酒馆币。无分红，无动态市场价。\n\n**线索**：品质、轮廓、占格、类别和名称分别记录。\n${Object.values(AUCTION_ROLES).map(r=>`• ${r.name}：${r.skill}`).join('\n')}\nNPC分别使用上述能力及不同出价风格，根据自己的线索估价。\n\n30分钟内可继续；离场或超时后，余轮按不出价处理，下次恢复时结算并退预算。每人每服同时一局，在开局频道操作。\n升级前的旧局继续按原酒馆币金额结算，不自动兑换；新局全部使用竞拍币。\n这是参考《竞拍之王》的单人改编；预算、费用、汇率、NPC、物品、平局与结算均为酒馆规则。`,components:[nav(g,id)],allowed_mentions:mentions};}
export function auctionCatalog(g,id){return {content:`📚 **仓库盲拍 · 24件酒馆藏品**\n以下为**常规档竞拍币**价值；小额×0.25、高额×3、典藏×10，开局时固定；每库独立生成8件，允许重复。\n品质比例：白30% / 绿25% / 蓝20% / 紫13% / 金8% / 红4%；同品质4件等概率。\n\n${AUCTION_QUALITIES.map((q,i)=>`**${q}品质**\n${AUCTION_ITEMS.filter(x=>x.quality===i).map(x=>`${x.name} · ${x.width}×${x.height} · ${x.category} · ${f(x.value)}`).join('\n')}`).join('\n\n')}\n\n轮廓为宽×高，占格为两者相乘。可结合品质与轮廓对照估价。以上为原创酒馆物品和数值；旧版局价值为本页的1/${AUCTION_RATE}，单位酒馆币。`,components:[nav(g,id)],allowed_mentions:mentions};}
export function auctionData(data,g,id,notice='',selectedTier='standard'){
 const tier=AUCTION_TIERS[selectedTier]||AUCTION_TIERS.standard;
 const s=data.session,active=s?.status==='active',revealing=s?.reveal&&!s.reveal.complete,legacy=s?.currency==='tavern',unit=legacy?'酒馆币':'竞拍币';let content=`📦 **酒馆仓库盲拍**\n可用竞拍币 **${data.balance===null?'开仓后显示':f(data.balance)}** · 酒馆币 **${f(data.tavernBalance)}**`,components=[];
 if(s){
  content+=`\n${active?`第 **${s.round} / 5** 轮 · 已暂存${f(s.budget)}${unit}`:'本局已结算'} · 能力：${AUCTION_ROLES[s.role].name}`;
  if(legacy)content+='\n这是升级前的旧局，以下金额仍为酒馆币。';
  else content+=`\n${AUCTION_TIERS[s.tier]?.name||'常规'}档 · 入场费 ${f(s.fee)}竞拍币 · ${f(s.fee/AUCTION_RATE)}酒馆币等值`;
  if(active){
   content+=`\n${AUCTION_ROLES[s.role].skill}\n${s.info.highCount===null?'':`紫、金、红品质合计 **${s.info.highCount}件**\n`}\n**你的仓库线索**\n${s.info.items.map((x,i)=>`${i+1}. ${x.quality===null?'品质未知':AUCTION_QUALITIES[x.quality]+'品质'} · ${x.width===null?'轮廓未知':`${x.width}×${x.height} / ${x.width*x.height}格`}`).join('\n')}`;
   content+=`\n\n${s.readOnly?`请回到 <#${s.channel}> 继续本局。`:`本轮报价单位：${unit}，0表示不出价。截止 <t:${Math.floor(s.expires/1000)}:R>`}`;
   const a=`${s.token}~${s.round}`;
   const estimate=s.estimate,reference=Number.isSafeInteger(estimate)?estimate:0;
   content+=`\n线索估值约 **${f(reference)}${unit}**，参考价不保证盈利。`;
   const offers=[[0,'本轮不出价'],[Math.min(s.budget,Math.floor(reference*0.8)),'估值80%'],[Math.min(s.budget,Math.floor(reference*0.95)),'估值95%'],[s.budget,'预算上限']];
   components.push(row(...offers.map(([b,label])=>button(g,id,`auctionBid~${a}~${b}`,b?`${label} · ${legacy?f(b):f(b/10000)+'万'}`:label,b?1:2,s.readOnly)),button(g,id,`auctionOffer~${a}~${legacy?'legacy':s.budget}`,'自填报价',1,s.readOnly)));
   components.push(row(button(g,id,`auctionLeave~${a}`,'放弃余下竞拍',4,s.readOnly)));
  }else if(revealing){
   const r=s.result,shown=s.items.filter(Boolean),subtotal=shown.reduce((n,x)=>n+x.value,0);
   content+=`\n\n${r.winner===null?'本局流拍':`${names[r.winner]}以 **${f(r.price)}${unit}** 拍中`}\n**开仓揭晓 ${s.reveal.count} / ${s.reveal.total}** · 已揭晓总值 **${f(subtotal)}${unit}**\n仓库格位保持不变，逐件揭晓图片、品质与真实价格。资金已结算，翻牌不再扣币。\n${shown.length?s.items.map((x,j)=>x?`${j+1}. ${x.name} · ${AUCTION_QUALITIES[x.quality]} · ${f(x.value)}${unit}`:null).filter(Boolean).join('\n'):'藏品仍在迷雾中。'}`;
   if(s.readOnly)content+=`\n请回到 <#${s.channel}> 继续开仓。`;
   components.push(row(button(g,id,`auctionReveal~${s.token}~${s.reveal.count}~next`,'揭晓下一件',1,s.readOnly),button(g,id,`auctionReveal~${s.token}~${s.reveal.count}~all`,'全部揭晓',2,s.readOnly)));
  }else{
   const r=s.result,won=r.winner===0;
   content+=`\n\n${r.winner===null?'本局流拍':`${names[r.winner]}以 **${f(r.price)}${unit}** 拍中`} · 仓库总值 **${f(r.total)}${unit}**\n退回预算 ${f(r.refund)} · 藏品结算 ${f(r.resale)}\n本局净变化 **${r.net>0?'+':''}${f(r.net)}${unit}**（含${f(s.fee)}入场费）${legacy?'':`\n折合酒馆币 **${r.net>0?'+':''}${f(r.net/AUCTION_RATE)}**`}\n结算后余额 ${f(r.balanceAfter)}${unit}${r.reason==='expired'?'\n本局已超时，余下各轮按不出价处理。':r.reason==='leave'?'\n已离场，余下各轮按不出价处理。':''}\n\n**开仓清单**（${unit}）\n${s.items.map((x,i)=>`${i+1}. ${x.name} · ${AUCTION_QUALITIES[x.quality]} · ${x.width*x.height}格 · ${f(x.value)}`).join('\n')}`;
   if(won)content+=`\n藏品已自动折算为${unit}。`;
  }
  content+=`\n\n同价优先：${s.priority.map(i=>names[i]).join(' → ')}`;
  if(s.history.length)content+=`\n**已揭晓报价**（${unit}：你 / 阿吉 / 老猫 / 掌柜）\n${s.history.map(h=>`第${h.round}轮：${h.bids.map(f).join(' / ')}${h.done?' · 成交判定':''}`).join('\n')}`;
 }
 if(!active&&!revealing){
  content+=`\n\n选择能力开启${s?'下一':'一'}局：**${tier.name}档：${f(tier.fee)}入场费 + 暂存${f(tier.budget)}竞拍币预算**。未用预算退回竞拍币钱包。`;
  if(!s)content+=`\n${Object.values(AUCTION_ROLES).map(r=>`• ${r.name}：${r.skill}`).join('\n')}`;
  if(data.balance<tier.budget+tier.fee)content+='\n竞拍币不足，点“竞拍币双向兑换”先换入。';
  components.push(row(...Object.entries(AUCTION_ROLES).map(([role,r])=>button(g,id,`auctionStart~${data.offerToken}~${role}~${selectedTier}`,`${r.name} · 开局`,1,data.balance<tier.budget+tier.fee))));
  content+=`\n本档需 ${f((tier.budget+tier.fee)/AUCTION_RATE)}酒馆币等值；最多支出预算与入场费之和。货值和NPC报价随档位同比缩放。`;
  components.push(row(...Object.entries(AUCTION_TIERS).map(([key,t])=>button(g,id,`auctionTier~${key}`,`${t.name} ${t.budget/10000}万`,key===selectedTier?1:2))));
 }
 if(notice)content+=`\n\n${notice}`;if(data.repeated)content+='\n重复操作已忽略，报价和钱包没有再次变动。';
 content+=`\n累计 ${data.stats.plays}局 · 新版净变化 ${data.stats.net>0?'+':''}${f(data.stats.net)}竞拍币${data.stats.legacyNet?` · 旧版净变化 ${f(data.stats.legacyNet)}酒馆币`:''}`;
 components.push(nav(g,id));
 return {content,embeds:[{color:0xb68b65,title:active?'仓库线索':'酒馆拍卖行',footer:{text:'单人改编 · 1酒馆币 ⇄ 100,000竞拍币 · 固定汇率双向兑换'}}],components,allowed_mentions:mentions};
}
export async function answerAuction(env,i){
 if(currencyInteraction(i))return answerCurrency(env,i);
 const p=parts(i);if(p.action==='auctionRules')return auctionRules(p.guild,p.id);
 if(p.action==='auctionCatalog'){
  const view=auctionCatalog(p.guild,p.id);try{view._mapScene={bytes:await renderAuctionCatalogImage(env),filename:'tavern-auction-catalog.png',mime:'image/png',description:'24件酒馆藏品配图与常规档价值'};}catch{view.content+='\n藏品配图暂未加载，图鉴文字仍有效。';}return view;
 }
 const base={guild:p.guild,id:p.id,channel:p.channel,name:i.member.nick||i.member.user.global_name||i.member.user.username||'来客'};
 const [action,token,value,last]=p.action.split('~');let data,notice='';
 try{
  if(action==='auctionStart')data=await tavernRequest(env,{...base,action,token,role:value,tier:last||'standard',presentation:'warehouse'});
  else if(action==='auctionBid')data=await tavernRequest(env,{...base,action,token,round:Number(value),bid:i.type===5?modalBid(i):Number(last)});
  else if(action==='auctionLeave')data=await tavernRequest(env,{...base,action,token,round:Number(value)});
  else if(action==='auctionReveal')data=await tavernRequest(env,{...base,action,token,step:Number(value),all:last==='all'});
  else data=await tavernRequest(env,{...base,action:'auctionView'});
 }catch(e){data=await tavernRequest(env,{...base,action:'auctionView'});notice=e.message;}
 if(data.repeated&&data.session?.status==='settled'){
  const previous=data.session,current=await tavernRequest(env,{...base,action:'auctionView'});
  if(current.session&&current.session.token!==previous.token){
   const r=previous.result,unit=previous.currency==='tavern'?'酒馆币':'竞拍币';
   notice=previous.reveal&&!previous.reveal.complete?`上一局竞拍已结算，开仓进度${previous.reveal.count}/8；本次没有重复结算。已恢复当前竞拍。`:`上一局已结算：净变化 ${r.net>0?'+':''}${f(r.net)}${unit}，结算后余额 ${f(r.balanceAfter)}${unit}。本次没有重复结算；已恢复${current.session.status==='active'?'当前进行中的竞拍':'最新一局的收据'}。`;
   data=current;
  }
 }
 const view=auctionData(data,p.guild,p.id,notice,action==='auctionTier'?token:'standard');
 if(data.session)try{view._mapScene={bytes:await renderAuctionImage(data.session,env),filename:'tavern-auction.png',mime:'image/png',description:'仓库盲拍：仅展示本人的已知线索；结束后展示开仓清单'};}catch{view.content+='\n配图暂未加载，以上文字线索和结算仍有效。';}
 return view;
}
