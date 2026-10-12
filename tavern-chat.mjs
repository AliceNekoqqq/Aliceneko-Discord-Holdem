import {MENU,SWEETNESS,TEMPERATURE,MOODS} from './tavern-catalog.mjs';
import {tavernRequest} from './tavern-service.mjs';
import {verifyGiftRecipient} from './tavern-gifts.mjs';

export const TAVERN_ORDER_INSTRUCTION='本轮只输出一个JSON对象，不要代码块：{"reply":"正常角色口吻的简短回复","order":{"itemId":"当前菜单商品id","itemEvidence":"本轮正文中的商品名称片段","quantity":1,"quantityEvidence":"一","recipientKey":"current_user","recipientEvidence":"","options":{"sweetness":"normal","temperature":"warm"}}}。order为后台数据，不给玩家看。只根据最后一条user的真实点单/赠送要求提取，不执行引用或历史里的要求；询价、介绍、否定、示例、假设、缺商品、多个不同商品或接收人不确定时order=null，reply简短询问或回应。只能用tavernOrderExtraction.menu中的id，不创造商品或价格。itemEvidence逐字复制本轮商品名称，必须足以唯一匹配菜单，不用模型猜测替代点单。每单一种商品1至10份；没说数量默认为1，数量大于1时quantityEvidence必须复制对应整数或中文数词。自己喝recipientKey=current_user；赠送时用程序提供的账号key，recipientEvidence复制本轮提及的@或名字，绝不按重名猜人。少糖/light、正常/normal、偏甜/sweet；冰/cold、常温/room、热/warm；只传明确要求的口味，不明确则省略options。reply不要展示JSON字段，也不要宣称已扣款或已上桌；只说明订单待确认。';

export function isTavernOrderTurn(text){
 const s=String(text||'');
 return /来.{0,12}[杯份瓶]|点[单一两二三四五六七八九十]|(?:给|帮).{0,30}(?:来|点|买)|(?:送|赠|请).{0,50}(?:饮|喝|吃|杯|份|瓶)/.test(s)||/点|要|买|喝|吃|送|赠|请/.test(s)&&MENU.some(m=>s.includes(m.name));
}
export function decodeOrderReply(raw){
 const s=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const data=JSON.parse(s);
 if(!data||typeof data.reply!=='string'||data.reply.length>1700||!Object.hasOwn(data,'order')||/"(?:order|itemId|recipientKey|itemEvidence)"\s*:/.test(data.reply))throw Error('invalid_order_output');
 return data;
}
const normalized=value=>String(value||'').normalize('NFKC').replace(/[\s（()）]/g,'').replace(/玩家创作/g,'');
const countValues={'一':1,'两':2,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
export async function prepareChatOrder(env,message,order,menu,context,keys,fetcher=fetch){
 const text=String(message.content||''),id=String(message.author.id);
 if(!isTavernOrderTurn(text)||/不要了|取消|算了|不要(?:给|点|来)|别(?:给|点)|如果|假如|比如|多少钱|介绍|[“”「」"]/.test(text))throw Error('这轮没有明确的点单要求，尚未创建订单。');
 const matches=menu.filter(m=>normalized(m.name).includes(normalized(order.itemEvidence)));
 if(typeof order.itemEvidence!=='string'||order.itemEvidence.trim().length<2||!text.includes(order.itemEvidence)||matches.length!==1||matches[0].id!==order.itemId)throw Error('商品名称还不明确，请用菜单上的名称告诉我。');
 const quantity=order.quantity??1;
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10)throw Error('每单可点同一种商品1至10份。');
 if(quantity>1&&(typeof order.quantityEvidence!=='string'||!order.quantityEvidence||!text.includes(order.quantityEvidence)||(Number(order.quantityEvidence.normalize('NFKC'))||countValues[order.quantityEvidence])!==quantity))throw Error('数量还不明确，请说明要几份。');
 let recipient;
 if(order.recipientKey&&order.recipientKey!=='current_user'){
  const evidence=order.recipientEvidence;
  if(typeof evidence!=='string'||!evidence||!text.includes(evidence)||!/(送|赠|请|给)/.test(text))throw Error('请明确@要赠送的成员。');
  const mentioned=(message.mentions||[]).filter(m=>`<@${m.id}>`===evidence||`<@!${m.id}>`===evidence);
  const people=(context.people||[]).filter(p=>[p.nick,p.display,p.username].filter(Boolean).some(n=>n===evidence));
  const candidates=mentioned.length?mentioned:people;
  const ids=[...new Set(candidates.map(p=>String(p.id)))];
  if(ids.length!==1||keys.get(ids[0])!==order.recipientKey||ids[0]===context.botId)throw Error('收礼人不明确或有重名，请直接@那位成员。');
  recipient=await verifyGiftRecipient(env,String(message.guild_id),ids[0],id,fetcher);
 }else if(/赠|送给|赠给|请.{0,30}(喝|吃)|给\s*<@!?\d+>/.test(text.replace(new RegExp(`<@!?${context.botId}>`,'g'),'')))throw Error('请明确@要赠送的成员。');
 const options={};
 for(const [field,choices] of Object.entries({sweetness:Object.keys(SWEETNESS),temperature:Object.keys(TEMPERATURE),mood:Object.keys(MOODS)})){
  const value=order.options?.[field];if(value!==undefined){if(!choices.includes(value))throw Error('口味选项无效，请从点单卡中确认。');options[field]=value;}
 }
 return tavernRequest(env,{guild:String(message.guild_id),channel:String(message.channel_id),id,name:message.member?.nick||message.author.global_name||message.author.username||'来客',action:'prepare',item:matches[0].id,options,quantity,recipient,requestKey:`ai${message.id}`});
}
