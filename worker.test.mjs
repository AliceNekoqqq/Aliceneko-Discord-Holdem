import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace("'./engine.mjs'",JSON.stringify(new URL('./engine.mjs',import.meta.url).href)).replace("'./computer.mjs'",JSON.stringify(new URL('./computer.mjs',import.meta.url).href)).replace("'./ui.mjs'",JSON.stringify(new URL('./ui.mjs',import.meta.url).href));
const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function context(){const map=new Map();const storage={sql:{exec:()=>({one:()=>({ok:1})})},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};storage.transaction=async fn=>fn(storage);const tasks=[];return {storage,map,tasks,blockConcurrencyWhile:fn=>fn(),waitUntil:p=>tasks.push(p)};}
test('signed Discord flow, private cards, stale click, duplicate, modal, timeout and safe routes',async()=>{
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);const env={BOT_TOKEN:'test-secret-not-real',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
 const instances=new Map();env.TABLES={idFromName:n=>n,get:n=>{if(!instances.has(n)){const ctx=context();instances.set(n,{ctx,do:new PokerTable(ctx,env)});}return {fetch:(url,init)=>instances.get(n).do.fetch(new Request(url,init))};}};
 const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>new Response(JSON.stringify({id:'999'}),{status:200,headers:{'Content-Type':'application/json'}});
 try{
 let counter=0;
 const call=async(data)=>{const i={application_id:'123',guild_id:'3',channel_id:'2',id:String(++counter),token:'transient-secret',member:{user:{id:'1'},permissions:'0'},...data};const body=JSON.stringify(i),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex');const ctx=context();const r=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':sig,'X-Signature-Timestamp':ts}}),env,ctx);await Promise.all(ctx.tasks);return {reply:await r.json(),i};};
 const unsigned=await worker.fetch(new Request('https://test/interactions',{method:'POST',body:'{}'}),env,context());assert.equal(unsigned.status,401);
 const hidden=await worker.fetch(new Request('https://test/.env'),env,context());assert.equal(hidden.status,404);
 const health=await worker.fetch(new Request('https://test/health'),env,context());assert.deepEqual(await health.json(),{ok:true});
 assert.deepEqual((await call({type:1})).reply,{type:1});
 const create={type:2,data:{name:'德州',options:[{name:'创建'}]}};
 let {reply:b}=await call(create);assert.equal(b.type,4);assert(!JSON.stringify(b).includes(env.BOT_TOKEN));
 const instance=instances.get('table:3:2');assert.equal(instance.ctx.map.get('table').messageId,'999');
 const pick=(b,a)=>b.data.components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':'+a)).custom_id;
 const click=async(action,id='1',custom)=>call({type:3,member:{user:{id},permissions:'0'},message:{id:'999'},data:{custom_id:custom||pick(b,action)}});
 const oldJoin=pick(b,'join');({reply:b}=await click('join','4'));assert.equal(b.type,7);
 const stale=await click('join','5',oldJoin);assert.equal(stale.reply.type,7);assert.equal(instance.ctx.map.get('table').players.length,2);
 const forbidden=await click('start','4');assert.equal(forbidden.reply.data.flags,64);
 ({reply:b}=await click('start'));assert.equal(b.type,7);
 const hand=await click('hand');assert.equal(hand.reply.data.flags,64);assert(hand.reply.data.content.includes('你的底牌'));
 const outsider=await click('hand','8');assert.equal(outsider.reply.data.flags,64);assert(!outsider.reply.data.content.includes('底牌'));
 const {reply:modal}=await click('raise');assert.equal(modal.type,9);
 const submit=await call({type:5,member:{user:{id:'1'},permissions:'0'},message:{id:'999'},data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'amount',value:'40'}]}]}});b=submit.reply;assert.equal(b.type,7);
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
  reply=await click('start');assert.equal(reply.type,7);
  let state=ctx.map.get('table');assert.equal(state.turn,'1');reply=await click('call');state=ctx.map.get('table');assert(state.computerDue);assert.equal(ctx.map.get('alarm'),state.computerDue);
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
   } else {reply=await click('call');assert.equal(reply.type,7);}
  }
  state=ctx.map.get('table');assert.equal(state.phase,'settled');assert.equal(state.players.reduce((s,p)=>s+p.stack,0),6000);assert(!ctx.map.has('alarm'));assert(updates.length>0);
  // Recreate a minimal one-computer lobby to test human timeout -> computer alarm.
  reply=await click('close');assert.equal(reply.type,4);const newer=ctx.map.get('table');newer.version++;await ctx.storage.put('table',newer);reply=await interaction({type:3,message:{id:'888'},data:{custom_id:reply.data.components[0].components[0].custom_id}});assert.equal(reply.type,7);
  reply=await interaction({type:2,data:{name:'德州',options:[{name:'测试',options:[{name:'电脑数量',value:1}]}]}});
  assert.equal(ctx.map.get('table').players.length,2);
  state=ctx.map.get('table');state.players[1].stack=0;await ctx.storage.put('table',state);
  reply=await click('start');assert.equal(reply.type,7);assert.equal(ctx.map.get('table').players[1].stack,1980);
  state=ctx.map.get('table');assert.equal(state.turn,'1');state.deadline=Date.now()-1;await ctx.storage.put('table',state);await table.alarm();assert.equal(ctx.map.get('table').phase,'settled');
  await click('start');reply=await click('close');await interaction({type:3,message:{id:'888'},data:{custom_id:reply.data.components[0].components[0].custom_id}});assert.equal(ctx.map.get('table').phase,'closed');assert(!ctx.map.has('alarm'));
  assert(!JSON.stringify([...ctx.map]).includes(env.BOT_TOKEN));
 } finally {globalThis.fetch=oldFetch;}
});

test('all-in confirmation is private, actor-bound, version-checked and single-use',async(t)=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({});t.after(()=>{globalThis.fetch=originalFetch;});
 const ctx=context(),table=new PokerTable(ctx,{BOT_TOKEN:'test'});
 let serial=0;
 const call=async(type,data,id='1',message='999')=>(await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{id:String(++serial),type,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message:{id:message},data}})}))).json();
 const action=(a,id='1')=>call(3,{custom_id:`h:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${a}`},id);
 await call(2,{name:'德州',options:[{name:'创建'}]});await action('join','4');await action('start');
 const before=structuredClone(ctx.map.get('table'));
 const prompt=await action('allin');assert.equal(prompt.type,4);assert.equal(prompt.data.flags,64);assert.deepEqual(ctx.map.get('table'),before);
 const key=prompt.data.components[0].components[0].custom_id;
 const denied=await call(3,{custom_id:key},'4','888');assert.equal(denied.data.flags,64);assert.deepEqual(ctx.map.get('table'),before);
 await action('call');const stale=await call(3,{custom_id:key},'1','888');assert(stale.data.content.includes('未执行'));assert.equal(ctx.map.get('table').players[0].stack,1980);
 // Opponent is now acting; cancel preserves the current table.
 const next=await action('allin','4');const cancel=next.data.components[0].components[1].custom_id;
 const state=structuredClone(ctx.map.get('table'));await call(3,{custom_id:cancel},'4','888');assert.deepEqual(ctx.map.get('table'),state);
 const yes=next.data.components[0].components[0].custom_id;
 const savedFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({});
 try {
  const accepted=await call(3,{custom_id:yes},'4','888');assert(accepted.data.content.includes('已全下'));
  assert.equal(ctx.map.get('table').players[1].stack,0);
  const after=structuredClone(ctx.map.get('table'));await call(3,{custom_id:yes},'4','888');assert.deepEqual(ctx.map.get('table'),after);
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
 const refreshed=await privateClick('hand');assert.equal(refreshed.type,7);assert.equal(refreshed.data.embeds[0].title,handTitle);
 const staleKey=key('p~1~call');
 const modal=await privateClick('raise');assert.equal(modal.type,9);assert(modal.data.custom_id.endsWith('p~1~submit'));
 const raised=await call(5,{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'amount',value:'40'}]}]},'1',{id:'888',flags:64});
 assert.equal(raised.type,7);assert.equal(raised.data.embeds[0].title,handTitle);assert.equal(ctx.map.get('table').currentBet,40);assert.equal(ctx.map.get('table').messageId,'999');
 const before=structuredClone(ctx.map.get('table'));
 const stale=await call(3,{custom_id:staleKey},'1',{id:'888',flags:64});assert(stale.data.content.includes('未执行'));assert.deepEqual(ctx.map.get('table'),before);
 await call(3,{custom_id:key('call')},'4');await call(3,{custom_id:key('check')},'4');
 const prompt=await privateClick('allin');assert.equal(prompt.type,7);assert(prompt.data.content.includes('确认投入'));assert.equal(prompt.data.embeds[0].title,handTitle);
 const cancel=await privateClick('cancel');assert.equal(cancel.data.embeds[0].title,handTitle);assert.equal(ctx.map.get('table').players[0].stack,1960);
 const allin=await privateClick('yesallin');assert.equal(allin.type,7);assert.equal(ctx.map.get('table').players[0].stack,0);
 await Promise.all(ctx.tasks);assert(patches.length>0);assert(patches.every(p=>p.embeds[0].title==='♠ Aliceneko · 德州扑克'));
 // A modal without an attached private message must create an ephemeral reply.
 const missingMessage=await call(5,{custom_id:staleKey.replace('call','submit'),components:[]},'1',undefined);
 assert.equal(missingMessage.type,4);assert.equal(missingMessage.data.flags,64);
});
