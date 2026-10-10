const METHODS=new Set(['GET','HEAD']);
let testBinding=null;
export function setStaticAssetTestBinding(binding){testBinding=binding;}
function bindingFor(env){return env?.ASSETS??testBinding;}
function mimeMatches(actual,expected){return (actual||'').split(';',1)[0].trim().toLowerCase()===expected.toLowerCase();}
export async function loadStaticAsset(path,record,env,contentType){
 const binding=bindingFor(env);
 if(!binding?.fetch||!record||!Number.isInteger(record.bytes)||record.bytes<1)return null;
 try{
  const response=await binding.fetch(new Request(new URL(path,'https://static-assets.invalid')));
  if(response.status!==200||!mimeMatches(response.headers.get('Content-Type'),contentType))return null;
  const data=new Uint8Array(await response.arrayBuffer());
  return data.byteLength===record.bytes?{...record,data}:null;
 }catch{return null;}
}
export async function serveStaticAsset(request,env,path,record,contentType){
 if(!METHODS.has(request.method))return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 if(!record||!Number.isInteger(record.bytes)||record.bytes<1)return new Response('Not Found',{status:404});
 const etag=record.sha256?'"'+record.sha256+'"':null;
 const headers={'Content-Type':contentType,'Content-Length':String(record.bytes),'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'};
 if(etag)headers.ETag=etag;
 if(etag&&request.headers.get('If-None-Match')===etag){delete headers['Content-Length'];return new Response(null,{status:304,headers});}
 if(request.method==='HEAD')return new Response(null,{headers});
 const loaded=await loadStaticAsset(path,record,env,contentType);
 if(!loaded)return new Response('Not Found',{status:404});
 return new Response(loaded.data,{headers});
}
