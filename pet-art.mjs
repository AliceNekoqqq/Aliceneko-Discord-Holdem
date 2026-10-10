import {PETS,petCoat} from './pet-catalog.mjs';
import manifest from './pet-art-manifest.mjs';
import {serveStaticAsset} from './static-art.mjs';

const ORIGIN='https://discord-holdem.aliceneko.workers.dev';
export const PET_ART_VERSION='v2';
export function getPetArtUrl(species,coat){
 const s=PETS.find(p=>p.id===species);if(!s)return null;
 const c=petCoat(species,coat)||s.coats[0];
 return ORIGIN+'/art/pets/'+species+'/'+c.id+'/'+PET_ART_VERSION+'.jpg';
}
export function petArtEmbed(species,coat){const url=getPetArtUrl(species,coat);return url?[{image:{url}}]:[];}
export async function servePetArt(request,env){
 const match=new URL(request.url).pathname.match(/^\/art\/pets\/([a-z-]+)\/([a-z-]+)\/(v1|v2)\.jpg$/);
 if(!match||!petCoat(match[1],match[2]))return new Response('Not found',{status:404});
 const record=manifest[match[3]]?.[match[1]+':'+match[2]];
 if(!record)return new Response('Not found',{status:404});
 const path='/art/pets/'+match[1]+'/'+match[2]+'/'+match[3]+'.jpg';
 return serveStaticAsset(request,env,path,record,'image/jpeg');
}
