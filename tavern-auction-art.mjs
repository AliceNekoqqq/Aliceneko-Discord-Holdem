import manifest from './auction-art-manifest.mjs';
import {loadStaticAsset,serveStaticAsset} from './static-art.mjs';
let pixels=null,loading=null;
export function serveAuctionArt(request,env){
 const path=new URL(request.url).pathname;
 const record=path===manifest.path?manifest:path===manifest.legacyAtlas?.path?manifest.legacyAtlas:path===manifest.previousAtlas?.path?manifest.previousAtlas:[...Object.values(manifest.items),...Object.values(manifest.legacyItems||{}),...Object.values(manifest.previousItems||{})].find(x=>x.path===path);
 if(!record)return new Response('Not Found',{status:404});
 return serveStaticAsset(request,env,path,record,path.endsWith('.bin')?'application/octet-stream':'image/png');
}
export async function prepareAuctionArt(env){
 if(pixels)return pixels;
 if(!loading)loading=(async()=>{
  const asset=await loadStaticAsset(manifest.path,manifest,env,'application/octet-stream');
  if(!asset)throw Error('Auction image atlas unavailable');
  return asset.data;
 })();
 try{return pixels=await loading;}catch(e){loading=null;throw e;}
}
export function drawAuctionItem(canvas,id,x,y,width,height,data){
 const sprite=manifest.items[id];if(!sprite)return false;
 const size=Math.max(1,Math.floor(Math.min(width,height))),left=Math.round(x+(width-size)/2),top=Math.round(y+(height-size)/2);
 for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){
  const sx=sprite.x+Math.min(127,Math.floor(dx*128/size)),sy=sprite.y+Math.min(127,Math.floor(dy*128/size)),i=(sy*manifest.width+sx)*4;
  if(data[i+3])canvas.pixel(left+dx,top+dy,[data[i],data[i+1],data[i+2]],data[i+3]);
 }
 return true;
}
