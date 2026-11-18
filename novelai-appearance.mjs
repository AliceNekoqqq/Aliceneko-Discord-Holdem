export const APPEARANCE_MAX_LENGTH=1600;
export const APPEARANCE_TURN_MAX_LENGTH=1000;
const MAX_SUBJECTS=6;
const TURN_LEASE_MS=120000;
const isId=value=>typeof value==='string'&&/^\d{1,20}$/.test(value);
const appearanceKey=(guild,user)=>`imageAppearance:${guild}:${user}`;
const draftKey=(guild,user)=>`imageAppearanceDraft:${guild}:${user}`;

export const IMAGE_APPEARANCE_INSTRUCTION=[
 '生图主体身份：image 可额外返回 appearanceSubjects:[{"key":"current_user","detail":"English per-person visual details"}]。仅当本轮真正要求画某位 Discord 成员时选择 appearanceTargets 中的对应 key。',
 '用户说“画我”或“我和某人”时用 current_user；画本轮 @ 的真人时用对应 token 的 key；若明确要画被回复的真人作者，用标注 quotedAuthor 的 key。斜杠人物选择由程序明确指定 selected key。',
 'image.prompt 保留人物数量、整体场景与构图。按画面从左到右排列各主体，detail 只写这个人的动作、神情、穿搭或临时指定外观，不要猜测未提供的外貌。不要因某人被提到就把他画进去，也不使用历史艾特、未列出的 key 或数字ID。',
 '若本轮明确要求不使用设定或提供替代外貌，给该主体填 useSaved:false，并在 detail 或主体描述中写本次所需的外貌。程序会在生成时自动加入已保存的外貌词，聊天回复不得声称自己读到了这些词。'
].join(' ');

export function imageAppearanceTargets(text,message,reference,idsToKeys){
 const ids=new Map();
 const add=(user,extra)=>{
  const id=String(user?.id||'');
  const key=idsToKeys.get(id);
  if(key&&isId(id)&&!user.bot)ids.set(id,{...ids.get(id),id,key,...extra});
 };
 add(message.author,{});
 const direct=new Map([...text.matchAll(/<@!?(\d{1,20})>/g)].map(match=>[match[1],match[0]]));
 for(const user of message.mentions||[]){
  const token=direct.get(user?.id);
  if(token)add(user,{token});
 }
 add(reference?.author,{quotedAuthor:true});
 return [...ids.values()].slice(0,MAX_SUBJECTS+1);
}

export function resolveAppearanceSubjects(image,targets,selectedKey){
 const candidates=new Map(targets.map(target=>[target.key,target.id]));
 const resolved=new Map();
 for(const subject of (Array.isArray(image.appearanceSubjects)?image.appearanceSubjects:[]).slice(0,MAX_SUBJECTS)){
  const id=candidates.get(subject?.key);
  if(id&&!resolved.has(id))resolved.set(id,{id,detail:typeof subject.detail==='string'?subject.detail.trim().slice(0,500):'',useSaved:subject.useSaved!==false});
 }
 if(selectedKey){
  const id=candidates.get(selectedKey);
  if(id&&!resolved.has(id))resolved.set(id,{id,detail:'',useSaved:true});
 }
 return [...resolved.values()];
}

export async function manageAppearance(storage,{guild,user,appearance,clear}){
 if(!isId(guild)||!isId(user))throw Error('请在服务器内设置自己的外貌。');
 const key=appearanceKey(guild,user);
 if(clear===true){
  if(appearance!==undefined)throw Error('请单独选择清除或填写新提示词。');
  await storage.delete(draftKey(guild,user));
  await storage.delete(key);
  return {notice:'你的本服生图外貌已清除。'};
 }
 if(appearance!==undefined){
  const text=typeof appearance==='string'?appearance.trim():'';
  if(!text||text.length>APPEARANCE_MAX_LENGTH)throw Error(`请输入1–${APPEARANCE_MAX_LENGTH}字的外貌提示词。`);
  await storage.delete(draftKey(guild,user));
  await storage.put(key,text);
  return {notice:'已保存你的本服生图外貌。你或本服成员请红小豆画你时，可以用这份设定。'};
 }
 const current=await storage.get(key);
 return {notice:current?'你在本服的生图外貌\n'+current:'你还没有设置本服生图外貌。用 /ai 生图 外貌 填写提示词。'};
}

export function readAppearanceModelOutput(raw){
 return validateAppearanceCandidate(JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')));
}

function validateAppearanceCandidate(output){
 const reply=typeof output?.reply==='string'?output.reply.trim():'';
 const tags=typeof output?.tags==='string'?output.tags.trim():output?.tags;
 if(!reply||reply.length>320||(tags!==null&&(
  typeof tags!=='string'||tags.length>APPEARANCE_MAX_LENGTH||!/^[\x20-\x7E]+$/.test(tags)||!/[A-Za-z]/.test(tags)||tags.includes('`')
 )))throw Error('invalid_appearance_output');
 return {reply,tags};
}

// The image Durable Object serializes draft reads and writes. Model work happens between begin and finish.
export async function manageAppearanceDraft(storage,p,now){
 const {guild,user,operation,revision,id}=p;
 if(!isId(guild)||!isId(user))throw Error('请在服务器内打开自己的外貌助手。');
 const key=draftKey(guild,user);
 let draft=await storage.get(key);
 if(operation==='open'&&!draft){
  draft={revision:crypto.randomUUID(),tags:await storage.get(appearanceKey(guild,user))||'',reply:'',history:[]};
  await storage.put(key,draft);
 }
 if(draft?.pending&&draft.pending.until<=now){
  draft={...draft,revision:crypto.randomUUID(),failedText:draft.pending.text};
  delete draft.pending;
  await storage.put(key,draft);
 }
 const view=()=>({revision:draft.revision,tags:draft.tags,reply:draft.reply,hasTurns:draft.history.length>0,canSave:Boolean(draft.generated),busy:Boolean(draft.pending),canRetry:Boolean(draft.failedText)});
 if(operation==='open')return view();
 if(operation==='begin'&&id&&(draft?.pending?.id===id||draft?.lastTurnId===id))return {duplicate:true};
 if(!draft||revision!==draft.revision)throw Error('草稿已更新，请刷新外貌助手后继续。');
 if(operation==='discard'){
  await storage.delete(key);
  return {notice:'已放弃这份外貌草稿。'};
 }
 if(operation==='finish'){
  if(!isId(id)||draft.pending?.id!==id)throw Error('这轮外貌修改已失效，请刷新后继续。');
  const text=draft.pending.text;
  delete draft.pending;
  draft.revision=crypto.randomUUID();
  draft.lastTurnId=id;
  if(p.result){
   const {reply,tags}=validateAppearanceCandidate(p.result);
   if(tags!==null){draft.tags=tags;draft.generated=true;}
   draft.reply=reply;
   draft.history=[...draft.history,{text,reply}].slice(-4);
   delete draft.failedText;
  }else draft.failedText=text;
  await storage.put(key,draft);
  return view();
 }
 if(draft.pending)throw Error('上一轮还在整理，请稍后刷新。');
 if(operation==='save'){
  if(!draft.generated)throw Error('先整理出标签，再确认保存。');
  return manageAppearance(storage,{guild,user,appearance:draft.tags});
 }
 if(operation!=='begin'||!isId(id))throw Error('无效的外貌助手操作。');
 const text=p.retry?draft.failedText:typeof p.text==='string'?p.text.trim():'';
 if(!text||text.length>APPEARANCE_TURN_MAX_LENGTH)throw Error(`请填写1～${APPEARANCE_TURN_MAX_LENGTH}字的外貌描述。`);
 draft.pending={id,text,until:now+TURN_LEASE_MS};
 await storage.put(key,draft);
 return {tags:draft.tags,history:draft.history,text};
}

export async function loadAppearanceCaptions(storage,guild,appearanceSubjects){
 if(!isId(guild)||!Array.isArray(appearanceSubjects)||!appearanceSubjects.length)return [];
 const subjects=[...new Map(appearanceSubjects.slice(0,MAX_SUBJECTS).filter(subject=>isId(subject?.id)).map(subject=>[subject.id,subject])).values()];
 const profiles=await Promise.all(subjects.map(subject=>subject.useSaved===false?'':storage.get(appearanceKey(guild,subject.id))));
 const captions=subjects.map((subject,index)=>[
  profiles[index],typeof subject.detail==='string'?subject.detail.trim().slice(0,500):''
 ].filter(Boolean).join(', '));
 return captions.some(Boolean)?captions:[];
}
