import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivatePanels} from './private-panels.mjs';
import {handPanel} from './ui.mjs';
import * as g from './engine.mjs';

function storage(){const map=new Map();return {map,get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)};}
function fixture(t){
 const db=storage(),env={BOT_TOKEN:'fake-bot-key',DISCORD_APPLICATION_ID:'123'},service=new PrivatePanels(db,env),requests=[];
 const old=globalThis.fetch;let serial=1000;
 globalThis.fetch=async(url,opts)=>{requests.push({url,method:opts.method,body:JSON.parse(opts.body)});return Response.json({id:opts.method==='POST'?String(++serial):url.split('/').at(-1)});};
 t.after(()=>{globalThis.fetch=old;});
 const table=g.newTable('1','2','3');g.join(table,'4');
 const remember=(id,reply={type:7,data:{}},message={id:'999'})=>service.remember(table,{member:{user:{id}},token:`token-${id}`,message},reply);
 return {db,service,table,requests,remember};
}
test('automatic hands retire old cards, update in place and survive object restart encrypted',async(t)=>{
 const f=fixture(t),{table,service,requests,db,remember}=f;
 await remember('1');await remember('4');await service.sync(table);assert.equal(requests.filter(r=>r.method==='POST').length,2);
 requests.length=0;g.start(table,'1');table.version++;await service.sync(table);
 assert.equal(requests.filter(r=>r.method==='POST').length,2);assert.equal(requests.filter(r=>r.method==='PATCH').length,2);
 assert(requests.filter(r=>r.method==='PATCH').every(r=>r.body.embeds.length===0&&r.body.components.length===0));
 for(const id of ['1','4']){
  const body=requests.find(r=>r.method==='POST'&&r.url.endsWith(`token-${id}`)).body;
  const p=table.players.find(p=>p.id===id);assert.equal(body.flags,64);
  assert.equal(body.embeds[0].fields[0].value,`**${g.cardText(p.cards[0])}**`);
  assert.equal(body.embeds[0].fields[1].value,`**${g.cardText(p.cards[1])}**`);
 }
 const atRest=JSON.stringify([...db.map]);assert(!atRest.includes('token-1'));assert(!atRest.includes('token-4'));assert(!atRest.includes('fake-bot-key'));
 const restored=new PrivatePanels(db,{BOT_TOKEN:'fake-bot-key',DISCORD_APPLICATION_ID:'123'});
 const sessions=await restored.read();assert.equal(sessions['1'].panel.hand,1);
 requests.length=0;g.act(table,'1','call');table.version++;await restored.sync(table);
 assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.equal(requests.filter(r=>r.method==='PATCH').length,2);
 const currentId=(await restored.read())['1'].panel.id;
 await remember('1',{type:7,data:handPanel(table,'1')},{id:currentId,flags:64});
 assert.equal((await service.read())['1'].retire.length,0);
 g.close(table,'1');table.version++;await restored.sync(table);
 assert.equal(db.map.has('privatePanels'),false);assert.equal(db.map.has('privateExpiry'),false);
});
test('manual original panel is renewed without retiring the same private message',async(t)=>{
 const {table,service,remember,requests}=fixture(t);
 await remember('1',{type:4,data:{...handPanel(table,'1'),flags:64}});
 await remember('1',{type:7,data:handPanel(table,'1')},{id:'888',flags:64});
 assert.equal((await service.read())['1'].retire.length,0);
 await service.sync(table);assert.equal(requests.length,0);
 // Another manual opening intentionally replaces the previous card.
 await remember('1',{type:4,data:{...handPanel(table,'1'),flags:64}});await service.sync(table);
 assert.equal(requests.length,1);assert.equal(requests[0].body.embeds.length,0);
});
test('expiry hides stale hands and erases credentials; failures have bounded retries',async(t)=>{
 const {table,service,remember,requests,db}=fixture(t);await remember('1');await service.sync(table);
 const realNow=Date.now;Date.now=()=>realNow()+14*60*1000+1000;
 try{await service.prune(table);assert.equal(db.map.has('privatePanels'),false);assert(requests.at(-1).body.content.includes('连接已到期'));assert.deepEqual(requests.at(-1).body.embeds,[]);}finally{Date.now=realNow;}
 await remember('1');const saved=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:503});
 try{assert.equal(await service.sync(table),true);assert.equal(await service.sync(table),true);assert.equal(await service.sync(table),false);}finally{globalThis.fetch=saved;}
 await remember('1');assert.equal(await service.sync(table),false);assert((await service.read())['1'].panel);
});
