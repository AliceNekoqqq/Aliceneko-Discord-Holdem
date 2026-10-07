import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import * as game from './uno-engine.mjs';
import {board,handPanel,pageCards,focusHandPage,actionText} from './uno-ui.mjs';
import {renderUnoImage,imageMessage,paintCard,renderBoardImage,boardImageMessage} from './uno-image.mjs';
import {Canvas,encodePNG} from './card-image.mjs';
let source=await readFile(new URL('./worker.mjs',import.meta.url),'utf8');source=source.replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
const {PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function context(){const map=new Map(),tasks=[];return {map,tasks,storage:{get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async v=>map.set('alarm',v),deleteAlarm:async()=>map.delete('alarm')},blockConcurrencyWhile:fn=>fn(),waitUntil:p=>tasks.push(p)};}
function setup(t){const ctx=context(),env={BOT_TOKEN:'fake-uno-test-key',DISCORD_APPLICATION_ID:'123'},table=new PokerTable(ctx,env),sent=[];const old=globalThis.fetch;let serial=0,message=8000;globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts?.body instanceof FormData?opts.body.get('payload_json'):opts?.body||'{}');sent.push({url,method:opts?.method,body,file:opts?.body instanceof FormData});return Response.json({id:String(++message),attachments:body.attachments?.map(x=>({...x,id:'file-'+message}))||[]});};t.after(()=>{globalThis.fetch=old;});
 const call=async(type,data,id='1',privateMessage=false,extra={})=>{const panel=(await table.panels.read())[id]?.panel;return (await table.fetch(new Request('https://internal',{method:'POST',body:JSON.stringify({op:'interaction',interaction:{type,data,id:String(++serial),token:'private-credential-'+serial,guild_id:'3',channel_id:'2',member:{user:{id},permissions:'0'},message:{id:privateMessage?(panel?.id||'private'):'999',flags:privateMessage?64:0},...extra}})}))).json();};
 const click=(action,id='1',priv=false,values)=>call(3,{custom_id:`u:${ctx.map.get('table').epoch}:${ctx.map.get('table').version}:${priv?`p~${id}~`:''}${action}`,...(values?{values}:{})},id,priv);
 const flush=async()=>{await ctx.storage.put('privateSyncAt',Date.now()-1);await table.alarm();};
 return {ctx,table,sent,call,click,flush};
}
test('shared channel occupancy, identity, stale clicks, duplicate ids and private colour selection',async t=>{
 const {ctx,call,click,sent,flush}=setup(t);let reply=await call(2,{name:'uno',options:[{name:'创建'}]});assert.equal(reply.type,4);assert.equal(ctx.map.get('table').game,'uno');
 await ctx.storage.put('table',{...ctx.map.get('table'),messageId:'999'});
 const conflict=await call(2,{name:'德州',options:[{name:'创建'}]});assert.equal(conflict.data.flags,64);assert(conflict.data.content.includes('UNO'));
 await click('join','4');await click('start');let state=ctx.map.get('table');state.players[0].cards=[104,1];state.players[1].cards=[26,28];state.discard=[5];state.deck=Array.from({length:108},(_,i)=>i).filter(c=>![104,1,26,28,5].includes(c));state.turn='1';state.pending=null;state.color='red';state.pages={};state.drawn=null;await ctx.storage.put('table',state);
 const hand=await click('hand');assert.equal(hand.data.flags,64);
 const spoof=await call(3,{custom_id:`u:${state.epoch}:${state.version}:p~1~play`,values:['104']},'4',true);assert.equal(spoof.data.flags,64);assert(!JSON.stringify(spoof).includes('万能'));
 const publicSpoof=await call(3,{custom_id:`u:${state.epoch}:${state.version}:p~1~play`,values:['104']},'1',false);assert(publicSpoof.data.content.includes('自己的'));
 const choice=await click('play','1',true,['104']);assert.deepEqual(choice,{type:6});await flush();assert.deepEqual(ctx.map.get('table').players[0].cards,[104,1]);
 const color=sent.flatMap(s=>s.body.components?.flatMap(r=>r.components)||[]).find(c=>c.custom_id?.includes('p~1~pickcolor')).custom_id;
 const wrong=await call(3,{custom_id:color},'4',true);assert(wrong.data.content.includes('自己的'));
 await call(3,{custom_id:color},'1',true);assert.equal(ctx.map.get('table').pending.kind,'draw4');
 const after=structuredClone(ctx.map.get('table'));const repeated=await call(3,{custom_id:color},'1',true);assert.equal(repeated.type,6);assert.deepEqual(ctx.map.get('table'),after);
 const reveal=await click('challenge','4',true);assert.equal(reveal.type,4);assert.equal(reveal.data.flags,64);assert(reveal.data.content.includes('质疑成功'));assert(reveal.data.content.includes('红色 1'));assert(!JSON.stringify(board(ctx.map.get('table'))).includes('红色 1'));
 assert.equal(ctx.map.get('table').turn,'4');
 const before=ctx.map.get('table');const stale=await call(3,{custom_id:`u:${before.epoch}:${before.version-1}:p~4~draw`},'4',true);assert.equal(stale.type,6);await flush();assert(sent.some(s=>s.body.content?.includes('未执行')));assert.deepEqual(ctx.map.get('table'),before);
 const replyId='stable-duplicate';await call(3,{custom_id:`u:${before.epoch}:${before.version}:p~4~draw`},'4',true,{id:replyId});const once=ctx.map.get('table');await call(3,{custom_id:`u:${once.epoch}:${once.version}:p~4~draw`},'4',true,{id:replyId});assert.deepEqual(ctx.map.get('table'),once);
});
test('automatic UNO hand stays in place across rounds, lobby stays quiet, encrypted restart and private isolation',async t=>{
 const {ctx,table,call,click,sent,flush}=setup(t);await call(2,{name:'uno',options:[{name:'测试',options:[{name:'电脑数量',value:1}]}]});await flush();assert.equal(sent.length,0);await click('start');await flush();assert(sent.some(s=>s.file));assert(sent.filter(s=>s.file).every(s=>s.url.includes('/webhooks/')));assert(!sent.some(s=>s.body.content?.includes('这张手牌卡已结束')));
 const state=ctx.map.get('table');assert(!JSON.stringify([...ctx.map]).includes('private-credential'));assert(!JSON.stringify([...ctx.map]).includes('fake-uno-test-key'));
 for(let i=0;i<1000&&ctx.map.get('table').phase==='active';i++){const current=ctx.map.get('table');if(current.players.find(p=>p.id===current.turn).bot){current.computerDue=Date.now()-1;await ctx.storage.put('table',current);await table.alarm();}else{
  if(current.pending?.kind==='openingColor')await click('opening~red','1',true);else if(current.pending)await click('accept','1',true);else{const cards=game.legalCards(current,'1');if(cards.length){if(current.players[0].cards.length===2)await click('uno','1',true);const chosen=await click('play','1',true,[String(cards[0])]);if(ctx.map.get('table').selectedWild)await click(`pickcolor~${cards[0]}~red`,'1',true);}else await click(current.drawn!==null?'pass':'draw','1',true);}
 }await flush();}
 assert.equal(ctx.map.get('table').phase,'settled');const posts=sent.filter(s=>s.method==='POST').length;await click('start');await flush();assert.equal(sent.filter(s=>s.method==='POST').length,posts);assert(sent.at(-1).body.content.includes('第 2 局'));
 const recovered=new PokerTable(ctx,{BOT_TOKEN:'fake-uno-test-key',DISCORD_APPLICATION_ID:'123'});assert(Object.keys(await recovered.panels.read()).includes('1'));
});
test('UNO idle closure independent of viewing and computer activity; close confirmation and poker reopening',async t=>{
 const {ctx,table,call,click,flush}=setup(t);await call(2,{name:'uno',options:[{name:'测试'}]});const before=ctx.map.get('table').idleDeadline;await click('hand');assert.equal(ctx.map.get('table').idleDeadline,before);
 let current=ctx.map.get('table');current.idleDeadline=Date.now()-1;await ctx.storage.put('table',current);await table.alarm();assert.equal(ctx.map.get('table').phase,'closed');await flush();
 await call(2,{name:'德州',options:[{name:'创建'}]});assert.notEqual(ctx.map.get('table').game,'uno');
 // Reverse conflict: UNO cannot replace a running poker lobby.
 const conflict=await call(2,{name:'uno',options:[{name:'创建'}]});assert(conflict.data.content.includes('德州'));assert.notEqual(ctx.map.get('table').game,'uno');
});
test('image layout, paging, all symbols and cache invalidate when legal choices change',async()=>{
 const t=game.newTable('1','2','3');t.phase='active';t.turn='1';t.handNo=1;t.discard=[3];t.color='red';t.players[0].cards=Array.from({length:50},(_,i)=>i);t.pages={'1':1};const p=pageCards(t,'1');assert.equal(p.cards.length,10);assert.equal(p.page,1);
 const data=handPanel(t,'1');assert(data.components.length<=5);for(const r of data.components){assert(r.components.length<=5);for(const c of r.components){if(c.options)assert(c.options.length<=25);assert((c.custom_id||'').length<=100);}}
 const result=await imageMessage(t,'1',data);assert(result.body instanceof FormData);const png=Buffer.from(await result.body.get('files[0]').arrayBuffer());assert.equal(png.readUInt32BE(16),760);assert.equal(png.readUInt32BE(20),506);let pos=8,parts=[];while(pos<png.length){const len=png.readUInt32BE(pos);if(png.toString('ascii',pos+4,pos+8)==='IDAT')parts.push(png.subarray(pos+8,pos+8+len));pos+=len+12;}assert.equal(inflateSync(Buffer.concat(parts)).length,(760*3+1)*506);assert(png.length<100000);
 assert(!(await imageMessage(t,'1',data,{id:'9',signature:result.signature})).body.get);t.turn='4';assert((await imageMessage(t,'1',data,{id:'9',signature:result.signature})).body instanceof FormData);
 const canvas=new Canvas(1024,330);canvas.text('ALICENEKO / UNO',35,24,26,[242,173,209]);canvas.text('CLASSIC 108 / GREEN FRAME / PLAYABLE',35,66,16,[164,199,218]);[1,42,69,96,23,100,104].forEach((card,i)=>paintCard(canvas,card,35+i*139,117,116,166,i<3));const preview=await encodePNG(canvas);await writeFile(new URL('../uno-cards-preview.png',import.meta.url),Buffer.from(await preview.arrayBuffer()));await writeFile(new URL('../uno-hand-preview.png',import.meta.url),png);await writeFile(new URL('../uno-board-preview.png',import.meta.url),Buffer.from(await (await renderBoardImage(104,'green')).arrayBuffer()));
});

test('named play is prominent with skip target, and drawn cards never enter public event history',()=>{
 const t=game.newTable('1','2','3');game.join(t,'4');game.join(t,'5');t.players[0].name='小爱';t.players[1].name='小明';t.players[2].name='小红';t.phase='active';t.handNo=1;t.turn='1';t.discard=[1];t.color='red';t.players[0].cards=[19,7];t.players[1].cards=[43];t.players[2].cards=[71];t.deck=[52];game.play(t,'1',19);
 const publicData=board(t);assert(publicData.content.startsWith('🃏 **小爱** 出了'));assert(publicData.content.includes('红色 跳过'));assert(publicData.content.includes('小红'));assert(publicData.embeds[0].fields[0].value.includes('跳过 小明'));assert.equal(t.lastPlay.actor,'1');
 game.draw(t,'5');assert.equal(t.lastAction.actor,'5');assert.equal(t.lastAction.kind,'draw');assert(!('card' in t.lastAction));assert(!JSON.stringify(board(t)).includes(game.cardName(52)));assert.equal(t.lastPlay.card,19);assert.equal(t.events.length,2);
});

test('smart hand focus finds legal cards and fresh draw, preserves manual paging and offers a locate button',()=>{
 const t=game.newTable('1','2','3');t.phase='active';t.handNo=1;t.turn='1';t.discard=[1];t.color='red';t.discard=[23];t.players[0].cards=[...Array.from({length:20},(_,i)=>25+i),100];t.pages={'1':0};focusHandPage(t);assert.equal(t.pages['1'],2);
 t.pages['1']=0;focusHandPage(t);assert.equal(t.pages['1'],0);const data=handPanel(t,'1');assert(data.embeds[0].description.includes('其他页'));assert(data.components.flatMap(r=>r.components).some(c=>c.label==='定位可出牌'));
 t.players[0].cards.push(101);t.drawn=101;focusHandPage(t);assert.equal(t.pages['1'],2);assert(handPanel(t,'1').embeds[0].title.includes('刚摸到'));
});

test('inline wild selection and direct card buttons keep acknowledgements image-free; manual reopen retires old panel',async t=>{
 const {ctx,table,call,click,sent,flush}=setup(t);await call(2,{name:'uno',options:[{name:'测试',options:[{name:'电脑数量',value:1}]}]});await click('start');let state=ctx.map.get('table');state.turn='1';state.pending=null;state.color='red';state.discard=[3];state.drawn=null;state.players[0].cards=[100,104,1];await ctx.storage.put('table',state);await flush();
 const old=(await table.panels.read())['1'].panel;assert(handPanel(state,'1').components[0].components.some(c=>c.custom_id?.endsWith('card~100')));
 const ack=await click('card~100','1',true);assert.deepEqual(ack,{type:6});assert(!JSON.stringify(ack).includes('attachments'));await flush();const selected=sent.findLast(s=>s.body.components?.flatMap(r=>r.components).some(c=>c.custom_id?.includes('pickcolor~100')));assert(selected);assert.equal(sent.filter(s=>s.method==='POST').length,1);
 await click('pickcolor~100~blue','1',true);assert.equal(ctx.map.get('table').color,'blue');assert.equal(ctx.map.get('table').lastPlay.card,100);assert(!ctx.map.get('table').selectedWild);await flush();
 assert.equal((await table.panels.read())['1'].panel.hand,old.hand);const opened=await click('hand');assert.equal(opened.type,4);assert.equal(opened.data.flags,64);await flush();assert(sent.some(s=>s.body.content?.includes('这张手牌卡已结束')));assert.equal((await table.panels.read())['1'].retire.length,0);
});

test('management actions bind actor and phase; late hand viewing cannot revive expired UNO table',async t=>{
 const {ctx,call,click}=setup(t);await call(2,{name:'uno',options:[{name:'测试'}]});const state=ctx.map.get('table');await ctx.storage.put('table',{...state,messageId:'999'});await click('join','4');const menu=await click('manage');assert(menu.data.flags&64);assert(menu.data.components.flatMap(r=>r.components).some(c=>c.label==='添加电脑'));
 const add=menu.data.components[0].components.find(c=>c.label==='添加电脑').custom_id;const wrong=await call(3,{custom_id:add},'4',true);assert(wrong.data.content.includes('自己的'));assert.equal(ctx.map.get('table').players.length,4);
 const nonOwner=await click('manage','4');assert(!nonOwner.data.components.flatMap(r=>r.components).some(c=>c.label==='关闭整桌'));
 let current=ctx.map.get('table');current.idleDeadline=Date.now()-1;await ctx.storage.put('table',current);const viewed=await click('hand');assert(viewed.data.content.includes('关闭'));assert.equal(ctx.map.get('table').phase,'closed');
});

test('all UNO panel states fit Discord component limits and public image is unaffected by private state',async()=>{
 const t=game.newTable('1','2','3');game.join(t,'4');t.phase='active';t.turn='1';t.handNo=1;t.color='red';t.discard=[104];t.players[0].cards=Array.from({length:107},(_,i)=>i);
 for(const turn of ['1','4'])for(const page of [0,3,10])for(const pending of [null,{kind:'openingColor',victim:'1'},{kind:'draw4',offender:'4',victim:'1'}]){t.turn=turn;t.pages={'1':page};t.pending=pending;t.unoOpportunity={player:'4'};const data=handPanel(t,'1');assert(data.components.length<=5);for(const r of data.components){assert(r.components.length<=5);for(const c of r.components){assert((c.custom_id||'').length<=100);assert((c.label||'').length<=80);if(c.options)assert(c.options.length<=25);}}for(const f of data.embeds[0].fields)assert(f.value.length<=1024);assert(data.embeds[0].title.length<=256);}
 const a=await boardImageMessage(t,board(t));t.players[0].cards=[5];t.deck=[12];t.pending={kind:'draw4',handBefore:[44,89]};const b=await boardImageMessage(t,board(t));assert.equal(a.signature,b.signature);assert.deepEqual(Buffer.from(await a.body.get('files[0]').arrayBuffer()),Buffer.from(await b.body.get('files[0]').arrayBuffer()));
});
