import {secureIndex} from './red-packet.mjs';
import {getArtUrl} from './tavern-art.mjs';
import {renderWeddingHall} from './marriage-image.mjs';

export const MARRIAGE_COPY=Object.freeze([
  '掌柜把堂前灯笼一盏盏点亮，{groom} 和 {bride} 并肩入席，今夜的喜气先把整间小酒馆暖了起来。',
  '红绸轻轻一落，{groom} 与 {bride} 在满堂祝福里相视而立；掌柜举起茶盏，替这场喜事添个好彩头。',
  '听说今天有喜事，桌上的瓜子都嗑得比平时起劲：恭喜 {groom} 和 {bride}，礼堂的热闹刚刚好。',
  '一拜堂前灯火，二拜满席亲友——掌柜不抢吉时，只把最暖的一句祝福送给 {groom} 和 {bride}。',
  '合卺杯映着红烛光；愿 {groom} 与 {bride} 往后的日子有甜有笑，也常回小酒馆坐坐。',
  '红盖头下的新娘端庄，新郎衣襟也收拾得齐整；{groom} 与 {bride} 的大日子，连河边晚风都放轻了。',
  '今天礼堂不谈输赢，只比谁先说恭喜：{groom} 和 {bride} 站在一处，满堂掌声替他们把热闹撑足。',
  '掌柜递上喜糖，也递上一份不催不赶的祝愿：祝 {groom} 和 {bride} 每次并肩，都有好风景。',
  '从红绸到灯影，礼堂处处都是好兆头；{groom} 与 {bride} 今日携手入场，宾客们已准备好鼓掌。',
  '酒馆今晚加开一席喜宴——{groom}、{bride} 请收下掌柜的祝福，剩下的热闹就交给在场亲友。'
]);

const COMMAND=/^(?:请\s*)?(?:举行婚礼|举办婚礼|办婚礼|结婚|婚礼)(?=$|[\s，,。.!！<])/u;

function validId(id){return /^\d{1,20}$/.test(String(id||''));}
function mentionUserMap(message){return new Map((Array.isArray(message?.mentions)?message.mentions:[]).filter(user=>validId(user?.id)).map(user=>[String(user.id),user]));}
function safeName(user,id){
  const raw=user?.member?.nick||user?.nick||user?.global_name||user?.display_name||user?.username||user?.name||'来客';
  return String(raw).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,48)||`来客${id.slice(-4)}`;
}

export function isMarriageCommand(content,botId){
  const text=String(content||'').replace(new RegExp(`<@!?${String(botId||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}>`,'g'),' ').trimStart();
  return COMMAND.test(text);
}

export function weddingParty(message,botId){
  const users=mentionUserMap(message),seen=new Set(),people=[];
  for(const match of String(message?.content||'').matchAll(/<@!?(\d+)>/g)){
    const id=String(match[1]);
    if(id===String(botId||''))continue;
    if(seen.has(id)){if(people.length<2)return {error:'新郎和新娘需要是两位不同的来客，请检查前两个提及。'};continue;}
    const user=users.get(id);
    if(!user||user.bot)continue;
    seen.add(id);
    people.push({id,name:safeName(user,id)});
  }
  if(people.length<2)return {error:'举行婚礼请依次 @新郎 @新娘；后续提及的人也会出现在礼堂现场图里。'};
  if(people.length>100)return {error:'礼堂现场图最多绘制 100 位被提及的来客，请分场举行婚礼。'};
  return {groom:people[0],bride:people[1],people};
}

export function weddingReplyText(party,randomIndex=secureIndex){
  const copy=MARRIAGE_COPY[randomIndex(MARRIAGE_COPY.length)];
  if(typeof copy!=='string')throw Error('Invalid wedding copy selection');
  return copy.replaceAll('{groom}',`<@${party.groom.id}>`).replaceAll('{bride}',`<@${party.bride.id}>`);
}

function mentionListForAlt(people){
  const names=people.map(person=>person.name);
  let result=`小酒馆婚礼礼堂现场，共${people.length}位被提及的来客：`;
  for(let i=0;i<names.length;i++){
    const next=result+(i?', ':'')+names[i];
    if(next.length>930){result+='等其余来客';break;}
    result=next;
  }
  return result;
}

export async function sendWeddingReply(env,message,party,{fetcher=fetch,randomIndex=secureIndex}={}){
  const line=weddingReplyText(party,randomIndex),hall=await renderWeddingHall(party.people);
  const filename='wedding-hall.png';
  const payload={
    content:line,
    embeds:[
      {title:'小酒馆 · 喜结良缘',color:0xb72d36,image:{url:getArtUrl('wedding')}},
      {title:'礼堂现场',description:`${party.people.length} 位来客已经到场`,color:0xb72d36,image:{url:`attachment://${filename}`}}
    ],
    attachments:[{id:0,filename,description:mentionListForAlt(party.people)}],
    message_reference:{message_id:message.id,fail_if_not_exists:false},
    allowed_mentions:{parse:[]},
    nonce:message.id,
    enforce_nonce:true
  };
  const form=new FormData();
  form.set('payload_json',JSON.stringify(payload));
  form.set('files[0]',hall.png,filename);
  const response=await fetcher(`https://discord.com/api/v10/channels/${encodeURIComponent(String(message.channel_id))}/messages`,{
    method:'POST',headers:{Authorization:'Bot '+env.BOT_TOKEN},body:form,signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){const error=new Error('discord_reply_failed');error.status=response.status;throw error;}
  return {line,attendeeCount:party.people.length,width:hall.width,height:hall.height};
}

export async function sendWeddingError(env,message,content,fetcher=fetch){
  const response=await fetcher(`https://discord.com/api/v10/channels/${encodeURIComponent(String(message.channel_id))}/messages`,{
    method:'POST',headers:{Authorization:'Bot '+env.BOT_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({content,message_reference:{message_id:message.id,fail_if_not_exists:false},allowed_mentions:{parse:[]},nonce:message.id,enforce_nonce:true}),
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){const error=new Error('discord_reply_failed');error.status=response.status;throw error;}
}

export async function handleMarriageCommand(env,message,botId,options={}){
  if(!isMarriageCommand(message?.content,botId))return null;
  const party=weddingParty(message,botId);
  if(party.error){await sendWeddingError(env,message,party.error,options.fetcher||fetch);return {handled:true,error:true};}
  const result=await sendWeddingReply(env,message,party,options);
  return {handled:true,...result};
}
