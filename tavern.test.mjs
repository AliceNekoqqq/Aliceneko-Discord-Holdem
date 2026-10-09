import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {TavernService} from './tavern-service.mjs';
import {TavernBridge} from './tavern-bridge.mjs';
import {beginTavernRound,noteTavernAction,rewardSnapshot,dayKey,MENU,DAILY_REWARD_CAP} from './tavern-catalog.mjs';
import {menuData,draftData,cardData,parseTavernIntent,answerTavern,immediateTavernReply,tavernCommand,handleNaturalTavern} from './tavern-ui.mjs';
import {getArtUrl} from './tavern-art.mjs';
import * as poker from './engine.mjs';
import * as ghost from './ghost-engine.mjs';
import * as liar from './liar-engine.mjs';
import * as uno from './uno-engine.mjs';
function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {db,map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}
const setup=()=>{const store=storage();return {store,service:new TavernService(store)};};
const base={guild:'3',id:'1',name:'Alice',channel:'2'};
const prepare=(s,item='milk',requestKey='request1',now=Date.now(),extra={})=>s.prepare({...base,item,requestKey,...extra},now);
function result(id='table:1',game='uno',now=Date.now(),extras={}){return {id,game,guild:'3',channel:'2',at:now,startedAt:now-60000,players:[{id:'1',name:'Alice',actions:3,won:true},{id:'2',name:'Bob',actions:3,won:false}],...extras};}
function environment(service){return {TABLES:{idFromName:n=>n,get:n=>({fetch:async(url,options)=>{const p=JSON.parse(options.body);try{return Response.json(await service.dispatch(p));}catch(e){return Response.json({error:e.message});}}})}};}
function interaction(action='menu',extras={}){return {type:3,id:'999',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},message:{flags:64},data:{custom_id:`t:3:1:${action}`},...extras};}

test('welcome and wallet persist once; guild stores are isolated; context reads never create money',async()=>{
 const {store,service:s}=setup();assert.equal(s.context('1','2'),null);assert.equal(s.view('1','Alice').member.balance,60);
 assert.equal(new TavernService(store).view('1').member.balance,60);assert.equal(s.rows("SELECT * FROM tavern_ledger WHERE kind='welcome'").length,1);
 const other=setup().service;other.view('1');const d=prepare(s);s.confirm('1',d.id,'2');assert.equal(other.view('1').member.balance,60);
 await s.dispatch({...base,action:'view'});await assert.rejects(()=>s.dispatch({...base,guild:'4',action:'view'}),/不匹配/);
});
test('draft creates no charge; repeated network confirmation charges exactly once, even after expiry',()=>{
 const {store,service:s}=setup(),now=Date.now(),d=prepare(s,'milk','same',now);
 assert.equal(s.view('1').member.balance,60);assert.equal(prepare(s,'soda','same',now).id,d.id);
 const a=s.confirm('1',d.id,'2',now);assert.equal(a.balance,45);assert(!a.repeated);
 const recovered=new TavernService(store),again=recovered.confirm('1',d.id,'2',now+999999);assert(again.repeated);assert.equal(again.balance,45);assert.equal(s.rows('SELECT * FROM tavern_orders').length,1);
 assert.throws(()=>s.confirm('2',d.id,'2',now),/不是你的/);assert.throws(()=>s.confirm('1',d.id,'9',now),/不是你的/);
});
test('insufficient funds, expiry, rapid order and free-water limits never deduct or insert orders',()=>{
 const {service:s}=setup(),now=Date.now(),first=prepare(s,'snack','first',now);s.confirm('1',first.id,'2',now);
 const d=prepare(s,'special','second',now);assert.throws(()=>s.confirm('1',d.id,'2',now+11000),/还差15/);
 const milk=prepare(s,'milk','milk',now);assert.throws(()=>s.confirm('1',milk.id,'2',now+1),/10秒/);assert.throws(()=>s.confirm('1',milk.id,'2',now+180001),/过期/);
 const water=prepare(s,'water','water',now);s.confirm('1',water.id,'2',now+11000);
 const tea=prepare(s,'tea','tea',now);assert.throws(()=>s.confirm('1',tea.id,'2',now+22000),/每分钟/);
 assert.equal(s.view('1').member.balance,20);assert.equal(s.rows('SELECT * FROM tavern_orders').length,2);
});
test('transaction rollback covers debit, order, ledger and confirmation status',()=>{
 const {store,service:s}=setup(),d=prepare(s),original=store.sql.exec;
 store.sql.exec=(q,...args)=>{if(q==='INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)'&&args[3]==='order')throw Error('disk');return original(q,...args);};
 assert.throws(()=>s.confirm('1',d.id,'2'),/disk/);store.sql.exec=original;
 assert.equal(s.view('1').member.balance,60);assert.equal(s.rows('SELECT * FROM tavern_orders').length,0);assert.equal(s.one('SELECT status FROM tavern_drafts WHERE id=?',d.id).status,'pending');
 assert.equal(s.confirm('1',d.id,'2').balance,45);
});
test('all four games credit normalized rewards once; no poker chip conversion; ties earn base',()=>{
 for(const game of ['uno','ghost','liar','poker']){
  const {store,service:s}=setup(),r=result('round:1',game);const a=s.reward('3',r);assert(a.counted);const balance=s.view('1').member.balance;assert(balance>60);
  const restored=new TavernService(store);assert(restored.reward('3',r).repeated);assert.equal(restored.view('1').member.balance,balance);assert(s.view('2').member.balance>60);
 }
 const {service:s}=setup(),r=result('tie:1','poker');r.players.forEach(p=>p.won=false);assert(s.reward('3',r).counted);assert.equal(s.view('1').member.balance,68);
});
test('short games, bots, inactivity, wrong guild, duplicates and surrender never mint coins',()=>{
 for(const change of [r=>r.startedAt=r.at-1,r=>r.players[1].bot=true,r=>r.players[1].actions=0,r=>r.players[1].surrendered=true,r=>r.guild='4',r=>r.players[1].id='1',r=>r.at+=999999,r=>r.id='bad']){
  const {service:s}=setup(),r=result();change(r);assert(!s.reward('3',r).counted);assert.equal(s.rows('SELECT * FROM tavern_members').length,0);
 }
 const {service:s}=setup(),r=result();r.players.push({id:'4',name:'four',actions:1,surrendered:true});assert(s.reward('3',r).counted);assert.equal(s.one('SELECT * FROM tavern_members WHERE id=?','4'),null);
});
test('per-roster limits span games and channels; daily caps are atomic and reset by Beijing day',()=>{
 const {service:s}=setup(),now=Date.parse('2026-10-08T15:58:00Z');
 for(let n=1;n<=8;n++){const r=result(`table:${n}`,n%2?'ghost':'poker',now,{channel:n%2?'2':'5'});assert(s.reward('3',r,now).counted);}
 assert.equal(s.reward('3',result('table:9','uno',now),now).reason,'roster_limit');
 for(let n=10;n<=25;n++){const r=result(`other:${n}`,'uno',now);r.players[1].id=String(n);s.reward('3',r,now);}
 assert.equal(s.view('1','',now).earned,DAILY_REWARD_CAP);const balance=s.view('1','',now).member.balance;
 const tomorrow=Date.parse('2026-10-08T16:01:00Z');assert.notEqual(dayKey(now),dayKey(tomorrow));assert(s.reward('3',result('tomorrow:1','uno',tomorrow),tomorrow).counted);assert.equal(s.view('1','',tomorrow).member.balance,balance+18);
});
test('reward rollback leaves neither result claims nor partial welcome credits',()=>{
 const {store,service:s}=setup(),original=store.sql.exec;
 store.sql.exec=(q,...args)=>{if(q.startsWith('INSERT INTO tavern_daily')&&args[0]==='2')throw Error('disk');return original(q,...args);};
 assert.throws(()=>s.reward('3',result()),/disk/);store.sql.exec=original;
 assert.equal(s.rows('SELECT * FROM tavern_members').length,0);assert.equal(s.rows('SELECT * FROM tavern_results').length,0);assert(s.reward('3',result()).counted);
});
test('profile is explicit, whitelist-controlled, persists and clears without erasing wallet',()=>{
 const {store,service:s}=setup();s.profile('1','Alice','sweetness','light');s.profile('1','Alice','seat','window');s.profile('1','Alice','restrictions','不加肉桂');
 const p=new TavernService(store).view('1').member;assert.equal(p.sweetness,'light');assert.equal(p.seat,'window');assert.equal(p.restrictions,'不加肉桂');
 for(const [k,v]of [['balance',999],['seat','admin'],['__proto__','anything']])assert.throws(()=>s.profile('1','Alice',k,v));
 s.profile('1','Alice','reset');assert.equal(s.view('1').member.balance,60);assert.equal(s.view('1').member.restrictions,'');
});
test('context exposes only the current account and current channel confirmed recent order',()=>{
 const {service:s}=setup(),now=Date.now();s.profile('1','Alice','restrictions','private note');const d=prepare(s,'special','mix',now,{options:{mood:'tired',sweetness:'light'}});
 assert.equal(s.context('1','2',now).currentOrder,null);s.confirm('1',d.id,'2',now);
 assert.equal(s.context('1','2',now).currentOrder.itemName,'今日心情特调「晚灯慢慢」');assert.equal(s.context('1','5',now).currentOrder,null);assert.equal(s.context('1','2',now+7200001).currentOrder,null);assert.equal(s.context('2','2',now),null);
 assert(!JSON.stringify(draftData(d,'1','3',true)).includes('private note'));assert(!JSON.stringify(draftData(d,'1','3',true)).includes('当前余额'));assert(JSON.stringify(cardData(s.view('1'),'1','3')).includes('private note'));
});
test('menus fit Discord limits and confirmation/privacy boundaries reject forged owners',async()=>{
 const {service:s}=setup(),env=environment(s),view=s.view('1');
 for(const data of [menuData(view,'1','3'),cardData(view,'1','3'),draftData(prepare(s),'1','3')]){assert(data.content.length<2000);assert(data.components.length<=5);for(const row of data.components){assert(row.components.length<=5);for(const c of row.components){assert(c.custom_id.length<=100);if(c.options)assert(c.options.length<=25);}}}
 assert(tavernCommand.options.length<=25);assert.equal(MENU.filter(x=>!x.requiresEquipment).length,20);
 assert(tavernCommand.options.flatMap(x=>x.options||[]).every(x=>!x.choices||x.choices.length<=25));
 for(const i of [interaction('wallet',{member:{user:{id:'2'}}}),interaction('wallet',{message:{flags:0}}),interaction('wallet',{guild_id:'4'})]){assert.equal(immediateTavernReply(i).type,4);await assert.rejects(()=>answerTavern(env,i));}
 assert.equal(immediateTavernReply(interaction('notes')).type,9);const publicOpen=interaction('menu',{message:{flags:0},data:{custom_id:'t:3:any:menu'}});assert((await answerTavern(env,publicOpen)).content.includes('今日菜单'));
});
test('natural intent handles requests but does not interpret questions, quotes or history as purchases',()=>{
 assert.deepEqual(parseTavernIntent('给我看看红豆牛奶的图片'),{action:'dish',item:'milk'});
 assert.deepEqual(parseTavernIntent('看看香菇清汤面图片'),{action:'dish',item:'mushroom-noodles'});
 assert.equal(parseTavernIntent('给我看看不存在的图片'),null);
 assert.equal(parseTavernIntent('给我一杯红豆牛奶').item,'milk');assert.equal(parseTavernIntent('看看菜单').action,'menu');assert.equal(parseTavernIntent('我想喝红豆牛奶').action,'menu');assert.equal(parseTavernIntent('给我一杯甜一点的，不要酒精').options.sweetness,'sweet');
 for(const text of ['上次来一杯红豆牛奶','别给我点红豆牛奶','红豆牛奶多少钱？','给我介绍红豆牛奶','给我一杯伏特加','给我看看“来一杯红豆牛奶”','如果我要红豆牛奶','我要知道红豆牛奶是什么','给我一杯红豆牛奶？','给我一杯红豆牛奶，不要了','我要红豆牛奶，算了','我想喝红豆牛奶，取消'])assert.equal(parseTavernIntent(text),null,text);
 assert.equal(parseTavernIntent('给我一杯红豆牛奶！').item,'milk');
 assert.equal(parseTavernIntent('给我一杯红豆牛奶，不要酒精').item,'milk');
});
test('natural previews run without model requests, publish no private preferences and never deduct',async t=>{
 const {service:s}=setup();s.profile('1','Alice','restrictions','secret');const env={...environment(s),BOT_TOKEN:'test'},sent=[];const previous=globalThis.fetch;globalThis.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return Response.json({id:'111'});};t.after(()=>globalThis.fetch=previous);
 const message={guild_id:'3',channel_id:'2',id:'456',author:{id:'1',username:'Alice'}};
 assert(await handleNaturalTavern(env,message,'给我一杯红豆牛奶'));assert.equal(s.view('1').member.balance,60);assert(!JSON.stringify(sent).includes('secret'));assert(!sent.some(r=>r.url.includes('gemini')));
 const draft=s.one('SELECT id FROM tavern_drafts');const data=await answerTavern(env,interaction(`review~${draft.id}`,{message:{flags:0}}));assert(data.content.includes('secret'));
});
test('natural dish image display creates neither a wallet nor a purchase draft',async t=>{
 const {service:s}=setup(),sent=[],previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));return Response.json({id:'111'});};t.after(()=>globalThis.fetch=previous);
 const message={guild_id:'3',channel_id:'2',id:'457',author:{id:'1',username:'Alice'}};
 for(const item of MENU){
  assert(await handleNaturalTavern({...environment(s),BOT_TOKEN:'test'},message,`给我看看${item.name}的图片`),item.id);
  assert.equal(sent.at(-1).embeds[0].image.url,getArtUrl(item.id),item.id);
  assert(!sent.at(-1).content.includes('补图清单'),item.id);
 }
 assert.equal(sent.length,MENU.length);assert(!JSON.stringify(sent).includes('余额'));
 assert.equal(s.rows('SELECT * FROM tavern_members').length,0);assert.equal(s.rows('SELECT * FROM tavern_drafts').length,0);
});
test('reward outbox survives restart and a lost response; backoff clears when delivered',async()=>{
 const {service:s}=setup(),store=storage(),t={game:'uno',guild:'3',channel:'2',players:[{id:'1'},{id:'2'}],rankedResult:result(),tavernRound:{startedAt:Date.now()-60000,actions:{'1':3,'2':2}}};t.rankedResult.at=Date.now();let fail=true;
 const env=environment(s),send=env.TABLES.get;env.TABLES.get=n=>{const stub=send(n);return {fetch:async(...args)=>{const response=await stub.fetch(...args);if(fail){fail=false;throw Error('lost response');}return response;}};};
 const bridge=new TavernBridge({ctx:{storage:store},env});await bridge.capture(t);await bridge.capture(t);assert.equal((await store.get('tavernJobs')).length,1);await store.put('tavernSyncAt',1);await bridge.flush();const balance=s.view('1').member.balance;assert(balance>60);assert(await store.get('tavernSyncAt')>Date.now());
 const recovered=new TavernBridge({ctx:{storage:store},env});await store.put('tavernSyncAt',1);await recovered.flush();assert.equal(s.view('1').member.balance,balance);assert.equal(await store.get('tavernSyncAt'),undefined);assert.equal(await store.get('tavernJobs'),undefined);
});
test('engine snapshots preserve completed poker leavers, exclude timeout actions and contain no cards',()=>{
 const t=poker.newTable('1','2','3');poker.join(t,'2');poker.start(t,'1',poker.shuffledDeck(),Date.now()-30000);poker.act(t,t.turn,'call');const next=t.turn;poker.queueLeave(t,next);poker.act(t,next,'fold');
 const r=rewardSnapshot(t);assert.equal(r.players.length,2);assert(r.players.some(p=>p.id===next));assert.equal(t.players.length,1);assert(!JSON.stringify(r).includes('cards'));
 const auto=poker.newTable('1','2','3');poker.join(auto,'2');poker.start(auto,'1');poker.act(auto,auto.turn,'fold',null,Date.now(),true);assert.deepEqual(auto.tavernRound.actions,{});
 const old={game:'uno',rankedResult:result(),players:[{id:'1'},{id:'2'}]};assert.equal(rewardSnapshot(old),null);
 const u=uno.newTable('1','2','3');uno.join(u,'2');uno.start(u,'1');assert(u.tavernRound.startedAt);noteTavernAction(u,'1');assert.equal(u.tavernRound.actions['1'],1);
 const g=ghost.create('1','2','3','one');ghost.start(g,'2','two');assert(g.tavernRound.startedAt);
 const l=liar.create('1','2','3','one');liar.join(l,'2','two');liar.start(l,'1');assert(l.tavernRound.startedAt);
});

test('signed tavern commands bypass occupied tables, defer privately and confirm once through actual Worker',async t=>{
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),env={BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')},instances=new Map(),names=[];
 env.TABLES={idFromName:n=>n,get:n=>{names.push(n);if(!instances.has(n)){const ctx={storage:storage(),blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}};instances.set(n,new PokerTable(ctx,env));}return {fetch:(url,options)=>instances.get(n).fetch(new Request(url,options))};}};
 const sent=[],previous=globalThis.fetch;globalThis.fetch=async(url,options)=>{sent.push({url,body:options.body&&JSON.parse(options.body)});return Response.json({id:'444'});};t.after(()=>globalThis.fetch=previous);
 let seq=100;const call=async(i)=>{const payload={application_id:'123',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},token:'test-token',id:String(++seq),...i},body=JSON.stringify(payload),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),tasks=[];
  const response=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return response.json();};
 assert.equal((await call({type:2,data:{name:'酒馆',options:[{name:'菜单'}]}})).data.flags,64);assert(names.every(n=>n==='tavern:3'));
 await call({type:2,data:{name:'酒馆',options:[{name:'点单',options:[{name:'商品',value:'milk'}]}]}});
 const s=instances.get('tavern:3').tavern,d=s.one('SELECT * FROM tavern_drafts');assert.equal(s.view('1').member.balance,60);
 assert.equal((await call(interaction(`confirm~${d.id}`))).type,6);await call(interaction(`confirm~${d.id}`));assert.equal(s.view('1').member.balance,45);
 assert.equal(sent.filter(r=>r.url.endsWith('/channels/2/messages')).length,1);assert(sent.find(r=>r.url.endsWith('/channels/2/messages')).body.enforce_nonce);
 const bad=await call(interaction(`confirm~${d.id}`,{member:{user:{id:'2'}}}));assert.equal(bad.type,4);assert.equal(bad.data.flags,64);
});

test('seasonal order confirmation is atomic and idempotent; retired-month previews do not charge',async t=>{
 const now=Date.parse('2026-10-31T23:59:00+08:00');t.mock.method(Date,'now',()=>now);
 const {service:s}=setup(),ops=s.operations;ops.vote({id:'1',name:'Alice',month:'202610',candidate:'c3'},now);
 for(let n=0;n<29;n++)ops.recordGame(`research:${n}`,{at:now},[{id:'1',name:'Alice'}],false);
 const basic=prepare(s,'milk','unlock',now);s.confirm('1',basic.id,'2',now);assert.equal(ops.board(null,now).season.unlocked,true);
 const drink=ops.menu(now).at(-1),d=prepare(s,drink.id,'season',now+11000),retired=prepare(s,drink.id,'retired',now+22000);
 const before=s.view('1','Alice',now).member.balance,record=ops.recordOrder.bind(ops);ops.recordOrder=()=>{throw Error('research disk');};
 assert.throws(()=>s.confirm('1',d.id,'2',now+22000),/research disk/);assert.equal(s.view('1','Alice',now).member.balance,before);assert.equal(s.one('SELECT id FROM tavern_orders WHERE id=?',d.id),null);ops.recordOrder=record;
 const bought=s.confirm('1',d.id,'2',now+22000);assert.equal(bought.balance,before-drink.price);assert.equal(bought.order.details.serve,drink.serve);
 const next=Date.parse('2026-11-01T00:00:00+08:00');assert.equal(s.confirm('1',d.id,'2',next).repeated,true);
 assert.throws(()=>s.confirm('1',retired.id,'2',next),/菜单|商品/);assert.equal(s.view('1','Alice',next).member.balance,bought.balance);
 assert.equal(s.rows('SELECT * FROM tavern_orders').length,2);
});

test('unlocked seasonal menu works through natural order preview without a second model or charge',async t=>{
 const {service:s}=setup(),now=Date.now(),month=dayKey(now).slice(0,7).replace('-',''),ops=s.operations;
 ops.vote({id:'1',name:'Alice',month,candidate:'c1'},now);for(let i=0;i<30;i++)ops.recordGame(`natural:${i}`,{at:now},[{id:'1',name:'Alice'}],false);
 const drink=ops.menu(now).at(-1),env=environment(s),oldFetch=globalThis.fetch,sent=[];globalThis.fetch=async(u,o)=>{sent.push(JSON.parse(o.body));return Response.json({id:'4'});};t.after(()=>globalThis.fetch=oldFetch);
 assert(await handleNaturalTavern(env,{guild_id:'3',channel_id:'2',id:'777',author:{id:'1',username:'Alice'}},`来一杯${drink.name}`));
 assert.match(sent[0].content,new RegExp(drink.name));assert.match(sent[0].content,/尚未扣款/);assert.equal(s.view('1').member.balance,60);assert.equal(s.rows('SELECT * FROM tavern_orders').length,0);
});



test('daily gift is explicit, persists once across restart, and resets at Beijing midnight',()=>{
 const {store,service:s}=setup(),before=Date.parse('2026-10-09T15:59:59Z'),after=before+1000;
 const first=s.view('1','Alice',before);assert.equal(first.member.balance,60);assert.equal(first.dailyGiftClaimed,false);assert.equal(first.dailyGiftAvailable,20);assert.equal(first.earned,0);
 const gift=s.claimDaily('1','Alice',before);assert.deepEqual(gift.dailyGift,{amount:20,repeated:false});assert.equal(gift.member.balance,80);assert.equal(gift.earned,20);assert(gift.dailyGiftClaimed);assert.equal(gift.dailyGiftAvailable,0);
 const restarted=new TavernService(store),repeat=restarted.claimDaily('1','Alice',before);assert(repeat.dailyGift.repeated);assert.equal(repeat.member.balance,80);assert.equal(repeat.earned,20);
 assert.equal(s.rows("SELECT * FROM tavern_ledger WHERE kind='daily_gift'").length,1);
 assert.equal(restarted.claimDaily('1','Alice',after).member.balance,100);assert.equal(restarted.view('1','',after).earned,20);
 assert.equal(setup().service.claimDaily('1','Alice',before).member.balance,80);
});
test('daily gift and games share cumulative cap; spending and replay never restore allowance',()=>{
 const {service:s}=setup(),now=Date.now();s.claimDaily('1','Alice',now);
 for(let n=1;n<=20;n++){const r=result(`cap:${n}`,'uno',now);r.players[1].id=String(n+20);s.reward('3',r,now);}
 const before=s.view('1','',now);assert.equal(before.earned,150);assert.equal(before.member.balance,210);
 const draft=prepare(s,'milk','capSpend',now);s.confirm('1',draft.id,'2',now);assert.equal(s.view('1','',now).member.balance,195);assert.equal(s.view('1','',now).earned,150);
 const r=result('cap:21','uno',now);r.players[1].id='90';s.reward('3',r,now);assert.equal(s.view('1','',now).member.balance,195);assert.equal(s.view('1','',now).earned,150);
 assert(s.claimDaily('1','Alice',now).dailyGift.repeated);assert.equal(s.view('1','',now).member.balance,195);
});
test('partial daily gift uses only remaining budget and cannot be topped up; full cap creates no gift ledger',()=>{
 const {service:s}=setup(),now=Date.now();s.member('1','Alice',now);s.sql.exec('INSERT INTO tavern_daily VALUES(?,?,?)','1',dayKey(now),145);
 const gift=s.claimDaily('1','Alice',now);assert.equal(gift.dailyGift.amount,5);assert.equal(gift.member.balance,65);assert.equal(gift.earned,150);assert(s.claimDaily('1','Alice',now).dailyGift.repeated);
 s.member('2','Bob',now);s.sql.exec('INSERT INTO tavern_daily VALUES(?,?,?)','2',dayKey(now),150);assert.equal(s.claimDaily('2','Bob',now).dailyGift.amount,0);assert.equal(s.view('2','',now).member.balance,60);assert.equal(s.rows("SELECT * FROM tavern_ledger WHERE user_id='2' AND kind='daily_gift'").length,0);
});
test('daily gift transaction failure rolls back wallet, allowance and ledger together',()=>{
 const {store,service:s}=setup(),now=Date.now(),original=store.sql.exec;
 store.sql.exec=(q,...a)=>{if(q==='INSERT INTO tavern_ledger VALUES(?,?,?,?,?,?)'&&a[3]==='daily_gift')throw Error('gift disk');return original(q,...a);};
 assert.throws(()=>s.claimDaily('1','Alice',now),/gift disk/);store.sql.exec=original;
 assert.equal(s.rows('SELECT * FROM tavern_members').length,0);assert.equal(s.rows('SELECT * FROM tavern_daily').length,0);assert.equal(s.rows('SELECT * FROM tavern_ledger').length,0);assert.equal(s.claimDaily('1','Alice',now).member.balance,80);
});
test('same roster earns full, half then quarter rewards with canonical order and retry preserving tier',()=>{
 const {service:s}=setup(),now=Date.now(),expected=[18,18,18,9,9,9,4,4];
 for(let n=0;n<8;n++){const r=result(`tier:${n+1}`,'uno',now);if(n%2)r.players.reverse();r.channel=n%2?'5':'2';const outcome=s.reward('3',r,now);assert.equal(outcome.rewards.find(p=>p.id==='1').amount,expected[n]);assert.equal(outcome.rewards.find(p=>p.id==='2').amount,n<3?12:n<6?6:3);assert(s.reward('3',r,now).repeated);}
 assert.equal(s.reward('3',result('tier:9','ghost',now),now).reason,'roster_limit');assert.equal(s.view('1','',now).earned,89);assert.equal(s.one('SELECT played FROM tavern_rosters').played,8);
});
test('daily gift UI keeps privacy and ownership and rejects cross-guild dispatch before credit',async()=>{
 const {service:s}=setup(),env=environment(s);const wallet=await answerTavern(env,interaction('wallet'));assert.equal(s.view('1').earned,0);assert(wallet.components.flatMap(r=>r.components).some(c=>c.custom_id==='t:3:1:claimDaily'));
 for(const i of [interaction('claimDaily',{member:{user:{id:'2'}}}),interaction('claimDaily',{message:{flags:0}}),interaction('claimDaily',{guild_id:'4'})]){assert.equal(immediateTavernReply(i).type,4);await assert.rejects(()=>answerTavern(env,i));}
 await assert.rejects(()=>s.dispatch({...base,guild:'4',action:'claimDaily'}),/不匹配/);assert.equal(s.view('1').earned,0);
 const reply=await answerTavern(env,interaction('claimDaily'));assert.match(reply.content,/20/);assert.equal(s.view('1').earned,20);await answerTavern(env,interaction('claimDaily'));assert.equal(s.view('1').member.balance,80);
});
