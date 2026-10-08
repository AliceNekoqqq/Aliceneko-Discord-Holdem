import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}
async function setup(t){
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),instances=new Map(),env={BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
 env.TABLES={idFromName:n=>n,get:n=>{if(!instances.has(n))instances.set(n,new PokerTable({storage:storage(),blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}},env));return {fetch:(u,o)=>instances.get(n).fetch(new Request(u,o))};}};
 const sent=[],oldFetch=globalThis.fetch;globalThis.fetch=async(u,o)=>{sent.push({url:u,body:o.body&&JSON.parse(o.body)});return Response.json({id:'444'});};t.after(()=>globalThis.fetch=oldFetch);
 let seq=1000;
 async function call(input){
  const i={application_id:'123',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},token:'test-token',id:String(++seq),...input},body=JSON.stringify(i),ts=String(Math.floor(Date.now()/1000));
  const sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),tasks=[];
  const r=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});
  await Promise.all(tasks);return r.json();
 }
 const component=(custom_id,flags=0,extra={})=>({type:3,message:{flags},data:{custom_id},...extra});
 const lastReply=()=>sent.filter(r=>r.url.includes('/webhooks/')).at(-1)?.body;
 return {call,component,sent,lastReply,instances,env};
}

test('signed public room entry creates no wallet; opening renovation privately awards welcome exactly once',async t=>{
 const s=await setup(t);
 assert.deepEqual(await s.call({type:2,data:{name:'酒馆',options:[{name:'店内'}]}}),{type:5});
 const service=s.instances.get('tavern:3').tavern;assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 assert(!s.lastReply().content.includes('余额'));
 const enter=s.lastReply().components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':renoEnter')).custom_id;
 assert.deepEqual(await s.call(s.component(enter)),{type:5,data:{flags:64}});
 assert.match(s.lastReply().content,/60币/);assert.equal(service.view('1').member.balance,60);
 await s.call(s.component(enter));assert.equal(service.rows("SELECT * FROM tavern_ledger WHERE kind='welcome'").length,1);
 assert.deepEqual(await s.call(s.component('t:3:any:renoLeaders')),{type:6});assert(!/私密余额|当前余额|余额[：:]/.test(s.lastReply().content));
 assert([...s.instances.keys()].every(n=>n==='tavern:3'));
});

test('signed title modal and private confirmation purchase once; public or other-user confirmation is rejected',async t=>{
 const s=await setup(t);
 const modal=await s.call(s.component('t:3:1:renoTitle~coat_rack',64));assert.equal(modal.type,9);
 const submitted=await s.call({type:5,data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'title',value:'旧街挂衣处'}]}]}});
 assert.deepEqual(submitted,{type:5,data:{flags:64}});
 const confirm=s.lastReply().components.flatMap(r=>r.components).find(c=>c.custom_id.includes(':renoConfirm~')).custom_id;
 const service=s.instances.get('tavern:3').tavern;assert.equal(service.view('1').member.balance,60);
 const other=await s.call(s.component(confirm,64,{member:{user:{id:'2',username:'Bob'}}}));assert.equal(other.type,4);assert.equal(other.data.flags,64);
 const publicClick=await s.call(s.component(confirm));assert.equal(publicClick.type,4);
 assert.deepEqual(await s.call(s.component(confirm,64)),{type:6});await s.call(s.component(confirm,64));
 assert.equal(service.view('1').member.balance,0);assert.equal(service.rows('SELECT * FROM tavern_reno_direct').length,1);
 const announcements=s.sent.filter(r=>r.url.endsWith('/channels/2/messages'));assert.equal(announcements.length,1);
 assert(announcements[0].body.enforce_nonce);assert.match(announcements[0].body.content,/旧街挂衣处/);assert(!announcements[0].body.content.includes('余额'));
 assert.deepEqual(announcements[0].body.allowed_mentions,{parse:[]});
 const wrongChannel=await s.call({type:5,channel_id:'9',data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'title',value:'错误频道'}]}]}});
 assert.equal(wrongChannel.type,5);assert.match(s.lastReply().content,/原频道/);assert.equal(service.rows('SELECT * FROM tavern_reno_direct').length,1);
});

test('signed unified lobby opens private services and returns through buttons without exposing a wallet',async t=>{
 const s=await setup(t);
 assert.deepEqual(await s.call({type:2,data:{name:'酒馆',options:[{name:'大厅'}]}}),{type:5});
 const service=s.instances.get('tavern:3').tavern;assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 const hub=s.lastReply();assert.match(hub.content,/小酒馆.*大厅/);assert(!hub.content.includes('余额'));
 const buttons=hub.components.flatMap(r=>r.components);
 for(const action of ['lobbyMenu','lobbyWallet','lobbyCard']){
  const custom_id=buttons.find(b=>b.custom_id.endsWith(':'+action)).custom_id;
  assert.deepEqual(await s.call(s.component(custom_id)),{type:5,data:{flags:64}});
  assert(service.view('1').member.balance===60);
  const back=s.lastReply().components.flatMap(r=>r.components).find(b=>b.custom_id.endsWith(':lobby')).custom_id;
  assert.deepEqual(await s.call(s.component(back,64)),{type:6});assert(!s.lastReply().content.includes('余额'));
 }
 const games=buttons.find(b=>b.custom_id.endsWith(':lobbyGames')).custom_id;
 assert.deepEqual(await s.call(s.component(games)),{type:6});
 const play=s.lastReply().components.flatMap(r=>r.components).filter(b=>b.custom_id.includes(':lobbyPlay~'));assert.equal(play.length,5);
 assert.match(s.lastReply().components.flatMap(r=>r.components).find(b=>b.custom_id.endsWith('~ghost')).label,/抽鬼牌/);
 assert.equal(service.rows("SELECT * FROM tavern_ledger WHERE kind='welcome'").length,1);
});
