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

export const WESTERN_MARRIAGE_COPY=Object.freeze([
  '花拱门下，{groom} 与 {bride} 并肩许下约定；掌柜把祝福斟进酒杯，愿往后的每一天都温柔明亮。',
  '白纱映着琥珀灯火，{groom} 和 {bride} 在亲友的掌声里交换戒指，小酒馆今晚也像被幸福点亮了。',
  '掌柜替花束理好缎带，见证 {groom} 与 {bride} 从今天起携手同行；愿日常有花香，也有热汤。',
  '河风轻轻经过礼堂，花瓣落在红木地板上。恭喜 {groom} 和 {bride}，把喜欢写成了长长久久。',
  '一束鲜花、一枚戒指、满堂笑声——{groom} 与 {bride} 的婚礼刚刚好，连灯笼都亮得格外温柔。',
  '白色头纱掠过花拱门，{groom} 向 {bride} 伸出手；掌柜说，最好的誓言就是以后也常常并肩。',
  '今天不拼酒量，只比谁的祝福更真诚：愿 {groom} 和 {bride} 往后的每一程，都有人牵手同行。',
  '礼堂的花与灯都为 {groom}、{bride} 留下了位置。掌柜举杯祝愿：相爱有回应，归来有热饭。',
  '从交换戒指到举杯庆贺，{groom} 与 {bride} 把这一晚过成了好故事；小酒馆会替他们记住掌声。',
  '花束交到手中，祝福也送到心里。恭喜 {groom} 和 {bride} 礼成，愿未来明亮，笑声常在。'
]);

export const WEDDING_TYPES=Object.freeze(['chinese','western']);
const GUEST_OPTIONS=Array.from({length:8},(_,index)=>({
  type:6,name:`宾客${index+1}`,description:'选择一位到场宾客',required:false
}));
export const marriageCommand={
  name:'结婚',description:'为两位来客举办小酒馆婚礼',type:1,integration_types:[0],contexts:[0],
  options:[
    {type:6,name:'新郎',description:'选择新郎',required:true},
    {type:6,name:'新娘',description:'选择新娘',required:true},
    {type:3,name:'婚礼类型',description:'选择中式或西式婚礼',required:false,choices:[
      {name:'中式婚礼',value:'chinese'},
      {name:'西式婚礼',value:'western'}
    ]},
    ...GUEST_OPTIONS
  ]
};

function validId(id){return /^\d{1,20}$/.test(String(id||''));}
function safeName(user,member,id){
  const raw=member?.nick||user?.global_name||user?.username||user?.display_name||'来客';
  return String(raw).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,48)||`来客${id.slice(-4)}`;
}

export function weddingPartyFromInteraction(interaction){
  const options=Array.isArray(interaction?.data?.options)?interaction.data.options:[];
  const byName=new Map(options.map(option=>[option.name,String(option.value||'')]));
  const resolved=interaction?.data?.resolved||{};
  const users=resolved.users||{},members=resolved.members||{};
  const pick=(name,required=false)=>{
    const id=byName.get(name)||'';
    if(!validId(id))return required?{error:`请在 /结婚 的「${name}」栏选择一位成员。`}:null;
    const user=users[id]||{};
    if(user.bot)return {error:'新郎、新娘和宾客都需要选择真人账号。'};
    return {id,name:safeName(user,members[id],id)};
  };
  const groom=pick('新郎',true);if(groom?.error)return groom;
  const bride=pick('新娘',true);if(bride?.error)return bride;
  if(groom.id===bride.id)return {error:'新郎和新娘需要是两位不同的成员。'};
  const type=byName.get('婚礼类型')||'chinese';
  if(!WEDDING_TYPES.includes(type))return {error:'请选择有效的婚礼类型。'};
  const people=[groom,bride],seen=new Set(people.map(person=>person.id));
  for(let n=1;n<=GUEST_OPTIONS.length;n++){
    if(!byName.has(`宾客${n}`))continue;
    const guest=pick(`宾客${n}`);if(guest?.error)return guest;
    if(guest&&!seen.has(guest.id)){seen.add(guest.id);people.push(guest);}
  }
  return {groom,bride,people,type};
}

export function weddingReplyText(party,randomIndex=secureIndex,type=party.type||'chinese'){
  const pool=type==='western'?WESTERN_MARRIAGE_COPY:type==='chinese'?MARRIAGE_COPY:null;
  if(!pool)throw Error('Invalid wedding type');
  const copy=pool[randomIndex(pool.length)];
  if(typeof copy!=='string')throw Error('Invalid wedding copy selection');
  return copy.replaceAll('{groom}',`<@${party.groom.id}>`).replaceAll('{bride}',`<@${party.bride.id}>`);
}

function mentionListForAlt(people){
  const names=people.map(person=>person.name);
  let result=`小酒馆婚礼礼堂现场，共${people.length}位来客：`;
  for(let i=0;i<names.length;i++){
    const next=result+(i?', ':'')+names[i];
    if(next.length>930){result+='等其余来客';break;}
    result=next;
  }
  return result;
}

function originalResponseUrl(env,interaction){
  return `https://discord.com/api/v10/webhooks/${encodeURIComponent(String(env.DISCORD_APPLICATION_ID))}/${encodeURIComponent(String(interaction.token))}/messages/@original`;
}

export async function sendWeddingReply(env,interaction,party,{fetcher=fetch,randomIndex=secureIndex}={}){
  const type=party.type||'chinese';
  const line=weddingReplyText(party,randomIndex,type),hall=await renderWeddingHall(party.people,type);
  const filename='wedding-hall.png';
  const isWestern=type==='western';
  const payload={
    content:line,
    embeds:[
      {title:isWestern?'小酒馆 · 西式婚礼':'小酒馆 · 中式婚礼',color:0xb72d36,image:{url:getArtUrl(isWestern?'wedding-western':'wedding')}},
      {title:isWestern?'西式礼堂现场':'中式礼堂现场',description:`${party.people.length} 位来客已经到场`,color:0xb72d36,image:{url:`attachment://${filename}`}}
    ],
    attachments:[{id:0,filename,description:`${isWestern?'西式':'中式'}${mentionListForAlt(party.people)}`}],
    allowed_mentions:{parse:[]}
  };
  const form=new FormData();
  form.set('payload_json',JSON.stringify(payload));
  form.set('files[0]',hall.png,filename);
  const response=await fetcher(originalResponseUrl(env,interaction),{
    method:'PATCH',body:form,signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){const error=new Error('discord_reply_failed');error.status=response.status;throw error;}
  return {line,attendeeCount:party.people.length,width:hall.width,height:hall.height,type};
}

export async function sendWeddingError(env,interaction,content,fetcher=fetch){
  const response=await fetcher(originalResponseUrl(env,interaction),{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content,embeds:[],attachments:[],allowed_mentions:{parse:[]}}),
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){const error=new Error('discord_reply_failed');error.status=response.status;throw error;}
}

export async function completeMarriageInteraction(env,interaction,options={}){
  const party=weddingPartyFromInteraction(interaction);
  if(party.error){await sendWeddingError(env,interaction,party.error,options.fetcher||fetch);return {handled:true,error:true};}
  try{
    const result=await sendWeddingReply(env,interaction,party,options);
    return {handled:true,...result};
  }catch(error){
    if(error.status)try{await sendWeddingError(env,interaction,'礼堂图片暂时没能送出，请稍后再试。',options.fetcher||fetch);}catch{}
    throw error;
  }
}
