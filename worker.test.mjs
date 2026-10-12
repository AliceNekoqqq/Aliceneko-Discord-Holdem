import test from 'node:test';
import assert from 'node:assert/strict';
import {board as pokerBoard} from './ui.mjs';
import { readFile } from 'node:fs/promises';
const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace("'./engine.mjs'",JSON.stringify(new URL('./engine.mjs',import.meta.url).href)).replace("'./computer.mjs'",JSON.stringify(new URL('./computer.mjs',import.meta.url).href)).replace("'./ui.mjs'",JSON.stringify(new URL('./ui.mjs',import.meta.url).href)).replace("'./private-panels.mjs'",JSON.stringify(new URL('./private-panels.mjs',import.meta.url).href)).replace("'./lifecycle.mjs'",JSON.stringify(new URL('./lifecycle.mjs',import.meta.url).href));
const preparedSource=source.replaceAll("'./uno-engine.mjs'",JSON.stringify(new URL('./uno-engine.mjs',import.meta.url).href)).replaceAll("'./board-sync.mjs'",JSON.stringify(new URL('./board-sync.mjs',import.meta.url).href)).replaceAll("'./uno-controller.mjs'",JSON.stringify(new URL('./uno-controller.mjs',import.meta.url).href)).replaceAll("'./uno-ui.mjs'",JSON.stringify(new URL('./uno-ui.mjs',import.meta.url).href));
const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(preparedSource.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`)).toString('base64'));
const pokerState=t=>{const copy=structuredClone(t);delete copy.ownerSeenAt;delete copy.takeoverNoticeFor;return copy;};
test('health rejects a connected gateway running the previous chat pipeline',async()=>{
  let actual={connected:true,ready:true,chatRuntime:'chat50-channel-order-speaker-map',token:'must-not-leak'};
  const env={TABLES:{idFromName:n=>n,get:n=>({fetch:async()=>Response.json(n==='system-health'?{ok:true,version:'test'}:actual)})}};
  const probe=async()=> (await worker.fetch(new Request('https://test/health'),env,{})).json();
  assert.equal((await probe()).ready,false);
  actual.chatRuntime='chat82-relationships';
  const good=await probe();assert.equal(good.ready,true);assert.equal(JSON.stringify(good).includes('must-not-leak'),false);
  actual.ready=false;assert.equal((await probe()).ready,false);
});
function context(){const map=new Map();const storage={sql:{exec:()=>({one:()=>({ok:1})})},get:async k=>structuredClone(map.get(k)),delete:async k=>map.delete(k),put:async(k,v)=>map.set(k,structuredClone(v)),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};storage.transaction=async fn=>fn(storage);const tasks=[];return {storage,map,tasks,blockConcurrencyWhile:fn=>fn(),waitUntil:p=>tasks.push(p)};}
test('signed Discord flow, private cards, stale click, duplicate, modal, timeout and safe routes',async()=>{
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);const env={BOT_TOKEN:'test-secret-not-real',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
 const instances=new Map();env.TABLES={idFromName:n=>n,get:n=>{if(n==='system-discord-gateway')return {fetch:async()=>Response.json({connected:false})};if(!instances.has(n)){const ctx=context();instances.set(n,{ctx,do:new PokerTable(ctx,env)});}return {fetch:(url,init)=>instances.get(n).do.fetch(new Request(url,init))};}};
 const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>new Response(JSON.stringify({id:'999'}),{status:200,headers:{'Content-Type':'application/json'}});
 try{
 let counter=0;
 const call=async(data)=>{const i={application_id:'123',guild_id:'3',channel_id:'2',id:String(++counter),token:'transient-secret',member:{user:{id:'1'},permissions:'0'},...data};const body=JSON.stringify(i),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex');const ctx=context();const r=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':sig,'X-Signature-Timestamp':ts}}),env,ctx);await Promise.all(ctx.tasks);return {reply:await r.json(),i};};
 const unsigned=await worker.fetch(new Request('https://test/interactions',{method:'POST',body:'{}'}),env,context());assert.equal(unsigned.status,401);
 const hidden=await worker.fetch(new Request('https://test/.env'),env,context());assert.equal(hidden.status,404);
 const health=await worker.fetch(new Request('https://test/health'),env,context());assert.deepEqual(await health.json(),{ok:true,version:'1.0.1-beta.82',ready:false,gateway:{connected:false,ready:false,chatRuntime:null,expectedRuntime:'chat82-relationships'},roguelike:{rulesVersion:'lantern-rules-v0.15',entry:'灯下迷城',professions:8,cards:96,relics:31,enemies:30,items:10,events:15,difficulties:11,stations:15,guidance:{cardTypes:true,contextHints:true,risks:true},lore:{world:true,professions:8},visuals:{map:true,battle:true,private:true}}});
 assert.deepEqual((await call({type:1})).reply,{type:1});
 const create={type:2,data:{name:'德州',options:[{name:'创建'}]}};
 let {reply:b}=await call(create);assert.equal(b.type,4);assert(!JSON.stringify(b).includes(env.BOT_TOKEN));
 const instance=instances.get('table:3:2');assert.equal(instance.ctx.map.get('table').messageId,'999');
 const pick=(b,a)=>b.data.components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':'+a)).custom_id;
 const click=async(action,id='1',custom)=>call({type:3,member:{user:{id},permissions:'0'},message:{id:'999'},data:{custom_id:custom||`h:${instance.ctx.map.get('table').epoch}:${instance.ctx.map.get('table').version}:${action}`}});
 const oldJoin=pick(b,'join');({reply:b}=await click('join','4'));assert.equal(b.type,6);
 const stale=await click('join','5',oldJoin);assert.equal(stale.reply.type,4);assert.equal(instance.ctx.map.get('table').players.length,2);
 const forbidden=await click('start','4');assert.equal(forbidden.reply.data.flags,64);
 ({reply:b}=await click('start'));assert.equal(b.type,6);
 const hand=await click('hand');assert.equal(hand.reply.data.flags,64);assert(hand.reply.data.content.includes('你的底牌'));
 const outsider=await click('hand','8');assert.equal(outsider.reply.data.flags,64);assert(!outsider.reply.data.content.includes('底牌'));
 const {reply:modal}=await click('raise');assert.equal(modal.type,9);
 const submit=await call({type:5,member:{user:{id:'1'},permissions:'0'},message:{id:'999'},data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'amount',value:'40'}]}]}});b=submit.reply;assert.equal(b.type,6);
 const state=instance.ctx.map.get('table');assert.equal(state.currentBet,40);state.deadline=Date.now()-1;await instance.ctx.storage.put('table',state);await instance.do.alarm();assert.equal(instance.ctx.map.get('table').phase,'settled');
 assert(!JSON.stringify([...instance.ctx.map]).includes('transient-secret'));assert(!JSON.stringify([...instance.ctx.map]).includes(env.BOT_TOKEN));
 const last=instance.ctx.map.get('table');assert.equal(last.players.reduce((s,p)=>s+p.stack,0),4000);
 const scheduled=context();await worker.scheduled({},env,scheduled);await Promise.all(scheduled.tasks);
 }finally{globalThis.fetch=oldFetch;}
});

test('solo practice flow schedules computer alarms, protects hands, refills and closes',async()=>{
 const ctx=context(),env={BOT_TOKEN:'test-secret-not-real',DISCORD_APPLICATION_ID:'123'},table=new PokerTable(ctx,env);
 const oldFetch=globalThis.fetch;const updates=[];
 globalThis.fetch=async(url,opts)=>{if(opts?.method==='PATCH')updates.push(JSON.parse(opts.body));return Response.json({id:'999'});};
 try {
  let serial=0;
  const interaction=async(data)=>{const i={id:String(++serial),guild_id:'3',channel_id:'2',member:{user:{id:'1'},permissions:'0'},message:{id:'999'},...data};const r=await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:i})}));return r.json();};
  let reply=await interaction({type:2,data:{name:'德州',options:[{name:'测试'}]}});
  assert.equal(reply.type,4);assert.equal(ctx.map.get('table').players.length,3);
  await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'bind',epoch:reply.bindEpoch,messageId:'999'})}));
  const click=action=>interaction({type:3,data:{custom_id:`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${action}`}});
  const outsiders=await interaction({type:3,member:{user:{id:'4'},permissions:'0'},data:{custom_id:`h:${ctx.map.get('table').epoch}:0:removebots`}});
  assert.equal(outsiders.data.flags,64);assert.equal(ctx.map.get('table').players.length,3);
  reply=await click('start');assert.equal(reply.type,6);
  let state=ctx.map.get('table');assert.equal(state.turn,'1');reply=await click('call');state=ctx.map.get('table');assert(state.computerDue);assert(ctx.map.get('alarm')<=state.computerDue);
  const hidden=await click('hand');assert.equal(hidden.data.flags,64);
  assert(!JSON.stringify(reply).includes('<@cpu:'));
  assert(!JSON.stringify(reply).includes('cpu:1'));
  for(const p of state.players.filter(p=>p.bot))assert(!JSON.stringify(reply).includes((await import('./engine.mjs')).cardsText(p.cards)));
  let count=0;
  while(ctx.map.get('table').turn) {
   assert(++count<300);state=ctx.map.get('table');
   if(state.computerDue) {
    const version=state.version;state.computerDue=Date.now()-1;await ctx.storage.put('table',state);await table.alarm();
    assert.equal(ctx.map.get('table').version,version+1);
   } else {reply=await click('call');assert.equal(reply.type,6);}
  }
  state=ctx.map.get('table');assert.equal(state.phase,'settled');assert.equal(state.players.reduce((s,p)=>s+p.stack,0),6000);assert(ctx.map.get('alarm')>Date.now());await ctx.storage.put('boardSyncAt',Date.now()-1);const jobs=await ctx.storage.get('boardJobs');for(const j of Object.values(jobs||{}))j.due=Date.now()-1;if(jobs)await ctx.storage.put('boardJobs',jobs);await table.alarm();assert(updates.length>0);
  // Recreate a minimal one-computer lobby to test human timeout -> computer alarm.
  reply=await click('close');assert.equal(reply.type,4);const newer=ctx.map.get('table');newer.version++;await ctx.storage.put('table',newer);reply=await interaction({type:3,message:{id:'888',flags:64},data:{custom_id:reply.data.components[0].components[0].custom_id}});assert.equal(reply.type,7);
  reply=await interaction({type:2,data:{name:'德州',options:[{name:'测试',options:[{name:'电脑数量',value:1}]}]}});
  assert.equal(ctx.map.get('table').players.length,2);
  state=ctx.map.get('table');state.players[1].stack=0;await ctx.storage.put('table',state);
  reply=await click('start');assert.equal(reply.type,6);assert.equal(ctx.map.get('table').players[1].stack,1980);
  state=ctx.map.get('table');assert.equal(state.turn,'1');state.deadline=Date.now()-1;await ctx.storage.put('table',state);await table.alarm();assert.equal(ctx.map.get('table').phase,'settled');
  await click('start');reply=await click('close');await interaction({type:3,message:{id:'888',flags:64},data:{custom_id:reply.data.components[0].components[0].custom_id}});assert.equal(ctx.map.get('table').phase,'closed');assert(!ctx.map.get('table').deadline);assert(!ctx.map.get('table').readyDue);
  assert(!JSON.stringify([...ctx.map]).includes(env.BOT_TOKEN));
 } finally {globalThis.fetch=oldFetch;}
});

test('all-in confirmation is private, actor-bound, version-checked and single-use',async(t)=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({});t.after(()=>{globalThis.fetch=originalFetch;});
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'test'});
 let serial=0;
 const call=async(type,data,id='1',message='999')=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),type,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message:{id:message,flags:message==='888'?64:0},data}})}))).json();
 const action=(a,id='1')=>call(3,{custom_id:`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`},id);
 await call(2,{name:'德州',options:[{name:'创建'}]});await action('join','4');await action('start');
 const before=structuredClone(ctx.map.get('table'));
 const prompt=await action('allin');assert.equal(prompt.type,4);assert.equal(prompt.data.flags,64);assert.deepEqual(pokerState(ctx.map.get('table')),pokerState(before));
 const key=prompt.data.components[0].components[0].custom_id;
 const denied=await call(3,{custom_id:key},'4','888');assert.equal(denied.data.flags,64);assert.deepEqual(pokerState(ctx.map.get('table')),pokerState(before));
 await action('call');const stale=await call(3,{custom_id:key},'1','888');assert(stale.data.content.includes('未执行'));assert.equal(ctx.map.get('table').players[0].stack,1980);
 // Opening a confirmation does not commit chips; only the affirmative control exists.
 const state=structuredClone(ctx.map.get('table'));const next=await action('allin','4');
 assert.equal(next.data.components[0].components.length,1);assert.deepEqual(pokerState(ctx.map.get('table')),pokerState(state));
 const yes=next.data.components[0].components[0].custom_id;
 const savedFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({});
 try {
  const accepted=await call(3,{custom_id:yes},'4','888');assert(accepted.data.content.includes('已全下'));
  assert.equal(ctx.map.get('table').players[1].stack,0);
  const after=structuredClone(ctx.map.get('table'));await call(3,{custom_id:yes},'4','888');assert.deepEqual(pokerState(ctx.map.get('table')),pokerState(after));
  await Promise.all(ctx.tasks);
 } finally {globalThis.fetch=savedFetch;}
});

test('private hand panel supports betting and modal, refreshes in place, and cannot expose cards publicly',async(t)=>{
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'test'}),patches=[];
 const savedFetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>{if(opts?.method==='PATCH')patches.push(JSON.parse(opts.body));return Response.json({});};t.after(()=>{globalThis.fetch=savedFetch;});
 let serial=0;
 const call=async(type,data,id='1',message={id:'999'})=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),type,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message,data}})}))).json();
 const key=a=>`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`;
 const click=a=>call(3,{custom_id:key(a)});
 const privateClick=a=>call(3,{custom_id:key(`p~1~${a}`)},'1',{id:'888',flags:64});
 await call(2,{name:'德州',options:[{name:'创建'}]});await call(3,{custom_id:key('join')},'4');await click('start');
 const opened=await click('hand');assert.equal(opened.type,4);assert.equal(opened.data.flags,64);const handTitle=opened.data.embeds[0].title;
 const forbidden=await call(3,{custom_id:key('p~1~hand')},'4',{id:'888',flags:64});assert.equal(forbidden.data.flags,64);assert(!JSON.stringify(forbidden).includes(handTitle));
 const publicSpoof=await click('p~1~hand');assert.equal(publicSpoof.type,4);assert.equal(publicSpoof.data.flags,64);assert(!JSON.stringify(publicSpoof).includes(handTitle));
 const hidden=await privateClick('hide');assert.equal(hidden.type,7);assert.deepEqual(hidden.data.embeds,[]);
 const refreshed=await privateClick('hand');assert.deepEqual(refreshed,{type:6});
 const staleKey=key('p~1~call');
 const modal=await privateClick('raise');assert.equal(modal.type,9);assert(modal.data.custom_id.endsWith('p~1~submit'));
 const raised=await call(5,{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'amount',value:'40'}]}]},'1',{id:'888',flags:64});
 assert.deepEqual(raised,{type:6});assert.equal(ctx.map.get('table').currentBet,40);assert.equal(ctx.map.get('table').messageId,'999');
 const before=structuredClone(ctx.map.get('table'));
 const stale=await call(3,{custom_id:staleKey},'1',{id:'888',flags:64});assert.deepEqual(stale,{type:6});assert.deepEqual(pokerState(ctx.map.get('table')),pokerState(before));
 await call(3,{custom_id:key('call')},'4');await call(3,{custom_id:key('check')},'4');
 const state=structuredClone(ctx.map.get('table'));const prompt=await privateClick('allin');assert.equal(prompt.type,4);assert.equal(prompt.data.flags,64);assert(prompt.data.content.includes('确认投入'));assert.equal(prompt.data.components[0].components.length,1);assert.deepEqual(pokerState(ctx.map.get('table')),pokerState(state));
 // The original panel remains usable because the confirmation is a separate reply.
 const unchanged=await privateClick('hand');assert.deepEqual(unchanged,{type:6});assert.equal(ctx.map.get('table').players[0].stack,1960);
 const allin=await call(3,{custom_id:prompt.data.components[0].components[0].custom_id},'1',{id:'777',flags:64});assert.equal(allin.type,7);assert.equal(ctx.map.get('table').players[0].stack,0);
 const jobs=await ctx.storage.get('boardJobs');for(const j of Object.values(jobs||{}))j.due=Date.now()-1;if(jobs)await ctx.storage.put('boardJobs',jobs);await table.alarm();await Promise.all(ctx.tasks);assert(patches.length>0);assert(patches.every(p=>p.embeds[0].title==='♠ Aliceneko · 德州扑克'));
 // A modal without an attached private message must create an ephemeral reply.
 const missingMessage=await call(5,{custom_id:staleKey.replace('call','submit'),components:[]},'1',undefined);
 assert.equal(missingMessage.type,4);assert.equal(missingMessage.data.flags,64);
});

test('table alarms deliver consecutive hands and update private cards after computer actions',async(t)=>{
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'fake-key',DISCORD_APPLICATION_ID:'123'}),sent=[];
 const oldFetch=globalThis.fetch;let messageSerial=7000;
 globalThis.fetch=async(url,opts)=>{const multipart=opts.body instanceof FormData;const body=JSON.parse(multipart?opts.body.get('payload_json'):opts.body||'{}');sent.push({url,method:opts.method,body,file:multipart?opts.body.get('files[0]'):null});return Response.json({id:opts.method==='POST'?String(++messageSerial):url.split('/').at(-1),attachments:body.attachments?.map(a=>({...a,id:a.id===0?String(++messageSerial):a.id}))||[]});};t.after(()=>{globalThis.fetch=oldFetch;});
 let serial=0;
 const interaction=async(type,data)=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{type,data,id:String(++serial),token:`continuation-${serial}`,guild_id:'3',channel_id:'2',member:{user:{id:'1'},permissions:'0'},message:{id:'999'}}})}))).json();
 const click=a=>interaction(3,{custom_id:`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`});
 const flush=async()=>{if(ctx.map.has('privateSyncAt')){await ctx.storage.put('privateSyncAt',Date.now()-1);await table.alarm();}};
 await interaction(2,{name:'德州',options:[{name:'测试'}]});await flush();assert.equal(sent.filter(r=>r.method==='POST').length,1);
 await click('start');await flush();let posts=sent.filter(r=>r.method==='POST');assert.equal(posts.length,2);assert.equal(posts[1].body.flags,64);assert(posts[1].body.content.includes('第 1 手'));
 assert(posts[1].file);assert.equal(posts[1].body.attachments.length,1);assert(sent.filter(r=>r.file).every(r=>r.url.includes('/webhooks/')));
 assert(sent.some(r=>r.method==='PATCH'&&r.body.content?.includes('这张手牌卡已结束')));
 let moves=0;
 while(ctx.map.get('table').turn){
  assert(++moves<100);const state=ctx.map.get('table');
  if(state.computerDue){state.computerDue=Date.now()-1;await ctx.storage.put('table',state);await table.alarm();}
  else {await click('call');}
  await flush();
 }
 assert.equal(sent.filter(r=>r.method==='POST').length,2);
 const cards=sent.filter(r=>r.method==='PATCH'&&r.body.embeds?.[0]?.title==='你的手牌');
 assert(cards.length>0);assert(cards.at(-1).body.embeds[0].fields.some(f=>f.name==='本手净变化'));
 let state=ctx.map.get('table');if(state.players[0].stack===0)await click('rebuy');
 await click('start');await flush();posts=sent.filter(r=>r.method==='POST');assert.equal(posts.length,3);assert(posts.at(-1).body.content.includes('第 2 手'));
 const atRest=JSON.stringify([...ctx.map]);assert(!atRest.includes('continuation-'));assert(!atRest.includes('fake-key'));
});

test('lobby warnings, read-only activity, expiry and channel recreation work without real waits',async(t)=>{
 const actualNow=Date.now;let now=1800000000000;Date.now=()=>now;t.after(()=>{Date.now=actualNow;});
 const oldFetch=globalThis.fetch,updates=[];globalThis.fetch=async(url,opts)=>{updates.push({url,body:JSON.parse(opts.body)});return Response.json({id:'999'});};t.after(()=>{globalThis.fetch=oldFetch;});
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'});let serial=0;
 const call=async(type,data,id='1',message={id:'999'})=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),type,data,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message}})}))).json();
 const key=a=>`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`;
 await call(2,{name:'德州',options:[{name:'创建'}]});await call(3,{custom_id:key('join')},'4');
 now+=300;await table.alarm();assert.equal(ctx.map.get('alarm'),ctx.map.get('table').ownerSeenAt+120000);
 now=ctx.map.get('table').ownerSeenAt+120000;await table.alarm();now+=300;await table.alarm();const manage=await call(3,{custom_id:key('manage')},'4');assert(manage.data.components.flatMap(r=>r.components).some(b=>b.label==='接管桌主'));
 now=ctx.map.get('table').lastActive+240000;await table.alarm();now+=300;await table.alarm();assert(updates.at(-1).body.embeds[0].fields.some(f=>f.name==='即将自动关桌'));
 const lastActive=ctx.map.get('table').lastActive;await call(3,{custom_id:key('hand')});assert.equal(ctx.map.get('table').lastActive,lastActive);
 const expiredKey=key('join');now+=60000;const late=await call(3,{custom_id:expiredKey},'8');assert(late.data.content.includes('已关闭'));assert.equal(ctx.map.get('table').phase,'closed');assert.equal(ctx.map.get('table').players.length,2);assert(!ctx.map.get('table').deadline);assert(!ctx.map.get('table').readyDue);await Promise.all(ctx.tasks);
 now+=300;await table.alarm();assert.equal(updates.at(-1).body.components.length,0);assert(updates.at(-1).body.embeds[0].fields.some(f=>f.name==='关闭原因'));
 const oldEpoch=ctx.map.get('table').epoch;const recreated=await call(2,{name:'德州',options:[{name:'创建'}]});assert.equal(recreated.type,4);assert.notEqual(ctx.map.get('table').epoch,oldEpoch);
 const stale=await call(3,{custom_id:expiredKey},'4');assert(stale.data.content.includes('旧牌桌'));assert.equal(ctx.map.get('table').players.length,1);
});

test('takeover is revalidated, idle clocks reset on real operations and active expiry refunds chips',async(t)=>{
 const actualNow=Date.now;let now=1800000000000;Date.now=()=>now;t.after(()=>{Date.now=actualNow;});
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'999'});t.after(()=>{globalThis.fetch=oldFetch;});
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'test'});let serial=0;
 const call=async(type,data,id='1')=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),type,data,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message:{id:'999'}}})}))).json();
 const key=a=>`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`;
 const click=(a,id='1')=>call(3,{custom_id:key(a)},id);
 await call(2,{name:'德州',options:[{name:'创建'}]});await click('join','4');
 now+=120000;let reply=await click('takeover','8');assert(reply.data.content.includes('已入座'));assert.equal(ctx.map.get('table').owner,'1');
 await click('refresh','1');reply=await click('takeover','4');assert(reply.data.content.includes('2 分钟'));assert.equal(ctx.map.get('table').owner,'1');
 now+=120000;reply=await click('takeover','4');assert.equal(reply.type,6);assert.equal(ctx.map.get('table').owner,'4');assert.equal(ctx.map.get('table').lastActive,now);
 await click('start','4');assert.equal(ctx.map.get('table').phase,'preflop');reply=await click('takeover','1');assert(reply.data.content.includes('等待发牌'));
 await click('call',ctx.map.get('table').turn);await click('check',ctx.map.get('table').turn);let state=ctx.map.get('table');assert.equal(state.phase,'flop');
 const baseline=state.lastActive;now+=600000;state.players.forEach(p=>p.timedOutAt=baseline+60000);await ctx.storage.put('table',state);await table.alarm();await Promise.all(ctx.tasks);
 state=ctx.map.get('table');assert.equal(state.phase,'closed');assert.deepEqual(state.players.map(p=>p.stack),[2000,2000]);assert(state.closeReason.includes('退回'));assert(!ctx.map.get('table').deadline);assert(!ctx.map.get('table').readyDue);
 // Settlement gets a full ten-minute lease even after a long automatic runout.
 await call(2,{name:'德州',options:[{name:'创建'}]});await click('join','4');await click('start');await click('fold',ctx.map.get('table').turn);
 state=ctx.map.get('table');assert.equal(state.phase,'settled');const settledAt=state.settledAt;now=settledAt+599999;await table.alarm();assert.equal(ctx.map.get('table').phase,'settled');now++;await table.alarm();assert.equal(ctx.map.get('table').phase,'closed');
});


test('multiple humans ready from the same board; cancel stops the alarm; automatic deal requires renewed consent each hand',async(t)=>{
 const actualNow=Date.now;let now=1800000000000;Date.now=()=>now;t.after(()=>{Date.now=actualNow;});
 const original=fetch,updates=[];globalThis.fetch=async(url,opts)=>{updates.push(JSON.parse(opts.body));return Response.json({id:'999'});};t.after(()=>{globalThis.fetch=original;});
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'fake'});let serial=0;
 const call=async(type,data,id='1',message={id:'999'})=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),type,data,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message}})}))).json();
 const key=a=>`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`;
 await call(2,{name:'德州',options:[{name:'创建'}]});await call(3,{custom_id:key('join')},'4');
 const bothReady=key('ready');assert.deepEqual(await call(3,{custom_id:bothReady}),{type:6});assert.equal(ctx.map.get('table').readyDue,null);
 assert.deepEqual(await call(3,{custom_id:bothReady},'4'),{type:6});assert.equal(ctx.map.get('table').readyDue,now+5000);
 now+=4900;await call(3,{custom_id:key('ready')});now+=200;await table.alarm();assert.equal(ctx.map.get('table').phase,'lobby');
 await call(3,{custom_id:key('ready')});now=ctx.map.get('table').readyDue;await table.alarm();assert.equal(ctx.map.get('table').handNo,1);assert.equal(ctx.map.get('table').phase,'preflop');assert(ctx.map.get('table').players.every(p=>!p.ready));
 await call(3,{custom_id:key('fold')},ctx.map.get('table').turn);assert.equal(ctx.map.get('table').phase,'settled');assert.equal(ctx.map.get('table').readyDue,null);
 now+=10000;await table.alarm();assert.equal(ctx.map.get('table').handNo,1);
 const body=pokerBoard(ctx.map.get('table'));assert(!body.components.flatMap(r=>r.components).some(b=>b.label==='手动发牌'));
});
test('management controls validate private owner and actor; queued departure preserves current pot; confirmation cannot edit public table',async(t)=>{
 const original=fetch;globalThis.fetch=async()=>Response.json({id:'999'});t.after(()=>{globalThis.fetch=original;});
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'fake'});let serial=0;
 const call=async(type,data,id='1',message={id:'999'})=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),type,data,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message}})}))).json();
 const key=a=>`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`;
 await call(2,{name:'德州',options:[{name:'创建'}]});await call(3,{custom_id:key('join')},'4');
 const manage=await call(3,{custom_id:key('manage')});assert.equal(manage.data.flags,64);
 const start=manage.data.components.flatMap(r=>r.components).find(b=>b.label==='手动发牌').custom_id;
 const spoof=await call(3,{custom_id:start},'4',{id:'888',flags:64});assert.equal(spoof.data.flags,64);assert.equal(ctx.map.get('table').handNo,0);
 const publicSpoof=await call(3,{custom_id:start});assert.equal(publicSpoof.data.flags,64);assert.equal(ctx.map.get('table').handNo,0);
 const started=await call(3,{custom_id:start},'1',{id:'888',flags:64});assert.equal(started.type,7);assert.equal(ctx.map.get('table').handNo,1);
 const before=structuredClone(ctx.map.get('table'));await call(3,{custom_id:key('m~4~leave')},'4',{id:'889',flags:64});const after=ctx.map.get('table');
 assert.equal(after.pot,before.pot);assert.equal(after.players[1].total,before.players[1].total);assert.equal(after.players[1].leaveAfterHand,true);
 const prompt=await call(3,{custom_id:key('allin')});const yes=prompt.data.components[0].components[0].custom_id;
 const invalid=await call(3,{custom_id:yes});assert.equal(invalid.data.flags,64);assert.equal(ctx.map.get('table').players[0].stack,before.players[0].stack);
});
test('private interactions acknowledge only; latest hand refresh travels encrypted then updates through the serialized alarm',async(t)=>{
 const original=fetch,requests=[];globalThis.fetch=async(url,opts)=>{const multipart=opts.body instanceof FormData;const body=JSON.parse(multipart?opts.body.get('payload_json'):opts.body||'{}');requests.push({url,body});return Response.json({id:url.split('/').at(-1),attachments:body.attachments?.map(a=>({...a,id:a.id===0?'555':a.id}))||[]});};t.after(()=>{globalThis.fetch=original;});
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'fake',DISCORD_APPLICATION_ID:'123'});let serial=0;
 const call=async(type,data,id='1',message={id:'999'})=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),token:'private-credential-'+serial,type,data,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message}})}))).json();
 const key=a=>`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`;
 await call(2,{name:'德州',options:[{name:'创建'}]});await call(3,{custom_id:key('join')},'4');await call(3,{custom_id:key('start')});
 await call(3,{custom_id:key('hand')});await ctx.storage.put('privateSyncAt',Date.now()-1);await table.alarm();requests.length=0;
 const old=key('p~1~call');const act=await call(3,{custom_id:old},'1',{id:'888',flags:64});assert.deepEqual(act,{type:6});
 const stale=await call(3,{custom_id:old},'1',{id:'888',flags:64});assert.deepEqual(stale,{type:6});assert.equal(requests.length,0);
 assert(!JSON.stringify([...ctx.map]).includes('private-credential-'));await ctx.storage.put('privateSyncAt',Date.now()-1);await table.alarm();
 const panel=requests.find(r=>r.url.includes('/webhooks/')&&r.body.components?.flatMap(row=>row.components).some(b=>b.custom_id?.includes(':p~1~')));assert(panel);assert(panel.body.content.includes('未执行'));assert(panel.body.embeds[0].fields[0].value.startsWith('1980 / 20'));
 assert(panel.body.components.flatMap(r=>r.components).every(b=>!b.custom_id||b.custom_id.includes(`:${ctx.map.get('table').version}:`)));
 const refresh=await call(3,{custom_id:key('p~1~hand')},'1',{id:'888',flags:64});assert.deepEqual(refresh,{type:6});
});


test('signed red packet clicks route to guild wallet and acknowledge privately, bypassing active game tables',async t=>{
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);const ctx=context(),rpc=[],patches=[];
 const env={DISCORD_APPLICATION_ID:'99',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex'),TABLES:{idFromName:n=>n,get:n=>({fetch:async(url,opts)=>{rpc.push({name:n,...JSON.parse(opts.body)});return Response.json({amount:123,repeated:false});}})}};
 t.mock.method(globalThis,'fetch',async(url,opts)=>{patches.push({url,body:JSON.parse(opts.body)});return Response.json({});});
 const i={type:3,application_id:'99',id:'100',token:'test',guild_id:'1',channel_id:'2',member:{user:{id:'10'}},message:{id:'456'},data:{custom_id:'rp:123'}};
 const body=JSON.stringify(i),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex');
 const r=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':sig,'X-Signature-Timestamp':ts}}),env,ctx);
 assert.deepEqual(await r.json(),{type:5,data:{flags:64}});await Promise.all(ctx.tasks);assert.equal(rpc[0].name,'tavern:1');assert.equal(rpc[0].action,'claim');assert.match(patches[0].body.content,/123 酒馆币/);assert.deepEqual(patches[0].body.allowed_mentions,{parse:[]});
});
