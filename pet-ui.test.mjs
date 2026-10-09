import test from 'node:test';
import assert from 'node:assert/strict';
import { immediatePetReply, petDeferredReply, petInteraction, answerPet, finishPet } from './pet-ui.mjs';

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

test('adoption modal enforces the service 24-character limit and claims only on submit',async()=>{
 const {env,calls}=mockEnv({...view,pet:{...view.pet,name:'新伙伴'}});const click=interaction('name~lamp-cat');const modal=immediatePetReply(click);assert.equal(modal.data.components[0].components[0].max_length,24);
 const submit={...click,type:5,message:{flags:64},data:{custom_id:'p:34:12:save~lamp-cat',components:[{components:[{custom_id:'petName',value:'团团'}]}]}};
 await answerPet(env,submit);assert.equal(calls[0].claim,true);assert.equal(calls[1].action,'petAdopt');assert.equal(calls[1].petName,'团团');
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
