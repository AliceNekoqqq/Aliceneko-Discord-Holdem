import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {lobbyGameRequest} from './tavern-lobby-routing.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length)return {toArray:()=>s.all(...args),one:()=>s.all(...args)[0]};s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}
const component=(action,overrides={})=>({type:3,id:'777',application_id:'123',guild_id:'3',channel_id:'701',member:{user:{id:'42',username:'Alice'},permissions:'0'},token:'interaction-token',message:{id:'lobby-message',flags:0},data:{custom_id:`t:3:any:${action}`},...overrides});

test('route only lobbyPlay buttons and preserve Discord actor while replacing command data',()=>{
 assert.equal(lobbyGameRequest({type:3,data:{custom_id:'unrelated'}}),null);
 const cases={poker:['德州','创建'],uno:['uno','创建'],ghost:['抽鬼牌','等待对手'],liar:['骗子酒馆','创建'],table:['德州','牌桌']};
 for(const [key,[name,sub]]of Object.entries(cases)){
  const input=component(`lobbyPlay~${key}`),resolved=lobbyGameRequest(input);assert(resolved?.interaction);
  assert.equal(resolved.interaction.type,2);assert.deepEqual(resolved.interaction.data,{name,options:[{name:sub}]});
  for(const field of ['id','token','member','guild_id','channel_id','application_id'])assert.equal(resolved.interaction[field],input[field]);
  assert.equal(input.type,3);assert.equal(input.data.custom_id,`t:3:any:lobbyPlay~${key}`);
 }
});

test('bad lobby buttons return clear validation errors without resolving an interaction',()=>{
 const bad=[
  [component('lobbyPlay~unknown'),/游戏入口无效/],
  [component('lobbyPlay~toString'),/游戏入口无效/],
  [component('lobbyPlay~poker',{data:{custom_id:'t:4:any:lobbyPlay~poker'}}),/不属于当前服务器/],
  [component('lobbyPlay~poker',{data:{custom_id:'t:3:99:lobbyPlay~poker'}}),/另一位玩家/],
  [component('lobbyPlay',{data:{custom_id:'t:3:any:lobbyPlay'}}),/格式无效/],
  [component('lobbyPlay~poker',{member:{user:{id:'42',username:'bot',bot:true},permissions:'0'}}),/机器人不能/],
  [component('lobbyPlay~poker',{guild_id:'nope'}),/服务器文字频道/]
 ];
 for(const [input,expect]of bad)assert.match(lobbyGameRequest(input).error,expect);
});

test('real signed Worker lobby clicks create each game through its controller and reject duplicates; table lookup follows the active game',async t=>{
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}} ").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),env={BOT_TOKEN:'local-test-token',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')},instances=new Map(),lookups=[];
 env.TABLES={idFromName:n=>n,get:n=>{lookups.push(n);if(!instances.has(n)){const ctx={storage:storage(),blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}};instances.set(n,new PokerTable(ctx,env));}return {fetch:(url,options)=>instances.get(n).fetch(new Request(url,options))};}};
 const previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'9001'});t.after(()=>globalThis.fetch=previous);
 let sequence=1000;
 const call=async(i)=>{const payload={...i,id:String(++sequence)},body=JSON.stringify(payload),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),tasks=[];
  const response=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return response.json();};
 const cases=[['poker','701','poker'],['uno','702','uno'],['ghost','703','ghost'],['liar','704','liar']];
 for(const [game,channel,expected]of cases){
  const response=await call(component(`lobbyPlay~${game}`,{channel_id:channel}));assert.equal(response.type,4,game);assert.equal(response.data.flags,undefined);
  const name=`table:3:${channel}`,stored=await instances.get(name).ctx.storage.get('table');assert.equal(stored.game,expected==='poker'?undefined:expected);assert.equal(stored.owner,'42');assert.equal(stored.phase,'lobby');
  const identity={epoch:stored.epoch,owner:stored.owner,phase:stored.phase,players:stored.players.length},count=instances.size,repeat=await call(component(`lobbyPlay~${game}`,{channel_id:channel}));assert.equal(repeat.type,4);assert.equal(repeat.data.flags,64);assert.match(repeat.data.content,/已有|结束|等待/);assert.equal(instances.size,count);const afterRepeat=await instances.get(name).ctx.storage.get('table');assert.deepEqual({epoch:afterRepeat.epoch,owner:afterRepeat.owner,phase:afterRepeat.phase,players:afterRepeat.players.length},identity);
  const tableReply=await call(component('lobbyPlay~table',{channel_id:channel}));assert.equal(tableReply.type,4);assert.equal(tableReply.data.flags,64);assert.match(tableReply.data.content,/牌桌/);assert.equal(instances.size,count);
 }
 assert.equal(instances.size,4);assert.equal(lookups.some(n=>n.startsWith('tavern:')),false);
});

test('signed forged guild, owner, unknown game and malformed buttons are private and do not access a namespace',async t=>{
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}} ").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),env={BOT_TOKEN:'local-test-token',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')},lookups=[];
 env.TABLES={idFromName:n=>n,get:n=>{lookups.push(n);throw Error(`unexpected namespace ${n}`)}};
 let sequence=2000;const call=async(i)=>{const payload={...i,id:String(++sequence)},body=JSON.stringify(payload),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex');const response=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:()=>{}});return response.json();};
 const bad=[
  component('lobbyPlay~poker',{data:{custom_id:'t:4:any:lobbyPlay~poker'}}),
  component('lobbyPlay~poker',{data:{custom_id:'t:3:99:lobbyPlay~poker'}}),
  component('lobbyPlay~other'),
  component('lobbyPlay',{data:{custom_id:'t:3:any:lobbyPlay'}})
 ];
 for(const input of bad){const response=await call(input);assert.equal(response.type,4);assert.equal(response.data.flags,64);assert(response.data.content.length>0);}
 assert.deepEqual(lookups,[]);
});
