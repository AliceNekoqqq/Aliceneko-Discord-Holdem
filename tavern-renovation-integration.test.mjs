import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {MENU} from './tavern-catalog.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')};
}

test('signed menu categories browse publicly without a wallet and food preview stays private until confirmation',async t=>{
 const s=await setup(t);
 assert.deepEqual(await s.call(s.component('t:3:any:menuCat~savory')),{type:6});
 const service=s.instances.get('tavern:3').tavern;
 assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 assert.match(s.lastReply().content,/香菇清汤面/);assert(!s.lastReply().content.includes('余额'));
 assert.deepEqual(await s.call(s.component('t:3:any:menu')),{type:5,data:{flags:64}});
 await s.call(s.component('t:3:1:menuCat~savory',64));
 const select=s.lastReply().components.flatMap(r=>r.components).find(c=>c.type===3);
 assert.equal(select.options.length,6);
 await s.call(s.component(select.custom_id,64,{data:{custom_id:select.custom_id,values:['mushroom-noodles']}}));
 const preview=s.lastReply();assert.match(preview.embeds[0].image.url,/\/art\/mushroom-noodles\/v1\.jpg$/);assert.match(preview.content,/食材：.*香菇/);assert.match(preview.content,/搭配：/);assert.match(preview.content,/按菜品原味 · 温热/);
 assert.equal(service.view('1').member.balance,500);assert.equal(service.rows('SELECT * FROM tavern_orders').length,0);
 const confirm=preview.components.flatMap(r=>r.components).find(c=>c.custom_id.includes('confirm~')).custom_id;
 await s.call(s.component(confirm,64));await s.call(s.component(confirm,64));
 assert.equal(service.view('1').member.balance,500-MENU.find(p=>p.id==='mushroom-noodles').price);
 assert.equal(service.rows('SELECT * FROM tavern_orders').length,1);
 assert.equal(s.sent.filter(r=>r.url.endsWith('/channels/2/messages')).length,1);assert.match(s.sent.find(r=>r.url.endsWith('/channels/2/messages')).body.embeds[0].image.url,/mushroom-noodles/);
 const other=await s.call(s.component('t:3:1:menuCat~savory',64,{member:{user:{id:'2',username:'Bob'}}}));assert.equal(other.type,4);
 const malformed=await s.call(s.component('t:4:any:menuCat~savory'));assert.equal(malformed.type,4);
});
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
  const r=await worker.fetch(new Request('https://test/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':ts,'X-Signature-Ed25519':sig}}),env,{waitUntil:p=>tasks.push(p)});
  await Promise.all(tasks);return r.json();
 }
 const component=(custom_id,flags=0,extra={})=>({type:3,message:{flags},data:{custom_id},...extra});
 const lastReply=()=>sent.filter(r=>r.url.includes('/webhooks/')).at(-1)?.body;
 return {call,component,sent,lastReply,instances,env,request:request=>worker.fetch(request,env,{waitUntil(){}})};
}

test('public dish assets preserve cache headers through the Worker wrapper without a data object',async t=>{
 const s=await setup(t),url='https://test/art/milk/v1.jpg';
 const response=await s.request(new Request(url));assert.equal(response.status,200);
 assert.equal(response.headers.get('Content-Type'),'image/jpeg');assert.match(response.headers.get('Cache-Control'),/max-age=31536000, immutable/);
 const bytes=new Uint8Array(await response.arrayBuffer());assert.deepEqual([...bytes.slice(0,2)],[255,216]);assert.equal(bytes.length,Number(response.headers.get('Content-Length')));
 const head=await s.request(new Request(url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await s.request(new Request('https://test/art/constructor/v1.jpg'))).status,404);
 assert.equal((await s.request(new Request(url,{method:'POST'}))).status,405);assert.equal(s.instances.size,0);
});

test('signed public room entry creates no wallet; opening renovation privately awards welcome exactly once',async t=>{
 const s=await setup(t);
 assert.deepEqual(await s.call({type:2,data:{name:'酒馆',options:[{name:'店内'}]}}),{type:5});
 const service=s.instances.get('tavern:3').tavern;assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 assert(!s.lastReply().content.includes('余额'));
 const enter=s.lastReply().components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':renoEnter')).custom_id;
 assert.deepEqual(await s.call(s.component(enter)),{type:5,data:{flags:64}});
 assert.match(s.lastReply().content,/500币/);assert.equal(service.view('1').member.balance,500);
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
 const service=s.instances.get('tavern:3').tavern;assert.equal(service.view('1').member.balance,500);service.sql.exec('UPDATE tavern_members SET balance=160 WHERE id=?','1');
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
  assert(service.view('1').member.balance===500);
  const back=s.lastReply().components.flatMap(r=>r.components).find(b=>b.custom_id.endsWith(':lobby')).custom_id;
  assert.deepEqual(await s.call(s.component(back,64)),{type:6});assert(!s.lastReply().content.includes('余额'));
 }
 const games=buttons.find(b=>b.custom_id.endsWith(':lobbyGames')).custom_id;
 assert.deepEqual(await s.call(s.component(games)),{type:6});
 const play=s.lastReply().components.flatMap(r=>r.components).filter(b=>b.custom_id.includes(':lobbyPlay~'));assert.equal(play.length,6);
 assert.equal(play.find(b=>b.custom_id.endsWith('~rogue'))?.label,'🏮 灯下迷城');
 assert.match(s.lastReply().components.flatMap(r=>r.components).find(b=>b.custom_id.endsWith('~ghost')).label,/抽鬼牌/);
 assert.equal(service.rows("SELECT * FROM tavern_ledger WHERE kind='welcome'").length,1);
});

test('signed operations buttons keep public board wallet-free and enforce daily manager ownership',async t=>{
 const s=await setup(t);await s.call({type:2,data:{name:'酒馆',options:[{name:'大厅'}]}});
 const service=s.instances.get('tavern:3').tavern,hub=s.lastReply();assert.match(hub.content,/今日店长.*Alice/);assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 const enter=hub.components.flatMap(r=>r.components).find(b=>b.custom_id.endsWith(':opsBoard')).custom_id;
 assert.deepEqual(await s.call(s.component(enter)),{type:6});assert(!s.lastReply().content.includes('余额'));
 const manage=s.lastReply().components.flatMap(r=>r.components).find(b=>b.custom_id.endsWith(':opsEnter')).custom_id;
 assert.deepEqual(await s.call(s.component(manage)),{type:5,data:{flags:64}});
 const panel=s.lastReply(),select=panel.components.flatMap(r=>r.components).find(c=>c.custom_id?.includes(':opsSet~')&&c.custom_id.endsWith('~ambience'));
 assert(select);assert(panel.components.filter(r=>r.components.some(c=>c.type===3)).every(r=>r.components.length===1));
 const other=await s.call(s.component(select.custom_id,64,{member:{user:{id:'7',username:'Bob'}},data:{custom_id:select.custom_id,values:['starlight']}}));assert.equal(other.type,4);
 const publicMutation=await s.call(s.component(select.custom_id,0,{data:{custom_id:select.custom_id,values:['starlight']}}));assert.equal(publicMutation.type,4);
 assert.deepEqual(await s.call(s.component(select.custom_id,64,{data:{custom_id:select.custom_id,values:['starlight']}})),{type:6});assert.equal(service.operations.board().settings.ambience,'starlight');
 assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 const stale=select.custom_id.replace(service.operations.board().day,'2020-01-01');await s.call(s.component(stale,64,{data:{custom_id:stale,values:['soft_lights']}}));assert.match(s.lastReply().content,/过期|重新/);assert.equal(service.operations.board().settings.ambience,'starlight');
 const bot=await s.call(s.component(enter,0,{member:{user:{id:'8',username:'Bot',bot:true}}}));assert.equal(bot.type,4);assert.equal(service.operations.one('SELECT user_id FROM tavern_ops_visits WHERE user_id=?','8'),null);
});

test('signed lobby tracking survives private entries and stops on public page navigation',async t=>{
 const s=await setup(t);await s.call({type:2,data:{name:'酒馆',options:[{name:'大厅'}]}});
 const store=s.instances.get('tavern:3').ctx.storage;assert.equal(store.map.get('tavernLobbyLive').boards[0].message,'444');
 await s.call({...s.component('t:3:any:lobbyWallet'),message:{id:'444',flags:0}});assert.equal(store.map.get('tavernLobbyLive').boards.length,1);
 await s.call({...s.component('t:3:any:opsBoard'),message:{id:'444',flags:0}});assert.equal(store.map.get('tavernLobbyLive').boards.length,0);assert.equal(store.map.has('alarm'),false);
});

test('signed map navigation attaches animated GIF, creates no wallet, caches unchanged views and clears image on exit',async t=>{
 const s=await setup(t);await s.call({type:2,data:{name:'酒馆',options:[{name:'大厅'}]}});
 const mapButton=s.lastReply().components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':lobbyMap'));assert(mapButton);
 assert.deepEqual(await s.call({...s.component(mapButton.custom_id),message:{id:'444',flags:0}}),{type:6});
 const reply=s.sent.filter(r=>r.url.includes('/webhooks/')).at(-1),service=s.instances.get('tavern:3').tavern,store=s.instances.get('tavern:3').ctx.storage;
 assert.match(reply.body.content,/最近30分钟.*1位来客/);assert(!reply.body.content.includes('余额'));assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
 assert.equal(reply.body.embeds[0].image.url,'attachment://tavern-scene.gif');assert.equal(reply.file.type,'image/gif');const bytes=new Uint8Array(await reply.file.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(0,6)),'GIF89a');
 assert.equal(store.map.get('tavernLobbyLive').boards.length,0);
 const cache=store.map.get('tavernSceneImageCache');await s.call(s.component(mapButton.custom_id));assert.equal(store.map.get('tavernSceneImageCache').signature,cache.signature);
 await s.call(s.component('t:3:any:lobbyGames'));assert.deepEqual(s.lastReply().attachments,[]);assert.deepEqual(s.lastReply().embeds,[]);
});

test('signed game creation propagates only public table data to guild map, with no financial side effects',async t=>{
 const s=await setup(t);await s.call({type:2,data:{name:'uno',options:[{name:'创建'}]}});
 const channel=[...s.instances.values()].find(x=>x.ctx.storage.map.has('tavernMapJob'));assert(channel);
 const job=channel.ctx.storage.map.get('tavernMapJob');assert.equal(job.game,'uno');assert.equal(job.players[0].id,'1');assert(!JSON.stringify(job).includes('hand'));
 await channel.tavernMapBridge.flush(Date.now()+3000);
 const service=s.instances.get('tavern:3').tavern,map=service.map.board();assert.equal(map.tableCount,1);assert.equal(map.visitorCount,1);assert.equal(service.rows('SELECT * FROM tavern_members').length,0);
});



test('signed daily gift click credits privately once through the real Worker and rejects forged owners',async t=>{
 const s=await setup(t);assert.deepEqual(await s.call({type:2,data:{name:'酒馆',options:[{name:'钱包'}]}}),{type:5,data:{flags:64}});
 const service=s.instances.get('tavern:3').tavern;assert.equal(service.view('1').earned,0);
 const claim=s.lastReply().components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':claimDaily')).custom_id;
 const forged=await s.call(s.component(claim,64,{member:{user:{id:'2',username:'Bob'}}}));assert.equal(forged.type,4);assert.equal(service.rows("SELECT * FROM tavern_ledger WHERE kind='daily_gift'").length,0);
 assert.equal((await s.call(s.component(claim))).type,4);
 assert.deepEqual(await s.call(s.component(claim,64)),{type:6});assert.match(s.lastReply().content,/已到账.*20/);assert.equal(service.view('1').member.balance,520);assert.equal(service.view('1').earned,20);
 await s.call(s.component(claim,64));assert.equal(service.view('1').member.balance,520);assert.equal(service.rows("SELECT * FROM tavern_ledger WHERE kind='daily_gift'").length,1);assert.equal(s.sent.filter(r=>r.url.endsWith('/channels/2/messages')).length,0);
});

