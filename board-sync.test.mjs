import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardSync} from './board-sync.mjs';
import * as g from './engine.mjs';
const db=()=>{const map=new Map();return {map,get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)};};
test('public updates coalesce and read the latest persisted state; jobs survive restart without bot credentials',async(t)=>{
 const storage=db(),env={BOT_TOKEN:'fake-token'},sync=new BoardSync(storage,env),state=g.newTable('1','2','3');state.messageId='99';
 const sent=[],original=fetch;globalThis.fetch=async(url,opts)=>{sent.push(JSON.parse(opts.body));return Response.json({});};t.after(()=>{globalThis.fetch=original;});
 await sync.queue(state,1000);g.join(state,'4');state.version++;await sync.queue(state,1010);g.join(state,'5');state.version++;
 await new BoardSync(storage,env).flush(state,1260);assert.equal(sent.length,1);assert(sent[0].embeds[0].description.includes('3/9'));assert(sent[0].components[0].components[0].custom_id.includes(':2:'));
 assert(!storage.map.has('boardJobs'));assert(!storage.map.has('boardSyncAt'));assert(!JSON.stringify([...storage.map]).includes('fake-token'));
});
test('old closed table receives its final snapshot even when replaced by a new game in that channel',async(t)=>{
 const storage=db(),sync=new BoardSync(storage,{BOT_TOKEN:'fake'}),old=g.newTable('1','2','3');old.messageId='99';g.close(old,'1');await sync.queue(old,1000);
 const current={game:'uno',epoch:'new',messageId:'100'},sent=[],original=fetch;globalThis.fetch=async(url,opts)=>{sent.push({url,data:JSON.parse(opts.body)});return Response.json({});};t.after(()=>{globalThis.fetch=original;});
 await sync.flush(current,1300);assert.equal(sent.length,1);assert(sent[0].url.endsWith('/99'));assert(sent[0].data.embeds[0].description.includes('牌桌关闭'));assert.equal(sent[0].data.components.length,0);
});
test('429 delay persists across newer snapshots; transient failures retry and missing messages stop',async(t)=>{
 const storage=db(),sync=new BoardSync(storage,{BOT_TOKEN:'fake'}),state=g.newTable('1','2','3');state.messageId='99';
 let calls=0,mode=429;const original=fetch;globalThis.fetch=async()=>{calls++;return mode===429?Response.json({retry_after:2},{status:429}):new Response('',{status:mode});};t.after(()=>{globalThis.fetch=original;});
 await sync.queue(state,1000);await sync.flush(state,1300);const retryAt=storage.map.get('boardSyncAt');assert(retryAt>=Date.now()+1900);
 g.join(state,'4');await sync.queue(state,1301);assert.equal(storage.map.get('boardSyncAt'),retryAt);await sync.flush(state,retryAt-1);assert.equal(calls,1);
 mode=503;await sync.flush(state,retryAt);assert(storage.map.has('boardJobs'));mode=404;await sync.flush(state,storage.map.get('boardSyncAt'));assert(!storage.map.has('boardJobs'));assert.equal(calls,3);
});

test('UNO public card updates coalesce, cache the attachment, and clear it on closure',async(t)=>{
 const u=await import('./uno-engine.mjs'),storage=db(),sync=new BoardSync(storage,{BOT_TOKEN:'fake'}),state=u.newTable('1','2','3');u.join(state,'4');state.messageId='99';state.phase='active';state.handNo=1;state.turn='1';state.discard=[1];state.color='red';state.players[0].cards=[3,7];state.players[1].cards=[33];
 const sent=[],original=fetch;globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body instanceof FormData?opts.body.get('payload_json'):opts.body);sent.push({body,file:opts.body instanceof FormData});return Response.json({attachments:body.attachments?.length?[{id:'public-image'}]:[]});};t.after(()=>{globalThis.fetch=original;});
 await sync.queue(state,1000);u.play(state,'1',3);state.version++;await sync.queue(state,1010);await sync.flush(state,1300);assert.equal(sent.length,1);assert(sent[0].file);assert(sent[0].body.content.includes('**<@1>** 出了'));assert(sent[0].body.content.includes('红色 2'));assert(!JSON.stringify(sent[0].body).includes('红色 4'));assert(!JSON.stringify([...storage.map]).includes('fake'));
 await sync.queue(state,1400);await sync.flush(state,1700);assert(!sent[1].file);assert.equal(sent[1].body.attachments[0].id,'public-image');
 u.close(state,'1');await sync.queue(state,1800);await sync.flush({game:'uno',epoch:'different',messageId:'100'},2100);assert.deepEqual(sent[2].body.attachments,[]);assert.equal(sent[2].body.components.length,0);
});

test('UNO public image rejection falls back to public text without leaking private cards',async(t)=>{
 const u=await import('./uno-engine.mjs'),storage=db(),sync=new BoardSync(storage,{BOT_TOKEN:'fake'}),state=u.newTable('1','2','3');state.messageId='99';state.phase='active';state.turn='1';state.discard=[23];state.color='red';state.players[0].cards=[77,89];const sent=[],original=fetch;globalThis.fetch=async(url,opts)=>{sent.push(opts);return sent.length===1?new Response('',{status:413}):Response.json({});};t.after(()=>{globalThis.fetch=original;});await sync.queue(state,1000);await sync.flush(state,1300);assert.equal(sent.length,2);const data=JSON.parse(sent[1].body);assert.deepEqual(data.attachments,[]);assert(!data.embeds[0].image);assert(!sent[1].body.includes(u.cardName(77)));assert(!storage.map.has('boardJobs'));
});
