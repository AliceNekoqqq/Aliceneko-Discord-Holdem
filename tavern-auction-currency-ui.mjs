import {tavernRequest} from './tavern-service.mjs';
import {validId} from './tavern-catalog.mjs';
import {AUCTION_RATE,EXCHANGE_MAX,auctionAmount as f} from './tavern-auction-currency.mjs';
const mentions={parse:[]},row=(...components)=>({type:1,components});
const button=(g,id,action,label,style=2,disabled=false)=>({type:2,custom_id:`t:${g}:${id}:${action}`,label,style,disabled});
export const auctionCurrencyCommandOption={type:1,name:'竞拍币',description:'查看竞拍币钱包，与酒馆币按1比10万双向兑换'};
export function currencyInteraction(i){return i.type===2&&i.data?.name==='酒馆'&&i.data.options?.[0]?.name==='竞拍币'||[3,5].includes(i.type)&&String(i.data?.custom_id||'').startsWith('t:')&&String(i.data.custom_id).split(':')[3]?.startsWith('auctionExchange');}
function parts(i){
 const guild=i.guild_id,id=i.member?.user?.id,channel=i.channel_id;
 if(!validId(guild)||!validId(id)||!validId(channel)||i.member.user.bot)throw Error('请在服务器频道打开自己的竞拍币兑换面板。');
 if(i.type===2&&currencyInteraction(i))return {guild,id,channel,action:'auctionExchange'};
 const p=String(i.data?.custom_id||'').split(':'),action=p[3]||'';
 if(p.length!==4||p[1]!==guild||!(i.type===3&&/^auctionExchange(?:$|(?:Buy|Sell)~[a-f0-9]{16}$)/.test(action)||i.type===5&&/^auctionExchangeDo~[a-f0-9]{16}~(?:buy|sell)$/.test(action)))throw Error('兑换面板已失效，请重新打开。');
 if(i.type===3&&p[2]==='any'&&action==='auctionExchange')return {guild,id,channel,action,publicEntry:true};
 if(p[2]!==id||i.message&&!(Number(i.message.flags)&64)||i.type===3&&!i.message)throw Error('请从本人私密兑换面板操作。');
 return {guild,id,channel,action};
}
function amount(i){const fields=i.data?.components?.flatMap(r=>r.components||[])||[],input=fields.filter(x=>x.custom_id==='amount'),raw=input.length===1?String(input[0].value??'').trim():'';if(!/^[1-9][0-9]{0,6}$/.test(raw)||Number(raw)>EXCHANGE_MAX)throw Error('请按酒馆币数量填写1至1,000,000的整数。');return Number(raw);}
export function immediateCurrencyReply(i){
 if(!currencyInteraction(i))return null;
 try{
  const p=parts(i);if(i.type===5)amount(i);
  const m=/^auctionExchange(Buy|Sell)~([a-f0-9]{16})$/.exec(p.action);
  if(m){const buy=m[1]==='Buy';return {type:9,data:{custom_id:`t:${p.guild}:${p.id}:auctionExchangeDo~${m[2]}~${buy?'buy':'sell'}`,title:buy?'酒馆币换入竞拍币':'竞拍币换回酒馆币',components:[row({type:4,custom_id:'amount',style:1,label:buy?'支付多少酒馆币？（1换10万竞拍币）':'换回多少酒馆币？（每币需10万竞拍币）',placeholder:'填写酒馆币数量，例如 210',required:true,min_length:1,max_length:7})]}};}
  return null;
 }catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}
}
export function currencyDeferredReply(i){if(!currencyInteraction(i))return null;const p=parts(i);return (i.type===3&&!p.publicEntry||i.type===5&&i.message)?{type:6}:{type:5,data:{flags:64}};}
export function currencyData(d,g,id,notice=''){
 const r=d.result,receipt=r?`\n\n**上次兑换收据**\n${r.direction==='buy'?`${f(r.tavernAmount)} 酒馆币 → ${f(r.auctionAmount)} 竞拍币`:`${f(r.auctionAmount)} 竞拍币 → ${f(r.tavernAmount)} 酒馆币`}\n兑换后：${f(r.tavernAfter)} 酒馆币 / ${f(r.auctionAfter)} 竞拍币${d.repeated?'\n本次兑换已完成，没有重复扣款。':''}`:'';
 return {content:`🪙 **竞拍币钱包 · 双向兑换**\n酒馆币余额：**${f(d.tavernBalance)}**\n可用竞拍币：**${f(d.auctionBalance)}**\n\n固定汇率：**1 酒馆币 ⇄ ${f(AUCTION_RATE)} 竞拍币**\n双向免手续费；按整数酒馆币数量兑换。\n目前可换回 ${f(Math.floor(d.auctionBalance/AUCTION_RATE))} 酒馆币，余下 ${f(d.auctionBalance%AUCTION_RATE)} 竞拍币保留，不取整扣除。\n竞拍中暂存的预算在结算后退回，不属于当前可兑换余额。${receipt}${notice?`\n\n${notice}`:''}\n\n**最近竞拍币流水**\n${d.ledger.map(x=>`${x.amount>=0?'+':''}${f(x.amount)} · ${x.note}`).join('\n')||'暂无流水。'}\n\n新局预算2,000万竞拍币，另收100万竞拍币入场费；首次可换入2,100万竞拍币开始。`,components:[row(button(g,id,`auctionExchangeBuy~${d.token}`,'酒馆币 → 竞拍币',1,d.tavernBalance<1),button(g,id,`auctionExchangeSell~${d.token}`,'竞拍币 → 酒馆币',1,d.auctionBalance<AUCTION_RATE)),row(button(g,id,'auctionExchange','刷新 / 恢复收据'),button(g,id,'auction','返回仓库盲拍'),button(g,id,'wallet','酒馆钱包'))],allowed_mentions:mentions};
}
export async function answerCurrency(env,i){
 const p=parts(i),base={guild:p.guild,id:p.id,channel:p.channel,name:i.member.nick||i.member.user.global_name||i.member.user.username||'来客'};let data,notice='';
 try{if(i.type===5){const [,token,direction]=p.action.split('~');data=await tavernRequest(env,{...base,action:'auctionExchangeConvert',token,direction,amount:amount(i)});}else data=await tavernRequest(env,{...base,action:'auctionExchangeView'});}
 catch(e){data=await tavernRequest(env,{...base,action:'auctionExchangeView'});notice=e.message;}
 return currencyData(data,p.guild,p.id,notice);
}
