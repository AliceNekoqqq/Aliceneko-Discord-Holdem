import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace("'./engine.mjs'",JSON.stringify(new URL('./engine.mjs',import.meta.url).href));
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
