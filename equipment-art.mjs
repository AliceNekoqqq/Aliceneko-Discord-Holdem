import manifest from './equipment-art-manifest.mjs';
import {loadStaticAsset,serveStaticAsset} from './static-art.mjs';

const ORIGIN='https://discord-holdem.aliceneko.workers.dev';
const assetPath=id=>'/art/equipment/'+id+'/v1.jpg';
export function equipmentAsset(id){return typeof id==='string'&&Object.hasOwn(manifest,id)?{...manifest[id]}:null;}
export function equipmentArtUrl(id){return equipmentAsset(id)?ORIGIN+assetPath(id):null;}
export function equipmentArtEmbed(id){const url=equipmentArtUrl(id);return url?[{image:{url}}]:[];}
export async function loadEquipmentArt(id,env){
 const asset=equipmentAsset(id);if(!asset)return null;
 return loadStaticAsset(assetPath(id),asset,env,'image/jpeg');
}
export async function serveEquipmentArt(request,env){
 const match=/^\/art\/equipment\/([a-z0-9-]+)\/v1\.jpg$/.exec(new URL(request.url).pathname);
 const asset=match&&equipmentAsset(match[1]);
 if(!asset)return new Response('Not Found',{status:404});
 return serveStaticAsset(request,env,assetPath(asset.id),asset,'image/jpeg');
}
