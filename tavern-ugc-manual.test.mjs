import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {answerUgc,immediateUgcReply} from './tavern-ugc-ui.mjs';

function setup(t){
 const db=new DatabaseSync(':memory:'),map=new Map();t.after(()=>db.close());
 const store={sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const r=s.all(...a);return {toArray:()=>r};}s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};
 const service=new TavernService(store);
 const env={TABLES:{idFromName:n=>n,get:()=>({fetch:async(_url,init)=>{try{return Response.json(await service.dispatch(JSON.parse(init.body)));}catch(e){return Response.json({error:e.message});}}})}};
 return {service,env};
}
const req=(action,extra={})=>({action,guild:'456',id:'123',name:'测试者',...extra});

test('manual recipe validates, guards ownership/revisions, undoes type, publishes once without AI calls',async t=>{
 const {service}=setup(t),ugc=service.ugc;
 let v=await ugc.dispatch(req('ugcStart'));const sid=v.session.id;
 v=await ugc.dispatch(req('ugcType',{sessionId:sid,value:'drink'}));
 const save=(target,value,extra={})=>ugc.dispatch(req('ugcManualSave',{sessionId:sid,revision:v.session.revision,target,value,...extra}));
 await assert.rejects(save('name','越权菜品',{id:'999'}),/不存在/);
 await assert.rejects(save('price',25),/字段/);
 await assert.rejects(save('ingredients',[]),/食材/);
 v=await save('type','dessert');
 const c=await ugc.dispatch(req('ugcAskConfirm',{sessionId:sid,operation:'undo'}));
 await ugc.dispatch(req('ugcExecuteConfirm',{sessionId:sid,token:c.token}));
 v=await ugc.dispatch(req('ugcView'));assert.equal(v.session.type,'drink');assert.equal(v.session.draft.type,'drink');
 for(const [target,value] of Object.entries({name:'自填青柠茶',ingredients:['青柠','茶叶'],flavor:'清爽',method:'泡茶加入青柠',temperature:'cold',description:'青柠清茶',appearance:'透明杯'}))v=await save(target,value);
 const old=v.session.revision;v=await save('flavor','酸甜');
 await assert.rejects(save('flavor','旧内容',{revision:old}),/已更新/);
 assert.equal(v.session.status,'REVIEW');assert.equal(v.session.calls,0);assert.equal(v.session.rounds,0);
 v=await ugc.dispatch(req('ugcPrice',{sessionId:sid,value:20,revision:v.session.revision}));
 const publish=req('ugcPublish',{sessionId:sid,revision:v.session.revision,requestKey:'manual-publish'});
 const a=await ugc.dispatch(publish),b=await ugc.dispatch(publish);assert.equal(a.dish.id,b.dish.id);
 assert(service.ugc.menu(Date.now(),'456').some(x=>x.id===a.dish.id));
 await assert.rejects(ugc.dispatch(req('ugcStart')),/今天已经/);
});

test('private manual UI saves all fields and publishes with model fetch forbidden',async t=>{
 const {env,service}=setup(t),oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Manual mode must not call an AI endpoint');};t.after(()=>globalThis.fetch=oldFetch);
 let seq=0;
 const i=(custom,type=3,extra={})=>({type,id:String(++seq),guild_id:'456',channel_id:'33',member:{user:{id:'123'}},message:{flags:64},data:type===2?{name:'酒馆',options:[{name:'研发'}]}:{custom_id:custom,...extra}});
 const find=(p,part)=>{assert(p.components,p.content);assert(p.components.length<=5);const c=p.components.flatMap(r=>r.components).find(c=>c.custom_id?.includes(part));assert(c,part);assert(c.custom_id.length<=100);return c.custom_id;};
 let p=await answerUgc(env,i(null,2));p=await answerUgc(env,i(find(p,':ugcStartManual')));p=await answerUgc(env,i(find(p,':ugcType~drink')));p=await answerUgc(env,i(find(p,':ugcManual~')));
 for(const [target,value] of Object.entries({name:'手作柠檬鸡尾酒',ingredients:'柠檬、金酒，汤力水',flavor:'清香微酸',method:'泡茶后加入柠檬',temperature:'冰凉',description:'一杯柠檬茶',appearance:'透明杯与柠檬片',lore:'夏日灵感',servingSizeMl:'250',alcoholPercent:'8.5'})){
  const modal=immediateUgcReply(i(find(p,':ugcManualPick~'),3,{values:[target]}));assert.equal(modal.type,9);
  p=await answerUgc(env,i(modal.data.custom_id,5,{components:[{components:[{custom_id:'value',value}]}]}));assert(p.content.includes('自填研发'),p.content);
 }
 p=await answerUgc(env,i(find(p,':ugcView~')));
 const price=immediateUgcReply(i(find(p,':ugcPrice~')));
 p=await answerUgc(env,i(price.data.custom_id,5,{components:[{components:[{custom_id:'value',value:'22'}]}]}));
 p=await answerUgc(env,i(find(p,':ugcPublish~')));p=await answerUgc(env,i(find(p,':ugcPublishNow~')));assert(p.content.includes('已确认入库'),p.content);
 assert.equal(service.one('SELECT calls FROM tavern_ugc_attempts').calls,0);
 const recipe=JSON.parse(service.one('SELECT recipe_json FROM tavern_ugc_revisions').recipe_json);assert.deepEqual(recipe.ingredients,['柠檬','金酒','汤力水']);assert.equal(recipe.temperature,'cold');assert.equal(recipe.servingSizeMl,250);assert.equal(recipe.alcoholPercent,8.5);
});
