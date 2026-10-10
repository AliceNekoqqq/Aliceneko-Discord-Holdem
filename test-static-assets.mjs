import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setStaticAssetTestBinding} from './static-art.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const publicRoot=resolve(root,'public');
const mime={'.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream'};
setStaticAssetTestBinding({
 async fetch(request){
  const pathname=new URL(request.url).pathname;
  if(!pathname.startsWith('/art/'))return new Response('Not found',{status:404});
  const path=resolve(publicRoot,'.'+pathname);
  if(path!==publicRoot&&!path.startsWith(publicRoot+sep))return new Response('Not found',{status:404});
  try{return new Response(await readFile(path),{headers:{'Content-Type':mime[extname(path)]||'application/octet-stream'}});}
  catch{return new Response('Not found',{status:404});}
 }
});
