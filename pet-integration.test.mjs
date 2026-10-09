import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('./worker.mjs',import.meta.url),'utf8');
const source=raw.replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function context(){
 const db=new DatabaseSync(':memory:'),map=new Map(),tasks=[];let queue=Promise.resolve();
 const storage={sql:{exec(q,...args){const st=db.prepare(q);if(st.columns().length){const rows=st.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}st.run(...args);return {toArray:()=>[]};}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async n=>map.set('alarm',n),deleteAlarm:async()=>map.delete('alarm'),transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,map,storage,tasks,blockConcurrencyWhile(fn){const p=queue.then(fn);queue=p.catch(()=>{});return p;},waitUntil:p=>tasks.push(p)};
}
async function setup(t){
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const env={DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex'),BOT_TOKEN:'fake-test-token'},instances=new Map(),posts=[];
 env.TABLES={idFromName:n=>n,get:n=>{if(!instances.has(n)){const ctx=context();instances.set(n,{ctx,object:new PokerTable(ctx,env)});}return {fetch:(url,options)=>instances.get(n).object.fetch(new Request(url,options))};}};
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{posts.push({url:String(url),method:options?.method,data:options?.body?JSON.parse(options.body):null});return Response.json({id:'99'});};t.after(()=>globalThis.fetch=original);
 let serial=0;
 const call=async(extra={},repeatId)=>{
  const i={type:3,application_id:'123',guild_id:'3',channel_id:'2',id:repeatId||String(++serial),token:'transient-test-token',member:{user:{id:'1',username:'Alice'}},message:{id:'55',flags:64},...extra};
  const body=JSON.stringify(i),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),ctx=context(),before=posts.length;
  const response=await worker.fetch(new Request('https://example/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':sig,'X-Signature-Timestamp':ts}}),env,ctx);await Promise.all(ctx.tasks);
  return {reply:await response.json(),patched:posts.slice(before).filter(p=>p.method==='PATCH').at(-1)?.data,i};
 };
 const action=(a,guild='3')=>({guild_id:guild,data:{custom_id:`p:${guild}:1:${a}`}});
 const adopt=async(guild='3',species='lamp-cat')=>call({...action(`save~${species}`,guild),type:5,data:{custom_id:`p:${guild}:1:save~${species}`,components:[{components:[{custom_id:'petName',value:'灯灯'}]}]}});
 return {env,instances,posts,call,action,adopt};
}
test('signed public entry, private naming, single pet across servers, and no public wallet leak',async t=>{
 const s=await setup(t);
 const opened=await s.call({message:{id:'10',flags:0},data:{custom_id:'t:3:any:lobbyPet'}});
 assert.deepEqual(opened.reply,{type:5,data:{flags:64}});assert(opened.patched.content.includes('领养'));assert(!opened.patched.content.includes('余额'));
 const privateState=s.instances.get('tavern:3').object.tavern;assert.equal(privateState.rows('SELECT * FROM tavern_members').length,0);
 const modal=await s.call(s.action('name~lamp-cat'));assert.equal(modal.reply.type,9);
 const first=await s.adopt();assert.equal(first.reply.data.flags,64);assert(first.patched.content.includes('灯灯'));assert.equal(privateState.pets.profile('1').species,'lamp-cat');
 const again=await s.adopt();assert(again.patched.content.includes('只能领养一只'));assert.equal(privateState.rows("SELECT * FROM tavern_ledger WHERE kind='welcome'").length,1);
 const other=await s.adopt('4','moss-dog');assert(other.patched.content.includes('另一家酒馆')||other.patched.content.includes('服务器'));assert(!s.instances.has('tavern:4'));
 const foreign=await s.call({data:{custom_id:'p:3:2:start'}});assert.equal(foreign.reply.type,4);assert.equal(foreign.reply.data.flags,64);
 const publicAction=await s.call({...s.action('start'),message:{id:'10',flags:0}});assert.equal(publicAction.reply.type,4);assert(publicAction.reply.data.content.includes('私密'));
 for(const p of s.posts){assert(p.url.includes('/webhooks/'));assert.equal(p.method,'PATCH');assert.deepEqual(p.data.allowed_mentions,{parse:[]});assert(!JSON.stringify(p.data).includes('fake-test-token'));}
});
test('signed walks use saved versions, finish once, and the UI resumes after a lost update or instance restart',async t=>{
 const s=await setup(t);await s.adopt();const started=await s.call({...s.action('startMaterial'),data:{custom_id:'p:3:1:startMaterial',values:['metal']}});assert.equal(started.reply.type,6);
 const instance=s.instances.get('tavern:3');let view=instance.object.tavern.pets.view('1');assert(view.walk);
 const initial=view.walk,selected=view.walkView.choices.find(c=>!c.disabled),oldAction=`act~${initial.id}~${initial.version}~${selected.id}`;
 const first=await s.call(s.action(oldAction));assert.equal(first.reply.type,6);
 const stale=await s.call(s.action(oldAction));assert(stale.patched.content.includes('路线已经变化'));
 const plan=['alley-paper','bakery-friend','drain-smell','fork-neighbor','porch-friend'];
 while((view=instance.object.tavern.pets.view('1')).walk){const choice=view.walkView.choices.find(c=>c.id===plan[view.walk.step]&&!c.disabled)||view.walkView.choices.find(c=>!c.disabled);await s.call(s.action(`act~${view.walk.id}~${view.walk.version}~${choice.id}`));}
 assert.equal(instance.object.tavern.rows("SELECT * FROM tavern_ledger WHERE kind='pet'").length,1);
 s.instances.set('tavern:3',{ctx:instance.ctx,object:new PokerTable(instance.ctx,s.env)});
 const resumed=await s.call(s.action('view'));assert(resumed.patched.content.includes('结算'));assert(s.instances.get('tavern:3').object.tavern.pets.view('1').receipt);
 assert(!JSON.stringify([...instance.ctx.map]).includes('transient-test-token'));
});
