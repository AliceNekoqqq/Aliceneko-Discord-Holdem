import {FLOWER_COPY} from './flower-copy.mjs';
import {validId,cleanText} from './tavern-catalog.mjs';
export const FLOWERS=Object.freeze([
 {id:'rose',name:'玫瑰花束',price:28,materials:'红玫瑰、配叶、包装纸'},
 {id:'sunflower',name:'向日葵花束',price:24,materials:'向日葵、配叶、包装纸'},
 {id:'gypsophila',name:'满天星花束',price:18,materials:'满天星、包装纸'},
 {id:'mixed',name:'混合花束',price:38,materials:'玫瑰、向日葵、满天星、配叶、包装纸'}
].map(x=>({...x,description:FLOWER_COPY.flowers.find(f=>f.id===x.id).description})));
export const FLOWER_OPTIONS=[{type:3,name:'商品',description:'要购买的花束；留空查看菜单',choices:FLOWERS.map(x=>({name:`${x.name} · ${x.price}币`,value:x.id}))},{type:4,name:'数量',description:'花束数量，默认1',min_value:1,max_value:10},{type:6,name:'赠给',description:'送给本服务器的成员；留空自己保留'},{type:3,name:'赠言',description:'随花束附上的话',max_length:160}];;
export class FlowerShop {
 constructor(t){this.t=t;this.sql=t.sql;
 this.sql.exec("CREATE TABLE IF NOT EXISTS flower_drafts(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,payer TEXT NOT NULL,channel TEXT NOT NULL,item TEXT NOT NULL,quantity INTEGER NOT NULL,price INTEGER NOT NULL,recipient TEXT NOT NULL,recipient_name TEXT NOT NULL,note TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL)");
 this.sql.exec("CREATE TABLE IF NOT EXISTS flower_orders(id TEXT PRIMARY KEY,payer TEXT NOT NULL,channel TEXT NOT NULL,item TEXT NOT NULL,quantity INTEGER NOT NULL,price INTEGER NOT NULL,recipient TEXT NOT NULL,recipient_name TEXT NOT NULL,note TEXT NOT NULL,status TEXT NOT NULL,at INTEGER NOT NULL)");
 this.sql.exec('CREATE INDEX IF NOT EXISTS flower_inbox ON flower_orders(recipient,status,at)');
 this.sql.exec('CREATE INDEX IF NOT EXISTS flower_drafts_pending ON flower_drafts(payer,status,expires)');
 this.sql.exec('CREATE TABLE IF NOT EXISTS flower_inventory(user_id TEXT NOT NULL,item TEXT NOT NULL,quantity INTEGER NOT NULL,PRIMARY KEY(user_id,item))');
 }
 prepare(p,now=Date.now()){
  const item=FLOWERS.find(x=>x.id===p.item),q=p.quantity??1;
  if(!item||!validId(p.id)||!validId(p.channel)||!Number.isSafeInteger(q)||q<1||q>10||!/^[-a-zA-Z0-9_]{1,80}$/.test(p.requestKey||''))throw Error('请选择菜单中的花束和1至10束的数量。');
  if(p.recipient&&(!validId(p.recipient.id)||p.recipient.bot))throw Error('请选择本服务器的真实成员。');
  const recipient=p.recipient?.id||p.id;const member=this.t.member(p.id,p.name,now);
  const prior=this.t.one('SELECT * FROM flower_drafts WHERE request_key=?',p.requestKey);
  if(prior){if(prior.payer!==p.id||prior.channel!==p.channel)throw Error('这不是你的订单。');return {...prior,balance:member.balance};}
  if(this.t.one("SELECT COUNT(*) n FROM flower_drafts WHERE payer=? AND status='pending' AND expires>?",p.id,now).n>=8)throw Error('请先处理已有的花束订单。');
  const d={id:crypto.randomUUID().replaceAll('-',''),request_key:p.requestKey,payer:p.id,channel:p.channel,item:item.id,quantity:q,price:item.price*q,recipient,recipient_name:cleanText(p.recipient?.name||member.name,32),note:cleanText(p.note||'',160),expires:now+180000,status:'pending'};
  this.sql.exec('INSERT INTO flower_drafts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',...Object.values(d));return {...d,balance:member.balance};
 }
 draft(id,owner,channel){const d=this.t.one('SELECT * FROM flower_drafts WHERE id=?',id);if(!d||d.payer!==owner||d.channel!==channel)throw Error('这不是你的花束订单。');return {...d,balance:this.t.member(owner).balance};}
 confirm(p,now=Date.now()){
  let answer;this.t.storage.transactionSync(()=>{
   const d=this.draft(p.draftId,p.id,p.channel);if(d.recipient!==p.expectedRecipient)throw Error('请重新核对收礼人。');
   const prior=this.t.one('SELECT * FROM flower_orders WHERE id=?',d.id);if(prior){answer={order:prior,balance:this.t.member(p.id).balance,repeated:true};return;}
   const item=FLOWERS.find(x=>x.id===d.item);if(d.status!=='pending'||d.expires<=now||!item||d.price!==item.price*d.quantity)throw Error('订单已过期或商品已变化，请重新选择。');
   const member=this.t.member(p.id);if(member.balance<d.price)throw Error(`余额不足，还差${d.price-member.balance}币。`);
   this.sql.exec('UPDATE tavern_members SET balance=balance-? WHERE id=?',d.price,p.id);
   this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`flower:${d.id}`,p.id,-d.price,'flower_order',`${item.name} ×${d.quantity}`,now);
   const status=d.recipient===p.id?'received':'waiting';
   this.sql.exec('INSERT INTO flower_orders VALUES(?,?,?,?,?,?,?,?,?,?,?)',d.id,d.payer,d.channel,d.item,d.quantity,d.price,d.recipient,d.recipient_name,d.note,status,now);
   if(status==='received')this.add(p.id,d.item,d.quantity);
   this.sql.exec("UPDATE flower_drafts SET status='confirmed' WHERE id=?",d.id);
   answer={order:this.t.one('SELECT * FROM flower_orders WHERE id=?',d.id),balance:member.balance-d.price,repeated:false};
  });return answer;
 }
 add(id,item,q){this.sql.exec('INSERT INTO flower_inventory VALUES(?,?,?) ON CONFLICT(user_id,item) DO UPDATE SET quantity=quantity+excluded.quantity',id,item,q);}
 claim(p){let order;this.t.storage.transactionSync(()=>{
  order=this.t.one('SELECT * FROM flower_orders WHERE id=?',p.orderId);if(!order||order.recipient!==p.id)throw Error('这不是送给你的礼物。');
  if(order.status==='received')return;if(order.status!=='waiting')throw Error('礼物状态已变化。');
  this.add(p.id,order.item,order.quantity);this.sql.exec("UPDATE flower_orders SET status='received' WHERE id=?",order.id);order={...order,status:'received'};
 });return order;}
 inbox(id){return {waiting:this.t.rows("SELECT * FROM flower_orders WHERE recipient=? AND status='waiting' ORDER BY at DESC LIMIT 10",id).map(o=>({...o,senderName:this.t.one('SELECT name FROM tavern_members WHERE id=?',o.payer)?.name||'居民'})),inventory:this.t.rows('SELECT item,quantity FROM flower_inventory WHERE user_id=?',id)};}
 dispatch(p){if(!validId(p.id))throw Error('请在服务器内使用。');
  if(p.action==='flowerPrepare')return this.prepare(p);
  if(p.action==='flowerConfirm')return this.confirm(p);
  if(p.action==='flowerDraft')return this.draft(p.draftId,p.id,p.channel);
  if(p.action==='flowerCancel'){const d=this.draft(p.draftId,p.id,p.channel);if(d.status==='confirmed')throw Error('订单已经完成，不能再取消。');this.sql.exec("UPDATE flower_drafts SET status='cancelled' WHERE id=? AND status='pending'",p.draftId);return {cancelled:true};}
  if(p.action==='flowerClaim')return this.claim(p);
  if(p.action==='flowerInbox')return this.inbox(p.id);
  if(p.action==='flowerContext')return {shop:'flower',inventory:this.inbox(p.id).inventory,waitingGifts:this.inbox(p.id).waiting.length};
  throw Error('未知花店操作。');
 }
}
