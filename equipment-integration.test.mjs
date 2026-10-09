import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {MENU} from './tavern-catalog.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}

async function setup(t){
 const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
 const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),instances=new Map(),env={BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
 env.TABLES={idFromName:n=>n,get:n=>{if(!instances.has(n))instances.set(n,new PokerTable({storage:storage(),blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}},env));return {fetch:(u,o)=>instances.get(n).fetch(new Request(u,o))};}};
 const sent=[],oldFetch=globalThis.fetch;globalThis.fetch=async(u,o)=>{const form=o.body instanceof FormData;sent.push({url:u,body:form?JSON.parse(o.body.get('payload_json')):o.body&&JSON.parse(o.body),file:form?o.body.get('files[0]'):null});return Response.json({id:'444'});};t.after(()=>globalThis.fetch=oldFetch);
 let seq=1000;
 async function call(input){
  const i={application_id:'123',guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},token:'test-token',id:String(++seq),...input},body=JSON.stringify(i),ts=String(Math.floor(Date.now()/1000));
  const sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),tasks=[];
  const r=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return r.json();
 }
 const component=(custom_id,flags=0,extra={})=>({type:3,message:{flags},data:{custom_id},...extra});
 const lastReply=()=>sent.filter(r=>r.url.includes('/webhooks/')).at(-1)?.body;
 return {call,component,sent,lastReply,instances};
}

function assertLayout(reply){
 assert(reply.content.length<=2000);assert(reply.components.length<=5);
 const ids=[];
 for(const row of reply.components){assert(row.components.length<=5);for(const component of row.components){if(component.custom_id)ids.push(component.custom_id);if(component.options)assert(component.options.length<=25);}}
 assert.equal(new Set(ids).size,ids.length,'component custom_id values must be unique within a message');
}

test('signed equipment purchase permanently unlocks server menu, gates forged picks, and charges cappuccino once',async t=>{
 const s=await setup(t),coffee=MENU.find(item=>item.id==='cappuccino');assert(coffee);assert.equal(coffee.price,28);
 // A public menu explains the lock without creating a member wallet.
 assert.deepEqual(await s.call(s.component('t:3:any:menuCat~drinks')),{type:6});
 const publicLocked=s.lastReply(),server3=s.instances.get('tavern:3').tavern;assertLayout(publicLocked);
 assert.match(publicLocked.content,/卡布奇诺.*需要咖啡机/);assert(!/余额|钱包/.test(publicLocked.content));assert.equal(server3.rows('SELECT * FROM tavern_members').length,0);
 // An equipment-gated forged selection on a different server is rejected before draft or wallet creation.
 assert.deepEqual(await s.call(s.component('t:4:1:pick',64,{guild_id:'4',data:{custom_id:'t:4:1:pick',values:['cappuccino']}})),{type:6});
 const server4=s.instances.get('tavern:4').tavern;assert.match(s.lastReply().content,/尚未解锁|不在当前菜单/);assert.equal(server4.rows('SELECT * FROM tavern_drafts').length,0);assert.equal(server4.rows('SELECT * FROM tavern_members').length,0);
 assert.deepEqual(await s.call(s.component('t:4:any:menuCat~drinks',0,{guild_id:'4'})),{type:6});assert.match(s.lastReply().content,/卡布奇诺.*需要咖啡机/);assert(!/余额|钱包/.test(s.lastReply().content));
 // Open the private equipment category, inspect the coffee machine, and prepare a purchase.
 assert.deepEqual(await s.call({type:2,data:{name:'酒馆',options:[{name:'装修'}]}}),{type:5,data:{flags:64}});assertLayout(s.lastReply());
 const renovation=s.lastReply(),category=renovation.components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':renoCategory'));assert(category);
 await s.call(s.component(category.custom_id,64,{data:{custom_id:category.custom_id,values:['equipment']}}));assertLayout(s.lastReply());
 const catalog=s.lastReply(),inspect=catalog.components.flatMap(r=>r.components).find(c=>c.custom_id.includes(':renoInspect~equipment'));assert(inspect.options.some(o=>o.value==='coffee_machine'));
 await s.call(s.component(inspect.custom_id,64,{data:{custom_id:inspect.custom_id,values:['coffee_machine']}}));assertLayout(s.lastReply());
 const detail=s.lastReply();for(const dish of ['河岸美式','红豆拿铁','卡布奇诺'])assert(detail.content.includes(dish));assert.match(detail.content,/本服务器永久加入公共菜单/);assert.match(detail.embeds[0].image.url,/\/art\/equipment\/coffee-machine\/v1\.jpg$/);
 const service=server3;service.sql.exec('UPDATE tavern_members SET balance=balance+1000 WHERE id=?','1');assert.equal(service.view('1').member.balance,1060);
 const title=detail.components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':renoTitle~coffee_machine')).custom_id;
 const modal=await s.call(s.component(title,64));assert.equal(modal.type,9);
 assert.deepEqual(await s.call({type:5,data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'title',value:'吧台咖啡角'}]}]}}),{type:5,data:{flags:64}});assertLayout(s.lastReply());
 const preview=s.lastReply();for(const dish of ['河岸美式','红豆拿铁','卡布奇诺'])assert(preview.content.includes(dish));assert.match(preview.embeds[0].image.url,/\/art\/equipment\/coffee-machine\/v1\.jpg$/);
 const confirm=preview.components.flatMap(r=>r.components).find(c=>c.custom_id.includes(':renoConfirm~')).custom_id;
 assert.deepEqual(await s.call(s.component(confirm,64)),{type:6});assertLayout(s.lastReply());await s.call(s.component(confirm,64));assertLayout(s.lastReply());
 const receipt=s.lastReply();for(const dish of ['河岸美式','红豆拿铁','卡布奇诺'])assert(receipt.content.includes(dish));assert.match(receipt.embeds[0].image.url,/\/art\/equipment\/coffee-machine\/v1\.jpg$/);
 assert.equal(service.view('1').member.balance,160);assert.equal(service.rows('SELECT * FROM tavern_reno_direct').length,1);
 const announcement=s.sent.find(r=>r.url.endsWith('/channels/2/messages'));assert(announcement);assert(!/余额/.test(announcement.body.content));assert.equal(s.sent.filter(r=>r.url.endsWith('/channels/2/messages')).length,1);assert.match(announcement.body.embeds[0].image.url,/coffee-machine/);assert.match(announcement.body.content,/卡布奇诺/);
 // A different visitor in the owning server sees all three coffees publicly, with no wallet created.
 assert.deepEqual(await s.call(s.component('t:3:any:menuCat~drinks',0,{member:{user:{id:'2',username:'Bob'}}})),{type:6});
 const unlockedPublic=s.lastReply();assertLayout(unlockedPublic);for(const dish of ['河岸美式','红豆拿铁','卡布奇诺'])assert(unlockedPublic.content.includes(dish));assert(!/余额|钱包/.test(unlockedPublic.content));assert.equal(service.rows('SELECT * FROM tavern_members WHERE id=?','2').length,0);
 // The second server remains locked after the first server's purchase.
 assert.deepEqual(await s.call(s.component('t:4:any:menuCat~drinks',0,{guild_id:'4',member:{user:{id:'2',username:'Bob'}}})),{type:6});assert.match(s.lastReply().content,/卡布奇诺.*需要咖啡机/);assert(!/余额|钱包/.test(s.lastReply().content));
 // The owner can now order cappuccino; confirmation charges 28 coins once and includes the menu art.
 assert.deepEqual(await s.call(s.component('t:3:1:menuCat~drinks',64)),{type:6});assertLayout(s.lastReply());
 const drinks=s.lastReply(),orderSelect=drinks.components.flatMap(r=>r.components).find(c=>c.type===3);assert(orderSelect.options.some(o=>o.value==='cappuccino'));
 await s.call(s.component(orderSelect.custom_id,64,{data:{custom_id:orderSelect.custom_id,values:['cappuccino']}}));assertLayout(s.lastReply());
 const orderPreview=s.lastReply();assert.match(orderPreview.content,/28币/);assert.match(orderPreview.embeds[0].image.url,/\/art\/equipment\/cappuccino\/v1\.jpg$/);assert.equal(service.view('1').member.balance,160);assert.equal(service.rows('SELECT * FROM tavern_drafts').length,1);
 const orderConfirm=orderPreview.components.flatMap(r=>r.components).find(c=>c.custom_id.includes(':confirm~')).custom_id;
 assert.deepEqual(await s.call(s.component(orderConfirm,64)),{type:6});await s.call(s.component(orderConfirm,64));
 assert.equal(service.view('1').member.balance,132);assert.equal(service.rows("SELECT * FROM tavern_orders WHERE item='cappuccino'").length,1);assert.equal(service.rows('SELECT * FROM tavern_drafts').filter(d=>d.item==='cappuccino'&&d.status==='confirmed').length,1);
 const served=s.sent.find(r=>r.url.endsWith('/channels/2/messages')&&r.body.content.includes('卡布奇诺')&&!r.body.content.includes('共同出资'));assert(served);assert.match(served.body.embeds[0].image.url,/\/art\/equipment\/cappuccino\/v1\.jpg$/);assert.equal(s.sent.filter(r=>r.url.endsWith('/channels/2/messages')&&r.body.content.includes('卡布奇诺')&&!r.body.content.includes('共同出资')).length,1);
});
