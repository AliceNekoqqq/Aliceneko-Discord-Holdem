import {dispatchRogue} from './rogue-interactions.mjs';
import {renderRogueImage,describeRogueImage} from './rogue-image.mjs';

// Rendering happens inside the guild DO after the action/settlement commits.
// The edge forwards a bounded multipart body to the same private webhook.
export async function rogueVisualResponse(service,interaction,{render=renderRogueImage}={}){
 let visual;
 const reply=dispatchRogue(service,interaction,{onVisual:(run,view)=>{visual={run,view};}});
 const data=structuredClone(reply.data);
 data.attachments=[];
 if(!visual||!data.embeds?.length)return Response.json({...reply,data});
 try{
  const png=await render(visual.run,{view:visual.view});
  if(!(png instanceof Blob)||png.type!=='image/png'||png.size>1500000)throw Error('invalid render');
  const filename=`lantern-${visual.view==='map'||visual.run.phase!=='BATTLE'?'map':'battle'}-${visual.run.version}.png`;
  data.embeds[0].image={url:`attachment://${filename}`};
  data.attachments=[{id:0,filename,description:JSON.stringify(describeRogueImage(visual.run,visual.view)).slice(0,1000)}];
  delete data.flags;
  const body=new FormData();body.set('payload_json',JSON.stringify(data));body.set('files[0]',png,filename);
  return new Response(body);
 }catch(error){
  console.error('rogue_image_failed',{reason:error.message});
  delete data.embeds[0].image;data.attachments=[];
  // Text panel and buttons remain usable; never repeat a state-changing action.
  return Response.json({...reply,data});
 }
}

export async function patchRoguePanel(response,url,{fetcher=fetch,authorization}={}){
 const multipart=response.headers.get('Content-Type')?.startsWith('multipart/form-data');
 let body,headers=authorization?{Authorization:authorization}:{};
 if(multipart){body=await response.formData();const data=JSON.parse(body.get('payload_json'));delete data.flags;delete data.ephemeral;body.set('payload_json',JSON.stringify(data));}
 else{const reply=await response.json();const data=reply?.data??{content:'远征暂时无法打开，请稍后重试。',allowed_mentions:{parse:[]}};delete data.flags;delete data.ephemeral;data.attachments??=[];body=JSON.stringify(data);headers['Content-Type']='application/json';}
 const result=await fetcher(url,{method:'PATCH',headers,body,signal:AbortSignal.timeout(8000)});
 if(!result.ok)throw Error(`Discord panel HTTP ${result.status}`);
 return result;
}
