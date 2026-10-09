import {renderTavernMap} from './tavern-map-image.mjs';
import {validId} from './tavern-catalog.mjs';
const CACHE='tavernMapImageCache';
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))).map(n=>n.toString(16).padStart(2,'0')).join('');
const base64=bytes=>{let s='';for(let at=0;at<bytes.length;at+=8192)s+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(s);};
// Render in the guild DO, cache one current public PNG, never interaction tokens.
export class TavernMapPresentation {
 constructor(host){this.host=host;this.storage=host.ctx.storage;}
 async render(p,now=Date.now()){
  if(!validId(p.id)||!validId(p.channel))throw Error('请在服务器文字频道打开地图。');
  const service=this.host.tavern;
  const board=await service.dispatch({...p,action:'mapBoard'}),room=service.renovation.board(),operations=service.operations.board(null,now);
  const snapshot={...board,at:Math.floor(now/60000)*60000,room:{name:room.stage.name,level:room.stage.level,assets:room.assets},operations};
  const signature=await hash(snapshot),cached=await this.storage.get(CACHE);
  let png=cached?.signature===signature?cached.png:null;
  if(!png){png=base64(await renderTavernMap(snapshot));await this.storage.put(CACHE,{signature,png});}
  return {source:board.source,at:snapshot.at,visitorCount:board.visitorCount,tableCount:board.tableCount,recentOrders:board.recentOrders,png};
 }
}
