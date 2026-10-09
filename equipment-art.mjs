import manifest from './equipment-art-manifest.mjs';

const ORIGIN='https://discord-holdem.aliceneko.workers.dev';
export function equipmentAsset(id){return typeof id==='string'&&Object.hasOwn(manifest,id)?{...manifest[id]}:null;}
export function equipmentArtUrl(id){return equipmentAsset(id)?`${ORIGIN}/art/equipment/${id}/v1.jpg`:null;}
export function equipmentArtEmbed(id){const url=equipmentArtUrl(id);return url?[{image:{url}}]:[];}
export async function loadEquipmentArt(id){
 const asset=equipmentAsset(id);if(!asset?.bytes)return null;
 const records=(await import('./equipment-art-data.mjs')).default,record=records[id];
 if(!record||record.mime!=='image/jpeg')return null;
 const data=Uint8Array.from(atob(record.base64),c=>c.charCodeAt(0));
 return data.byteLength===asset.bytes?{...asset,data}:null;
}
export async function serveEquipmentArt(request){
 const match=/^\/art\/equipment\/([a-z0-9-]+)\/v1\.jpg$/.exec(new URL(request.url).pathname);
 const asset=match&&equipmentAsset(match[1]);
 if(!asset||!asset.bytes)return new Response('Not Found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const etag=`"${asset.sha256}"`,headers={'Content-Type':'image/jpeg','Content-Length':String(asset.bytes),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff',ETag:etag};
 if(request.headers.get('If-None-Match')===etag){delete headers['Content-Length'];return new Response(null,{status:304,headers});}
 if(request.method==='HEAD')return new Response(null,{headers});
 const loaded=await loadEquipmentArt(asset.id);
 if(!loaded)return new Response('Not Found',{status:404});
 return new Response(loaded.data,{headers});
}
