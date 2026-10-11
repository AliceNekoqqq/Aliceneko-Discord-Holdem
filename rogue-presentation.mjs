import {dispatchRogue} from './rogue-interactions.mjs';
import {renderRogueImage,describeRogueImage} from './rogue-image.mjs';

// Rendering happens inside the guild DO after the action/settlement commits.
// The edge forwards a bounded multipart body to the same private webhook.
export async function rogueVisualResponse(service,interaction,{render=renderRogueImage,env}={}){
 let visual;
 const reply=dispatchRogue(service,interaction,{onVisual:(run,view)=>{visual={run,view};}});
 const data=structuredClone(reply.data);
 data.attachments=[];
 if(!visual||!data.embeds?.length)return Response.json({...reply,data});
 const textEmbeds=structuredClone(data.embeds);
 try{
  const png=await render(visual.run,{view:visual.view,env});
  if(!(png instanceof Blob)||png.type!=='image/png'||png.size>1500000)throw Error('invalid render');
  const filename=`lantern-${visual.view==='map'||visual.run.phase!=='BATTLE'?'map':'battle'}-${visual.run.version}.png`;
  if(visual.run.phase==='BATTLE'&&visual.view==='auto'){
   const text=data.embeds[0];
   data.embeds=[{title:text.title,color:text.color,image:{url:`attachment://${filename}`}}, {...text,title:'战斗操作'}, ...data.embeds.slice(1)];
  }else data.embeds[0].image={url:`attachment://${filename}`};
  data.attachments=[{id:0,filename,description:JSON.stringify(describeRogueImage(visual.run,visual.view)).slice(0,1000)}];
  delete data.flags;
  const body=new FormData();body.set('payload_json',JSON.stringify(data));body.set('files[0]',png,filename);
  return new Response(body);
 }catch(error){
  console.error('rogue_image_failed',{reason:error.message});
  data.embeds=textEmbeds;data.attachments=[];
  // Text panel and buttons remain usable; never repeat a state-changing action.
  return Response.json({...reply,data});
 }
}

export async function patchRoguePanel(response,url,{fetcher=fetch,authorization}={}){
 const multipart=response.headers.get('Content-Type')?.startsWith('multipart/form-data');
 let body,headers={};
 if(multipart){body=await response.formData();const data=JSON.parse(body.get('payload_json'));delete data.flags;delete data.ephemeral;body.set('payload_json',JSON.stringify(data));}
 else{const reply=await response.json();const data=reply?.data??{content:'远征暂时无法打开，请稍后重试。',allowed_mentions:{parse:[]}};delete data.flags;delete data.ephemeral;data.attachments??=[];body=JSON.stringify(data);headers['Content-Type']='application/json';}
 // Never replay the game action: only retry the idempotent panel PATCH.
 let lastError;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const result=await fetcher(url,{method:'PATCH',headers,body,signal:AbortSignal.timeout(12000)});
   if(result.ok)return result;
   const detail=(await result.text().catch(()=>'')).slice(0,350);
   lastError=new Error(`Discord panel HTTP ${result.status}: ${detail}`);
   if(result.status!==429&&result.status<500)break;
  }catch(error){lastError=error;}
  if(attempt===0)await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw lastError;
}
