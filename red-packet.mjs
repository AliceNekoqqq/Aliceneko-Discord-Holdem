// Authority is an exact account ID, never a nickname or model decision.
export const RED_PACKET_OWNER='993451176282574878';
export const RED_PACKET_TTL=24*60*60*1000;
const idOk=s=>/^\d{1,20}$/.test(String(s||''));
export function parseRedPacket(message,botId){
 if(message?.author?.id!==RED_PACKET_OWNER||message.author.bot||!idOk(message.guild_id)||!idOk(message.channel_id)||!idOk(message.id))return null;
 if(!(message.mentions||[]).some(u=>u.id===botId)&&!String(message.content||'').includes(`<@${botId}>`)&&!String(message.content||'').includes(`<@!${botId}>`))return null;
 const text=String(message.content||'').replace(/```[\s\S]*?```/g,'').split('\n').filter(l=>!/^\s*>/.test(l)).join(' ').replace(/<@!?\d+>/g,'');
 if(!/(?:发|派|送)[^。！？]{0,50}红包/.test(text)||/(?:别|不要|不许|取消|停止|怎么|如何|如果|例如|比如)[^。！？]{0,50}(?:发|派|送)/.test(text))return null;
 const amounts=[...text.matchAll(/(?<![\d.\-])([0-9]+)(?:\s*)(?:元|币|酒馆币)/g)];
 const counts=[...text.matchAll(/(?:名额\s*([0-9]+)\s*个?|([0-9]+)\s*(?:个名额|人份|份|个))/g)].filter(m=>!/^\s*红包/.test(text.slice(m.index+m[0].length)));
 if(amounts.length!==1||counts.length!==1)return {error:'请写清总金额和名额，例如：发一个600元的拼手气红包，名额5个。金额使用整数酒馆币。'};
 const total=Number(amounts[0][1]),slots=Number(counts[0][1]||counts[0][2]);
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
 create(message,botId,now=Date.now()){
 const spec=parseRedPacket(message,botId);if(!spec)return null;if(spec.error)return spec;
 return this.host.storage.transactionSync(()=>{const prior=this.one('SELECT id FROM tavern_red_packets WHERE id=?',message.id);if(!prior)this.sql.exec('INSERT INTO tavern_red_packets VALUES(?,?,?,?,?,?,?,?,?,NULL)',message.id,message.guild_id,message.channel_id,spec.total,spec.slots,spec.mode,JSON.stringify(splitPacket(spec.total,spec.slots,spec.mode)),now,now+RED_PACKET_TTL);return this.view(message.id);});
 }
 bind(id,messageId){if(!idOk(messageId))throw Error('无效消息。');this.sql.exec('UPDATE tavern_red_packets SET message_id=COALESCE(message_id,?) WHERE id=?',messageId,id);return true;}
 claim(i,now=Date.now()){
 const id=String(i.data?.custom_id||'').split(':')[1],user=i.member?.user;
 if(i.type!==3||!idOk(user?.id)||user.bot)throw Error('红包只向服务器内的真人来客开放。');
 return this.host.storage.transactionSync(()=>{
 const p=this.view(id);if(i.guild_id!==p.guild||i.channel_id!==p.channel||p.message_id&&i.message?.id!==p.message_id)throw Error('请在红包原消息中领取。');
 const prior=p.claims.find(c=>c.user_id===user.id);if(prior)return {packet:p,amount:prior.amount,repeated:true};
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
export async function prepareRedPacket(env,message,botId){const spec=parseRedPacket(message,botId);if(!spec)return null;if(spec.error)return spec;try{return await packetRpc(env,message.guild_id,{action:'create',message,botId});}catch{return {error:'红包创建失败，请稍后重新 @ 我发送。'};}}
export async function finishRedPacket(env,i){let content;try{const answer=await packetRpc(env,i.guild_id,{action:'claim',interaction:i});content=answer.error||`${answer.repeated?'你已经领过这个红包':'红包已拆开'}：**${answer.amount} 酒馆币**，已存入钱包。`;}catch{content='红包服务暂时繁忙，请重试。';}await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(8000)});}
