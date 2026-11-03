import {tavernRequest} from './tavern-service.mjs';
import {AUCTION_QUALITIES,AUCTION_TIERS} from './tavern-auction.mjs';
import {auctionAmount as f} from './tavern-auction-currency.mjs';
import {renderAuctionInventoryImage} from './tavern-auction-image.mjs';
const row=(...components)=>({type:1,components}),mentions={parse:[]};
const button=(g,id,action,label,style=2,disabled=false)=>({type:2,custom_id:`t:${g}:${id}:${action}`,label,style,disabled});
export const inventoryAction=action=>/^auction(?:Inventory~[0-9]{1,6}|(?:InvSelect|InvSell|InvBulk|InvCabinet|InvPlaceMenu)~[a-f0-9]{16}|InvConfirm~[a-f0-9]{16}|InvPlace~[a-f0-9]{16}~[0-5]|InvRemove~[a-f0-9]{16}~[0-5])$/.test(action);
const inventoryNav=(g,id)=>row(button(g,id,'auctionInventory~0','个人仓库'),button(g,id,'auction','返回竞拍'),button(g,id,'auctionExchange','竞拍币兑换'));
export function inventoryData(data,g,id,mode='inventory',notice=''){
 const b=(action,label,style=2,disabled=false)=>button(g,id,action,label,style,disabled),components=[];
 let content=`🧳 **个人藏品仓库**\n可用竞拍币 **${f(data.balance)}**\n已开仓 ${data.ownedCount??data.count}件 · 藏品总值 **${f(data.value)}竞拍币** · 展示中 ${data.displayed}/6件`;
 if(data.locked)content+=`\n还有 **${data.locked}件** 等待开仓揭晓。`;
 if(data.mode==='sale'){
  content+=`\n\n**确认出售 ${data.count}件**\n${data.quality===null?'按你选中的藏品出售':`范围：${data.quality===6?'全部品质闲置藏品（含红）':AUCTION_QUALITIES[data.quality]+'品质闲置藏品'}；本次最多500件`}\n将收到 **${f(data.total)}竞拍币**。展示中与未开仓的藏品不在按品质批卖范围。\n${data.items.map(x=>`• ${x.item.name} · ${AUCTION_QUALITIES[x.item.quality]} · ${f(x.item.value)}`).join('\n')}${data.count>data.items.length?`\n另有${data.count-data.items.length}件，已计入总价。`:''}\n确认有效至 <t:${Math.floor(data.expires/1000)}:R>`;
  components.push(row(b(`auctionInvConfirm~${data.token}`,`确认卖出${data.count}件`,4),b('auctionInventory~0','取消 / 返回仓库')));
 }else if(mode==='bulk'){
  content+='\n\n**按品质批量出售**\n选择品质后先核对件数和总价，再确认出售。每次最多500件，自动避开展示中和未开仓藏品。';
  components.push(row({type:3,custom_id:`t:${g}:${id}:auctionInvBulk~${data.token}`,placeholder:'选择要批卖的品质',min_values:1,max_values:1,options:[...AUCTION_QUALITIES.map((q,i)=>({label:`${q}品质闲置藏品`,value:String(i)})),{label:'全部闲置藏品（含红品质）',value:'6'}]}));
 }else if(mode==='cabinet'||mode==='place'){
  content=`🏛️ **我的藏品展示柜**\n已陈列 **${data.displayed}/6件** · 陈列总值 **${f(data.cabinet.reduce((s,x)=>s+x.item.value,0))}竞拍币**\n陈列只展示收藏，不产生额外收益。`;
  if(mode==='place'){
   const selected=data.items.find(x=>data.selected.includes(x.id));
   if(!selected||data.selected.length!==1){content+='\n请先在仓库中只选一件藏品。';}
   else{
    content+=`\n\n准备陈列：**${selected.item.name}**\n选择位置；替换时原藏品退回仓库。`;
    for(let r=0;r<2;r++)components.push(row(...Array.from({length:3},(_,j)=>{
     const slot=r*3+j,unit=data.cabinet.find(x=>x.display_slot===slot);
     return b(`auctionInvPlace~${data.token}~${slot}`,`${slot+1}号：${unit?'替换 '+unit.item.name:'空位'}`,1);
    })));
   }
  }else{
   content+='\n点击下方位置撤下藏品，藏品会回到仓库。';
   for(let r=0;r<2;r++)components.push(row(...Array.from({length:3},(_,j)=>{
    const slot=r*3+j,unit=data.cabinet.find(x=>x.display_slot===slot);
    return b(`auctionInvRemove~${data.token}~${slot}`,`${slot+1}号：${unit?unit.item.name:'空位'}`,2,!unit);
   })));
  }
 }else{
  content+=`\n\n第 **${data.page+1}/${data.pages}页** · 勾选后可单卖、多件卖或陈列\n${data.items.map((x,j)=>`${j+1}. **${x.item.name}** · ${AUCTION_QUALITIES[x.item.quality]} · ${x.item.width*x.item.height}格 · ${f(x.item.value)}${x.display_slot!==null?` · 展示${x.display_slot+1}号位`:''}\n　${AUCTION_TIERS[x.tier]?.name||'常规'}档拍得`).join('\n')||'仓库暂时空着，拍中并开仓后藏品会存到这里。'}`;
  if(data.items.length)components.push(row({type:3,custom_id:`t:${g}:${id}:auctionInvSelect~${data.token}`,placeholder:'选择藏品（可多选）',min_values:0,max_values:data.items.length,options:data.items.map((x,j)=>({label:`${j+1}. ${x.item.name}${x.display_slot!==null?' · 展示中':''}`,value:x.id,description:`${AUCTION_QUALITIES[x.item.quality]}品质 · ${f(x.item.value)}竞拍币`,default:data.selected.includes(x.id)}))}));
  const selected=data.items.filter(x=>data.selected.includes(x.id));
  content+=`\n已选 ${selected.length}件 · 合计 ${f(selected.reduce((s,x)=>s+x.item.value,0))}竞拍币`;
  components.push(row(b(`auctionInvSell~${data.token}`,'出售选中藏品',4,!selected.length),b(`auctionInvPlaceMenu~${data.token}`,'放入展示柜',1,selected.length!==1),b(`auctionInvBulk~${data.token}`,'按品质批卖'),b(`auctionInvCabinet~${data.token}`,'我的展示柜')));
  components.push(row(b(`auctionInventory~${Math.max(0,data.page-1)}`,'上一页',2,data.page===0),b(`auctionInventory~${data.page}`,'刷新本页'),b(`auctionInventory~${Math.min(data.pages-1,data.page+1)}`,'下一页',2,data.page===data.pages-1)));
  if(data.pending){
   if(data.pending.channel===data.channel)components.push(row(b(`auctionReveal~${data.pending.token}~${data.pending.opened}~next`,'继续开仓揭晓',1)));
   else content+=`\n前往 <#${data.pending.channel}> 完成待揭晓仓库。`;
  }
 }
 if(data.receipt)content+=`\n\n${data.repeated?'这批已出售，没有重复入账。':'出售完成。'}卖出 **${data.receipt.count}件**，收到 **${f(data.receipt.total)}竞拍币**。`;
 if(notice)content+=`\n\n${notice}`;
 // Keep every panel under Discord's five component rows, including the pending-reveal shortcut.
 components.push(inventoryNav(g,id));
 return {content,components,allowed_mentions:mentions,embeds:[{color:0xb68b65,title:mode==='cabinet'||mode==='place'?'藏品展示柜':'个人藏品仓库',footer:{text:'按拍得时价值卖出 · 展示不自动出售'}}]};
}
export async function answerInventory(env,i,p){
 const base={guild:p.guild,id:p.id,channel:p.channel,name:i.member.nick||i.member.user.global_name||i.member.user.username||'来客'};
 const [action,token,slot]=p.action.split('~');let data,mode='inventory',notice='';
 try{
  if(action==='auctionInventory')data=await tavernRequest(env,{...base,action:'auctionInventoryView',page:Number(token)});
  else if(action==='auctionInvSelect')data=await tavernRequest(env,{...base,action:'auctionInventorySelect',token,selected:i.data.values});
  else if(action==='auctionInvSell')data=await tavernRequest(env,{...base,action:'auctionInventoryQuote',token});
  else if(action==='auctionInvConfirm')data=await tavernRequest(env,{...base,action:'auctionInventorySell',token});
  else if(action==='auctionInvPlace'){data=await tavernRequest(env,{...base,action:'auctionInventoryPlace',token,slot:Number(slot)});mode='cabinet';notice=`已放入${Number(slot)+1}号位，原藏品已退回仓库。`;}
  else if(action==='auctionInvRemove'){data=await tavernRequest(env,{...base,action:'auctionInventoryRemove',token,slot:Number(slot)});mode='cabinet';}
  else if(action==='auctionInvBulk'&&i.data.component_type===3){
   if(!Array.isArray(i.data.values)||i.data.values.length!==1||!/^[0-6]$/.test(i.data.values[0]))throw Error('请选择有效品质。');
   data=await tavernRequest(env,{...base,action:'auctionInventoryQuote',token,quality:Number(i.data.values[0])});
  }else{
   // Read the token through the service even for menus, so forged/stale tokens cannot act on a selection.
   data=await tavernRequest(env,{...base,action:'auctionInventoryMenu',token});
   mode=action==='auctionInvBulk'?'bulk':action==='auctionInvCabinet'?'cabinet':'place';
  }
 }catch(e){notice=e.message;data=await tavernRequest(env,{...base,action:'auctionInventoryView',page:0});mode='inventory';}
 data.channel=p.channel;
 const view=inventoryData(data,p.guild,p.id,mode,notice);
 try{view._mapScene={bytes:await renderAuctionInventoryImage(data,env,mode==='cabinet'||mode==='place'),filename:'tavern-collection.png',mime:'image/png',description:mode==='cabinet'||mode==='place'?'本人的六格藏品展示柜':'本人的已开仓藏品与冻结价值'};}catch{view.content+='\n藏品配图暂未加载，文字与操作仍可使用。';}
 return view;
}
