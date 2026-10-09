import test from 'node:test';
import assert from 'node:assert/strict';
import { immediatePetReply, petDeferredReply, petInteraction, answerPet, finishPet } from './pet-ui.mjs';
import { PETS } from './pet-catalog.mjs';

const interaction=(action,owner='12',flags=64,extra={})=>({type:3,id:'900',guild_id:'34',channel_id:'56',member:{user:{id:'12',username:'Ada'}},message:{flags},data:{custom_id:`p:34:${owner}:${action}`},...extra});
const view={pet:{id:'pet-1',species:'lamp-cat',name:'灯灯',growth:0,items:[],materials:{},habits:[],unlockedHabits:[],memories:[],experiences:[]},walk:null,walkView:null,reward:{used:0,earned:0,cap:20,totalEarned:12,totalCap:150},balance:30,items:[],materials:{paper:2},decor:{}};
function mockEnv(result=view){const calls=[];const env={TABLES:{idFromName:x=>x,get:()=>({fetch:async(_url,req)=>{const body=JSON.parse(req.body);calls.push(body);return new Response(JSON.stringify(body.op==='petHome'?{guild:null}:result),{status:200});}})}};return {env,calls};}

test('public lobby entry is recognized and always opens a private response',()=>{
 const i={type:3,id:'1',guild_id:'34',channel_id:'56',member:{user:{id:'12'}},message:{flags:0},data:{custom_id:'t:34:any:lobbyPet'}};
 assert.equal(petInteraction(i),true);assert.deepEqual(petDeferredReply(i),{type:5,data:{flags:64}});
});

test('non-owner and public action buttons are rejected before service access',async()=>{
 const publicAction=interaction('care','12',0);assert.match(immediatePetReply(publicAction).data.content,/私密/);
 const otherOwner=interaction('care','99',64);assert.match(immediatePetReply(otherOwner).data.content,/另一位/);
 await assert.rejects(answerPet({},otherOwner),/另一位/);
});

test('species preview opens a name modal and a shop preview performs no mutation',async()=>{
 const calls=[];const stub={TABLES:{idFromName:x=>x,get:()=>({fetch:async(_url,req)=>{calls.push(JSON.parse(req.body));return new Response(JSON.stringify({guild:null}),{status:200});}})}};
 const choose=interaction('name~lamp-cat');const modal=immediatePetReply(choose);assert.equal(modal.type,9);assert.equal(modal.data.custom_id,'p:34:12:save~lamp-cat');
 const purchase=interaction('buyPreview~bell-charm');const preview=await answerPet(stub,purchase);assert.match(preview.content,/尚未扣款/);assert.equal(calls.length,0);
});

test('walk choice carries the walk id and stale version to pet service',async()=>{
 const calls=[];const stub={TABLES:{idFromName:x=>x,get:()=>({fetch:async(_url,req)=>{const body=JSON.parse(req.body);calls.push(body);return new Response(JSON.stringify(body.op==='tavern'?{pet:{id:'pet-1',species:'lamp-cat',name:'灯灯',growth:0},walk:null,walkView:null,reward:{used:0,earned:0,cap:20},balance:6,items:[],materials:{},decor:{}}:{guild:null}),{status:200});}})}};
 const i=interaction('act~walk-abc~7~alley-scent');await answerPet(stub,i);assert.equal(calls.at(-1).action,'petAct');assert.equal(calls.at(-1).walkId,'walk-abc');assert.equal(calls.at(-1).version,7);assert.equal(calls.at(-1).choice,'alley-scent');
});

test('pet UI payloads disable mentions and stay within Discord component bounds',async()=>{
 const stub={TABLES:{idFromName:x=>x,get:()=>({fetch:async(_url,req)=>{const body=JSON.parse(req.body);return new Response(JSON.stringify(body.op==='tavern'?{pet:null,walk:null,reward:{used:0,earned:0,cap:20},balance:6,items:[],materials:{},decor:{}}:{guild:null}),{status:200});}})}};
 const data=await answerPet(stub,interaction('view'));assert.deepEqual(data.allowed_mentions,{parse:[]});assert(data.components.length<=5);for(const r of data.components){assert(r.components.length<=5);for(const c of r.components)assert(c.custom_id.length<=100);}
});

test('real pet UI message branches satisfy Discord legacy component payload constraints',async()=>{
 const owned={...view,pet:{...view.pet,unlockedHabits:['friendly']}};
 const walking={...owned,walk:{id:'walk-abc',version:7,phase:'playing',energy:6,bag:[],bagCapacity:3},walkView:{location:'灯巷',intent:'sniff',intentName:'闻一闻',choices:[{id:'bakery-friend',label:'和摊主聊聊雨天生意',cost:1,effect:'结识摊主',preferred:true},{id:'alley-scent',label:'循着雨后的花香走石阶',cost:1,effect:'记下花香'}]}};
 const routes=[
  ['empty panel',interaction('view'),{...view,pet:null}],
  ['owned panel',interaction('view'),owned],
  ['walking panel',interaction('view'),walking],
  ['coat menu',interaction('coatMenu'),owned],
  ['coat preview',interaction('coatPreview~silver'),owned],
  ['adoption preview',interaction('preview~dusk-rabbit~peach'),{...view,pet:null}],
  ['material shop',interaction('materials'),{...owned,materialBudget:{gathered:2,gatherCap:3,bought:4,buyCap:6}}],
  ['home and item shop',interaction('home'),owned],
  ['habits',interaction('habits'),owned],
  ['journal',interaction('journal'),owned],
  ['item purchase preview',interaction('buyPreview~bell-charm'),owned],
  ['material purchase preview',interaction('materialBuyPreview~cloth'),owned],
 ];
 for(const [label,i,result] of routes){
  const payload=await answerPet(mockEnv(result).env,i);
  assert.deepEqual(payload.allowed_mentions,{parse:[]},label);
  assert(Array.isArray(payload.components),`${label}: components array`);
  assert(payload.components.length<=5,`${label}: at most five action rows`);
  const ids=new Set();
  for(const actionRow of payload.components){
   assert.equal(actionRow.type,1,`${label}: action row type`);
   assert(Array.isArray(actionRow.components)&&actionRow.components.length>=1,`${label}: non-empty row`);
   assert(actionRow.components.length<=5,`${label}: at most five children per row`);
   const children=actionRow.components;
   const selects=children.filter(c=>c.type===3);
   assert(selects.length===0||children.length===1,`${label}: a select occupies its own row`);
   for(const c of children){
    assert([2,3].includes(c.type),`${label}: supported interactive component type`);
    assert.equal(typeof c.custom_id,'string',`${label}: custom_id is a string`);
    const idLength=Array.from(c.custom_id).length;
    assert(idLength>=1&&idLength<=100,`${label}: custom_id length ${idLength}`);
    assert(!ids.has(c.custom_id),`${label}: duplicate custom_id ${c.custom_id}`);ids.add(c.custom_id);
    if(c.type===2){
     const labelLength=Array.from(c.label||'').length;
     assert(labelLength>=1&&labelLength<=80,`${label}: button label length ${labelLength}`);
     assert([1,2,3,4].includes(c.style),`${label}: valid interactive button style`);
    }else{
     assert(Array.isArray(c.options)&&c.options.length>=1&&c.options.length<=25,`${label}: select option count`);
     assert(Array.from(c.placeholder||'').length<=150,`${label}: select placeholder length`);
     assert(Number.isInteger(c.min_values)&&Number.isInteger(c.max_values)&&c.min_values>=0&&c.min_values<=c.max_values&&c.max_values<=25,`${label}: valid select bounds`);
     for(const option of c.options){
      for(const field of ['label','value'])assert(Array.from(option[field]||'').length>=1&&Array.from(option[field]).length<=100,`${label}: option ${field} length`);
      if(option.description!==undefined)assert(Array.from(option.description).length<=100,`${label}: option description length`);
     }
    }
   }
  }
  if(payload.content!==undefined)assert(Array.from(payload.content).length<=2000,`${label}: content length`);
  if(payload.embeds!==undefined){
   assert(payload.embeds.length<=10,`${label}: embed count`);
   for(const embed of payload.embeds)if(embed.image?.url)assert(Array.from(embed.image.url).length<=2048,`${label}: image URL length`);
  }
 }
});

test('adoption modal enforces the service 24-character limit and claims only on submit',async()=>{
 const {env,calls}=mockEnv({...view,pet:{...view.pet,name:'新伙伴'}});const click=interaction('name~lamp-cat');const modal=immediatePetReply(click);assert.equal(modal.data.components[0].components[0].max_length,24);
 const submit={...click,type:5,message:{flags:64},data:{custom_id:'p:34:12:save~lamp-cat',components:[{components:[{custom_id:'petName',value:'团团'}]}]}};
 await answerPet(env,submit);assert.equal(calls[0].claim,true);assert.equal(calls[1].action,'petAdopt');assert.equal(calls[1].petName,'团团');
 assert.equal(calls[1].coat,'amber');
});

test('modal submit requires a private source message and still checks the real owner',async()=>{
 const base={...interaction('unused'),type:5,data:{custom_id:'p:34:12:save~lamp-cat',components:[{components:[{custom_id:'petName',value:'团团'}]}]}};
 const publicModal={...base,message:{flags:0}},missingSource={...base,message:undefined};
 assert.equal(immediatePetReply(publicModal).type,4);assert.match(immediatePetReply(publicModal).data.content,/私密/);
 assert.equal(immediatePetReply(missingSource).type,4);assert.match(immediatePetReply(missingSource).data.content,/重新打开/);
 await assert.rejects(answerPet({},publicModal),/私密/);await assert.rejects(answerPet({},missingSource),/重新打开/);
 const privateOtherOwner={...base,member:{user:{id:'99'}},message:{flags:64}};
 assert.match(immediatePetReply(privateOtherOwner).data.content,/另一位/);
});

test('starting selects one Chinese-labeled material and habits use an array',async()=>{
 const {env,calls}=mockEnv();const home=await answerPet(env,interaction('view'));const selector=home.components.flatMap(r=>r.components).find(c=>c.custom_id==='p:34:12:startMaterial');assert.equal(selector.options.length,6);assert(selector.options.some(x=>x.label.startsWith('纸片')));
 const start=interaction('startMaterial','12',64,{data:{custom_id:'p:34:12:startMaterial',values:['flower']}});await answerPet(env,start);assert.equal(calls.at(-1).action,'petStart');assert.equal(calls.at(-1).material,'flower');
 const habit=interaction('habit','12',64,{data:{custom_id:'p:34:12:habit',values:['friendly']}});await answerPet(env,habit);assert.equal(calls.at(-1).action,'petHabit');assert.deepEqual(calls.at(-1).habits,['friendly']);assert.equal('habit' in calls.at(-1),false);
});

test('owned items have an equip action and purchase preview remains read-only',async()=>{
 const {env,calls}=mockEnv({...view,items:['bell-charm']});const data=await answerPet(env,interaction('home'));assert(data.content.includes('金属片'));
 const equip=data.components.flatMap(r=>r.components).find(c=>c.custom_id==='p:34:12:equip~bell-charm');assert(equip&&!equip.disabled);await answerPet(env,interaction('equip~bell-charm'));assert.equal(calls.at(-1).action,'petEquip');assert.equal(calls.at(-1).item,'bell-charm');
 const before=calls.length;await answerPet(env,interaction('buyPreview~paper-pinwheel'));assert.equal(calls.length,before);
});

test('purchase confirmation carries catalog price and shop version; old and forged values are explicit',async()=>{
 const {env,calls}=mockEnv();const preview=await answerPet(env,interaction('buyPreview~bell-charm'));
 const confirm=preview.components[0].components[0];assert.equal(confirm.custom_id,'p:34:12:buy~bell-charm~30~v1');
 const before=calls.filter(x=>x.op==='tavern').length;await answerPet(env,interaction('buy~bell-charm~30~v1'));const legitimate=calls.findLast(x=>x.op==='tavern');assert.equal(legitimate.expectedPrice,30);assert.equal(legitimate.expectedShopVersion,'v1');
 await answerPet(env,interaction('buy~bell-charm~1~v1'));const forged=calls.findLast(x=>x.op==='tavern');assert.equal(forged.expectedPrice,1);assert.equal(forged.expectedShopVersion,'v1');
 await assert.rejects(answerPet(env,interaction('buy~bell-charm')),/预览版本已失效/);assert.equal(calls.filter(x=>x.op==='tavern').length,before+2);
});

test('experience history and panel content are bounded',async()=>{
 const giant={...view,pet:{...view.pet,memories:Array.from({length:80},(_,i)=>({text:`memory ${i} `.repeat(40)})),experiences:Array.from({length:80},(_,i)=>({event:`event ${i} `.repeat(40)}))}};
 const {env}=mockEnv(giant);const panel=await answerPet(env,interaction('view'));assert(panel.content.length<=2000);
 const journal=await answerPet(env,interaction('journal'));assert(journal.content.length<=2000);assert(journal.content.includes('memory 79')||journal.content.includes('event 79'));
});

test('completed receipt displays zero coins but retains XP and selected-material award',async()=>{
 const receiptView={...view,materials:{cloth:3},reward:{...view.reward,earned:20,totalEarned:150,totalCap:150},receipt:{coins:0,growth:10,materials:2,material:'cloth',rewarded:true}};
 const {env}=mockEnv(receiptView);const data=await answerPet(env,interaction('view'));assert(data.content.includes('0金币'));assert(data.content.includes('10成长点'));assert(data.content.includes('布料+2'));assert(data.content.length<=2000);
});

test('finishPet turns service errors into a private, usable return panel',async()=>{
 const {env}=mockEnv();env.TABLES.get=()=>({fetch:async(_url,req)=>{const body=JSON.parse(req.body);return new Response(JSON.stringify(body.op==='petHome'?{guild:null}:{error:'当前没有伙伴，请先领养。'}),{status:200});}});const old=globalThis.fetch;let payload;
 globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return new Response(null,{status:204});};
 try{await finishPet({...env,DISCORD_APPLICATION_ID:'77',BOT_TOKEN:'token'},interaction('care','12',64,{data:{custom_id:'p:34:12:care'}}));}finally{globalThis.fetch=old;}
 assert.match(payload.content,/当前没有伙伴/);assert(payload.components?.some(r=>r.components.some(c=>c.custom_id==='p:34:12:view')));assert.deepEqual(payload.allowed_mentions,{parse:[]});
});

test('finishPet falls back after HTTP failure without repeating a purchase mutation',async()=>{
 const {env,calls}=mockEnv();const oldFetch=globalThis.fetch,oldWarn=console.warn;const payloads=[],warnings=[];let n=0;
 globalThis.fetch=async(_url,options)=>{payloads.push(JSON.parse(options.body));return new Response(null,{status:++n===1?400:204});};console.warn=(...args)=>warnings.push(args);
 try{
  const result=await finishPet({...env,DISCORD_APPLICATION_ID:'77',BOT_TOKEN:'secret-token'},interaction('buy~bell-charm~30~v1'));
  assert.equal(result.content,'🐾 伙伴页面暂时显示失败，请重新打开「我的伙伴」查看已保存的结果。');
 }finally{globalThis.fetch=oldFetch;console.warn=oldWarn;}
 assert.equal(payloads.length,2);assert.equal(payloads[0].content.includes('伙伴小窝'),true);
 assert.deepEqual(payloads[1],{content:'🐾 伙伴页面暂时显示失败，请重新打开「我的伙伴」查看已保存的结果。',components:[],embeds:[],attachments:[],allowed_mentions:{parse:[]}});
 assert.equal(calls.filter(c=>c.action==='petBuy').length,1);assert.deepEqual(warnings,[['pet_panel_update_failed',400]]);
 assert(!JSON.stringify(warnings).includes('secret-token'));
});

test('finishPet falls back after network failure and does not expose error details',async()=>{
 const {env,calls}=mockEnv();const oldFetch=globalThis.fetch,oldWarn=console.warn;const payloads=[],warnings=[];let n=0;
 globalThis.fetch=async(_url,options)=>{payloads.push(JSON.parse(options.body));if(++n===1)throw Error('sensitive URL and token');return new Response(null,{status:204});};console.warn=(...args)=>warnings.push(args);
 try{await finishPet({...env,DISCORD_APPLICATION_ID:'77',BOT_TOKEN:'secret-token'},interaction('care'));}finally{globalThis.fetch=oldFetch;console.warn=oldWarn;}
 assert.equal(payloads.length,2);assert.deepEqual(payloads[1].components,[]);assert.deepEqual(payloads[1].embeds,[]);assert.deepEqual(payloads[1].attachments,[]);
 assert.equal(calls.filter(c=>c.action==='petCare').length,1);assert.deepEqual(warnings,[['pet_panel_update_failed','network']]);
 assert(!JSON.stringify(warnings).includes('sensitive URL'));assert(!JSON.stringify(warnings).includes('secret-token'));
});

test('finishPet throws a safe error when both message updates fail',async()=>{
 const {env,calls}=mockEnv();const oldFetch=globalThis.fetch,oldWarn=console.warn;const warnings=[];let n=0;
 globalThis.fetch=async()=>new Response(null,{status:++n===1?400:503});console.warn=(...args)=>warnings.push(args);
 try{await assert.rejects(finishPet({...env,DISCORD_APPLICATION_ID:'77',BOT_TOKEN:'secret-token'},interaction('care')),/初次 HTTP 400；备用面板 HTTP 503/);}finally{globalThis.fetch=oldFetch;console.warn=oldWarn;}
 assert.equal(n,2);assert.equal(calls.filter(c=>c.action==='petCare').length,1);assert.deepEqual(warnings,[['pet_panel_update_failed',400]]);
 assert(!JSON.stringify(warnings).includes('secret-token'));
});

test('long Discord snowflakes and 22-hex walk ids still fit Discord custom_id limit',async()=>{
 const g='12345678901234567890',u='98765432109876543210',walk='abcdef0123456789abcdef';
 const longView={...view,walk:{id:walk,version:1234567,phase:'playing',energy:6,bag:[],bagCapacity:3},walkView:{location:'灯巷',intent:'sniff',intentName:'闻一闻',choices:[{id:'bakery-friend',label:'和摊主聊聊雨天生意',cost:1,effect:'结识摊主',preferred:true},{id:'alley-scent',label:'循着雨后的花香走石阶',cost:1,effect:'记下花香'}],goalProgress:[{id:'explore',name:'发现一条新线索',complete:false}]}};
 const {env}=mockEnv(longView);const i={type:3,id:'901',guild_id:g,channel_id:'56',member:{user:{id:u}},message:{flags:64},data:{custom_id:`p:${g}:${u}:view`}};const data=await answerPet(env,i);
 for(const r of data.components)for(const c of r.components)assert(c.custom_id.length<=100,c.custom_id);
 assert(data.content.includes('闻一闻'));assert(data.content.includes('发现一条新线索'));
});

test('cross-server ownership error names the home server and cannot call pet service',async()=>{
 const calls=[];const env={TABLES:{idFromName:x=>x,get:()=>({fetch:async(_url,req)=>{const body=JSON.parse(req.body);calls.push(body);return new Response(JSON.stringify({guild:'99'}),{status:200});}})}};
 await assert.rejects(answerPet(env,interaction('care')),/服务器 99/);assert.equal(calls.length,1);
});

test('five species are offered and a selected coat preview carries its real pet art URL',async()=>{
 const {env}=mockEnv({...view,pet:null});const home=await answerPet(env,interaction('view'));
 const speciesButtons=home.components.flatMap(r=>r.components);assert.equal(speciesButtons.length,5);
 for(const id of ['lamp-cat','moss-dog','paper-sparrow','dusk-rabbit','river-otter'])assert(speciesButtons.some(b=>b.custom_id.endsWith(`preview~${id}`)));
 const preview=await answerPet(env,interaction('preview~dusk-rabbit~peach'));
 assert(preview.embeds?.[0]?.image?.url.endsWith('/art/pets/dusk-rabbit/peach/v2.jpg'));
 assert(preview.content.includes('蜜桃侏儒立耳型'));
 assert(preview.content.includes('不会影响成长、物品或能力'));
 const coatSelector=preview.components[0].components[0];assert.equal(coatSelector.options.length,3);
 assert(coatSelector.options.every(x=>x.description&&/耳|脸|毛|体型|身形|尾/.test(x.description)));
 assert(preview.content.includes('可免费更换'));
});

test('all fifteen coat ids retain distinct breed-inspired silhouettes',()=>{
 const expected={
  'lamp-cat':['amber','silver','calico'],'moss-dog':['moss','cocoa','cream'],'paper-sparrow':['rice','ink','rose'],
  'dusk-rabbit':['lavender','peach','moon'],'river-otter':['chestnut','slate','honey'],
 };
 for(const [id,coatIds]of Object.entries(expected)){
  const coats=PETS.find(p=>p.id===id).coats;assert.deepEqual(coats.map(c=>c.id),coatIds);
  assert(coats.every(c=>c.name&&c.description&&/型|灵感|外形/.test(c.description)));
 }
});

test('random adoption stays read-only through preview and sends random only on named confirmation',async()=>{
 const {env,calls}=mockEnv({...view,pet:{...view.pet,name:'新伙伴'}});
 const preview=await answerPet(env,interaction('randomAdopt~river-otter'));assert.match(preview.content,/确认时抽取/);assert.equal(calls.filter(c=>c.op==='tavern').length,0);
 const modal=immediatePetReply(interaction('name~river-otter~random'));assert.equal(modal.data.custom_id,'p:34:12:save~river-otter~random');
 const submit={...interaction('unused'),type:5,message:{flags:64},data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'petName',value:'河灯'}]}]}};
 await answerPet(env,submit);assert.equal(calls.find(c=>c.op==='tavern').action,'petAdopt');assert.equal(calls.find(c=>c.op==='tavern').coat,'random');
});

test('coat previews do not mutate; explicit and random confirmation call petCoat once',async()=>{
 const {env,calls}=mockEnv();const before=calls.length;
 const preview=await answerPet(env,interaction('coatPreview~silver'));assert.match(preview.content,/尚未修改伙伴/);assert.match(preview.content,/成长、物品与能力保持/);assert(preview.embeds[0].image.url.endsWith('/art/pets/lamp-cat/silver/v2.jpg'));assert.equal(calls.filter(c=>c.op==='tavern').length,1);
 await answerPet(env,interaction('setCoat~silver'));assert.equal(calls.at(-1).action,'petCoat');assert.equal(calls.at(-1).coat,'silver');
 const random=await answerPet(env,interaction('coatRandomPreview'));assert.match(random.content,/确认时抽取/);assert.equal(calls.at(-1).action,'petView');
 await answerPet(env,interaction('setCoat~random'));assert.equal(calls.at(-1).action,'petCoat');assert.equal(calls.at(-1).coat,'random');assert(calls.length>before);
});

test('material shop preview is read-only and confirmation carries fixed price, quantity, version',async()=>{
 const {env,calls}=mockEnv({...view,materialBudget:{gathered:2,gatherCap:3,bought:4,buyCap:6}});
 const store=await answerPet(env,interaction('materials'));assert(store.components.length<=5);for(const r of store.components)assert(r.components.length<=5);
 const preview=await answerPet(env,interaction('materialBuyPreview~cloth'));assert.match(preview.content,/布料×2/);assert.match(preview.content,/尚未扣款/);assert.equal(calls.filter(c=>c.action==='petMaterialBuy').length,0);
 const confirm=preview.components[0].components[0];assert.equal(confirm.custom_id,'p:34:12:materialBuy~cloth~6~2~materials-v1');
 await answerPet(env,interaction('materialBuy~cloth~6~2~materials-v1'));const request=calls.at(-1);assert.equal(request.action,'petMaterialBuy');assert.equal(request.material,'cloth');assert.equal(request.expectedPrice,6);assert.equal(request.expectedQuantity,2);assert.equal(request.expectedShopVersion,'materials-v1');
 await assert.rejects(answerPet(env,interaction('materialBuy~cloth~5~2~materials-v1')),/预览已失效/);
});

test('daily gathering submits one selected material and panel shows daily limits and inventory',async()=>{
 const withBudget={...view,materialBudget:{gathered:2,gatherCap:3,bought:4,buyCap:6}};const {env,calls}=mockEnv(withBudget);
 const panel=await answerPet(env,interaction('view'));assert.match(panel.content,/每日免费采集：剩余 1\/3份/);assert.match(panel.content,/每日材料铺：剩余 2\/6份/);assert.match(panel.content,/纸片×2/);
 const choose=interaction('gatherMaterial','12',64,{data:{custom_id:'p:34:12:gatherMaterial',values:['flower']}});await answerPet(env,choose);assert.equal(calls.at(-1).action,'petGather');assert.equal(calls.at(-1).material,'flower');
});

test('invalid coat ids are rejected while legacy species-only and explicit random modals remain valid',async()=>{
 const badButton=immediatePetReply(interaction('name~lamp-cat~not-a-coat'));assert.equal(badButton.type,4);assert.match(badButton.data.content,/不可领养/);
 const validRandom=immediatePetReply(interaction('name~lamp-cat~random'));assert.equal(validRandom.type,9);assert.equal(validRandom.data.custom_id,'p:34:12:save~lamp-cat~random');
 const {env,calls}=mockEnv({...view,pet:{...view.pet}});
 await assert.rejects(answerPet(env,interaction('preview~lamp-cat~not-a-coat')),/外形信息已失效/);
 await assert.rejects(answerPet(env,interaction('selectCoat~lamp-cat','12',64,{data:{custom_id:'p:34:12:selectCoat~lamp-cat',values:['not-a-coat']}})),/外形信息已失效/);
 await assert.rejects(answerPet(env,interaction('coatPreview~not-a-coat')),/外形信息已失效/);
 await assert.rejects(answerPet(env,interaction('setCoat~not-a-coat')),/外形信息已失效/);
 assert.equal(calls.filter(c=>c.action==='petCoat'||c.action==='petAdopt').length,0);
 const legacy={...view,pet:{...view.pet}};delete legacy.pet.coat;const legacyPanel=await answerPet(mockEnv(legacy).env,interaction('view'));
 assert(legacyPanel.content.includes('外形：琥珀狸花短毛'));
 const invalidSave={...interaction('unused'),type:5,message:{flags:64},data:{custom_id:'p:34:12:save~lamp-cat~not-a-coat',components:[{components:[{custom_id:'petName',value:'团团'}]}]}};
 await assert.rejects(answerPet(env,invalidSave),/信息已失效/);
});
