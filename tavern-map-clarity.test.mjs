import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {db,map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(error){db.exec('ROLLBACK');throw error;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}
async function loadWorker(){
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}} ").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function component(action,{guild='3',owner='any',user='1',flags=0,customGuild=guild,message='public-lobby'}={}){return {type:3,application_id:'123',guild_id:guild,channel_id:'2',member:{user:{id:user,username:'Alice'},nick:'Alice',permissions:'0'},token:'fixture-token',message:{id:message,flags},data:{custom_id:`t:${customGuild}:${owner}:${action}`}};}
async function harness(t){
 const {default:worker,PokerTable}=await loadWorker(),store=storage();t.after(()=>store.db.close());
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),env={BOT_TOKEN:'fixture',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
 const guild=new PokerTable({storage:store,blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}},env);env.TABLES={idFromName:n=>n,get:()=>({fetch:(url,options)=>guild.fetch(new Request(url,options))})};
 const sent=[],original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async(url,options={})=>{const form=options.body instanceof FormData,raw=form?options.body.get('payload_json'):options.body,payload=raw?JSON.parse(typeof raw==='string'?raw:await raw.text()):null,file=form?options.body.get('files[0]'):null;sent.push({url:String(url),form,payload,file,fileBytes:file?new Uint8Array(await file.arrayBuffer()):null});return Response.json({id:'4',flags:payload?.content?.includes('大厅')?0:64});};
 let seq=100;const call=async(input)=>{const interaction={id:String(++seq),application_id:'123',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'},nick:'Alice',permissions:'0'},token:'fixture-token',...input};const body=JSON.stringify(interaction),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),tasks=[];const response=await worker.fetch(new Request('https://fixture/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});const ack=await response.json();await Promise.all(tasks);return ack;};
 return {guild,store,sent,call};
}
const locationOf=guild=>guild.tavern.map.board().visitors.find(v=>v.id==='1')?.location;

test('signed clear-map entry is private PNG, preserves wallet/location, and refreshes the same private response',async t=>{
 const {guild,store,sent,call}=await harness(t);
 const lobby=await call({type:2,data:{name:'酒馆',options:[{name:'大厅'}]}});assert.equal(lobby.type,5);
 await guild.tavern.dispatch({guild:'3',id:'1',channel:'2',name:'Alice',action:'mapMove',area:'window'});
 const before=locationOf(guild);assert.equal(before.area,'window');const rowsBefore=guild.tavern.rows('SELECT * FROM tavern_members').length;
 const opened=await call(component('lobbyMapHD'));assert.equal(opened.type,5);assert.equal(opened.data.flags,64);
 const first=sent.findLast(x=>x.url.includes('/webhooks/123/'));assert(first?.form);assert.equal(first.file.type,'image/png');assert.deepEqual([...first.fileBytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
 assert.match(first.payload.content,/最近30分钟 \*\*\d+ 位来客\*\* · \*\*\d+ 张牌桌\*\*/);
 assert.equal(guild.tavern.rows('SELECT * FROM tavern_members').length,rowsBefore);assert.deepEqual(locationOf(guild),before);
 const live=store.map.get('tavernLobbyLive');assert.equal(live.boards.length,1);assert.equal(live.boards[0].message,'4');
 const refreshComponent=first.payload.components.flatMap(r=>r.components).find(c=>c.custom_id==='t:3:1:lobbyMapHD');assert(refreshComponent,JSON.stringify(first.payload.components));
 const refreshed=await call(component('lobbyMapHD',{owner:'1',flags:64,message:'private-map'}));assert.equal(refreshed.type,6);
 const second=sent.findLast(x=>x.url.includes('/webhooks/123/'));assert.equal(second.url,first.url);assert.equal(second.file.type,'image/png');assert.equal(live.boards.length,1);
 assert.equal(guild.tavern.rows('SELECT * FROM tavern_members').length,rowsBefore);assert.deepEqual(locationOf(guild),before);
 assert(!sent.some(x=>x.url.endsWith('/channels/2/messages/4')));
});

test('clear-map signed interaction rejects a forged guild or another owner',async t=>{
 const {call}=await harness(t);
 for(const forged of [component('lobbyMapHD',{customGuild:'9'}),component('lobbyMapHD',{owner:'99'})]){const ack=await call(forged);assert.equal(ack.type,4);assert.equal(ack.data.flags,64);}
});
