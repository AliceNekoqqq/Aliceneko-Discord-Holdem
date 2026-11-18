import {APPEARANCE_TURN_MAX_LENGTH} from './novelai-appearance.mjs';

const mentionAllowed={parse:[]};
const privateReply=content=>({type:4,data:{content,flags:64,allowed_mentions:mentionAllowed}});
const row=(...components)=>({type:1,components});
const customId=({guild,user,revision},operation)=>['nia',guild,user,operation,...(revision?[revision]:[])].join(':');
const button=(context,operation,label,style=2,disabled=false)=>({type:2,custom_id:customId(context,operation),label,style,disabled});
export const appearanceEditorEntry=(guild,user)=>row(button({guild,user},'open','AI 生成标签',1));
export const appearanceEditorInteraction=i=>[3,5].includes(i.type)&&String(i.data?.custom_id||'').startsWith('nia:');

export function appearanceEditorRequest(i){
 const match=String(i.data?.custom_id||'').match(/^nia:(\d{1,20}):(\d{1,20}):(open|edit|send|retry|save|discard)(?::([a-f0-9-]{36}))?$/);
 const member=i.member?.user;
 if(!match||member?.bot||match[1]!==i.guild_id||match[2]!==member?.id||!(Number(i.message?.flags)&64))throw Error('请用 /ai 生图 外貌 打开自己的私密面板。');
 const [,guild,user,operation,revision]=match;
 if((operation==='open')===Boolean(revision)||i.type!==(operation==='send'?5:3))throw Error('外貌面板已失效，请重新打开。');
 const request={guild,user,operation,revision,id:i.id};
 if(operation==='send'){
  const fields=i.data.components?.flatMap(field=>field.component?[field.component]:field.components||[])||[];
  const input=fields[0];
  request.text=input?.custom_id==='description'&&input.type===4&&typeof input.value==='string'?input.value.trim():'';
  if(fields.length!==1||!request.text||request.text.length>APPEARANCE_TURN_MAX_LENGTH)throw Error(`请填写1～${APPEARANCE_TURN_MAX_LENGTH}字的外貌描述。`);
 }
 return request;
}

function draftPanel(context,draft,content=''){
 const controls={...context,revision:draft.revision};
 const title=draft.canSave?'候选英文标签':'当前外貌提示词';
 const preview=draft.tags?'**'+title+'**\n```\n'+draft.tags.replace(/`/g,"'")+'\n```':'还没有外貌标签。';
 const notice=draft.busy?'正在整理上一轮描述，稍后可刷新。':draft.canRetry?'刚才那轮没有整理成功，已有标签草稿已保留。':'';
 return {content:content||notice,embeds:[{title:'我的外貌 · AI 标签助手',color:0xe8a0b7,
  description:[preview,draft.reply||'可以用中文描述发色、发型、瞳色、耳朵或其他常驻特征。',
   '继续补充或修改，满意后点「确认保存」。'].join('\n\n')}],
  components:[row(button(controls,'edit',draft.hasTurns?'继续修改':'描述我的外貌',1,draft.busy),
   ...(draft.canRetry?[button(controls,'retry','重试上一轮',2,draft.busy)]:[]),
   button(controls,'save','确认保存',3,draft.busy||!draft.canSave),
   button(context,'open','刷新'),button(controls,'discard','放弃草稿',2))],allowed_mentions:mentionAllowed};
}

export async function answerAppearanceEditor(request,rpc){
 try{
  const {guild,user,operation}=request;
  if(operation==='edit')return {type:9,data:{custom_id:customId(request,'send'),title:'告诉红小豆你的外貌',components:[
   {type:18,label:'外貌描述或修改要求',component:{type:4,custom_id:'description',style:2,required:true,max_length:APPEARANCE_TURN_MAX_LENGTH,
    placeholder:'例如：灰金色长卷发，蓝眼睛，精灵耳。或者：只把瞳色改成琥珀色。'}}]}};
  const result=await rpc(request);
  const data=operation==='open'?draftPanel(request,result):{content:result.notice,embeds:[],components:[appearanceEditorEntry(guild,user)],allowed_mentions:mentionAllowed};
  return {type:7,data};
 }catch(error){return privateReply(error.message);}
}

export async function runAppearanceTurn(request,rpc,generate){
 const turn=await rpc({...request,operation:'begin',retry:request.operation==='retry'});
 if(turn.duplicate)return;
 const result=await generate(turn).catch(()=>null);
 const draft=await rpc({...request,operation:'finish',result});
 return draftPanel({...request,revision:undefined},draft);
}
