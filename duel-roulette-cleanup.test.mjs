import test from 'node:test';
import assert from 'node:assert/strict';
import {DuelPanels} from './duel-roulette-panels.mjs';
import * as game from './duel-roulette-model.mjs';
const storage=()=>{const m=new Map();return {async get(k){return structuredClone(m.get(k));},async put(k,v){m.set(k,structuredClone(v));},async delete(k){m.delete(k);}};};
const panels=st=>new DuelPanels({storage:st,env:{BOT_TOKEN:'test'}});
const started=()=>{const t=game.create('duel','1','2','3','甲');game.accept(t,'4','乙');t.messageId='900';return t;};
const round=(t,a='rock',b='scissors')=>{game.choose(t,'1',a,t.round);game.choose(t,'4',b,t.round);};
test('round receipts expire after display, survive restart, and never delete the original board or repost',async ctx=>{
 const st=storage(),p=panels(st),t=started(),calls=[];let now=Date.now(),seq=100;
 ctx.mock.method(Date,'now',()=>now);ctx.mock.method(globalThis,'fetch',async(url,o)=>{calls.push({url,method:o.method});return o.method==='DELETE'?new Response(null,{status:204}):Response.json({id:String(++seq)});});
 round(t);assert.equal(await p.publicResult(t),true);assert.equal(await st.get('duelRoundCleanupAt'),now+10000);
 now+=9999;await panels(st).publicResult(t);assert.equal(calls.length,1);
 now++;await panels(st).publicResult(t);assert.equal(calls.length,2);assert.equal(calls[1].method,'DELETE');assert(calls[1].url.endsWith('/101'));assert(!calls.some(c=>c.url.endsWith('/900')));
 assert.equal(await st.get('duelRoundCleanupAt'),undefined);assert.equal(await p.publicResult(t),false);assert.equal(calls.length,2);
});
test('end removes earlier rounds immediately and removes the final receipt after its display',async ctx=>{
 const st=storage(),p=panels(st),t=started(),deleted=[];let now=Date.now(),seq=100;
 ctx.mock.method(Date,'now',()=>now);ctx.mock.method(globalThis,'fetch',async(url,o)=>{if(o.method==='DELETE'){deleted.push(url);return new Response(null,{status:204});}return Response.json({id:String(++seq)});});
 round(t);await p.publicResult(t);round(t);await p.publicResult(t);assert.equal(t.phase,'settled');assert.equal(deleted.length,1);assert(deleted[0].endsWith('/101'));
 now+=10000;await panels(st).cleanupRounds(t);assert.equal(deleted.length,2);assert(deleted[1].endsWith('/102'));await p.publicResult(t);assert.equal(seq,102);
});
test('cleanup works after another game replaces the table and treats missing messages as deleted',async ctx=>{
 const st=storage(),p=panels(st),t=started();let n=0;
 ctx.mock.method(globalThis,'fetch',async(url,o)=>{if(o.method==='POST')return Response.json({id:'101'});n++;return new Response(null,{status:404});});
 round(t);await p.publicResult(t);await panels(st).cleanupRounds({epoch:'other',game:'uno',phase:'active'});assert.equal(n,1);assert.equal(await st.get('duelRoundCleanupAt'),undefined);
});
test('cleanup honors rate limits, bounds failures, and does not repost a deleted receipt',async ctx=>{
 const st=storage(),p=panels(st),t=started();let now=Date.now(),deletes=0;
 ctx.mock.method(Date,'now',()=>now);ctx.mock.method(globalThis,'fetch',async(url,o)=>{if(o.method==='POST')return Response.json({id:'101'});deletes++;return Response.json({retry_after:5},{status:429});});
 round(t);await p.publicResult(t);now+=10000;assert(await p.cleanupRounds(t));await p.cleanupRounds(t);assert.equal(deletes,1);assert.equal(await st.get('duelRoundCleanupAt'),now+5000);
 now+=5000;await p.cleanupRounds(t);now+=5000;assert.equal(await p.cleanupRounds(t),false);assert.equal(deletes,3);assert.equal(await st.get('duelRoundCleanupAt'),undefined);
 await p.publicResult(t);assert.equal(deletes,3);
});
