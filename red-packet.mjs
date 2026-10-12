// Authority is an exact account ID, never a nickname or model decision.
export const RED_PACKET_OWNER='993451176282574878';
export const RED_PACKET_TTL=24*60*60*1000;
export const RED_PACKET_LINKED_ACCOUNTS=Object.freeze(['1402174864827219978','1360154014146363446']);
export const RED_PACKET_REPEAT_LINES=Object.freeze(["文小弟领了一次还想领？贪心！", "文小弟，换个小号就想再领？红包可认得你！", "文小弟，红包都进兜了，还想再伸一次手呀？", "文小弟，大小号轮流上场？一次就是一次哦！", "文小弟，刚领完就又来了？给别人留点手气嘛！", "文小弟，换件马甲也没用，这个红包你领过啦！"]);
const packetPerson=id=>RED_PACKET_LINKED_ACCOUNTS.includes(id)?RED_PACKET_LINKED_ACCOUNTS[0]:id;
const idOk=s=>/^\d{1,20}$/.test(String(s||''));
// Accept everyday phrasing, but never let a model infer or authorize currency.
const NUMBER='[+\\-−]?[0-9]+(?:[.][0-9]+)*|[零〇一二两三四五六七八九十百千万亿点]+';
const BOUNDARY='(?<![0-9.+\\-−零〇一二两三四五六七八九十百千万亿点])';
function integerValue(raw){
 if(/^[+\-−]?[0-9]+(?:[.][0-9]+)*$/.test(raw))return /^[+\-−]?[0-9]+$/.test(raw)?Number(raw.replace('−','-')):NaN;
 if(!raw||/[点亿]/.test(raw))return NaN;
 const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 if(!/[十百千万]/.test(raw))return Number([...raw].map(c=>digits[c]).join(''));
 let total=0,section=0,digit=0,lastUnit=10000;
 for(const c of raw){if(c in digits){digit=digits[c];continue;}const unit={十:10,百:100,千:1000,万:10000}[c];if(!unit)return NaN;
 if(unit===10000){total+=(section+digit||1)*unit;section=0;lastUnit=10000;}
 else {if(unit>=lastUnit)return NaN;section+=(digit||1)*unit;lastUnit=unit;}digit=0;}
 return total+section+digit;
}
function numberMatches(text,pattern){return [...text.matchAll(new RegExp(pattern,'dg'))].map(m=>{const group=m[1]!==undefined?1:2;return {raw:m[group],start:m.indices[group][0],end:m.indices[group][1],value:integerValue(m[group])}});}
export function redPacketIntent(message,botId){
 if(message?.author?.id!==RED_PACKET_OWNER||message.author.bot||!idOk(message.guild_id)||!idOk(message.channel_id)||!idOk(message.id))return false;
 if(!(message.mentions||[]).some(u=>u.id===botId)&&!String(message.content||'').includes(`<@${botId}>`)&&!String(message.content||'').includes(`<@!${botId}>`))return false;
 const text=String(message.content||'').normalize('NFKC').replace(/```[\s\S]*?```/g,'').split('\n').filter(l=>!/^\s*>/.test(l)).join(' ').replace(/<@!?[0-9]+>/g,'');
 if(!/(?:发|派|送|来|安排|整|弄|包)[^。!?！？]{0,80}红包/.test(text)||/(?:别|不要|不许|取消|停止|怎么|如何|如果|例如|比如)[^。!?！？]{0,80}(?:发|派|送|来|安排|整|弄|包)/.test(text))return false;
 return true;
}
export function validateExtractedPacket(message,botId,spec){
 if(!redPacketIntent(message,botId))return null;
 if(!spec||!Number.isSafeInteger(spec.total)||spec.total<1||spec.total>1000000||!Number.isSafeInteger(spec.slots)||spec.slots<1||spec.slots>100||spec.total<spec.slots||!['equal','random'].includes(spec.mode))return {error:'红包金额或名额不完整，请告诉我总额和领取人数。'};
 const text=String(message.content||'').normalize('NFKC').replace(/```[\s\S]*?```/g,'').split('\n').filter(l=>!/^\s*>/.test(l)).join(' ').replace(/<@!?[0-9]+>/g,'');
 const values=numberMatches(text,`${BOUNDARY}(${NUMBER})`);
 const evidence=(raw,value)=>typeof raw==='string'&&integerValue(raw)===value&&values.some(r=>r.raw===raw);
 if(!evidence(spec.totalEvidence,spec.total)||!evidence(spec.slotsEvidence,spec.slots))return {error:'红包金额或人数还不明确，请再写清总额和名额。'};
 return {total:spec.total,slots:spec.slots,mode:spec.mode};
}
export function decodePacketReply(raw){
 const text=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const data=JSON.parse(text);
 if(!data||typeof data.reply!=='string'||data.reply.length>2000||/totalEvidence|slotsEvidence|redPacketExtraction|"packet"\s*:/.test(data.reply)||!Object.hasOwn(data,'packet'))throw Error('invalid_red_packet_output');
 return {reply:data.reply,packet:data.packet};
}
export function parseRedPacket(message,botId){
 if(!redPacketIntent(message,botId))return null;
 const text=String(message.content||'').normalize('NFKC').replace(/```[\s\S]*?```/g,'').split('\n').filter(l=>!/^\s*>/.test(l)).join(' ').replace(/<@!?[0-9]+>/g,'');
 const n=`(${NUMBER})`;
 const counts=numberMatches(text,`(?:名额|人数|份数)\\s*(?:为|是|[:：])?\\s*${n}\\s*(?:个|人|份)?|${BOUNDARY}${n}\\s*(?:个\\s*(?:名额|人)|名额|人份|人|份)`);
 const generic=numberMatches(text,`(?:红包|[，,。.!！;；]|分成|分|共)\\s*${n}\\s*个(?!\\s*(?:的?红包|名额))`);
 const unique=rows=>[...new Map(rows.map(r=>[r.start,r])).values()];
 const slotsFound=unique([...counts,...generic]);
 const masked=text.split('');for(const r of slotsFound)for(let i=r.start;i<r.end;i++)masked[i]=' ';const amountText=masked.join('');
 const amounts=unique([
  ...numberMatches(amountText,`(?:总额|金额|红包)[:：,，\\s]*(?:为|是)?\\s*${n}`),
  ...numberMatches(amountText,`${BOUNDARY}${n}\\s*(?:酒馆币|金币|元|币|块(?:钱)?)`),
  ...numberMatches(amountText,`${BOUNDARY}${n}\\s*(?:的)?\\s*(?:拼手气|随机|均分|平均|普通)?\\s*红包`)
 ]);
 if(amounts.length!==1||slotsFound.length!==1)return {error:'红包金额或名额还不明确，请补全，例如：发个600的拼手气红包，5个名额。'};
 const total=amounts[0].value,slots=slotsFound[0].value;
 if(!Number.isSafeInteger(total)||total<1||total>1000000||!Number.isSafeInteger(slots)||slots<1||slots>100||total<slots)return {error:'红包总额须为1～1,000,000酒馆币，名额1～100个，且每人至少1币。'};
 return {total,slots,mode:/均分|平均|普通红包/.test(text)?'equal':'random'};
}
export function secureIndex(n){const a=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a)}while(a[0]>=limit);return a[0]%n;}
export function splitPacket(total,slots,mode,random=secureIndex){
 const parts=[];let left=total;
 for(let i=0;i<slots;i++){const remaining=slots-i;const amount=remaining===1?left:mode==='equal'?Math.floor(total/slots)+(i<total%slots?1:0):1+random(Math.min(left-(remaining-1),Math.max(1,Math.floor(2*left/remaining))));parts.push(amount);left-=amount;}
 return parts;
}
export class RedPackets{
 constructor(tavern){this.host=tavern;this.sql=tavern.sql;
 this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_red_packets (id TEXT PRIMARY KEY,guild TEXT NOT NULL,channel TEXT NOT NULL,total INTEGER NOT NULL,slots INTEGER NOT NULL,mode TEXT NOT NULL,parts TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,message_id TEXT)');
 this.sql.exec('CREATE TABLE IF NOT EXISTS tavern_red_claims (packet TEXT NOT NULL,user_id TEXT NOT NULL,amount INTEGER NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(packet,user_id))');}
 one(q,...a){return this.host.one(q,...a)}
 view(id){const p=this.one('SELECT * FROM tavern_red_packets WHERE id=?',id);if(!p)throw Error('红包不存在。');const claims=this.host.rows('SELECT user_id,amount,at FROM tavern_red_claims WHERE packet=? ORDER BY at,user_id',id);return {...p,claims};}
 create(message,botId,now=Date.now(),extracted=null){
 const spec=extracted?validateExtractedPacket(message,botId,extracted):parseRedPacket(message,botId);if(!spec)return null;if(spec.error)return spec;
 return this.host.storage.transactionSync(()=>{const prior=this.one('SELECT id FROM tavern_red_packets WHERE id=?',message.id);if(!prior)this.sql.exec('INSERT INTO tavern_red_packets VALUES(?,?,?,?,?,?,?,?,?,NULL)',message.id,message.guild_id,message.channel_id,spec.total,spec.slots,spec.mode,JSON.stringify(splitPacket(spec.total,spec.slots,spec.mode)),now,now+RED_PACKET_TTL);return this.view(message.id);});
 }
 bind(id,messageId){if(!idOk(messageId))throw Error('无效消息。');this.sql.exec('UPDATE tavern_red_packets SET message_id=COALESCE(message_id,?) WHERE id=?',messageId,id);return true;}
 claim(i,now=Date.now()){
 const id=String(i.data?.custom_id||'').split(':')[1],user=i.member?.user;
 if(i.type!==3||!idOk(user?.id)||user.bot)throw Error('红包只向服务器内的真人来客开放。');
 return this.host.storage.transactionSync(()=>{
 const p=this.view(id);if(i.guild_id!==p.guild||i.channel_id!==p.channel||p.message_id&&i.message?.id!==p.message_id)throw Error('请在红包原消息中领取。');
 const prior=p.claims.find(c=>packetPerson(c.user_id)===packetPerson(user.id));
 if(prior)return {packet:p,amount:prior.amount,repeated:true,...(RED_PACKET_LINKED_ACCOUNTS.includes(user.id)?{publicNotice:RED_PACKET_REPEAT_LINES[crypto.getRandomValues(new Uint32Array(1))[0]%RED_PACKET_REPEAT_LINES.length]}:{})};
 if(now>=p.expires)throw Error('这个红包已过期。');if(p.claims.length>=p.slots)throw Error('这个红包已领完。');
 const amount=JSON.parse(p.parts)[p.claims.length];this.host.member(user.id,i.member.nick||user.global_name||user.username,now,true);
 this.sql.exec('INSERT INTO tavern_red_claims VALUES(?,?,?,?)',id,user.id,amount,now);
 this.sql.exec('UPDATE tavern_members SET balance=balance+? WHERE id=?',amount,user.id);
 this.sql.exec('INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)',`red:${id}:${user.id}`,user.id,amount,'system_red_packet','开发者系统红包',now);
 return {packet:this.view(id),amount,repeated:false};});
 }
}
export function packetCard(p,now=Date.now()){
 const done=p.claims.length>=p.slots,expired=now>=p.expires;
 const used=p.claims.reduce((s,c)=>s+c.amount,0),best=done?Math.max(...p.claims.map(c=>c.amount)):null;
 return {embeds:[{title:`🧧 ${p.mode==='equal'?'均分':'拼手气'}红包 · ${p.total.toLocaleString('en-US')} 酒馆币`,color:0xb72d36,description:`${done?'已领完':expired?'已过期':'点击下方按钮拆红包'} · ${p.claims.length}/${p.slots} 人已领取\n已领取 ${used} 币 · 剩余 ${p.total-used} 币\n系统发放 · 不扣任何人的钱包\n有效期至 <t:${Math.floor(p.expires/1000)}:f>`,image:{url:'https://discord-holdem.aliceneko.workers.dev/art/red-packet/v1.jpg'},fields:p.claims.length?[{name:'领取记录',value:p.claims.slice(-15).map(c=>`<@${c.user_id}> · **${c.amount}** 币${c.amount===best?' 👑手气最佳':''}`).join('\n')+(p.claims.length>15?`\n共${p.claims.length}人，显示最近15人`:''),inline:false}]:[],footer:{text:'每人限领一次 · 金额单位为酒馆币'},timestamp:new Date(p.expires).toISOString()}],components:[{type:1,components:[{type:2,style:4,label:done?'已领完':expired?'已过期':'拆红包',custom_id:`rp:${p.id}`,disabled:done||expired}]}]};
}
export async function packetRpc(env,guild,body){const stub=env.TABLES.get(env.TABLES.idFromName(`tavern:${guild}`));const response=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'redPacket',...body})});if(!response.ok)throw Error('红包服务暂时不可用。');return response.json();}
export async function prepareRedPacket(env,message,botId,extracted=null){const spec=extracted?validateExtractedPacket(message,botId,extracted):parseRedPacket(message,botId);if(!spec)return null;if(spec.error)return spec;try{return await packetRpc(env,message.guild_id,{action:'create',message,botId,extracted});}catch{return {error:'红包创建失败，请稍后重新 @ 我发送。'};}}
export async function finishRedPacket(env,i){
 let content,publicNotice;
 try{const answer=await packetRpc(env,i.guild_id,{action:'claim',interaction:i});
 publicNotice=answer.publicNotice;
 content=answer.error||(publicNotice?'这个红包你已经领过了，大小号共用一次领取机会。':`${answer.repeated?'你已经领过这个红包':'红包已拆开'}：**${answer.amount} 酒馆币**，已存入钱包。`);
 }catch{content='红包服务暂时繁忙，请重试。';}
 const webhook=`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}`;
 await fetch(`${webhook}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(8000)});
 if(publicNotice)await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:publicNotice,flags:0,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(8000)});
}
