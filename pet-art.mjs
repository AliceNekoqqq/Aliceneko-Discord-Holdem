import {PETS,petCoat} from './pet-catalog.mjs';

const ORIGIN='https://discord-holdem.aliceneko.workers.dev';
export const PET_ART_VERSION='v2';
export function getPetArtUrl(species,coat){
 const s=PETS.find(p=>p.id===species);if(!s)return null;
 const c=petCoat(species,coat)||s.coats[0];
 return `${ORIGIN}/art/pets/${species}/${c.id}/${PET_ART_VERSION}.jpg`;
}
export function petArtEmbed(species,coat){const url=getPetArtUrl(species,coat);return url?[{image:{url}}]:[];}
export async function servePetArt(request){
 const match=new URL(request.url).pathname.match(/^\/art\/pets\/([a-z-]+)\/([a-z-]+)\/(v1|v2)\.jpg$/);
 if(!match||!petCoat(match[1],match[2]))return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const records=(await (match[3]==='v1'?import('./pet-art-data.mjs'):import('./pet-art-data-v2.mjs'))).default;
 const asset=records[`${match[1]}:${match[2]}`];if(!asset)return new Response('Not found',{status:404});
 const etag=`"${asset.sha256}"`,headers={'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable',ETag:etag,'X-Content-Type-Options':'nosniff','Content-Length':String(asset.bytes)};
 if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{'Cache-Control':headers['Cache-Control'],ETag:etag}});
 if(request.method==='HEAD')return new Response(null,{headers});
 const text=atob(asset.base64),bytes=Uint8Array.from(text,c=>c.charCodeAt(0));return new Response(bytes,{headers});
}
