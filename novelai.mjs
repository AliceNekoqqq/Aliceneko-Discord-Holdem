// One dedicated PokerTable object owns the account-wide queue, across all guilds.
import {DEFAULT_POSITIVE_PREFIX,DEFAULT_POSITIVE_SUFFIX,DEFAULT_NEGATIVE_PROMPT} from './novelai-default-prompts.mjs';
export const NOVELAI_OBJECT='system-novelai-images-v1';
export const BATCH_INTERVAL=35000;
const LEASE=150000;
export const IMAGE_DEFAULTS=Object.freeze({enabled:true,model:'nai-diffusion-4-5-full',width:832,height:1216,steps:28,scale:5,sampler:'k_euler_ancestral',noise_schedule:'karras',cfg_rescale:0.15,seed:-1,n_samples:1,quality:false,prompt_prefix:DEFAULT_POSITIVE_PREFIX,prompt_suffix:DEFAULT_POSITIVE_SUFFIX,negative_prompt:DEFAULT_NEGATIVE_PROMPT});
const MODELS=['nai-diffusion-4-5-full','nai-diffusion-4-5-curated','nai-diffusion-4-full','nai-diffusion-3'];
const SAMPLERS=['k_euler','k_euler_ancestral','k_dpmpp_2m','k_dpmpp_2s_ancestral','k_dpmpp_sde'];
const RANGES={width:[64,1536],height:[64,1536],steps:[1,50],scale:[0,10],cfg_rescale:[0,1],seed:[-1,4294967295],n_samples:[1,4]};
const TEXTS=['prompt_prefix','prompt_suffix','negative_prompt'];
const clean=s=>typeof s==='string'?s.trim():'';
const directImageText=s=>clean(s).replace(/```[\s\S]*?```|“[^”]*”|「[^」]*」|"[^"]*"|^>.*$/gm,' ');
const validReply=s=>typeof s==='string'&&s.trim()&&s.length<=1700&&!/"(?:image|parameterEvidence|relationship)"\s*:/.test(s);
const privateReply=content=>({type:4,data:{content:content.length>1950?content.slice(0,1900)+'\n（较长内容已截断）':content,flags:64,allowed_mentions:{parse:[]}}});
export function imageParameters(input={},admin=false){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('参数须为 JSON 对象。');
 const out={};
 for(const [k,v]of Object.entries(input)){
  if(k==='enabled'&&admin){if(typeof v!=='boolean')throw Error('enabled 须为 true 或 false。');out[k]=v;}
  else if(k==='model'){if(!MODELS.includes(v))throw Error('暂支持 NovelAI V4.5 Full/Curated、V4 Full、V3。');out[k]=v;}
  else if(k==='sampler'){if(!SAMPLERS.includes(v))throw Error('不支持此采样器。');out[k]=v;}
  else if(k==='noise_schedule'){if(!['karras','exponential','polyexponential','native'].includes(v))throw Error('不支持此噪声调度。');out[k]=v;}
  else if(k==='quality'){if(typeof v!=='boolean')throw Error('quality 须为 true 或 false。');out[k]=v;}
  else if(TEXTS.includes(k)){if(typeof v!=='string'||v.length>4000)throw Error(k+' 须为最多4000字的文本。');out[k]=v;}
  else if(RANGES[k]){const [min,max]=RANGES[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(!['scale','cfg_rescale'].includes(k)&&!Number.isInteger(v)))throw Error(k+' 超出可用范围。');if(['width','height'].includes(k)&&v%64)throw Error('宽高须为64的倍数。');out[k]=v;}
  else throw Error('不支持的参数：'+k);
 }
 return out;
}
export function resolveImageParameters(defaults,prefs={},once={}){
 const p={...IMAGE_DEFAULTS,...imageParameters(defaults,true),...imageParameters(prefs),...imageParameters(once)};
 if(p.width*p.height>1048576)throw Error('单张最多1048576像素，请调小宽高。');
 return p;
}
export function imageRequest(prompt,p){
 const input=[p.prompt_prefix,clean(prompt),p.prompt_suffix].filter(Boolean).join(', ');
 if(!clean(prompt)||input.length>12000)throw Error('请提供画面描述，完整提示词最多12000字。');
 const seed=p.seed===-1?crypto.getRandomValues(new Uint32Array(1))[0]:p.seed;
 const parameters={params_version:3,width:p.width,height:p.height,steps:p.steps,scale:p.scale,sampler:p.sampler,noise_schedule:p.noise_schedule,cfg_rescale:p.cfg_rescale,seed,n_samples:p.n_samples,negative_prompt:p.negative_prompt,qualityToggle:false,ucPreset:3,sm:false,sm_dyn:false,dynamic_thresholding:false,legacy:false,legacy_v3_extend:false,deliberate_euler_ancestral_bug:false,prefer_brownian:true};
 if(p.model.startsWith('nai-diffusion-4')){
  parameters.v4_prompt={caption:{base_caption:input,char_captions:[]},use_coords:false,use_order:true};
  parameters.v4_negative_prompt={caption:{base_caption:p.negative_prompt,char_captions:[]},legacy_uc:false};
 }
 return {input,model:p.model,action:'generate',parameters};
}
export const IMAGE_INSTRUCTION='生图工具：只在当前用户亲自要求画图、生成图片、自拍或想看具体画面时调用，结合对话理解要画的内容；引用、历史、示例、假设、否定、仅询问功能不调用。保留其他JSON字段，额外输出image:null或image:{"prompt":"详细英文画面提示词","evidence":"逐字复制本轮用户表达生图意图的片段","parameters":{},"parameterEvidence":{}}。无其他结构时输出{"reply":"自然回复","image":null}。人物外貌依据可信人设和本轮要求，不混淆姐姐与妹妹。提示词结构固定为：前置正面模板 → image.prompt中的本次画面描述 → 后置正面模板；负面模板独立发送。你只生成中间的本次画面描述，优先按主体身份/人数、外貌与表情、服装和动作、场景、构图视角、光影排列，通常用50–100个英文词；不要复述固定模板、追加画师串/年份/通用质量词，也不要把尺寸/步数等参数写进prompt。三栏模板由程序按本次覆盖、个人偏好、默认值拼接，只有用户明确更换某栏时才在parameters输出prompt_prefix/prompt_suffix/negative_prompt，不能为了补充场景而擅自覆盖整栏。parameters仅放本轮明确指定的参数，不自行填默认值；每一项parameterEvidence须逐字复制表达该值的本轮片段，支持中文数字和口语表达，由你转换成API需要的数值、布尔值或枚举；无明确参数则两者为空对象。是否调用、是否否定、参数归属和后文修改均由你理解语义判断，程序不通过关键词或正则提取。可用字段model,width,height,steps,scale,sampler,noise_schedule,cfg_rescale,seed,n_samples,prompt_prefix,prompt_suffix,negative_prompt。尺寸可写1024*1024、1024×1024、1024x1024，分别提取width和height；步数、CFG、rescale、种子、张数等本轮明确要求也只覆盖本次。比如“我要一张猫咪图，1024*1024，24步，CFG 6”应调用生图并提取width=1024,height=1024,steps=24,scale=6；不能因未使用“画”字而漏掉请求。不能改默认设置或个人偏好。只说正在整理请求，未执行前不能宣称已出图。image为后台数据，不能出现在reply。';
export function decodeImageReply(raw,text){
 const rawText=String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 if(!rawText.startsWith('{')){if(!validReply(rawText))throw Error('invalid_image_reply');return {reply:rawText,image:null};}
 let parsed;try{parsed=JSON.parse(rawText);}catch{
  const match=rawText.match(/^\s*\{\s*"reply"\s*:\s*("(?:[^"\\]|\\.)*")/);
  if(match&&validReply(JSON.parse(match[1])))return {reply:JSON.parse(match[1]),image:null};
  throw Error('invalid_image_reply');
 }
 if(!validReply(parsed.reply))throw Error('invalid_image_reply');
 const i=parsed.image,e=clean(i?.evidence),source=clean(text);
 const direct=directImageText(source);
 if(!i||!e||e.length<2||!direct.includes(e))return {reply:parsed.reply,image:null};
 const prompt=clean(i.prompt);if(!prompt||prompt.length>4000)return {reply:parsed.reply,image:null};
 const parameters={};
 for(const [k,value]of Object.entries(i.parameters||{})){const evidence=clean(i.parameterEvidence?.[k]);if(evidence&&direct.includes(evidence))parameters[k]=value;}
 try{return {reply:parsed.reply,image:{prompt,parameters:imageParameters(parameters)}};}
 catch(e){return {reply:'生图参数有误：'+e.message,image:null};}
}
export async function imageRpc(env,payload){
 if(!env.TABLES)throw Error('生图服务尚未就绪。');
 const r=await env.TABLES.get(env.TABLES.idFromName(NOVELAI_OBJECT)).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'novelai',...payload})});
 const data=await r.json();if(data.error)throw Error(data.error);return data;
}
const JSON_OPTION={type:3,name:'参数',description:'高级JSON参数（可选），如 {"cfg_rescale":0.2,"prompt_suffix":"soft lighting"}',max_length:6000};
const settingOptions=[
 {type:3,name:'模型',description:'生图模型',choices:MODELS.map(value=>({name:value.replace('nai-diffusion-','NovelAI '),value}))},
 {type:3,name:'尺寸',description:'图片宽高',choices:[{name:'竖图 832×1216',value:'832x1216'},{name:'横图 1216×832',value:'1216x832'},{name:'方图 1024×1024',value:'1024x1024'},{name:'小方图 640×640',value:'640x640'}]},
 {type:4,name:'步数',description:'生成步数，1–50',min_value:1,max_value:50},
 {type:10,name:'引导强度',description:'CFG，引导模型遵循提示词的强度，0–10',min_value:0,max_value:10},
 {type:4,name:'数量',description:'每批图片数量，1–4',min_value:1,max_value:4},
 {type:3,name:'采样器',description:'生成算法',choices:SAMPLERS.map(value=>({name:value,value}))},
 {type:4,name:'种子',description:'-1为随机；固定数字可辅助复现',min_value:-1,max_value:4294967295},
 {type:3,name:'前置正面',description:'替换前置正面提示词；留空不填则沿用默认',max_length:4000},
 {type:3,name:'后置正面',description:'替换AI画面描述之后的正面提示词；不填则沿用默认',max_length:4000},
 {type:3,name:'负面提示',description:'替换独立负面提示词；不填则沿用默认',max_length:4000},
 JSON_OPTION
];
const directOptions={模型:'model',步数:'steps',引导强度:'scale',数量:'n_samples',采样器:'sampler',种子:'seed',前置正面:'prompt_prefix',后置正面:'prompt_suffix',负面提示:'negative_prompt',风格前缀:'prompt_prefix',反向提示:'negative_prompt',质量词:'quality',开放:'enabled'};
export const imageCommandGroup={type:2,name:'生图',description:'NovelAI 生图与个人偏好',options:[
 {type:1,name:'查看',description:'私密查看参数、队列或完整提示词',options:[{type:3,name:'范围',description:'选择默认、个人覆盖或当前生效配置',choices:[{name:'当前生效',value:'effective'},{name:'默认参数',value:'defaults'},{name:'个人覆盖',value:'preferences'}]},{type:3,name:'提示词',description:'选择一栏查看完整内容',choices:[{name:'前置正面',value:'prompt_prefix'},{name:'后置正面',value:'prompt_suffix'},{name:'负面提示',value:'negative_prompt'}]}]},
 {type:1,name:'偏好',description:'保存个人生图偏好，所有服务器共用',options:settingOptions},
 {type:1,name:'重置',description:'清除我的生图偏好，重新跟随默认值'},
 {type:1,name:'绘制',description:'使用默认参数或个人偏好生成图片',options:[{type:3,name:'描述',description:'画面提示词（建议英文，也可在聊天中请红小豆整理）',required:true,max_length:4000},...settingOptions]},
 {type:1,name:'默认',description:'开发者调整全局默认参数和开放开关',options:[{type:5,name:'开放',description:'是否接受玩家生图请求'},...settingOptions]},
 {type:1,name:'试画',description:'开发者在开放前用当前默认参数试画',options:[{type:3,name:'描述',description:'画面提示词',required:true,max_length:4000},...settingOptions]}
]};
export async function handleImageCommand(env,i,action){
 try{
  const user=String(i.member?.user?.id||i.user?.id||'');
  const admin=Boolean(env.DEVELOPER_DISCORD_USER_ID)&&user===String(env.DEVELOPER_DISCORD_USER_ID);
  if(['默认','试画'].includes(action.name)&&!admin)return privateReply('只有开发者可以调整默认参数或开放前试画。');
  const values=Object.fromEntries((action.options||[]).map(o=>[o.name,o.value]));
  const params=values.参数?JSON.parse(values.参数):{};
  for(const [name,key]of Object.entries(directOptions))if(Object.hasOwn(values,name))params[key]=values[name];
  if(values.尺寸){const [width,height]=values.尺寸.split('x').map(Number);params.width=width;params.height=height;}
  const result=await imageRpc(env,{action:action.name,user,admin,params,prompt:values.描述,id:String(i.id),channel:String(i.channel_id)});
  if(action.name==='查看')return imageSettingsReply(result,values);
  return privateReply(result.notice||JSON.stringify(result,null,2));
 }catch(e){return privateReply(e instanceof SyntaxError?'参数JSON格式有误。':e.message);}
}
export function imageSettingsReply(result,values={}){
 const labels={prompt_prefix:'前置正面',prompt_suffix:'后置正面',negative_prompt:'负面提示'},scope=values.范围||'effective';
 const config=scope==='defaults'?result.defaults:scope==='preferences'?result.preferences:{...result.defaults,...result.preferences};
 const names={effective:'当前生效',defaults:'默认参数',preferences:'个人覆盖'};
 if(TEXTS.includes(values.提示词)){
  const field=values.提示词,text=config[field];
  return {type:4,data:{flags:64,allowed_mentions:{parse:[]},content:'正面顺序：前置正面 → AI本次画面描述 → 后置正面；负面独立发送。',embeds:[{title:names[scope]+' · '+labels[field],description:text===undefined?'未设置，沿用默认。':text===''?'（空）':'```\n'+text+'\n```',color:0xe8a0b7}]}};
 }
 const scalar=Object.fromEntries(Object.entries(config).filter(([key])=>!TEXTS.includes(key)&&key!=='quality'));
 return privateReply(names[scope]+'\n'+JSON.stringify(scalar,null,2)+'\n'+TEXTS.map(k=>labels[k]+'：'+(Object.hasOwn(config,k)?config[k]===''?'空':config[k].length+'字':'沿用默认')).join('\n')+'\n正面顺序：前置正面 → AI本次画面描述 → 后置正面；负面独立。\n用 /ai 生图 查看 的「提示词」选项查看任意一栏全文。\n队列等待'+result.queued+'批；每批间隔35秒。');
}
export class NovelAIService{
 constructor(host,fetcher=fetch,now=()=>Date.now()){this.host=host;this.storage=host.ctx.storage;this.env=host.env;this.fetcher=fetcher;this.now=now;}
 async state(){
  const s=await this.storage.get('novelaiState');
  if(!s)return {defaults:{...IMAGE_DEFAULTS},defaultsRevision:4,queue:[],recent:[],notBefore:0,inflight:null};
  if((s.defaultsRevision||1)<2){s.defaults.cfg_rescale=0.15;s.defaultsRevision=2;await this.storage.put('novelaiState',s);}
  if(s.defaultsRevision<3){s.defaults={...s.defaults,prompt_prefix:DEFAULT_POSITIVE_PREFIX,prompt_suffix:DEFAULT_POSITIVE_SUFFIX,negative_prompt:DEFAULT_NEGATIVE_PROMPT,quality:false};s.defaultsRevision=3;await this.storage.put('novelaiState',s);}
  if(s.defaultsRevision<4){s.defaults.enabled=true;s.defaultsRevision=4;await this.storage.put('novelaiState',s);}
  return s;
 }
 async save(s){await this.storage.put('novelaiState',s);if(s.inflight)await this.storage.setAlarm(s.inflight.expires);else if(s.queue.length)await this.storage.setAlarm(Math.max(this.now()+1,s.notBefore));else await this.storage.deleteAlarm();}
 async dispatch(p){
  const s=await this.state(),key='imagePreferences:'+p.user;
  if(p.action==='status')return {configured:Boolean(this.env.NOVELAI_API_KEY),enabled:s.defaults.enabled,model:s.defaults.model,cfg_rescale:s.defaults.cfg_rescale,promptStructure:'prefix-ai-body-suffix',defaultsRevision:s.defaultsRevision,defaultPromptLengths:TEXTS.map(k=>({field:k,length:s.defaults[k].length})),queued:s.queue.length,busy:!!s.inflight,intervalSeconds:35};
  if(p.action==='查看')return {defaults:s.defaults,preferences:await this.storage.get(key)||{},queued:s.queue.length,busy:!!s.inflight,intervalSeconds:35};
  if(p.action==='默认'){
   if(!p.admin)throw Error('只有开发者可以调整默认参数。');
   s.defaults=resolveImageParameters({...s.defaults,...imageParameters(p.params,true)});await this.save(s);return {notice:'默认参数已更新。使用 /ai 生图 查看 可查看参数或三栏提示词全文。'};
  }
  if(p.action==='偏好'){
   const prefs={...await this.storage.get(key)||{},...imageParameters(p.params)};resolveImageParameters(s.defaults,prefs);
   await this.storage.put(key,prefs);return {notice:'个人生图偏好已保存；只对你生效。提示词按前置正面 → AI本次画面描述 → 后置正面拼接，负面独立发送。使用 /ai 生图 查看 可看全文。'};
  }
  if(p.action==='重置'){await this.storage.delete(key);return {notice:'已清除个人生图偏好，之后跟随默认参数。'};}
  if(!['绘制','试画'].includes(p.action))throw Error('未知生图操作。');
  if(p.action==='试画'&&!p.admin)throw Error('只有开发者可以开放前试画。');
  if(!s.defaults.enabled&&p.action!=='试画')return {notice:'生图功能已接入，正在等待开发者调整默认参数后开放。',accepted:false};
  if(!this.env.NOVELAI_API_KEY)throw Error('NovelAI 密钥尚未配置。');
  if(!/^\d{1,20}$/.test(p.user)||!/^\d{1,20}$/.test(p.id)||!/^\d{1,20}$/.test(p.channel))throw Error('生图请求来源无效。');
  if(s.recent.some(x=>x.id===p.id)||s.queue.some(x=>x.id===p.id)||s.inflight?.job.id===p.id)return {notice:'这条请求已经受理，不会重复生图。',accepted:false};
  if(s.queue.length>=20)throw Error('生图队列已满，请稍后再试。');
  if(s.queue.some(x=>x.user===p.user)||s.inflight?.job.user===p.user)throw Error('你还有生图请求在排队或生成，请等完成后再发起。');
  const prefs=p.action==='试画'?{}:await this.storage.get(key)||{};
  const params=resolveImageParameters(s.defaults,prefs,p.params||{}),request=imageRequest(p.prompt,params);
  s.queue.push({id:p.id,user:p.user,channel:p.channel,reference:p.reference||null,request,created:this.now()});
  await this.save(s);return {accepted:true,notice:`已加入生图队列：${params.width}×${params.height}，${params.steps}步，CFG ${params.scale}，rescale ${params.cfg_rescale}，${params.n_samples}张。前面有${s.queue.length-1+(s.inflight?1:0)}批；每批完成后至少间隔35秒。完成后会发到本频道。`};
 }
 async claim(){
  const s=await this.state(),now=this.now();
  if(s.inflight){
   if(s.inflight.expires>now){await this.save(s);return null;}
   const job=s.inflight.job;s.inflight=null;s.recent.push({id:job.id,status:'unknown',at:now});s.recent=s.recent.slice(-500);s.notBefore=now+BATCH_INTERVAL;await this.save(s);return {expired:job};
  }
  if(!s.queue.length||s.notBefore>now){await this.save(s);return null;}
  const job=s.queue.shift();
  if(now-job.created>30*60000){s.recent.push({id:job.id,status:'expired',at:now});s.recent=s.recent.slice(-500);await this.save(s);return {expired:job};}
  s.inflight={job,expires:now+LEASE};await this.save(s);return {job};
 }
 async alarm(){
  const claim=await this.host.ctx.blockConcurrencyWhile(()=>this.claim());
  if(!claim)return;
  if(claim.expired){await this.notice(claim.expired,'这次生图已过期或结果无法确认，没有自动重试，请检查频道后重新发起。');return;}
  const {job}=claim;let status='failed';
  try{
   const response=await this.fetcher('https://image.novelai.net/ai/generate-image',{method:'POST',headers:{Authorization:'Bearer '+this.env.NOVELAI_API_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(job.request),signal:AbortSignal.timeout(100000)});
   if(!response.ok){const e=Error('novelai_http');e.status=response.status;throw e;}
   const data=await response.json();
   if(!Array.isArray(data.images)||data.images.length!==job.request.parameters.n_samples)throw Error('invalid_image_response');
   const form=new FormData(),attachments=[];let total=0;
   for(const [index,item]of data.images.entries()){
    if(typeof item.image!=='string'||item.image.length>14000000)throw Error('invalid_image_response');
    const raw=atob(item.image),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));total+=bytes.length;
    if(total>9500000||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error('invalid_image_response');
    const filename=`novelai-${index+1}.png`;form.append(`files[${index}]`,new Blob([bytes],{type:'image/png'}),filename);attachments.push({id:index,filename});
   }
   const p=job.request.parameters;
   form.append('payload_json',JSON.stringify({content:`🎨 <@${job.user}> · NovelAI · ${p.width}×${p.height} · ${p.steps}步 · CFG ${p.scale} · 种子 ${p.seed}`,attachments,nonce:job.id,enforce_nonce:true,allowed_mentions:{parse:[]},...(job.reference?{message_reference:{message_id:job.reference,fail_if_not_exists:false}}:{})}));
   const sent=await this.fetcher('https://discord.com/api/v10/channels/'+job.channel+'/messages',{method:'POST',headers:{Authorization:'Bot '+this.env.BOT_TOKEN},body:form,signal:AbortSignal.timeout(15000)});
   if(!sent.ok){status='delivery_failed';throw Error('image_delivery_failed');}status='sent';
  }catch(e){await this.notice(job,status==='delivery_failed'?'图片已生成，但发送失败；没有自动重新生图。':e.status===401||e.status===403?'NovelAI 凭证无效或没有访问权限，请联系开发者。':e.status===402?'NovelAI 额度不足，请联系开发者。':e.status===429?'NovelAI 当前限流；本次没有自动重试，请稍后重新发起。':'本次生图失败或结果无法确认，没有自动重试。若频道已出现图片，请勿重复发起。');}
  finally{
   await this.host.ctx.blockConcurrencyWhile(async()=>{const s=await this.state();if(s.inflight?.job.id!==job.id)return;s.inflight=null;s.notBefore=this.now()+BATCH_INTERVAL;s.recent.push({id:job.id,status,at:this.now()});s.recent=s.recent.slice(-500);await this.save(s);});
  }
 }
 async notice(job,content){try{await this.fetcher('https://discord.com/api/v10/channels/'+job.channel+'/messages',{method:'POST',headers:{Authorization:'Bot '+this.env.BOT_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]},nonce:job.id,enforce_nonce:true,...(job.reference?{message_reference:{message_id:job.reference,fail_if_not_exists:false}}:{})}),signal:AbortSignal.timeout(8000)});}catch{}}
}
