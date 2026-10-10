import manifest from './tavern-art-manifest.mjs';
import {equipmentArtUrl,serveEquipmentArt,equipmentAsset,loadEquipmentArt} from './equipment-art.mjs';
import {loadStaticAsset,serveStaticAsset} from './static-art.mjs';

const ART_VERSION='v1';
const ART_ORIGIN='https://discord-holdem.aliceneko.workers.dev';
export const ART_MANIFEST=Object.freeze(Object.fromEntries(Object.entries(manifest).map(([id,asset])=>[id,Object.freeze({...asset})])));
export function imageAsset(id){if(typeof id!=='string')return null;if(!Object.hasOwn(ART_MANIFEST,id))return equipmentAsset(id);return {...ART_MANIFEST[id]};}
const assetPath=id=>'/art/'+id+'/'+ART_VERSION+'.jpg';
export function getArtUrl(id){if(!Object.hasOwn(ART_MANIFEST,id))return equipmentArtUrl(id);return ART_ORIGIN+assetPath(id);}
export function artEmbed(id,details={}){const key=details?.assetKey;const ugc=typeof key==='string'&&/^art\/ugc\/[A-Za-z0-9_/-]+\.(?:png|jpg|webp)$/.test(key)&&!key.includes('..')?ART_ORIGIN+'/'+key:null;const url=ugc||getArtUrl(id);return url?[{image:{url}}]:[];}
export async function loadArt(id,env){
 if(equipmentAsset(id))return loadEquipmentArt(id,env);
 const asset=imageAsset(id);if(!asset||!Object.hasOwn(ART_MANIFEST,id))return null;
 return loadStaticAsset(assetPath(id),asset,env,'image/jpeg');
}
export async function serveArt(request,env){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/art/equipment/'))return serveEquipmentArt(request,env);
 const match=/^\/art\/([a-z0-9-]+)\/v1\.jpg$/.exec(url.pathname);
 if(!match||!Object.hasOwn(ART_MANIFEST,match[1]))return new Response('Not Found',{status:404});
 const asset=ART_MANIFEST[match[1]];
 return serveStaticAsset(request,env,assetPath(asset.id),asset,'image/jpeg');
}
