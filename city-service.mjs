// City state is isolated from game/table and tavern wallet objects.
export const CITY_VERSION='city.1';
export const validId=v=>/^\d{1,20}$/.test(String(v||''));
export const clean=(v,n=80)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[@<>`*_\[\]]/g,'').trim().slice(0,n);
export class CityService {
 constructor(storage){this.storage=storage;}
 async config(){return await this.storage.get('city:config')||{version:CITY_VERSION,places:{}};}
 async bind(place){
  if(!validId(place.channelId)||!clean(place.name)||!clean(place.street))throw Error('请填写有效的地点名称和街道。');
  return this.storage.transaction(async tx=>{
   const c=await tx.get('city:config')||{version:CITY_VERSION,places:{}};
   if(!c.places[place.channelId]&&Object.keys(c.places).length>=200)throw Error('当前城市最多登记200个地点。');
   if(!['public','tavern','shop','home'].includes(place.kind||'public'))throw Error('不支持的地点类型。');
   c.places[place.channelId]={channelId:place.channelId,name:clean(place.name),street:clean(place.street),kind:place.kind||'public',description:clean(place.description,600),updatedAt:Date.now()};
   await tx.put('city:config',c);return c.places[place.channelId];
  });
 }
 async unbind(channel){return this.storage.transaction(async tx=>{const c=await tx.get('city:config');if(!c?.places[channel])throw Error('当前频道尚未登记为地点。');delete c.places[channel];await tx.put('city:config',c);return true;});}
 async clear({user,channel,placeId}){
  let startAfter;
  do{
   const page=await this.storage.list({prefix:placeId?`scene:${placeId}:`:'scene:',limit:100,...(startAfter?{startAfter}:{})});
   for(const [key]of page){
    if(channel&&!key.endsWith(`:${channel}`))continue;
    await this.storage.transaction(async tx=>{const rows=await tx.get(key)||[];const next=user?rows.filter(r=>r.speakerId!==user&&r.replyTo!==user):[];if(next.length)await tx.put(key,next);else await tx.delete(key);});
   }
   if(page.size<100)break;startAfter=[...page.keys()].at(-1);
  }while(startAfter);
  return {ok:true};
 }
 async position(user,now=Date.now()){
  const p=await this.storage.get(`position:${user}`);if(!p)return null;
  const c=await this.config();if(!c.places[p.placeId])return null;
  return {...p,status:p.updatedAt+30*60*1000>now?'active':'away'};
 }
 async leave(user){await this.storage.delete(`position:${user}`);return {left:true};}
 async context({channel,parent,user,message,now=Date.now()}){
  return this.storage.transaction(async tx=>{
   const c=await tx.get('city:config')||{places:{}},place=c.places[channel]||c.places[parent];if(!place)return null;
   const sceneId=String(channel),key=`scene:${place.channelId}:${sceneId}`;
   const rows=(await tx.get(key)||[]).filter(r=>r.at>now-24*60*60*1000);
   const recent=rows.filter(r=>r.id!==message?.id).slice(-12);
   const position={placeId:place.channelId,sceneId,updatedAt:now};
   if(validId(user))await tx.put(`position:${user}`,position);
   if(message?.id&&message?.content&&!rows.some(r=>r.id===message.id)){
    rows.push({id:String(message.id),speakerId:String(user),name:clean(message.name,80),content:String(message.content).slice(0,1000),at:now});await tx.put(key,rows.slice(-16));
   }
   return {version:CITY_VERSION,place,scene:{thread:sceneId!==place.channelId},position,recent};
  });
 }
 async recordReply({channel,placeId,messageId,user,content,now=Date.now()}){
  if(!validId(placeId)||!validId(channel)||!validId(messageId)||!content)return;
  return this.storage.transaction(async tx=>{const key=`scene:${placeId}:${channel}`,rows=(await tx.get(key)||[]).filter(r=>r.at>now-24*60*60*1000);const id=`bot:${messageId}`;if(rows.some(r=>r.id===id))return;rows.push({id,speakerId:'bot',replyTo:String(user),name:'红豆粉',content:String(content).slice(0,1000),at:now});await tx.put(key,rows.slice(-16));});
 }
}
export async function cityRequest(env,guild,payload){
 if(!env?.TABLES||!validId(guild))return null;
 const stub=env.TABLES.get(env.TABLES.idFromName(`city:${guild}`));
 const r=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({...payload,op:'city'})});
 if(!r.ok)throw Error('城市服务暂时不可用。');const data=await r.json();if(data?.error)throw Error(data.error);return data;
}
