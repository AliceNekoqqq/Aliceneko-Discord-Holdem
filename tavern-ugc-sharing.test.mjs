import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {UGCSharedCatalog,syncSharedUgc} from './tavern-ugc-sharing.mjs';
import {readFile} from 'node:fs/promises';
import {UGCService} from './tavern-ugc-service.mjs';
import {answerUgc} from './tavern-ugc-ui.mjs';

function storage(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());const map=new Map();return {sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const r=s.all(...a);return {toArray:()=>r};}s.run(...a);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),setAlarm:async()=>{},deleteAlarm:async()=>{},getAlarm:async()=>null};}
function fixture(t){const a=new TavernService(storage(t)),b=new TavernService(storage(t)),catalog=new UGCSharedCatalog(storage(t));let fail=false;const uploads=[];
 const env={TABLES:{idFromName:n=>n,get:n=>({fetch:async(_url,init)=>{if(fail)throw Error('temporary outage');const p=JSON.parse(init.body);uploads.push(p);assert.equal(n,'ugc-global-catalog-v1');return Response.json(catalog.sync(p));}})}};
 return {a,b,catalog,env,uploads,outage:v=>fail=v};}
async function publish(host,guild){const ugc=host.ugc,p={guild,id:'123',name:'配方作者'};let v=await ugc.dispatch({...p,action:'ugcStart'});const sessionId=v.session.id;await ugc.dispatch({...p,action:'ugcType',sessionId,value:'drink'});
 for(const [target,value] of Object.entries({name:'跨服柠檬茶',ingredients:['柠檬','茶叶'],flavor:'清爽',method:'茶汤加入柠檬',temperature:'cold',description:'一杯柠檬茶',appearance:'透明杯'}))v=await ugc.dispatch({...p,action:'ugcManualSave',sessionId,target,value});
 await ugc.dispatch({...p,action:'ugcPrice',sessionId,value:20});return (await ugc.dispatch({...p,action:'ugcPublish',sessionId,requestKey:'publish'})).dish;
}

test('published legacy recipes, art and withdrawals share across independent guild stores; wallets/drafts do not',async t=>{
 const {a,b,env,catalog,uploads}=fixture(t),dish=await publish(a,'456');
 const privateSession=await a.ugc.dispatch({action:'ugcStart',guild:'456',id:'999',name:'私密草稿者'});
 await a.ugc.dispatch({action:'ugcType',guild:'456',id:'999',sessionId:privateSession.session.id,value:'drink'});
 a.member('123','作者');const sourceBalance=a.member('123').balance;
 await syncSharedUgc(env,a,'456');await syncSharedUgc(env,b,'789');
 const menu=b.operations.menu();assert(menu.some(x=>x.id===dish.id));
 const list=await b.ugc.dispatch({action:'ugcList',guild:'789',id:'777'});assert(list.items.some(x=>x.id===dish.id));
 assert.equal((await b.ugc.dispatch({action:'ugcList',guild:'789',id:'123',mine:true})).items.length,0);
 assert.equal(b.one('SELECT COUNT(*) AS n FROM tavern_ugc_sessions').n,0);
 assert.equal(b.one('SELECT COUNT(*) AS n FROM tavern_members').n,0);
 const data=JSON.stringify(catalog.sync({guild:'789',version:-1}));assert(!data.includes('私密草稿者'));assert(!data.includes('balance'));assert(!data.includes('history'));
 const d=b.prepare({id:'777',name:'买家',channel:'33',item:dish.id,requestKey:'cross-order'});b.confirm('777',d.id,'33');
 assert.equal(b.member('777').balance,480);assert.equal(a.member('123').balance,sourceBalance);
 const before=uploads.filter(x=>x.entries).length;await syncSharedUgc(env,a,'456');assert.equal(uploads.filter(x=>x.entries).length,before);
 const hash=a.one('SELECT recipe_hash FROM tavern_ugc_revisions WHERE dish_id=?',dish.id).recipe_hash;
 a.ugc.importArt({guild:'456',id:'123',trustedOperations:true,value:{dish_id:dish.id,recipe_revision:1,recipe_hash:hash,asset_key:'art/ugc/shared.jpg'}});
 await syncSharedUgc(env,a,'456');await syncSharedUgc(env,b,'789');assert.equal(b.operations.item(dish.id).assetKey,'art/ugc/shared.jpg');
 await assert.rejects(b.ugc.dispatch({action:'ugcWithdraw',guild:'789',id:'777',target:dish.id}),/找不到/);
 const pending=b.prepare({id:'777',name:'买家',channel:'33',item:dish.id,requestKey:'before-withdraw'});
 a.ugc.withdraw({guild:'456',id:'123',target:dish.id});await syncSharedUgc(env,a,'456');await syncSharedUgc(env,b,'789');
 assert(!b.operations.menu().some(x=>x.id===dish.id));assert.throws(()=>b.confirm('777',pending.id,'33'),/菜单已更新/);assert.equal(b.member('777').balance,480);
});

test('older source snapshots cannot resurrect withdrawn dishes; older replies cannot roll back mirrors; failed uploads retry',async t=>{
 const {a,b,catalog,env,outage}=fixture(t),dish=await publish(a,'456'),old=a.ugc.shareExport('456');
 await syncSharedUgc(env,a,'456');await syncSharedUgc(env,b,'789');const oldReply=catalog.sync({guild:'789',version:-1});
 a.ugc.withdraw({guild:'456',id:'123',target:dish.id});outage(true);await assert.rejects(syncSharedUgc(env,a,'456'),/outage/);
 assert(a.ugc.shareState().sourceRevision>a.ugc.shareState().uploadedRevision);
 outage(false);await syncSharedUgc(env,a,'456');catalog.sync({...old,guild:'456',version:-1});await syncSharedUgc(env,b,'789');
 b.ugc.shareApply(oldReply,0);assert.equal(b.operations.item(dish.id),null);
});

test('bootstrap imports only published source recipes from every bot guild and is idempotent',async t=>{
 const {a,catalog}=fixture(t),dish=await publish(a,'456'),oldFetch=globalThis.fetch;let discovery=0,exports=0;
 globalThis.fetch=async()=>{discovery++;return Response.json([{id:'456'}]);};t.after(()=>globalThis.fetch=oldFetch);
 const env={BOT_TOKEN:'fixture',TABLES:{idFromName:n=>n,get:n=>({fetch:async()=>{exports++;assert.equal(n,'tavern:456');return Response.json(a.ugc.shareExport('456'));}})}};
 assert.equal((await catalog.bootstrap(env)).complete,true);await catalog.bootstrap(env);assert.equal(discovery,1);assert.equal(exports,2);
 assert(catalog.sync({guild:'789',version:-1}).entries.some(x=>x.id===dish.id));
});

test('actual Worker synchronizes menus and rejects shared checkout during a directory outage without debit',async t=>{
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 const {PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const instances=new Map(),env={};let offline=false;
 env.TABLES={idFromName:n=>n,get:n=>({fetch:async(url,init)=>{if(n==='ugc-global-catalog-v1'&&offline)throw Error('outage');if(!instances.has(n))instances.set(n,new PokerTable({storage:storage(t),blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}},env));return instances.get(n).fetch(new Request(url,init));}})};
 const call=async(guild,action,extra={})=>(await env.TABLES.get(`tavern:${guild}`).fetch('https://internal',{method:'POST',body:JSON.stringify({op:'tavern',guild,id:'123',name:'测试者',action,...extra})})).json();
 await call('456','ugcStart');const origin=instances.get('tavern:456').tavern;
 // Complete the already opened session locally, then publish through the production handler.
 const ugc=origin.ugc,sid=(await ugc.dispatch({action:'ugcView',guild:'456',id:'123'})).session.id;
 await call('456','ugcType',{sessionId:sid,value:'drink'});
 for(const [target,value] of Object.entries({name:'全服共享果茶',ingredients:['果汁','茶叶'],flavor:'清爽',method:'混合果汁与茶汤',temperature:'cold',description:'果茶',appearance:'玻璃杯'}))await call('456','ugcManualSave',{sessionId:sid,target,value});
 await call('456','ugcPrice',{sessionId:sid,value:20});const result=await call('456','ugcPublish',{sessionId:sid,requestKey:'worker-publish'});assert(result.dish,result.error);
 const menu=await call('789','opsMenu');assert(menu.some(x=>x.id===result.dish.id));
 const draft=await call('789','prepare',{item:result.dish.id,channel:'33',requestKey:'worker-shared-order'});assert(draft.id,draft.error);
 offline=true;const rejected=await call('789','confirm',{draftId:draft.id,channel:'33'});assert(rejected.error);
 assert.equal(instances.get('tavern:789').tavern.member('123').balance,500);
 offline=false;const paid=await call('789','confirm',{draftId:draft.id,channel:'33'});assert(!paid.error,paid.error);assert.equal(instances.get('tavern:789').tavern.member('123').balance,480);
 await call('456','ugcWithdraw',{target:result.dish.id});assert(!(await call('789','opsMenu')).some(x=>x.id===result.dish.id));
 const interaction={type:2,id:'111',guild_id:'456',channel_id:'33',member:{user:{id:'123'}},data:{name:'酒馆',options:[{name:'我的作品'}]}};
 const list=await answerUgc(env,interaction),pick=list.components.flatMap(r=>r.components).find(x=>x.custom_id?.includes(':ugcRelistPick'));assert(pick);
 const page=await answerUgc(env,{...interaction,type:3,id:'112',message:{flags:64},data:{custom_id:pick.custom_id,values:[result.dish.id]}});assert(page.content.includes('已重新上架'),page.content);
 assert((await call('789','opsMenu')).some(x=>x.id===result.dish.id));
 const daily=origin.one('SELECT COUNT(*) AS n FROM tavern_ugc_daily').n;await call('456','ugcRelist',{target:result.dish.id});assert.equal(origin.one('SELECT COUNT(*) AS n FROM tavern_ugc_daily').n,daily);

});


test('relisting preserves recipe/art/daily quota, checks author and source guild, and repeats without duplicate events',async t=>{
 const {a}=fixture(t),dish=await publish(a,'456'),before=a.ugc._dish(dish.id),daily=a.one('SELECT COUNT(*) AS n FROM tavern_ugc_daily').n;
 a.ugc.withdraw({guild:'456',id:'123',target:dish.id});
 assert.throws(()=>a.ugc.relist({guild:'456',id:'777',target:dish.id}),/找不到/);
 assert.throws(()=>a.ugc.relist({guild:'789',id:'123',target:dish.id}),/找不到/);
 a.ugc.relist({guild:'456',id:'123',target:dish.id});assert.equal(a.ugc.relist({guild:'456',id:'123',target:dish.id}).repeated,true);
 assert.deepEqual(a.ugc._dish(dish.id).recipe,before.recipe);assert.equal(a.one('SELECT COUNT(*) AS n FROM tavern_ugc_daily').n,daily);
 assert.equal(a.one("SELECT COUNT(*) AS n FROM tavern_ugc_events WHERE event_type='relist'").n,1);
 a.ugc.withdraw({guild:'456',id:'123',target:dish.id});
 a.sql.exec("INSERT INTO tavern_ugc_dishes SELECT 'ugc_conflictingname00000',guild,user_id,author_name,name_key,'active',current_revision,created_at,price_policy FROM tavern_ugc_dishes WHERE id=?",dish.id);
 assert.throws(()=>a.ugc.relist({guild:'456',id:'123',target:dish.id}),/同名/);assert.equal(a.ugc._dish(dish.id).status,'withdrawn');
});

test('one-time restoration revives existing withdrawals, preserves later withdrawals and never repeats',async t=>{
 const {a,b}=fixture(t),da=await publish(a,'456'),db=await publish(b,'789'),cutoff=Date.parse('2026-10-16T12:57:35Z');
 for(const [host,dish,guild,at] of [[a,da,'456',cutoff-1],[b,db,'789',cutoff+1]]){
  host.sql.exec('UPDATE tavern_ugc_dishes SET created_at=? WHERE id=?',cutoff-1000,dish.id);
  host.ugc.withdraw({guild,id:'123',target:dish.id},at);
  host.sql.exec("DELETE FROM tavern_ugc_share_meta WHERE key='restore-withdrawn-20261016'");
  host._ugc=new UGCService(host);
 }
 assert.equal(a.ugc._dish(da.id).status,'active');assert.equal(b.ugc._dish(db.id).status,'withdrawn');
 a.ugc.withdraw({guild:'456',id:'123',target:da.id},cutoff+1000);a._ugc=new UGCService(a);assert.equal(a.ugc._dish(da.id).status,'withdrawn');
 assert.equal(a.one("SELECT COUNT(*) AS n FROM tavern_ugc_events WHERE reason_code='developer_restore_20261016'").n,1);
});
