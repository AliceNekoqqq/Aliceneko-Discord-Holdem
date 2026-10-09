import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleNaturalTavern} from './tavern-ui.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {db,map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}
async function loadWorker(){
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}} ").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function component(action,{owner='any',guild='3',user='1',channel='2',flags=0,values=[],message='public-lobby'}={}){
 return {type:3,application_id:'123',guild_id:guild,channel_id:channel,member:{user:{id:user,username:'Alice'},nick:'Alice',permissions:'0'},token:'interaction-token',message:{id:message,flags},data:{custom_id:`t:${guild}:${owner}:${action}`,...(values.length?{values}:{})}};
}

async function harness(t){
 const {default:worker,PokerTable}=await loadWorker(),store=storage();t.after(()=>store.db.close());
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),env={BOT_TOKEN:'fixture',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
 const guild=new PokerTable({storage:store,blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}},env);
 env.TABLES={idFromName:n=>n,get:()=>({fetch:(url,options)=>guild.fetch(new Request(url,options))})};
 const sent=[],original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async(url,options={})=>{
  const form=options.body instanceof FormData,raw=form?options.body.get('payload_json'):options.body;
  const payload=raw?JSON.parse(typeof raw==='string'?raw:await raw.text()):null,file=form?options.body.get('files[0]'):null;
  sent.push({url:String(url),form,payload,file,fileBytes:file?new Uint8Array(await file.arrayBuffer()):null});
  return Response.json({id:'4',flags:0});
 };
 let seq=100;
 const call=async(input)=>{
  const interaction={id:String(++seq),application_id:'123',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'},nick:'Alice',permissions:'0'},token:'fixture-token',...input};
  const body=JSON.stringify(interaction),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),tasks=[];
  const response=await worker.fetch(new Request('https://fixture/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});
  const ack=await response.json();await Promise.all(tasks);return ack;
 };
 return {guild,store,sent,call};
}
const mapMove=(area,owner='1')=>component('lobbyMove',{owner,flags:64,values:[area],message:'private-seat'});
const areaOf=(guild)=>guild.tavern.map.board().visitors.find(v=>v.id==='1')?.location;

test('signed lobby position choice is private, moves the real player, and patches the bound public scene',async t=>{
 const {guild,store,sent,call}=await harness(t);
 const opened=await call({type:2,data:{name:'酒馆',options:[{name:'大厅'}]}});assert.equal(opened.type,5);
 const first=sent.find(x=>x.form&&x.url.includes('/webhooks/123/'));assert(first?.file);assert.equal(first.file.type,'image/gif');assert.equal(new TextDecoder().decode(first.fileBytes.slice(0,6)),'GIF89a');
 assert.equal(store.map.get('tavernLobbyLive').boards[0].message,'4');
 const seat=await call(component('lobbySeat'));assert.equal(seat.type,5);assert.equal(seat.data.flags,64);
 assert.equal(guild.tavern.rows('SELECT * FROM tavern_members').length,0);assert.equal(areaOf(guild).area,'commons');
 const privatePanel=sent.findLast(x=>x.url.includes('/webhooks/123/')&&x.payload?.components?.some(r=>r.components?.some(c=>c.custom_id==='t:3:1:lobbyMove')));
 assert(privatePanel);

 const moved=await call(mapMove('window'));assert.equal(moved.type,6);assert.deepEqual(areaOf(guild),{area:'window',changedAt:areaOf(guild).changedAt});
 const live=store.map.get('tavernLobbyLive'),due=live.due;assert(due>=Date.now()+1900&&due<=Date.now()+2100);
 const probe=await guild.tavernMapPresentation.renderScene({id:'3',channel:'2',passive:true},due);assert.equal(probe.scene.mime,'image/gif');
 await guild.tavernLive.flush(due);
 const refresh=sent.findLast(x=>x.url.endsWith('/channels/2/messages/4'));assert(refresh?.form, JSON.stringify({urls:sent.map(x=>x.url),payload:refresh?.payload,state:store.map.get('tavernLobbyLive')}));assert.equal(refresh.file.type,'image/gif');assert.equal(new TextDecoder().decode(refresh.fileBytes.slice(0,6)),'GIF89a');
 assert.notDeepEqual(refresh.fileBytes,first.fileBytes);
 const serialized=JSON.stringify(refresh.payload);assert(!serialized.includes('t:3:1:lobbyMove'));assert(!serialized.includes('_liveState'));assert(!serialized.includes('tableChannel'));assert(!serialized.includes('location'));
 assert.equal(areaOf(guild).area,'window');

 const active={guild:'3',channel:'5',epoch:'position-game',at:Date.now(),expires:Date.now()+1800000,game:'uno',phase:'playing',closed:false,players:[{id:'1',name:'Alice',bot:false}]};
 assert.equal(await (await guild.dispatch({op:'tavern',guild:'3',action:'mapTable',table:active})).json(),true);assert.equal(areaOf(guild).area,'game');
 assert.equal(await (await guild.dispatch({op:'tavern',guild:'3',action:'mapTable',table:{...active,at:active.at+1,closed:true,players:[]}})).json(),true);assert.equal(areaOf(guild).area,'window');
});

test('signed menu/order and profile position rules preserve unrelated choices and reject forged selectors',async t=>{
 const {guild,call}=await harness(t);
 await call({type:2,data:{name:'酒馆',options:[{name:'大厅'}]}});
 await call(mapMove('window'));
 assert.equal((await call(component('lobbyWallet'))).data.flags,64);assert.equal(areaOf(guild).area,'window');
 assert.equal((await call(component('lobbyCard'))).data.flags,64);assert.equal(areaOf(guild).area,'window');
 await call(component('pref~sweetness',{owner:'1',flags:64,values:['sweet'],message:'private-card'}));assert.equal(areaOf(guild).area,'window');
 assert.equal(await handleNaturalTavern({TABLES:{}},{guild_id:'3',channel_id:'2',id:'999',author:{id:'1',username:'Alice'},member:{nick:'Alice'}},'今天有点累，想在这里聊聊天。'),false);assert.equal(areaOf(guild).area,'window');
 await guild.dispatch({op:'tavern',guild:'3',id:'1',name:'Alice',channel:'2',action:'context',recordVisit:true});assert.equal(areaOf(guild).area,'window');
 await call(component('lobbyMap'));assert.equal(areaOf(guild).area,'window');
 await call(component('lobbyMenu'));assert.equal(areaOf(guild).area,'bar');
 await call({type:2,data:{name:'酒馆',options:[{name:'点单',options:[{name:'商品',value:'milk'}]}]}});assert.equal(areaOf(guild).area,'bar');
 await call(mapMove('window'));
 const failed=await call(component('confirm~does-not-exist',{owner:'1',flags:64,message:'private-order'}));assert.equal(failed.type,6);assert.equal(areaOf(guild).area,'window');

 for(const [seat,area]of [['counter','bar'],['window','window'],['sofa','commons'],['quiet','quiet'],['any','commons']]){
  await call(component('pref~seat',{owner:'1',flags:64,values:[seat],message:'private-card'}));assert.equal(areaOf(guild).area,area,seat);
 }
 const bad=[
  component('lobbyMove',{owner:'any',flags:0,values:['window']}),
  component('lobbyMove',{owner:'99',flags:64,values:['window']}),
  component('lobbyMove',{owner:'1',flags:0,values:['window'],message:'public-lobby'}),
  {...component('lobbyMove',{owner:'1',flags:64,values:['window']}),data:{custom_id:'t:9:1:lobbyMove',values:['window']}}
 ];
 for(const forged of bad){const ack=await call(forged);assert.equal(ack.type,4);assert.equal(ack.data.flags,64);}
 assert.equal(areaOf(guild).area,'commons');
});
