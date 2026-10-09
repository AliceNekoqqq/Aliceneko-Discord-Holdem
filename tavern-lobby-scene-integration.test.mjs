import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {TavernService} from './tavern-service.mjs';
import {tavernRuntimeData} from './ai-chat.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {db,map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}
async function loadWorker(){
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('signed public lobby uploads GIF and real map events schedule same message refresh without wallets',async t=>{
 const {default:worker,PokerTable}=await loadWorker(),store=storage();t.after(()=>store.db.close());
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),env={BOT_TOKEN:'fixture',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
 const guild=new PokerTable({storage:store,blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}},env);
 env.TABLES={idFromName:n=>n,get:()=>({fetch:(url,options)=>guild.fetch(new Request(url,options))})};
 const sent=[],original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async(url,options)=>{const form=options.body instanceof FormData;sent.push({url,form,payload:form?JSON.parse(options.body.get('payload_json')):JSON.parse(options.body),file:form?options.body.get('files[0]'):null});return Response.json({id:'4',flags:0});};
 const interaction={id:'101',application_id:'123',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},token:'fixture-token',type:2,data:{name:'酒馆',options:[{name:'大厅'}]}};
 const body=JSON.stringify(interaction),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),tasks=[];
 const response=await worker.fetch(new Request('https://fixture/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});
 assert.equal((await response.json()).type,5);await Promise.all(tasks);
 const first=sent.find(x=>x.form);assert(first);assert.equal(first.file.type,'image/gif');assert.equal(new TextDecoder().decode(new Uint8Array(await first.file.arrayBuffer()).slice(0,6)),'GIF89a');assert.equal(first.payload.embeds[0].image.url,'attachment://tavern-scene.gif');assert(!JSON.stringify(first.payload).includes('_mapScene'));assert.equal(guild.tavern.context('1','2'),null);
 assert.equal(store.map.get('tavernLobbyLive').boards[0].message,'4');
 const now=Date.now(),touch=await guild.dispatch({op:'tavern',guild:'3',id:'2',name:'Bob',channel:'2',action:'mapTouch'});assert.equal(await touch.json(),true);
 const due=store.map.get('tavernLobbyLive').due;assert(due>=now+1900&&due<=Date.now()+2100);
 await guild.tavernLive.flush(due);const refresh=sent.find(x=>x.url.includes('/channels/2/messages/4'));assert(refresh?.form);assert(refresh.payload.content.includes('2'));assert.equal(guild.tavern.context('2','2'),null);assert.equal(store.map.get('tavernLobbyLive').due,null);
 const table={guild:'3',channel:'5',epoch:'fixture-table',at:Date.now(),expires:Date.now()+1800000,game:'uno',phase:'playing',closed:false,players:[{id:'2',name:'Bob',bot:false}]};
 const accepted=await guild.dispatch({op:'tavern',guild:'3',action:'mapTable',table});assert.equal(await accepted.json(),true);assert(store.map.get('tavernLobbyLive').due);
});
test('actual mention context records a recent visitor while passive personal history remains read-only',async t=>{
 const store=storage(),s=new TavernService(store);t.after(()=>store.db.close());
 await s.dispatch({guild:'3',id:'1',channel:'2',action:'context'});assert.equal(s.map.board().visitorCount,0);
 const seen=[],env={TABLES:{idFromName:n=>n,get:()=>({fetch:async(_u,o)=>{const p=JSON.parse(o.body);seen.push(p);return Response.json(await s.dispatch(p));}})}};
 await tavernRuntimeData(env,'3','1','2','Alice');assert.equal(seen.find(x=>x.action==='context').recordVisit,true);assert.equal(s.map.board().visitorCount,1);assert.equal(s.map.board().visitors[0].name,'Alice');assert.equal(s.context('1','2'),null);
});
test('automatic game timeout or close publishes a fresh public map snapshot for all game controllers',async()=>{
 const {PokerTable}=await loadWorker();
 for(const game of ['uno','ghost','liar']){
  const table={game,phase:'active',guild:'3',channel:'2',epoch:'fixture',players:[]},map=new Map([['table',table]]),captures=[];
  const storage={get:async key=>map.get(key)};
  const host={ctx:{storage,blockConcurrencyWhile:fn=>fn()},tavernMapBridge:{flush:async()=>{},capture:async value=>captures.push(value?.phase)},tavernBridge:{capture:async()=>{},flush:async()=>{}},ghost:{flush:async()=>{}},rankBridge:{flush:async()=>{}},liarBridge:{flush:async()=>{}},boards:{flush:async()=>{}},armAlarm:async()=>{}};
  host[game]={...(host[game]||{}),alarm:async()=>{table.phase='closed';return false;}};
  await PokerTable.prototype.alarm.call(host);assert.deepEqual(captures,['closed'],game);
 }
});
