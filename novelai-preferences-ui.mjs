// Native Discord private settings; rpc is supplied by the transport module.
import {V5_MODELS} from './novelai-v5.mjs';

export const IMAGE_MODEL_CHOICES=[...V5_MODELS,['NovelAI V4.5 Full','nai-diffusion-4-5-full'],['NovelAI V4.5 Curated','nai-diffusion-4-5-curated'],['NovelAI V4 Full','nai-diffusion-4-full'],['NovelAI V3','nai-diffusion-3']];
const PREFIX='nip';
const LABELS={prompt_prefix:'前置正面',prompt_suffix:'后置正面',negative_prompt:'负面提示'};
const GROUPS={basic:[['width','宽度（64的倍数）'],['height','高度（64的倍数）'],['steps','步数（1–50）'],['scale','引导强度 CFG（0–10）'],['n_samples','每批张数（1–4）']],advanced:[['seed','种子（-1为随机）'],['cfg_rescale','Rescale（0–1）']]};
const SELECTS={
 model:{label:'模型',choices:IMAGE_MODEL_CHOICES},
 sampler:{label:'采样器',choices:[['Euler','k_euler'],['Euler Ancestral','k_euler_ancestral'],['DPM++ 2M','k_dpmpp_2m'],['DPM++ 2S Ancestral','k_dpmpp_2s_ancestral'],['DPM++ SDE','k_dpmpp_sde']]},
 noise_schedule:{label:'噪声调度',choices:[['Karras','karras'],['Exponential','exponential'],['Polyexponential','polyexponential'],['Native','native']]}
};
const privateReply=content=>({type:4,data:{content:String(content).slice(0,1900),flags:64,allowed_mentions:{parse:[]}}});
const owner=i=>String(i.member?.user?.id||i.user?.id||'');
const key=(i,action)=>`${PREFIX}:${i.guild_id}:${owner(i)}:${action}`;
const row=components=>({type:1,components});
const button=(i,action,label,style=2)=>({type:2,custom_id:key(i,action),label,style});
const effective=s=>({...s.defaults,...s.preferences});
const own=(s,k)=>Object.hasOwn(s.preferences,k);
const source=(s,k)=>own(s,k)?'个人设置':'跟随默认';
const numberValue=(s,k)=>`${effective(s)[k]} · ${source(s,k)}`;
const templateValue=(s,k)=>`${source(s,k)} · ${effective(s)[k].length?effective(s)[k].length+'字':'空段'}`;
function panelReply(i,data){return {type:i.type===2||!i.message?4:7,data:{...data,...(i.type===2||!i.message?{flags:64}:{}),allowed_mentions:{parse:[]}}};}
function baseData(i,s,notice=''){
 const p=effective(s);
 return {content:notice||'这些设置只对你生效，并在所有服务器共用；本次对话中指定的参数优先。',embeds:[{title:'🎨 我的生图设置',color:0xe8a0b7,description:'点按钮打开填写窗口，或用下拉菜单选择。\n正面顺序：前置正面 → AI本次画面 → 后置正面；负面独立。',fields:[
  {name:'图片尺寸',value:`宽：${numberValue(s,'width')}\n高：${numberValue(s,'height')}`,inline:true},
  {name:'生成参数',value:`步数：${numberValue(s,'steps')}\nCFG：${numberValue(s,'scale')}\nRescale：${numberValue(s,'cfg_rescale')}`,inline:true},
  {name:'张数与种子',value:`张数：${numberValue(s,'n_samples')}\n种子：${p.seed===-1?'随机':p.seed} · ${source(s,'seed')}`,inline:true},
  ...Object.keys(LABELS).map(k=>({name:LABELS[k],value:templateValue(s,k),inline:true}))
 ],footer:{text:'保存设置不会触发生图；已排队图片继续使用提交时的参数。'}}],components:[
  row([button(i,'basic','基础数值',1),button(i,'advanced','进阶数值'),button(i,'templates','提示词模板'),button(i,'reset','恢复全部默认',4),button(i,'home','刷新')]),
  ...Object.entries(SELECTS).map(([field,def])=>row([{type:3,custom_id:key(i,'select_'+field),placeholder:def.label,min_values:1,max_values:1,options:[{label:'跟随默认',description:'当前默认：'+(def.choices.find(([,v])=>v===s.defaults[field])?.[0]||s.defaults[field]),value:'inherit',default:!own(s,field)},...def.choices.map(([label,value])=>({label,value,default:own(s,field)&&s.preferences[field]===value}))]}]))
 ]};
}
function templateData(i,s,notice=''){
 return {content:notice||'每栏可单独修改。点击“编辑”会带入当前生效的完整内容；保存空白会清空该段。',embeds:[{title:'📝 我的提示词模板',color:0xe8a0b7,description:'前置正面 → AI本次画面描述 → 后置正面\n负面提示独立发送。',fields:Object.keys(LABELS).map(k=>({name:LABELS[k],value:templateValue(s,k)})),footer:{text:'“跟随默认”只移除该栏的个人覆盖，其他设置保持。'}}],components:[
  ...Object.entries(LABELS).map(([field,label])=>row([button(i,'edit_'+field,'编辑'+label,1),button(i,'inherit_'+field,label+'跟随默认')])),row([button(i,'home','返回个人设置')])
 ]};
}
function inputLabel(label,description,field,value,placeholder,style=1,maxLength=32){
 return {type:18,label,description,component:{type:4,custom_id:field,style,required:false,max_length:maxLength,...(value!==undefined?{value:String(value)}:{}),placeholder}};
}
function modal(i,s,group){
 if(GROUPS[group])return {type:9,data:{custom_id:key(i,'save_'+group),title:group==='basic'?'我的生图 · 基础数值':'我的生图 · 进阶数值',components:GROUPS[group].map(([field,label])=>inputLabel(label,'留空将移除这一项个人设置，重新跟随默认。',field,s.preferences[field],'当前默认：'+s.defaults[field]))}};
 const field=group.slice(5);
 if(!Object.hasOwn(LABELS,field))throw Error('无效的设置项，请重新打开个人设置。');
 return {type:9,data:{custom_id:key(i,'save_'+field),title:'我的生图 · '+LABELS[field],components:[inputLabel(LABELS[field],'保存空白表示此段不使用；恢复默认请点面板里的“跟随默认”。',field,effective(s)[field],'填写完整提示词',2,4000)]}};
}
function fieldsOf(i){
 const values={};
 const walk=components=>{for(const c of components||[]){if(c.type===4){if(Object.hasOwn(values,c.custom_id))throw Error('表单字段重复，请重新打开填写窗口。');values[c.custom_id]=c.value;}if(c.component)walk([c.component]);if(c.components)walk(c.components);}};
 walk(i.data?.components);return values;
}
export const imagePreferencesInteraction=i=>[3,5].includes(i.type)&&String(i.data?.custom_id||'').startsWith(PREFIX+':');
export async function openImagePreferences(i,rpc){
 try{if(!i.guild_id||!owner(i))return privateReply('请在服务器内打开个人设置。');const s=await rpc({action:'查看',user:owner(i)});return panelReply(i,baseData(i,s));}catch(e){return privateReply(e.message);}
}
export async function handleImagePreferences(i,rpc){
 try{
  const match=String(i.data?.custom_id||'').match(/^nip:(\d{1,20}):(\d{1,20}):([a-z_]+)$/);
  if(!match||match[1]!==String(i.guild_id)||match[2]!==owner(i))return privateReply('这是其他用户的个人设置，请使用 /ai 生图 偏好 打开自己的面板。');
  if((i.type===3||i.message)&&!(Number(i.message?.flags)&64))return privateReply('请使用 /ai 生图 偏好 重新打开私密设置面板。');
  const action=match[3],user=owner(i);
  if(i.type===5){
   if(!action.startsWith('save_'))throw Error('无效的设置表单。');
   const group=action.slice(5),values=fieldsOf(i),params={},unset=[];
   if(GROUPS[group]){
    const expected=GROUPS[group].map(([k])=>k);
    if(Object.keys(values).some(k=>!expected.includes(k))||expected.some(k=>!Object.hasOwn(values,k)))throw Error('设置表单不完整，请重新打开填写窗口。');
    for(const field of expected){const raw=String(values[field]??'').trim();if(!raw){unset.push(field);continue;}const number=Number(raw);if(!Number.isFinite(number))throw Error('数值设置只能填写数字；留空可跟随默认。');params[field]=number;}
   }else if(Object.hasOwn(LABELS,group)){
    if(Object.keys(values).length!==1||typeof values[group]!=='string')throw Error('提示词表单无效，请重新打开。');params[group]=values[group];
   }else throw Error('无效的设置表单。');
   await rpc({action:'偏好编辑',user,params,unset});
   const s=await rpc({action:'查看',user});return panelReply(i,Object.hasOwn(LABELS,group)?templateData(i,s,'这一栏已保存，仅对你生效。'):baseData(i,s,'个人参数已保存，下一次生图时生效。'));
  }
  if(i.type!==3)throw Error('无效的个人设置操作。');
  if(action.startsWith('save_'))throw Error('请通过填写窗口提交设置。');
  if(action==='reset')return panelReply(i,{content:'确定恢复全部默认吗？这会移除你所有个人覆盖；不会改全局默认或已排队的图片。',embeds:[],components:[row([button(i,'reset_confirm','确认恢复默认',4),button(i,'home','取消')])]});
  let notice='';
  if(action==='reset_confirm'){await rpc({action:'重置',user});notice='已恢复全部默认。';}
  else if(action.startsWith('select_')){
   const field=action.slice(7),value=i.data.values?.[0];if(!Object.hasOwn(SELECTS,field)||i.data.values?.length!==1||(value!=='inherit'&&!SELECTS[field].choices.some(([,v])=>v===value)))throw Error('无效的选项，请刷新面板。');
   await rpc({action:'偏好编辑',user,params:value==='inherit'?{}:{[field]:value},unset:value==='inherit'?[field]:[]});notice='选择已保存，下一次生图时生效。';
  }else if(action.startsWith('inherit_')){
   const field=action.slice(8);if(!Object.hasOwn(LABELS,field))throw Error('无效的模板设置。');await rpc({action:'偏好编辑',user,params:{},unset:[field]});notice='这一栏已恢复跟随默认。';
  }else if(!['home','templates','basic','advanced'].includes(action)&&!action.startsWith('edit_'))throw Error('无效的个人设置操作。');
  const s=await rpc({action:'查看',user});
  if(GROUPS[action]||action.startsWith('edit_'))return modal(i,s,action);
  return panelReply(i,action==='templates'||action.startsWith('inherit_')?templateData(i,s,notice):baseData(i,s,notice));
 }catch(e){return privateReply('设置未完成：'+e.message);}
}
