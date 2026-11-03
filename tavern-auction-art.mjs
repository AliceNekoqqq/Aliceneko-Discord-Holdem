import manifest from './auction-art-manifest.mjs';
import {loadStaticAsset,serveStaticAsset} from './static-art.mjs';
let pixels=null,loading=null;
export function serveAuctionArt(request,env){
 const path=new URL(request.url).pathname;
 const record=path===manifest.path?manifest:path===manifest.previousLargeAtlas?.path?manifest.previousLargeAtlas:path===manifest.previousExpandedAtlas?.path?manifest.previousExpandedAtlas:path===manifest.legacyAtlas?.path?manifest.legacyAtlas:path===manifest.previousAtlas?.path?manifest.previousAtlas:[...Object.values(manifest.items),...Object.values(manifest.legacyItems||{}),...Object.values(manifest.previousItems||{})].find(x=>x.path===path);
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
 if(sprite.bounds){
  const [bx,by,right,bottom]=sprite.bounds,bw=right-bx,bh=bottom-by,scale=Math.min(width/bw,height/bh),w=Math.max(1,Math.floor(bw*scale)),h=Math.max(1,Math.floor(bh*scale)),left=Math.round(x+(width-w)/2),top=Math.round(y+(height-h)/2);
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
   const sx=sprite.x+bx+Math.min(bw-1,Math.floor(dx*bw/w)),sy=sprite.y+by+Math.min(bh-1,Math.floor(dy*bh/h)),i=(sy*manifest.width+sx)*4;
   if(data[i+3])canvas.pixel(left+dx,top+dy,[data[i],data[i+1],data[i+2]],data[i+3]);
  }return true;
 }
 const size=Math.max(1,Math.floor(Math.min(width,height))),left=Math.round(x+(width-size)/2),top=Math.round(y+(height-size)/2);
 for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){
  const sx=sprite.x+Math.min(127,Math.floor(dx*128/size)),sy=sprite.y+Math.min(127,Math.floor(dy*128/size)),i=(sy*manifest.width+sx)*4;
  if(data[i+3])canvas.pixel(left+dx,top+dy,[data[i],data[i+1],data[i+2]],data[i+3]);
 }
 return true;
}
