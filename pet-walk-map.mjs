import { STAGES } from './pet-catalog.mjs';
const ORIGIN='https://discord-holdem.aliceneko.workers.dev';
export const WALK_ART_VERSION='v1';
const names=Object.fromEntries(STAGES.map(s=>[s.id,s.id==='tavern-porch'?'酒馆门廊':s.name]));
const validScene=id=>id==='home'||Object.hasOwn(names,id);
export function getPetWalkArtUrl(id){return validScene(id)?`${ORIGIN}/art/pet-walk/scenes/${id}/${WALK_ART_VERSION}.jpg`:null;}
export function petWalkMapEmbed(view){
 if(!view?.pet||!view.walk)return null;
 const walk=view.walk,step=walk.phase==='done'?'done':Number.isInteger(walk.step)&&walk.step>=0&&walk.step<STAGES.length?String(walk.step):null;
 if(step===null)return null;
 return {title:'雨后旧街 · 同行地图',description:step==='done'?'五站同行已完成。':'实线是走过的路，亮圈标出当前位置。',image:{url:`${ORIGIN}/art/pet-walk/maps/${step}/${WALK_ART_VERSION}.png`},color:0xda859e};
}
export function petWalkSceneEmbed(view){
 if(!view?.pet||!view.walk)return null;
 const index=view.walk.phase==='done'?STAGES.length-1:view.walk.step;
 if(!Number.isInteger(index)||!STAGES[index])return null;
 const stage=STAGES[index];return {title:`${index+1} / ${STAGES.length} · ${names[stage.id]}`,image:{url:getPetWalkArtUrl(stage.id)},color:0xda859e};
}
export function petHomeSceneEmbed(view){return view?.pet?{title:'伙伴小窝',description:'临窗小窝的氛围图；实际布置见下方物品栏。',image:{url:getPetWalkArtUrl('home')},color:0xda859e}:null;}
export async function servePetWalkArt(request){
 const path=new URL(request.url).pathname;
 const scene=path.match(/^\/art\/pet-walk\/scenes\/([a-z-]+)\/v1\.jpg$/);
 const map=path.match(/^\/art\/pet-walk\/maps\/(0|1|2|3|4|done)\/v1\.png$/);
 if((!scene&&!map)||(scene&&!validScene(scene[1])))return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const records=(await (scene?import('./pet-walk-art-data.mjs'):import('./pet-walk-map-data.mjs'))).default;
 const record=records[(scene||map)[1]];
 if(!record)return new Response('Not found',{status:404});
 const etag=`"${record.sha256}"`,headers={'Content-Type':scene?'image/jpeg':'image/png','Cache-Control':'public, max-age=31536000, immutable',ETag:etag,'X-Content-Type-Options':'nosniff','Content-Length':String(record.bytes)};
 if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':headers['Cache-Control']}});
 if(request.method==='HEAD')return new Response(null,{headers});
 return new Response(Uint8Array.from(atob(record.base64),c=>c.charCodeAt(0)),{headers});
}
