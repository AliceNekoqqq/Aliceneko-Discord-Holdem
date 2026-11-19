export const MODEL_SETTINGS_OBJECT='system-ai-model-settings';
export const MODEL_ROLES=Object.freeze({chat:'聊天默认',image:'生图提示词',appearance:'个人外貌标签'});
const STATE_KEY='textModelSettings';
const EMPTY_REVISION='0'.repeat(16);
const DRAFT_TTL=30*60_000;
const MAX_MODELS=500;
const MAX_CATALOG_BYTES=512*1024;
const resolvedConnection=Symbol('resolved text model connection');
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const modelId=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const serverId=/^\d{1,20}$/;
const newRevision=()=>crypto.randomUUID().replaceAll('-','').slice(0,16);
export const isModelDeveloper=(env,id)=>/^\d{17,20}$/.test(String(env.DEVELOPER_DISCORD_USER_ID||'').trim())&&String(env.DEVELOPER_DISCORD_USER_ID).trim()===id;

export function modelBaseUrl(value){
 let url;
 if(typeof value!=='string'||value.length>600||!/^https:\/\//i.test(value)||/[\\\x00-\x20]/.test(value))throw Error('请输入公开的 HTTPS API 地址。');
 try{url=new URL(value);}catch{throw Error('请输入公开的 HTTPS API 地址。');}
 const host=url.hostname;
 if(url.username||url.password||url.search||url.hash||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(host)||
  /(?:^|\.)(?:localhost|internal|local|lan|home|arpa|test|invalid|onion)$/.test(host))throw Error('请输入公开的 HTTPS API 地址。');
 let path=url.pathname.replace(/\/+$/,'').replace(/\/(?:chat\/completions|models)$/,'');
 if(host==='generativelanguage.googleapis.com'&&['','/v1beta'].includes(path))path='/v1beta/openai';
 return url.origin+(path||'/v1');
}

async function encryptionKey(env){
 const encoded=env.AI_MODEL_SETTINGS_KEY;
 if(typeof encoded!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw Error('模型面板暂未配置密钥保护。');
 return crypto.subtle.importKey('raw',Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function sealConnection(env,connection){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(env),encoder.encode(JSON.stringify(connection)));
 return {iv:btoa(String.fromCharCode(...iv)),data:btoa(String.fromCharCode(...new Uint8Array(data)))};
}
async function unsealConnection(env,sealed){
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(sealed.iv)},await encryptionKey(env),bytes(sealed.data));
 return JSON.parse(decoder.decode(plain));
}

async function catalogModels(baseUrl,apiKey,fetcher){
 let response;
 try{response=await fetcher(baseUrl+'/models',{headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});}
 catch{throw Error('读取模型列表失败。请检查地址和网关是否在线。');}
 if(!response.ok){
  await response.body?.cancel().catch(()=>{});
  if(response.status>=300&&response.status<400)throw Error('模型接口要求跳转。请填写最终 API 地址。');
  throw Error('读取模型列表失败（HTTP '+response.status+'）。请检查 API 地址、Key 和权限。');
 }
 const reader=response.body?.getReader();
 if(!reader)throw Error('接口没有返回可用的模型列表。');
 let size=0,body='';
 const streamDecoder=new TextDecoder();
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>MAX_CATALOG_BYTES){await reader.cancel();throw Error('model_catalog_too_large');}
   body+=streamDecoder.decode(value,{stream:true});
  }
  body+=streamDecoder.decode();
  const data=JSON.parse(body).data;
  const ids=Array.isArray(data)?[...new Set(data.map(item=>item?.id).filter(id=>typeof id==='string'&&modelId.test(id)&&id!==apiKey&&!(apiKey.length>=8&&id.includes(apiKey))))]:[];
  if(ids.length)return {catalog:ids.sort().slice(0,MAX_MODELS),total:ids.length};
 }catch(error){
  if(error.message==='model_catalog_too_large')throw Error('接口返回的模型列表过大。');
 }
 throw Error('接口没有返回可用的模型列表。请使用兼容 /models 的 API。');
}

export async function prepareModelConnection(env,request,fetcher=fetch){
 const baseUrl=modelBaseUrl(request.url);
 const apiKey=request.key;
 if(typeof apiKey!=='string'||!/^[!-~]{1,600}$/.test(apiKey))throw Error('请输入有效的 API Key。');
 const sealed=await sealConnection(env,{baseUrl,apiKey});
 const models=await catalogModels(baseUrl,apiKey,fetcher);
 return {host:new URL(baseUrl).host,sealed,...models};
}

export async function modelSettingsRpc(env,request){
 if(!env.TABLES)throw Error('模型配置服务暂不可用。');
 const stub=env.TABLES.get(env.TABLES.idFromName(MODEL_SETTINGS_OBJECT));
 const response=await stub.fetch('https://internal',{method:'POST',body:JSON.stringify({op:'modelSettings',...request})});
 const body=await response.json();
 if(!response.ok||body.error)throw Error(body.error||'模型配置服务暂不可用。');
 return body;
}

export async function dispatchModelSettings(storage,env,request){
 const state=await storage.get(STATE_KEY)||{revision:EMPTY_REVISION};
 if(request.action==='runtime')return {connection:state.active?.sealed??null,models:state.active?.models??null};
 if(!isModelDeveloper(env,request.user)||!serverId.test(request.guild||''))throw Error('只有开发者账号能修改模型配置。');
 if(!env.AI_MODEL_SETTINGS_KEY)throw Error('模型面板暂未配置密钥保护。');
 if(state.draft&&state.draft.expires<=Date.now()){
  delete state.draft;
  state.revision=newRevision();
  await storage.put(STATE_KEY,state);
 }
 const draft=state.draft;
 const revision=state.revision;
 const source=draft||state.active;
 const view=()=>{
  const visible=state.draft||state.active;
  return {revision:state.revision,hasDraft:Boolean(visible&&visible===state.draft),host:visible?.host||'',catalog:visible?.catalog||[],total:visible?.total||0,models:visible?.models||{},activeHost:state.active?.host||'',activeModels:state.active?.models||{}};
 };
 if(request.action==='open')return view();
 if(request.revision!==revision)throw Error('面板已更新。请重新运行 /ai 模型。');
 if(request.action==='verify')return view();
 const saveDraft=connection=>{state.draft={...connection,expires:Date.now()+DRAFT_TTL};};
 switch(request.action){
  case 'prepare': {
   const {host,sealed,catalog,total}=request.connection;
   const sameHost=Boolean(source)&&source.host===host;
   const existing=sameHost?source.models:{chat:env.GEMINI_MODEL,image:null,appearance:env.GEMINI_APPEARANCE_MODEL};
   const models=Object.fromEntries(Object.keys(MODEL_ROLES).map(role=>[role,catalog.includes(existing[role])?existing[role]:null]));
   saveDraft({host,sealed,catalog,total,models});
   break;
  }
  case 'choose': {
   if(!source||!Object.hasOwn(MODEL_ROLES,request.role))throw Error('请先读取模型列表。');
   const selected=request.index===-1&&request.role!=='chat'?null:source.catalog[request.index];
   if(selected===undefined)throw Error('请从列表中选择模型。');
   saveDraft({...source,models:{...source.models,[request.role]:selected}});
   break;
  }
  case 'save': {
   if(!draft?.models.chat)throw Error('请先选择「聊天默认」模型。');
   const {expires,...active}=draft;
   state.active=active;
   delete state.draft;
   break;
  }
  case 'discard':
   delete state.draft;
   break;
  default:
   throw Error('无效的模型配置操作。');
 }
 state.revision=newRevision();
 await storage.put(STATE_KEY,state);
 return view();
}

export async function resolveModelRuntime(env){
 if(!env.AI_MODEL_SETTINGS_KEY||!env.TABLES||env[resolvedConnection])return env;
 const saved=await modelSettingsRpc(env,{action:'runtime'});
 if(!saved.connection)return {...env,[resolvedConnection]:true};
 const {baseUrl,apiKey}=await unsealConnection(env,saved.connection);
 return {...env,[resolvedConnection]:true,GEMINI_API_BASE_URL:baseUrl,GEMINI_API_KEY:apiKey,
  GEMINI_MODEL:saved.models.chat,GEMINI_IMAGE_PROMPT_MODEL:saved.models.image,
  GEMINI_APPEARANCE_MODEL:saved.models.appearance||saved.models.chat};
}

export function configuredTextModel(env,context,runtimeData){
 const override=env[resolvedConnection]===true&&Boolean(env.GEMINI_IMAGE_PROMPT_MODEL);
 if(context==='appearance')return env.GEMINI_APPEARANCE_MODEL;
 if(override&&(runtimeData.imageCommand||runtimeData.imageReplyRepair||runtimeData.imagePromptRequested))return env.GEMINI_IMAGE_PROMPT_MODEL;
 return env.GEMINI_MODEL;
}

export function validTextModel(value){return typeof value==='string'&&modelId.test(value);}
