import {renderTavernMap,renderTavernScene,TAVERN_SCENE_VERSION} from './tavern-map-image.mjs';
import {validId} from './tavern-catalog.mjs';
const CACHE='tavernMapImageCache';
const SCENE_CACHE='tavernSceneImageCache';
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))).map(n=>n.toString(16).padStart(2,'0')).join('');
const base64=bytes=>{let s='';for(let at=0;at<bytes.length;at+=8192)s+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(s);};
// Render in the guild DO, cache one current public PNG, never interaction tokens.
export class TavernMapPresentation {
 constructor(host){this.host=host;this.env=host.env;this.storage=host.ctx.storage;}
 async snapshot(p,now=Date.now()){
  if(!validId(p.id)||!validId(p.channel))throw Error('请在服务器文字频道打开地图。');
  const service=this.host.tavern;
  // A passive live refresh must describe the current confirmed snapshot without
  // making the refresh itself look like a new visit.
  const board=p.passive===true?service.map.board(now):await service.dispatch({...p,action:'mapBoard'});
  const room=service.renovation.board(),operations=service.operations.board(null,now);
  return {...board,at:Math.floor(now/60000)*60000,room:{name:room.stage.name,level:room.stage.level,assets:room.assets},operations};
 }
 async _render(p,now,animated){
  const snapshot=await this.snapshot(p,now),signature=await hash({version:TAVERN_SCENE_VERSION,snapshot}),cacheKey=animated?SCENE_CACHE:CACHE,cached=await this.storage.get(cacheKey);
  let result=cached?.signature===signature?(animated?{filename:cached.filename,mime:cached.mime,bytes:Uint8Array.from(atob(cached.data),c=>c.charCodeAt(0))}:{filename:'tavern-scene.png',mime:'image/png',bytes:Uint8Array.from(atob(cached.png),c=>c.charCodeAt(0))}):null;
  if(!result){
   try{result=animated?await renderTavernScene(snapshot,{},this.env):{filename:'tavern-scene.png',mime:'image/png',bytes:await renderTavernMap(snapshot,this.env)};}
   catch(error){if(!animated)throw error;result=await renderTavernScene(snapshot,{animated:false},this.env);}
   if(animated)await this.storage.put(cacheKey,{signature,filename:result.filename,mime:result.mime,data:base64(result.bytes)});
   else await this.storage.put(cacheKey,{signature,png:base64(result.bytes)});
  }
  return {snapshot,result};
 }
 async render(p,now=Date.now()){
  const {snapshot,result}=await this._render(p,now,false);
  return {source:snapshot.source,at:snapshot.at,visitorCount:snapshot.visitorCount,tableCount:snapshot.tableCount,recentOrders:snapshot.recentOrders,png:base64(result.bytes)};
 }
 async renderScene(p,now=Date.now()){
  const {snapshot,result}=await this._render(p,now,true);
  return {source:snapshot.source,at:snapshot.at,visitorCount:snapshot.visitorCount,tableCount:snapshot.tableCount,recentOrders:snapshot.recentOrders,operations:snapshot.operations,scene:{filename:result.filename,mime:result.mime,data:base64(result.bytes)}};
 }
}
