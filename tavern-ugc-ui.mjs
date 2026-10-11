import {tavernRequest} from './tavern-service.mjs';
import {generateUgcCandidate} from './tavern-ugc-ai.mjs';
import {isAlcoholicUGCDraft} from './tavern-ugc-catalog.mjs';

const mentions={parse:[]},row=(...components)=>({type:1,components});
const cid=(g,u,a)=>`t:${g}:${u}:${a}`;
const button=(g,u,a,label,style=2,disabled=false)=>({type:2,custom_id:cid(g,u,a),label:String(label).slice(0,80),style,disabled});
const sessionButton=(g,u,s,a,label,style=2,disabled=false)=>button(g,u,`${a}~${s.id}~${s.revision}`,label,style,disabled);
const okId=x=>/^\d{1,20}$/.test(String(x||''));
const editFields=[['name','名称'],['type','类型'],['ingredients','食材'],['flavor','风味/口感'],['method','制作概述'],['temperature','温度'],['servingSizeMl','容量 ml'],['alcoholPercent','酒精度 %'],['description','介绍'],['appearance','摆盘/外观'],['lore','创作缘由']];
const clean=(v,n=300)=>String(v??'').replace(/<@!?\d+>/g,'＠').replace(/@/g,'＠').replace(/[\r\n]+/g,' ').slice(0,n)||'未填写';
const mentionAllowed={parse:[]};
const typeNames={drink:'饮品',dessert:'甜点',savory:'小食/主食'},tempNames={warm:'温热',cold:'冰凉',room:'常温'},equipmentNames={coffee_machine:'咖啡机',baking_oven:'烘焙烤箱',blender:'搅拌机',ice_cream_maker:'冰淇淋机'};
function routeAction(i){
 if(i.type===2&&i.data?.name==='酒馆'){
  const name=i.data.options?.[0]?.name;
  return ['研发','我的作品'].includes(name)?name:null;
 }
 if([3,5].includes(i.type)){
  const parts=String(i.data?.custom_id||'').split(':');
  return parts.length===4&&parts[0]==='t'&&parts[3].startsWith('ugc')?parts[3]:null;
 }
 return null;
}
function actionContext(value){const parts=String(value||'').split('~');const rev=Number(parts.at(-1)),sessionId=parts.at(-2);if(/^ugc_[\w-]{10,60}$/.test(sessionId||'')&&Number.isInteger(rev)){return {action:parts.slice(0,-2).join('~'),sessionId,revision:rev};}return {action:String(value||''),sessionId:null,revision:null};}
export function ugcInteraction(i){return routeAction(i)!==null;}
function validate(i){
 const g=String(i.guild_id||''),u=String(i.member?.user?.id||''),ch=String(i.channel_id||'');
 if(!okId(g)||!okId(u)||!okId(ch))throw Error('请在服务器文字频道内使用研发功能。');
 let action=routeAction(i),owner=u;
 if(i.type!==2){const p=String(i.data.custom_id).split(':');if(p.length!==4||p[0]!=='t'||p[1]!==g)throw Error('研发面板已失效，请重新打开。');owner=p[2];action=p[3];if(owner==='any'&&action!=='ugcBrowse')throw Error('此公开按钮只能打开创作菜单。');if(owner!=='any'&&owner!==u)throw Error('这是另一位来客的私密研发面板。');if(i.type===3&&owner!=='any'&&!(Number(i.message?.flags)&64))throw Error('请从本人私密研发面板继续操作。');}
 const ctx=actionContext(action);return {g,u,ch,...ctx,name:i.member?.nick||i.member?.user?.global_name||i.member?.user?.username||'来客'};
}
export function immediateUgcReply(i){if(!ugcInteraction(i))return null;try{const p=validate(i);if(i.type===3&&p.action==='ugcChat')return modal(p.g,p.u,`ugcSubmitTurn~${p.sessionId}~${p.revision}`,'告诉她我的想法','最多800字',800);if(i.type===3&&p.action==='ugcPrice')return modal(p.g,p.u,`ugcSetPrice~${p.sessionId}~${p.revision}`,'菜品售价','输入整数，范围10～50币',2,2);if(i.type===3&&p.action==='ugcBrowseSearch')return modal(p.g,p.u,'ugcSearchList','搜索创作菜单','输入菜名或作者',60,1);if(i.type===3&&p.action.startsWith('ugcEdit~')){const target=p.action.slice(8);if(!editFields.some(([key])=>key===target))throw Error('请选择菜品卡中的字段。');return modal(p.g,p.u,`ugcEditText~${target}~${p.sessionId}~${p.revision}`,'修改菜品卡',`描述希望怎样修改：${editFields.find(x=>x[0]===target)[1]}`,800);}return null;}catch(e){return {type:4,data:{content:e.message,flags:64,allowed_mentions:mentions}};}}
export function ugcDeferredReply(i){if(!ugcInteraction(i))return null;if(i.type===3){const p=String(i.data?.custom_id||'').split(':');if(p[2]==='any')return {type:5,data:{flags:64}};const ctx=actionContext(p[3]);if(ctx.action==='ugcRetry')return {type:7,data:{content:'⏳ 已收到重试，正在用上一轮原文重新生成。完成后这张菜品卡会自动更新；原要求仍保存在私密会话中。',components:[row(sessionButton(p[1],p[2],{id:ctx.sessionId,revision:ctx.revision},'ugcView','刷新研发面板'))],allowed_mentions:mentions}};return {type:6};}return {type:5,data:{flags:64}};}
async function call(env,p){return tavernRequest(env,p);}
const baseOf=p=>({guild:p.g,id:p.u,name:p.name,channel:p.ch});
function sessionOf(b){return b?.session||b?.mine?.session||null;}
function dishText(d){
 const fields=d?.draft||d?.recipe||d||{};
 const ingredients=Array.isArray(fields.ingredients)?fields.ingredients.join('、'):fields.ingredients;
 return [`**${clean(fields.name,24)}** · ${clean(typeNames[fields.type]||fields.type,30)}`,`食材：${clean(ingredients,300)}`,`风味：${clean(fields.flavor,100)}`,`制作：${clean(fields.method,300)}`,`温度：${clean(tempNames[fields.temperature]||fields.temperature,30)}`,...(isAlcoholicUGCDraft(fields)?[`容量：${clean(fields.servingSizeMl,20)} ml`,`酒精度：${clean(fields.alcoholPercent,20)}% vol`]:[]),`介绍：${clean(fields.description,180)}`,`摆盘/外观：${clean(fields.appearance,200)}`,`创作缘由：${clean(fields.lore,120)}`,`设备要求：${clean(Array.isArray(fields.equipment)&&fields.equipment.length?fields.equipment.map(k=>equipmentNames[k]||k).join('、'):'无额外设备',100)}`,`售价：${Number.isInteger(d?.price)?`${d.price}币`:'待填写（10～50币）'}`,`作者：${clean(d?.author||d?.author_name,32)}`].join('\n');
}
function compactDishText(d){const f=d?.draft||d?.recipe||d||{},ingredients=Array.isArray(f.ingredients)?f.ingredients.join('、'):f.ingredients;return [`**${clean(f.name,24)}** · ${clean(typeNames[f.type]||f.type,30)}`,`食材：${clean(ingredients,300)}`,`风味：${clean(f.flavor,100)}`,`制作：${clean(f.method,120)}`,`温度：${clean(tempNames[f.temperature]||f.temperature,30)}`,...(isAlcoholicUGCDraft(f)?[`容量：${clean(f.servingSizeMl,20)} ml`,`酒精度：${clean(f.alcoholPercent,20)}% vol`]:[]),`介绍：${clean(f.description,90)}`,`摆盘：${clean(f.appearance,90)}`,`创作缘由：${clean(f.lore,80)}`,`设备：${clean(Array.isArray(f.equipment)&&f.equipment.length?f.equipment.map(k=>equipmentNames[k]||k).join('、'):'无额外设备',80)}`,`售价：${Number.isInteger(d?.price)?`${d.price}币`:'待填写（10～50币）'}`,`作者：${clean(d?.author||d?.author_name,32)}`].join('\n');}
function homePage(b,g,u){
 const s=sessionOf(b),parts=[];
 if(s){const draft=s.draft||{},required=[['name','名称'],['type','类型'],['ingredients','食材'],['flavor','风味/口感'],['method','制作概述'],['temperature','温度'],...(isAlcoholicUGCDraft(draft)?[['servingSizeMl','容量'],['alcoholPercent','酒精度']]:[]),['description','介绍'],['appearance','摆盘/外观']],missing=required.filter(([k])=>draft[k]===undefined||draft[k]===null||draft[k]===''||(Array.isArray(draft[k])&&!draft[k].length)).map(([,label])=>label);
  const candidate=s.edit_candidate;
  const candidatePreview=candidate?`\n\n**修改候选** · ${editFields.find(([k])=>k===candidate.target)?.[1]||'字段'}\n${clean(candidate.value,300)}\n采用后才会更新整张菜品卡。`:'';
  const lastReply=s.edit_history?.at(-1)?.reply||s.history?.at(-1)?.reply;
  parts.push(`🔒 **私密菜品卡 · 研发**\n${s.status==='CHOOSING'?'先选择菜品类型。':compactDishText(s)}${lastReply?`\n\n**当前引导**\n${clean(lastReply,350)}`:''}${candidatePreview}\n\n${missing.length?`还缺：${missing.join('、')}`:'配方信息已齐，可以检查定稿。'}${s.status==='GENERATING'?'\n\n正在整理这一轮，请稍候。':''}`);
  if(s.status==='CHOOSING'){
   parts.push(row(sessionButton(g,u,s,'ugcType~drink','🥤 饮品'),sessionButton(g,u,s,'ugcType~dessert','🍰 甜点'),sessionButton(g,u,s,'ugcType~savory','🥪 小食/主食')));
   parts.push(row(sessionButton(g,u,s,'ugcAskConfirm~cancel','取消研发',2)));
  } else {
   const generating=s.status==='GENERATING';
   const controls=[sessionButton(g,u,s,'ugcChat',s.retryText?'继续补充想法':'告诉她我的想法',1,generating),sessionButton(g,u,s,'ugcEdit','修改一项',2,generating||!!candidate),sessionButton(g,u,s,'ugcPrice','填写/修改售价',2,generating)];
   if(s.retryText)controls.push(sessionButton(g,u,s,'ugcRetry','重试上一轮',1,generating));
   parts.push(row(...controls));
   parts.push(row(sessionButton(g,u,s,`ugcAskConfirm~undo`,'回退上一轮',2,generating||!(s.snapshots?.length)),sessionButton(g,u,s,'ugcAskConfirm~restart','重新研发'),sessionButton(g,u,s,'ugcAskConfirm~cancel','取消研发')));
   if(candidate)parts.push(row(sessionButton(g,u,s,`ugcEdit~${candidate.target}`,'继续讨论'),sessionButton(g,u,s,'ugcAdoptEdit~'+s.revision,'采用修改',1),sessionButton(g,u,s,'ugcDiscardEdit~'+s.revision,'放弃本次修改',2)));
   else if(s.edit_target)parts.push(row(sessionButton(g,u,s,'ugcDiscardEdit~'+s.revision,'放弃本次修改',2)));
   parts.push(row(sessionButton(g,u,s,'ugcPublish','检查定稿并确认入库',1,missing.length>0||!Number.isInteger(s.price)||!!candidate||!!s.edit_target||generating),sessionButton(g,u,s,'ugcView','刷新研发面板')));
  }
 } else {
  const publishedToday=!!b?.dailyPublished;
  parts.push(`🔒 **私密菜品研发**${publishedToday?'\n今天已成功研发一款，明天可再制作。':'\n每个服务器每天最多成功研发一款。'}\n研发和修改不收费；售价由你填写，范围为10～50币。模型只整理候选内容，确认入库后才会发布。`,row(button(g,u,'ugcStart',publishedToday?'今天已完成研发':'开始研发',1,publishedToday)));
 }
 const tally=b?.attemptsRemaining;if(tally!==undefined)parts[0]+=`\n今日可开始会话：${clean(tally,8)}`;
 parts.push(row(button(g,u,'ugcList','我的作品'),button(g,u,'menu','返回总菜单')));
 return {content:parts.shift().slice(0,1900),components:parts,allowed_mentions:mentionAllowed};
}
function listPage(b,g,u,mine=false){const items=b.items||[],page=b.page||0;const lines=items.map(x=>`• **${clean(x.name,24)}** · ${clean(x.author_name||x.authorName||x.author,40)} · ${Number.isInteger(x.price)?`${x.price}币`:'—'}${x.status==='active'?'':' · 已下架'}`);const comps=[];
 if(mine&&items.some(x=>x.status==='active')){const active=items.filter(x=>x.status==='active').slice(0,25);comps.push(row({type:3,custom_id:cid(g,u,'ugcWithdrawPick'),placeholder:'选择要下架的作品',min_values:1,max_values:1,options:active.map(x=>({label:clean(x.name,96),value:String(x.id).slice(0,100)}))}));}
 if(b.hasMore)comps.push(row(button(g,u,`ugcListPage~${page+1}`,'下一页')));
 comps.push(row(button(g,u,'ugcView','我的研发'),button(g,u,'menu','返回总菜单')));
 return {content:`🔒 **我的作品**\n${lines.join('\n')||'还没有发布作品。'}\n\n作品仅在本服务器显示；下架不返还当天研发名额。`,components:comps,allowed_mentions:mentionAllowed};
}
function encodeQuery(s){const bytes=new TextEncoder().encode(s);let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decodeQuery(s){try{const raw=atob(String(s).replaceAll('-','+').replaceAll('_','/'));return new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));}catch{return '';}}
function browsePage(b,g,u,query=''){const items=b.items||[],page=b.page||0,components=[];if(items.length)components.push(row({type:3,custom_id:cid(g,u,'ugcBrowsePick'),placeholder:'选择一款创作菜品，打开私密点单预览',min_values:1,max_values:1,options:items.slice(0,20).map(x=>({label:clean(x.name,86),value:String(x.id).slice(0,100),description:`${clean(x.author,32)} · ${x.price}币`.slice(0,100)}))}));const nav=[],token=query?encodeQuery([...query].slice(0,8).join('')):'';if(page>0)nav.push(button(g,u,`ugcB~${page-1}~${token}`,'上一页'));if(b.hasMore)nav.push(button(g,u,`ugcB~${page+1}~${token}`,'下一页'));nav.push(button(g,'any','ugcBrowse','刷新'),button(g,u,'ugcBrowseSearch','搜索'),button(g,u,'ugcView','我的研发'));components.push(row(...nav.slice(0,5)));return {content:`🔒 **大家的创作菜单** · 第 ${page+1} 页${query?` · 搜索：${clean(query,8)}`:''}\n${items.map(x=>`• **${clean(x.name,24)}** · ${clean(x.author,32)} · ${Number.isInteger(x.price)?`${x.price}币`:''}`).join('\n')||'这里还没有公开作品。'}\n\n选择作品只会打开你的私密点单预览；确认前不会扣款。`,components,allowed_mentions:mentionAllowed};}
function modal(g,u,action,title,label,max=800,min=1){return {type:9,data:{custom_id:cid(g,u,action),title,components:[row({type:4,custom_id:'value',label,style:2,min_length:min,max_length:max,required:true})]}};}
function valueFrom(i,key='value'){return i.data?.components?.flatMap(x=>x.components||[]).find(x=>x.custom_id===key)?.value??'';}
function failedTurnPage(view,g,u,isEdit){const page=homePage(view,g,u);page.content=`⚠️ ${isEdit?'本轮修改':'本轮研发'}没有完成，菜品卡未改变；你输入的要求已经暂存。点击“重试上一轮”会用原文重新生成，无需重打。\n\n${page.content}`.slice(0,1900);return page;}
async function runTurn(env,p,turn,turnBase){
 const isEdit=!!turn.target,model=await generateUgcCandidate(env,{...turn,text:turn.text});
 if(model.errorCode){console.warn('ugc_generation_failed',{reason:model.errorCode});const view=await call(env,{...turnBase,action:'ugcFailTurn',errorCode:model.errorCode});return failedTurnPage(view,p.g,p.u,isEdit);}
 try{return homePage(await call(env,{...turnBase,action:'ugcFinishTurn',reply:model.reply,patch:model.patch,missing:model.missing}),p.g,p.u);}
 catch(error){console.error('ugc_candidate_persist_failed',{reason:String(error?.message||error?.name||'unknown').slice(0,120)});const view=await call(env,{...turnBase,action:'ugcFailTurn',errorCode:'candidate_persist_failed'});return failedTurnPage(view,p.g,p.u,isEdit);}
}
async function dispatch(env,p,action,i){const base={...baseOf(p),...(p.sessionId?{sessionId:p.sessionId,revision:p.revision}:{})};
 if(action==='研发'||action==='ugcView'){return homePage(await call(env,{...base,action:'ugcView'}),p.g,p.u);}
 if(action==='创作菜单'||action==='ugcBrowse'){const b=await call(env,{...base,action:'ugcList',page:0});return browsePage(b,p.g,p.u);}
 if(action==='ugcSearchList'){const query=valueFrom(i).trim();if(!query||[...query].length>8)throw Error('请输入1～8字的菜名或作者关键词。');const b=await call(env,{...base,action:'ugcList',page:0,query});return browsePage(b,p.g,p.u,query);}
 if(action.startsWith('ugcB~')){const [,rawPage,encoded='']=action.split('~'),page=Number(rawPage);if(!Number.isSafeInteger(page)||page<0)throw Error('创作菜单页码无效。');const query=decodeQuery(encoded);return browsePage(await call(env,{...base,action:'ugcList',page,query}),p.g,p.u,query);}
 if(action==='ugcBrowsePick'){const item=i.data?.values?.[0];if(!item||!/^ugc_[\w-]{10,60}$/.test(item))throw Error('请选择创作菜单中的作品。');const d=await call(env,{...base,action:'prepare',item,options:{},requestKey:`i${i.id}`});return {content:`🍽️ **点单预览 · ${clean(d.details?.itemName||d.item,50)}**\n本单 **${d.price}币**${Number.isInteger(d.balance)?` · 当前余额 ${d.balance}币`:''}\n${d.status==='pending'?'尚未扣款；请打开本人私密确认窗口。':'这份订单已处理或过期。'}`,components:[row(button(p.g,p.u,`review~${d.id}`,'打开我的确认窗口',1)),row(button(p.g,p.u,'ugcList','我的作品'),button(p.g,'any','ugcBrowse','返回创作菜单'))],allowed_mentions:mentionAllowed};}
 if(action==='我的作品'||action==='ugcList'||action.startsWith('ugcListPage~')){const page=action.startsWith('ugcListPage~')?Number(action.split('~')[1])||0:0;return listPage(await call(env,{...base,action:'ugcList',page,mine:true}),p.g,p.u,true);}
 if(action==='ugcWithdrawPick'){const target=i.data?.values?.[0];if(!target||!/^ugc_[\w-]{10,60}$/.test(target))throw Error('请选择你在本服的作品。');await call(env,{...base,action:'ugcWithdraw',target});return listPage(await call(env,{...base,action:'ugcList',page:0,mine:true}),p.g,p.u,true);}
 if(action==='ugcStart'){return homePage(await call(env,{...base,action:'ugcStart'}),p.g,p.u);}
 if(action.startsWith('ugcType~')){const value=action.split('~')[1];if(!['drink','dessert','savory'].includes(value))throw Error('请选择有效的菜品类型。');return homePage(await call(env,{...base,action:'ugcType',value}),p.g,p.u);}
 if(action==='ugcChat')return modal(p.g,p.u,'ugcSubmitTurn','告诉她我的想法','最多800字',800);
 if(action==='ugcRetry'){
  const view=await call(env,{...base,action:'ugcView'}),s=sessionOf(view);
  if(!s?.retryText)throw Error('没有可重试的上一轮，请刷新菜品卡后继续。');
  if((base.sessionId&&s.id!==base.sessionId)||(base.revision!==undefined&&s.revision!==base.revision))throw Error('菜品卡已更新，请刷新后再重试。');
  const turn=await call(env,{...base,action:'ugcBeginTurn',text:s.retryText,...(s.retryTarget?{target:s.retryTarget}:{}),requestKey:i.id});
  if(turn.repeated)return homePage({session:turn.session},p.g,p.u);
  const turnBase={...base,sessionId:turn.session?.id||base.sessionId,revision:turn.revision,turnId:turn.turnId};
  return runTurn(env,p,turn,turnBase);
 }
 if(action==='ugcSubmitTurn'){
  const text=valueFrom(i);if(!text.trim()||text.length>800)throw Error('请输入1～800字的研发想法。');
  const turn=await call(env,{...base,action:'ugcBeginTurn',text:text.trim(),requestKey:i.id});
  if(turn.repeated)return homePage({session:turn.session,attemptsRemaining:undefined},p.g,p.u);
  const turnBase={...base,sessionId:turn.session?.id||base.sessionId,revision:turn.revision,turnId:turn.turnId};
  return runTurn(env,p,turn,turnBase);
 }
 if(action==='ugcEdit'){
  const context={id:p.sessionId,revision:p.revision},components=[];for(let n=0;n<editFields.length;n+=5)components.push(row(...editFields.slice(n,n+5).map(([target,label])=>sessionButton(p.g,p.u,context,`ugcEdit~${target}`,label))));
  components.push(row(sessionButton(p.g,p.u,context,'ugcView','取消并返回菜品卡')));
  return {content:'选择要逐项修改的字段。还没提交修改时，可以取消并返回菜品卡；提交后的候选也可以放弃。采用后才更新菜品卡。',components,allowed_mentions:mentionAllowed};
 }
 if(action.startsWith('ugcEdit~')){
  throw Error('请重新打开修改字段面板。');
 }
 if(action.startsWith('ugcEditText~')){
  const target=action.slice('ugcEditText~'.length);if(!editFields.some(([key])=>key===target))throw Error('修改字段已失效，请重新选择。');
  const text=valueFrom(i);if(!text.trim()||text.length>800)throw Error('请输入1～800字的修改想法。');
  const current=sessionOf(await call(env,{...base,action:'ugcView'}));
  if(!current?.edit_candidate)await call(env,{...base,action:'ugcEdit',target});
  const turn=await call(env,{...base,action:'ugcBeginTurn',text:text.trim(),target,requestKey:i.id});
  if(turn.repeated)return homePage({session:turn.session},p.g,p.u);
  const turnBase={...base,sessionId:turn.session?.id||base.sessionId,revision:turn.revision,turnId:turn.turnId};
  return runTurn(env,p,turn,turnBase);
 }
 if(action==='ugcSetPrice'){const raw=valueFrom(i);if(!/^\d+$/.test(raw)||Number(raw)<10||Number(raw)>50)throw Error('售价只能填写10～50之间的整数。');return homePage(await call(env,{...base,action:'ugcPrice',value:Number(raw)}),p.g,p.u);}
 if(action.startsWith('ugcAdoptEdit~'))return homePage(await call(env,{...base,action:'ugcAdoptEdit',revision:Number(action.split('~')[1])}),p.g,p.u);
 if(action.startsWith('ugcDiscardEdit~'))return homePage(await call(env,{...base,action:'ugcDiscardEdit',revision:Number(action.split('~')[1])}),p.g,p.u);
 if(action==='ugcPublish'){
  const b=await call(env,{...base,action:'ugcView'}),s=sessionOf(b);if(!s||!Number.isInteger(s.price)||s.edit_candidate)throw Error('请先填写售价并处理待采用的修改。');
  return {content:`请检查完整菜品卡：\n${dishText(s)}\n\n确认后会在本服务器公开，并占用今天的一款研发名额。`,components:[row(sessionButton(p.g,p.u,s,`ugcPublishNow~${s.revision}`,'确认入库',1),sessionButton(p.g,p.u,s,'ugcView','返回继续修改'))],allowed_mentions:mentionAllowed};
 }
 if(action.startsWith('ugcPublishNow~')){const s=base.sessionId?{id:base.sessionId}:sessionOf(await call(env,{...base,action:'ugcView'}));if(!s)throw Error('研发会话已失效，请刷新作品列表。');const result=await call(env,{...base,action:'ugcPublish',sessionId:s.id,revision:Number(action.split('~')[1]),requestKey:i.id});if(result?.dish)return {content:`✅ **已确认入库**\n**${clean(result.dish.recipe?.name,24)}**已发布到本服务器的总菜单，并按类型归入相应分类。\n作者：${clean(result.dish.author_name,32)} · 售价：${result.dish.recipe?.price}币\n今天的研发名额已使用。`,components:[row(button(p.g,p.u,'menu','查看总菜单'),button(p.g,p.u,'ugcList','我的作品'))],allowed_mentions:mentionAllowed};return homePage(result,p.g,p.u);}
 if(action.startsWith('ugcAskConfirm~')){const operation=action.split('~')[1];if(!['cancel','restart','undo'].includes(operation))throw Error('确认操作无效。');const c=await call(env,{...base,action:'ugcAskConfirm',operation});const labels={cancel:'取消研发并删除本次草稿？',restart:'清空本轮研发内容并重新选择类型？',undo:'撤销最近一轮研发问答？'};return {content:`${labels[operation]}\n确认凭证60秒有效，未确认不会修改草稿。`,components:[row(sessionButton(p.g,p.u,{id:base.sessionId,revision:base.revision},`ugcExecuteConfirm~${c.token}`,'确认执行',4),sessionButton(p.g,p.u,{id:base.sessionId,revision:base.revision},'ugcView','返回研发'))],allowed_mentions:mentionAllowed};}
 if(action.startsWith('ugcExecuteConfirm~')){const token=action.slice('ugcExecuteConfirm~'.length);if(!token||token.length>80)throw Error('确认面板已失效，请重新打开。');const receipt=await call(env,{...base,action:'ugcExecuteConfirm',token});const view=await call(env,{...base,action:'ugcView',sessionId:base.sessionId});const page=homePage(view,p.g,p.u);if(receipt.operation==='cancel')page.content=`已取消本次研发，草稿和临时问答已清除。\n\n${page.content}`;else if(receipt.operation==='restart')page.content=`已清空本轮内容，请重新选择类型。\n\n${page.content}`;return page;}
 if(action.startsWith('ugcWithdraw~')){const target=action.slice('ugcWithdraw~'.length);return homePage(await call(env,{...base,action:'ugcWithdraw',target}),p.g,p.u);}
 throw Error('研发面板已失效，请重新打开。');
}
function modelFailure(){return 'ugc_model_failure';}
export async function answerUgc(env,i){const p=validate(i);try{return await dispatch(env,p,p.action,i);}catch(e){return {content:e?.message||'操作没有完成，请重新打开研发面板。',flags:64,allowed_mentions:mentions};}}
