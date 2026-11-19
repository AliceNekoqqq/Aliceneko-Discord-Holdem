import {isModelDeveloper,MODEL_ROLES,modelSettingsRpc,prepareModelConnection} from './ai-model-settings.mjs';

export const modelSettingsCommand={type:1,name:'模型',description:'开发者私密配置 AI 接口和用途模型'};
const mentions={parse:[]};
const pageSize=24;
const row=(...components)=>({type:1,components});
const componentId=(request,action)=>['aim',request.guild,request.user,action,request.revision,request.page].join(':');
const button=(request,action,label,style=2,disabled=false)=>({type:2,custom_id:componentId(request,action),label,style,disabled});
const reply=(content)=>({type:4,data:{content,flags:64,allowed_mentions:mentions}});
const renderModel=id=>id?'`'+id+'`':'跟随聊天默认';
export const isModelSettingsInteraction=i=>(i.type===2&&i.data?.name==='ai'&&i.data.options?.[0]?.name===modelSettingsCommand.name)||
 ([3,5].includes(i.type)&&String(i.data?.custom_id||'').startsWith('aim:'));

export function modelSettingsRequest(env,i){
 const user=i.member?.user;
 if(!user||user.bot||!isModelDeveloper(env,user.id))throw Error('只有开发者账号能修改模型配置。');
 const context={guild:i.guild_id,user:user.id};
 if(i.type===2)return {...context,action:'open',page:0};
 const match=String(i.data?.custom_id||'').match(/^aim:(\d{1,20}):(\d{1,20}):(edit|connect|prev|next|chat|image|appearance|save|discard):([a-f0-9]{16}):(\d{1,2})$/);
 if(!match||match[1]!==context.guild||match[2]!==context.user||!(Number(i.message?.flags)&64))throw Error('请重新运行 /ai 模型 打开私密面板。');
 const [, , ,action,revision,pageText]=match;
 const page=Number(pageText);
 const request={...context,action,revision,page};
 if(action==='connect'&&i.type===5){
  const fields=i.data.components?.flatMap(item=>item.component?[item.component]:item.components||[])||[];
  if(fields.length!==2||fields.some(field=>field.type!==4||typeof field.value!=='string'))throw Error('请重新填写 API 地址和 Key。');
  const field=id=>fields.find(candidate=>candidate.custom_id===id)?.value.trim();
  return {...request,url:field('url'),key:field('key')};
 }
 if(i.type!==3||action==='connect')throw Error('面板交互已失效。');
 if(Object.hasOwn(MODEL_ROLES,action)){
  const [value,extra]=i.data.values||[];
  if(i.data.component_type!==3||extra!==undefined||!/^(-1|\d{1,3})$/.test(value||''))throw Error('请从下拉列表中选择模型。');
  const index=Number(value);
  if(index!==-1&&(index<page*pageSize||index>=(page+1)*pageSize))throw Error('请从当前页选择模型。');
  return {...request,action:'choose',role:action,index};
 }
 if(i.data.component_type!==2)throw Error('面板交互已失效。');
 return request;
}

function modelSettingsPanel(env,request,state,content=''){
 const maxPage=Math.max(0,Math.ceil(state.catalog.length/pageSize)-1);
 const page=Math.max(0,Math.min(maxPage,request.page));
 const controls={...request,revision:state.revision,page};
 const active=state.activeHost||'Worker 默认配置';
 const models=state.activeHost?state.activeModels:{chat:env.GEMINI_MODEL,appearance:env.GEMINI_APPEARANCE_MODEL};
 const roles=Object.entries(MODEL_ROLES);
 const lines=['**正在使用**  '+active,...roles.map(([role,label])=>label+' · '+(role==='chat'&&!models.chat?'`内置默认`':renderModel(models[role])))];
 if(state.hasDraft){
  lines.push('', '**待保存**  '+state.host,...roles.map(([role,label])=>label+' · '+(role==='chat'&&!state.models.chat?'请选择':renderModel(state.models[role]))));
 }else if(!state.catalog.length){
  lines.push('','填写支持 OpenAI 格式的 API 地址，红小豆会读取该 Key 的模型列表。');
 }
 const start=page*pageSize;
 const selects=state.catalog.length?roles.map(([role,label])=>{
  const current=state.models[role];
  const options=state.catalog.slice(start,start+pageSize).map((id,i)=>({label:id.slice(0,100),value:String(start+i),default:current===id}));
  if(role!=='chat')options.unshift({label:'跟随聊天默认',value:'-1',default:!current});
  return row({type:3,custom_id:componentId(controls,role),placeholder:'选择'+label+'模型',options});
 }):[];
 if(state.catalog.length)lines.push('', '模型列表 '+(page+1)+'/'+(maxPage+1)+' 页 · '+state.catalog.length+' 个'+(state.total>state.catalog.length?'（接口共返回 '+state.total+' 个）':'')+'。选择后点「保存生效」。');
 const actions=[button(controls,'edit','填写 API 地址和 Key',1)];
 if(state.hasDraft)actions.push(button(controls,'save','保存生效',3,!state.models.chat),button(controls,'discard','放弃草稿'));
 return {content,embeds:[{title:'红小豆 · 模型配置',description:lines.join('\n'),color:0xe8a0b7}],allowed_mentions:mentions,components:[
  ...selects,...(maxPage>0?[row(button(controls,'prev','上一页',2,page===0),button(controls,'next','下一页',2,page===maxPage))]:[]),row(...actions)
 ]};
}

export async function answerModelSettings(env,request){
 try{
  if(request.action==='edit'){
   await modelSettingsRpc(env,{...request,action:'verify'});
   const field=(id,label,placeholder)=>({type:18,label,component:{type:4,style:1,custom_id:id,required:true,max_length:600,placeholder}});
   return {type:9,data:{title:'填写 API 连接',custom_id:componentId(request,'connect'),components:[
    field('url','API 代理地址','https://你的服务域名/v1'),field('key','API Key','只填要用于此地址的 API Key')
   ]}};
  }
  const pageChange=['prev','next'].includes(request.action);
  const state=await modelSettingsRpc(env,pageChange?{...request,action:'verify'}:request);
  const page=request.page+(request.action==='prev'?-1:request.action==='next'?1:0);
  const data=modelSettingsPanel(env,{...request,page},state,request.action==='save'?'已保存。下一次文字模型请求使用新配置。':request.action==='discard'?'已放弃草稿。':'');
  return request.action==='open'?{type:4,data:{...data,flags:64}}:{type:7,data};
 }catch(error){return reply(error.message);}
}

export async function finishModelConnection(env,request){
 const scope={guild:request.guild,user:request.user,revision:request.revision};
 try{
  await modelSettingsRpc(env,{...scope,action:'verify'});
  const connection=await prepareModelConnection(env,request);
  const state=await modelSettingsRpc(env,{...scope,action:'prepare',connection});
  return modelSettingsPanel(env,{...scope,page:0},state,'模型列表已加载。请选择用途，确认后保存。');
 }catch(error){
  const state=await modelSettingsRpc(env,{...scope,action:'open'}).catch(()=>null);
  return state?modelSettingsPanel(env,{...scope,page:0},state,error.message):{content:'模型配置暂不可用。请重新运行 /ai 模型。',embeds:[],components:[],allowed_mentions:mentions};
 }
}
