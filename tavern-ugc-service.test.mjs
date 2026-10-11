import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {UGCService} from './tavern-ugc-service.mjs';
import {validateUGCDraft,ugcMenuItem,UGC_PRICE_MIN,UGC_PRICE_MAX} from './tavern-ugc-catalog.mjs';

function storage(){const db=new DatabaseSync(':memory:'),map=new Map();return {db,sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...a);return {toArray:()=>rows,one:()=>rows[0]}}s.run(...a);return {toArray:()=>[]}}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}},get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),delete:async k=>map.delete(k)}}
const base=Date.parse('2026-10-10T10:00:00+08:00');
function setup(){const store=storage(),host=new TavernService(store),ugc=new UGCService(host);return {store,host,ugc}}
const p=(action,more={})=>({action,guild:'456',id:'123',name:'小葵',...more});

test('strict recipe validation applies user price bounds, text types, length limits and derived allergens/equipment',()=>{
 const d={name:'晨雾拿铁',type:'drink',ingredients:['咖啡豆','牛奶'],flavor:'醇香',method:'使用咖啡机萃取并加热牛奶',temperature:'warm',description:'柔和香浓的一杯饮品。',appearance:'白色奶泡上撒少许可可粉。'};
 for(const price of [UGC_PRICE_MIN,UGC_PRICE_MAX])assert.equal(validateUGCDraft(d,{requireComplete:true,price}).price,price);
 assert.deepEqual(validateUGCDraft(d).equipment,['coffee_machine']);assert(validateUGCDraft(d).allergens.includes('乳制品'));
 for(const value of [9,51,10.5,'20',0])assert.throws(()=>validateUGCDraft(d,{requireComplete:true,price:value}));
 assert.throws(()=>validateUGCDraft({...d,name:42}),/必须是文本/);assert.throws(()=>validateUGCDraft({...d,name:'这是一道名字长到超过二十四个字符的菜品名字真的很长很长'}),/不能超过/);
});

test('alcohol recipes are allowed, require declared volume and ABV, and retain specs in published items',()=>{
 const recipe={name:'小葵特调金汤力',type:'drink',ingredients:['金酒','汤力水','青柠','冰块'],flavor:'清爽微苦',method:'将金酒与汤力水加冰搅匀',temperature:'cold',description:'青柠与金酒调成的一杯饮品。',appearance:'装在透明高球杯中。',servingSizeMl:250,alcoholPercent:8};
 const complete=validateUGCDraft(recipe,{requireComplete:true,price:32});assert.equal(complete.alcoholPercent,8);assert.equal(complete.servingSizeMl,250);
 assert.throws(()=>validateUGCDraft({...recipe,servingSizeMl:undefined},{requireComplete:true,price:32}),/容量和酒精度/);
 assert.throws(()=>validateUGCDraft({...recipe,servingSizeMl:undefined,alcoholPercent:undefined},{requireComplete:true,price:32}),/容量和酒精度/);
 assert.throws(()=>validateUGCDraft({...recipe,servingSizeMl:250.5}),/整数/);
 assert.throws(()=>validateUGCDraft({...recipe,alcoholPercent:101}),/酒精度/);
 const item=ugcMenuItem({id:'ugc_testdrink',author_name:'小葵',current_revision:1},complete,{status:'ready',asset_key:'art/ugc/test.png'});
 assert.deepEqual([item.servingSizeMl,item.alcoholPercent,item.imageStatus],[250,8,'ready']);
});

test('published alcohol recipe specs survive into the normal order snapshot',async()=>{
 const {ugc,host}=setup();let view=await ugc.dispatch(p('ugcStart',{now:base})),sessionId=view.session.sessionId;
 await ugc.dispatch(p('ugcType',{sessionId,value:'drink',revision:view.session.revision,now:base+1}));
 const turn=await ugc.dispatch(p('ugcBeginTurn',{sessionId,text:'制作一款金汤力，250ml，8%vol',requestKey:'alcohol-turn',now:base+2}));
 view=await ugc.dispatch(p('ugcFinishTurn',{sessionId,turnId:turn.turnId,reply:'规格按你提供的记录。',patch:{name:'小葵特调金汤力',ingredients:['金酒','汤力水','青柠','冰块'],flavor:'清爽微苦',method:'将金酒与汤力水加冰搅匀',temperature:'cold',description:'青柠与金酒调成的一杯饮品。',appearance:'装在透明高球杯中。',servingSizeMl:250,alcoholPercent:8},now:base+3}));
 view=await ugc.dispatch(p('ugcPrice',{sessionId,value:32,revision:view.session.revision,now:base+4}));
 const published=await ugc.dispatch(p('ugcPublish',{sessionId,revision:view.session.revision,requestKey:'alcohol-publish',now:base+5}));
 const menuItem=host.operations.item(published.dish.id,base+6);assert.equal(menuItem.alcoholPercent,8);assert.equal(menuItem.servingSizeMl,250);
 const order=host.prepare({id:'123',name:'小葵',channel:'33',item:published.dish.id,requestKey:'alcohol-order'},base+6);
 assert.equal(order.details.alcoholPercent,8);assert.equal(order.details.servingSizeMl,250);
});

test('adds private retry-text columns when migrating an existing session table',()=>{
 const store=storage();store.sql.exec('CREATE TABLE tavern_ugc_sessions(session_id TEXT PRIMARY KEY,guild TEXT NOT NULL,user_id TEXT NOT NULL,status TEXT NOT NULL)');
 const host={storage:store,sql:store.sql,rows:(q,...args)=>store.sql.exec(q,...args).toArray(),one:(q,...args)=>store.sql.exec(q,...args).toArray()[0]||null};
 new UGCService(host);const columns=store.sql.exec('PRAGMA table_info(tavern_ugc_sessions)').toArray().map(x=>x.name);assert(columns.includes('last_failed_text'));assert(columns.includes('last_failed_target'));store.db.close();
});

test('same user resumes one session per guild, budgets rounds, binds undo confirmation and restores full prior draft',async()=>{
 const {ugc}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));const sessionId=v.session.sessionId;v=await ugc.dispatch(p('ugcStart',{now:base+1}));assert.equal(v.session.sessionId,sessionId);
 v=await ugc.dispatch(p('ugcType',{sessionId,value:'dessert',now:base+2}));const turn=await ugc.dispatch(p('ugcBeginTurn',{sessionId,text:'做一个莓果冷甜点',requestKey:'turn-undo',now:base+3}));assert.equal(turn.session.calls,2);assert.equal(turn.draft.type,'dessert');const repeated=await ugc.dispatch(p('ugcBeginTurn',{sessionId,text:'different duplicate body',requestKey:'turn-undo',now:base+3}));assert.equal(repeated.repeated,true);assert.equal(repeated.turnId,turn.turnId);
 const finished=await ugc.dispatch(p('ugcFinishTurn',{sessionId,turnId:turn.turnId,reply:'我先确认风味和材料。',patch:{name:'莓果雪酪',ingredients:['草莓','蓝莓'],flavor:'清爽酸甜'},missing:['method'],now:base+4}));assert.equal(finished.session.history.length,1);assert.equal(finished.session.draft.name,'莓果雪酪');const finishRepeat=await ugc.dispatch(p('ugcFinishTurn',{sessionId,turnId:turn.turnId,reply:'我先确认风味和材料。',patch:{name:'莓果雪酪',ingredients:['草莓','蓝莓'],flavor:'清爽酸甜'},missing:['method'],now:base+4}));assert.equal(finishRepeat.repeated,true);
 const confirm=await ugc.dispatch(p('ugcAskConfirm',{sessionId,operation:'undo',now:base+5}));assert.equal(confirm.expires,base+60005);
 await assert.rejects(ugc.dispatch(p('ugcExecuteConfirm',{sessionId,token:confirm.token,now:base+6,id:'999'})),/无效/);
 const undone=await ugc.dispatch(p('ugcExecuteConfirm',{sessionId,token:confirm.token,now:base+6}));assert.deepEqual(undone.session.draft,{type:'dessert',category:'desserts'});assert.equal(undone.session.history.length,0);
 assert.equal((await ugc.dispatch(p('ugcExecuteConfirm',{sessionId,token:confirm.token,now:base+7}))).operation,'undo');
});

test('model patch is allowlisted; field edit candidate is isolated until adoption; price rejects without mutation',async()=>{
 const {ugc}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));const sid=v.session.sessionId;await ugc.dispatch(p('ugcType',{sessionId:sid,value:'drink',now:base+1}));let t=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'饮品设计',requestKey:'turn-fail',now:base+2}));
 await assert.rejects(ugc.dispatch(p('ugcFinishTurn',{sessionId:sid,turnId:t.turnId,reply:'',patch:{name:'蜜桃茶',price:25},now:base+3})),/不能修改字段/);
 await ugc.dispatch(p('ugcFailTurn',{sessionId:sid,turnId:t.turnId,now:base+4}));v=await ugc.dispatch(p('ugcPrice',{sessionId:sid,value:25,now:base+5}));assert.equal(v.session.price,25);await assert.rejects(ugc.dispatch(p('ugcPrice',{sessionId:sid,value:51,now:base+6})),/10至50/);assert.equal((await ugc.dispatch(p('ugcView',{sessionId:sid,now:base+7}))).session.price,25);
});

test('publish is idempotent, server-scoped, and atomically consumes the Beijing-day slot',async()=>{
 const {ugc,host}=setup();const v=await ugc.dispatch(p('ugcStart',{now:base})),sid=v.session.sessionId;await ugc.dispatch(p('ugcType',{sessionId:sid,value:'savory',now:base+1}));const t=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'制作一道蒸红薯小食',requestKey:'turn-publish',now:base+2}));await ugc.dispatch(p('ugcFinishTurn',{sessionId:sid,turnId:t.turnId,reply:'定稿如下。',patch:{name:'金边蜜薯',ingredients:['红薯'],flavor:'绵密焦甜',method:'将红薯蒸熟后切块装盘',temperature:'warm',description:'红薯慢烤后焦甜绵软。',appearance:'放在小木盘中，切面金黄。'},now:base+3}));await ugc.dispatch(p('ugcPrice',{sessionId:sid,value:20,now:base+4}));
 const published=await ugc.dispatch(p('ugcPublish',{sessionId:sid,requestKey:'request-1',revision:4,now:base+5}));assert.equal(published.dish.id.startsWith('ugc_'),true);assert.equal(published.dish.status,'active');assert.equal(host.one('SELECT COUNT(*) AS n FROM tavern_ugc_daily').n,1);
 const retry=await ugc.dispatch(p('ugcPublish',{sessionId:sid,requestKey:'request-1',revision:4,now:base+6}));assert.equal(retry.dish.id,published.dish.id);assert.equal(host.one('SELECT COUNT(*) AS n FROM tavern_ugc_dishes').n,1);
 assert.equal(ugc._menuFor('456')[0].author,'小葵');await assert.rejects(ugc.dispatch(p('ugcStart',{now:base+7})),/今天已经成功研发/);assert.deepEqual(ugc.list(p('ugcList'),base).items.length,1);
});

test('sessions and published dishes remain isolated by guild, cleanup erases session text, and nextExpiry is exposed',async()=>{
 const {ugc,host}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));await ugc.dispatch({...p('ugcType',{sessionId:v.session.sessionId,value:'drink',now:base+1}),guild:'456'});v=await ugc.dispatch({...p('ugcStart',{now:base+2}),guild:'789'});assert.notEqual(v.session.sessionId,undefined);
 assert.equal(ugc.nextExpiry(base+2),base+1800001);assert.equal(ugc.cleanup(base+1800001),1);assert.equal(host.one('SELECT draft_json,history_json FROM tavern_ugc_sessions WHERE guild=?','456').draft_json,'{}');assert.equal(host.one('SELECT history_json FROM tavern_ugc_sessions WHERE guild=?','456').history_json,'[]');
 const old=await ugc.dispatch({...p('ugcView',{sessionId:v.session.sessionId}),guild:'456',now:base+1000});assert.equal(old.session,null);const other=await ugc.dispatch({...p('ugcView',{sessionId:v.session.sessionId}),guild:'789',now:base+1000});assert.equal(other.session.sessionId,v.session.sessionId);
});

test('background cleanup deletes a failed turn after its private session expires',async()=>{
 const {ugc,host}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));const sid=v.session.sessionId;v=await ugc.dispatch(p('ugcType',{sessionId:sid,value:'drink',revision:v.session.revision,now:base+1}));const turn=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'只在这轮使用的研发要求',requestKey:'expire-failed-turn',revision:v.session.revision,now:base+2}));await ugc.dispatch(p('ugcFailTurn',{sessionId:sid,turnId:turn.turnId,now:base+3}));assert.equal(host.one('SELECT last_failed_text FROM tavern_ugc_sessions WHERE session_id=?',sid).last_failed_text,'只在这轮使用的研发要求');assert.equal(ugc.cleanup(base+1800001),1);const row=host.one('SELECT status,last_failed_text,last_failed_target FROM tavern_ugc_sessions WHERE session_id=?',sid);assert.equal(row.status,'EXPIRED');assert.equal(row.last_failed_text,null);assert.equal(row.last_failed_target,null);
});


test('expired generation lease recovers the pre-turn draft and permits a fresh request key',async()=>{
 const {ugc,host}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));const sid=v.session.sessionId;await ugc.dispatch(p('ugcType',{sessionId:sid,value:'drink',now:base+1}));const turn=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'旧轮次',requestKey:'lease-old',now:base+2}));assert.equal(turn.session.status,'GENERATING');
 const view=await ugc.dispatch(p('ugcView',{sessionId:sid,now:base+240003}));assert.equal(view.session.status,'DRAFTING');assert.equal(view.session.turnId,null);assert.equal(view.session.calls,2);assert.equal(view.session.turnId,null);assert.equal(view.session.retryText,'旧轮次');assert.equal(host.one('SELECT turn_text FROM tavern_ugc_sessions WHERE session_id=?',sid).turn_text,null);
 const retry=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:view.session.retryText,requestKey:'lease-new',revision:view.session.revision,now:base+240004}));assert.equal(retry.repeated,undefined);assert.equal(retry.text,'旧轮次');assert.equal(retry.session.retryText,null);
});

test('single-field edit can take multiple turns, only updates after adoption, and undo restores pre-adoption card',async()=>{
 const {ugc}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));const sid=v.session.sessionId;await ugc.dispatch(p('ugcType',{sessionId:sid,value:'dessert',now:base+1}));let t=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'草莓冷甜点',requestKey:'edit-base',now:base+2}));
 v=await ugc.dispatch(p('ugcFinishTurn',{sessionId:sid,turnId:t.turnId,reply:'完整草稿',patch:{name:'草莓雪酪',ingredients:['草莓','糖','冰块'],flavor:'清爽酸甜',method:'冷冻后搅拌',temperature:'cold',description:'草莓制成的清凉甜点。',appearance:'盛在白色小碗里。'},missing:[],now:base+3}));const original=v.session.draft;
 v=await ugc.dispatch(p('ugcEdit',{sessionId:sid,target:'name',revision:v.session.revision,now:base+4}));let edit=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'名字更有秋日感',requestKey:'edit-one',revision:v.session.revision,now:base+5}));v=await ugc.dispatch(p('ugcFinishTurn',{sessionId:sid,turnId:edit.turnId,reply:'先提议',patch:{name:'秋日莓果雪酪'},revision:edit.revision,now:base+6}));assert.equal(v.session.draft.name,'草莓雪酪');
 edit=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'更短一些',requestKey:'edit-two',revision:v.session.revision,now:base+7}));v=await ugc.dispatch(p('ugcFinishTurn',{sessionId:sid,turnId:edit.turnId,reply:'调整提议',patch:{name:'秋莓雪酪'},revision:edit.revision,now:base+8}));assert.equal(v.session.edit_candidate.value,'秋莓雪酪');assert.equal(v.session.draft.name,'草莓雪酪');
 v=await ugc.dispatch(p('ugcAdoptEdit',{sessionId:sid,revision:v.session.revision,now:base+9}));assert.equal(v.session.draft.name,'秋莓雪酪');const c=await ugc.dispatch(p('ugcAskConfirm',{sessionId:sid,operation:'undo',revision:v.session.revision,now:base+10}));v=await ugc.dispatch(p('ugcExecuteConfirm',{token:c.token,now:base+11}));assert.deepEqual(v.session.draft,original);assert.equal(v.session.edit_candidate.value,'秋莓雪酪');
});

test('one successful publication on each side of Beijing midnight consumes separate daily slots',async()=>{
 const {ugc,host}=setup();
 async function publishAt(now,name,key){let v=await ugc.dispatch(p('ugcStart',{now}));const sid=v.session.sessionId;await ugc.dispatch(p('ugcType',{sessionId:sid,value:'savory',revision:v.session.revision,now:now+1}));let t=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'做一道温热小食',requestKey:`${key}-turn`,revision:(await ugc.dispatch(p('ugcView',{sessionId:sid,now:now+2}))).session.revision,now:now+2}));v=await ugc.dispatch(p('ugcFinishTurn',{sessionId:sid,turnId:t.turnId,reply:'完整定稿',patch:{name,ingredients:['米饭','番茄','鸡蛋'],flavor:'酸甜鲜香',method:'蒸熟米饭后搭配番茄鸡蛋',temperature:'warm',description:'番茄鸡蛋与米饭组合成一份热食。',appearance:'盛在浅色陶碗中。'},now:now+3}));v=await ugc.dispatch(p('ugcPrice',{sessionId:sid,value:20,revision:v.session.revision,now:now+4}));return ugc.dispatch(p('ugcPublish',{sessionId:sid,revision:v.session.revision,requestKey:key,now:now+5}));}
 const before=Date.parse('2026-10-10T23:59:00+08:00'),after=Date.parse('2026-10-11T00:01:00+08:00');await publishAt(before,'午夜番茄饭','midnight-one');await publishAt(after,'新日番茄饭','midnight-two');assert.deepEqual(host.rows('SELECT day FROM tavern_ugc_daily ORDER BY day').map(x=>x.day),['2026-10-10','2026-10-11']);
});

test('failed publication transaction rolls back dish, daily slot, receipt and preserves the private draft',async()=>{
 const {ugc,host,store}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));const sid=v.session.sessionId;await ugc.dispatch(p('ugcType',{sessionId:sid,value:'savory',revision:v.session.revision,now:base+1}));let t=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'一道家常热食',requestKey:'rollback-turn',now:base+2}));v=await ugc.dispatch(p('ugcFinishTurn',{sessionId:sid,turnId:t.turnId,reply:'完整定稿',patch:{name:'家常番茄饭',ingredients:['米饭','番茄','鸡蛋'],flavor:'酸甜鲜香',method:'蒸熟米饭后搭配番茄鸡蛋',temperature:'warm',description:'番茄鸡蛋与米饭组合成一份热食。',appearance:'盛在浅色陶碗中。'},now:base+3}));v=await ugc.dispatch(p('ugcPrice',{sessionId:sid,value:20,revision:v.session.revision,now:base+4}));store.db.exec("CREATE TRIGGER injected_ugc_daily_failure BEFORE INSERT ON tavern_ugc_daily BEGIN SELECT RAISE(ABORT,'injected'); END");
 await assert.rejects(ugc.dispatch(p('ugcPublish',{sessionId:sid,revision:v.session.revision,requestKey:'rollback-publish',now:base+5})),/injected/);assert.equal(host.one('SELECT COUNT(*) AS n FROM tavern_ugc_dishes').n,0);assert.equal(host.one('SELECT COUNT(*) AS n FROM tavern_ugc_daily').n,0);assert.equal(host.one('SELECT COUNT(*) AS n FROM tavern_ugc_receipts').n,0);const session=host.one('SELECT status,draft_json FROM tavern_ugc_sessions WHERE session_id=?',sid);assert.equal(session.status,'REVIEW');assert.equal(JSON.parse(session.draft_json).name,'家常番茄饭');
});

test('cancel confirmation erases failed-turn text and a repeated confirmation returns the saved receipt once',async()=>{
 const {ugc,host}=setup();let v=await ugc.dispatch(p('ugcStart',{now:base}));const sid=v.session.sessionId;await ugc.dispatch(p('ugcType',{sessionId:sid,value:'drink',revision:v.session.revision,now:base+1}));let t=await ugc.dispatch(p('ugcBeginTurn',{sessionId:sid,text:'保留在临时会话的描述',requestKey:'cancel-turn',revision:(await ugc.dispatch(p('ugcView',{sessionId:sid,now:base+2}))).session.revision,now:base+2}));v=await ugc.dispatch(p('ugcFailTurn',{sessionId:sid,turnId:t.turnId,revision:t.revision,now:base+3}));assert.equal(v.session.retryText,'保留在临时会话的描述');v=await ugc.dispatch(p('ugcView',{sessionId:sid,now:base+4}));const c=await ugc.dispatch(p('ugcAskConfirm',{sessionId:sid,operation:'cancel',revision:v.session.revision,now:base+5}));const one=await ugc.dispatch(p('ugcExecuteConfirm',{token:c.token,now:base+6}));const two=await ugc.dispatch(p('ugcExecuteConfirm',{token:c.token,now:base+7}));assert.equal(one.status,'CANCELLED');assert.equal(two.status,'CANCELLED');const row=host.one('SELECT status,draft_json,history_json,snapshots_json,last_failed_text,last_failed_target FROM tavern_ugc_sessions WHERE session_id=?',sid);assert.equal(row.draft_json,'{}');assert.equal(row.history_json,'[]');assert.equal(row.snapshots_json,'[]');assert.equal(row.last_failed_text,null);assert.equal(row.last_failed_target,null);
});
