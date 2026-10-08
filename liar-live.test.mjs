import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardSync} from './board-sync.mjs';
import {PrivatePanels} from './private-panels.mjs';
import {DiscordGateway} from './discord-gateway.mjs';
import {handPanel} from './liar-ui.mjs';
import * as game from './liar-engine.mjs';

function storage(){const map=new Map();return {map,get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)};}
function fixture(ctx){
 const db=storage(),env={BOT_TOKEN:'test-secret',DISCORD_APPLICATION_ID:'7'},t=game.create('1','2','3','Alice');game.join(t,'4','Bob');game.start(t,'1',()=>.7);t.turn='1';t.messageId='100';
 const requests=[],nonces=new Map();let next=1000,mode='ok',lose=false;
 ctx.mock.method(globalThis,'fetch',async(url,opts={})=>{
  const body=opts.body?JSON.parse(opts.body instanceof FormData?opts.body.get('payload_json'):opts.body):null;
  requests.push({url,method:opts.method||'GET',body});
  if(opts.method==='DELETE')return new Response(null,{status:mode==='delete403'?403:204});
  if(mode==='429')return Response.json({retry_after:3},{status:429});
  if(mode==='reject-image'&&opts.body instanceof FormData)return new Response(null,{status:413});
  const id=opts.method==='POST'?(nonces.get(body?.nonce)||String(++next)):url.split('/').at(-1);
  if(body?.nonce)nonces.set(body.nonce,id);
  if(lose&&opts.method==='POST'){lose=false;throw Error('response lost after creation');}
  return Response.json({id,flags:body?.flags||0,attachments:body?.attachments?.length?[{id:'image-'+id}]:[]});
 });
 return {db,env,t,requests,sync:new BoardSync(db,env),mode:v=>mode=v,lose:()=>lose=true,nonces};
}

test('latest board follows play, challenge, roulette and redeal; old messages are removed and clocks stay unchanged',async ctx=>{
 const f=fixture(ctx),{t,db,sync,requests}=f;await db.put('table',t);
 async function publish(){await sync.queue(t,1000);const before=[t.lastActive,t.idleDeadline,t.deadline,t.stageDue,t.version];await sync.flush(t,1300);assert.deepEqual([t.lastActive,t.idleDeadline,t.deadline,t.stageDue,t.version],before);assert.equal((await db.get('table')).messageId,t.messageId);}
 await publish();assert.equal(t.messageId,'1001');game.play(t,'1',[0,1]);t.version++;await publish();assert(requests.filter(r=>r.method==='POST').at(-1).body.embeds[0].description.includes('2张'));
 game.challenge(t,'4');t.version++;const loser=t.players.find(p=>p.id===t.reveal.loser);loser.chamber=6;await publish();assert(requests.filter(r=>r.method==='POST').at(-1).body.embeds[0].description.includes('质疑'));
 game.advance(t,()=>.7,t.stageDue);t.version++;await publish();assert(requests.filter(r=>r.method==='POST').at(-1).body.embeds[0].description.includes('安全'));
 game.advance(t,()=>.7,t.stageDue);t.version++;await publish();assert.equal(t.handNo,2);assert(requests.filter(r=>r.method==='POST').at(-1).body.embeds[0].fields.some(x=>x.value.includes('安全')));
 assert.equal(requests.filter(r=>r.method==='DELETE').length,5);assert.equal(requests.filter(r=>r.method==='POST').length,5);
 assert(!requests.some(r=>JSON.stringify(r.body).includes('你的手牌')));assert(!db.map.has('boardJobs'));
});

test('channel chatter coalesces without starvation, ignores own/replayed messages, and moves only Liar tables',async ctx=>{
 const f=fixture(ctx),{sync,db,t,requests}=f;await sync.queue(t,1);await sync.flush(t,251);
 const live=await db.get('liarLiveBoard');assert.equal(await sync.follow(t,t.messageId),false);assert.equal(await sync.follow(t,'99'),false);
 assert(await sync.follow(t,'2000',live.at+1));const due=await db.get('boardSyncAt');assert(due>=live.at+2500);
 for(let i=0;i<20;i++)await sync.follow(t,String(2001+i),live.at+100+i*200);assert.equal(await db.get('boardSyncAt'),due);
 await sync.flush(t,due);assert.equal(requests.filter(r=>r.method==='POST').length,2);assert.equal(await sync.follow({...t,game:'uno'},'3000'),false);
});

test('lost POST response and object restart reuse a stable nonce; only a confirmed new board retires the previous board',async ctx=>{
 const f=fixture(ctx),{db,t,sync,requests,env}=f;f.lose();await sync.queue(t,1);await sync.flush(t,251);
 assert.equal(t.messageId,'100');assert.equal(requests.filter(r=>r.method==='DELETE').length,0);const due=await db.get('boardSyncAt');
 await new BoardSync(db,env).flush(t,due);const posts=requests.filter(r=>r.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].body.nonce,posts[1].body.nonce);assert(posts.every(r=>r.body.enforce_nonce));assert.equal(t.messageId,'1001');assert.equal(requests.filter(r=>r.method==='DELETE').length,1);
});

test('rate limit preserves the old board, image rejection falls back publicly, deletion failure disables the old board',async ctx=>{
 const f=fixture(ctx),{db,t,sync,requests}=f;f.mode('429');await sync.queue(t,1);await sync.flush(t,251);assert.equal(t.messageId,'100');const due=await db.get('boardSyncAt');assert(due>=Date.now()+2900);
 f.mode('reject-image');await sync.flush(t,due);const posts=requests.filter(r=>r.method==='POST');assert.equal(posts.length,3);assert.deepEqual(posts.at(-1).body.attachments,[]);assert(!JSON.stringify(posts.at(-1).body).includes('你的手牌'));
 game.play(t,'1',[0]);t.version++;f.mode('delete403');await sync.queue(t,1);await sync.flush(t,251);assert(requests.some(r=>r.method==='PATCH'&&r.body.content?.includes('最新消息')&&r.body.components.length===0&&r.body.embeds.length===0));
});

test('public interactions never become Liar private credentials; opening and updating a hand remains bound to its owner',async ctx=>{
 const f=fixture(ctx),{db,t,env,requests}=f,p=new PrivatePanels(db,env);
 const i={member:{user:{id:'1'}},token:'public-original',message:{id:'100',flags:0},data:{custom_id:`l:${t.epoch}:${t.version}:start`}};
 assert.equal(await p.remember(t,i,{type:6}),false);assert.equal((await p.read())['1'],undefined);await p.sync(t);assert.equal(requests.length,0);
 const opened={type:4,data:handPanel(t,'1')};assert.equal(opened.data.flags,64);i.token='private-original';assert(await p.remember(t,i,opened));await p.sync(t);
 const session=(await p.read())['1'];assert.equal(session.panel.private,true);assert.equal(session.panel.owner,'1');assert(requests.every(r=>r.url.includes('/webhooks/')));assert(!requests.some(r=>r.url.includes('public-original')));
});

test('legacy public original is read and cleared without ever uploading hand content; unverified network failure discards it',async ctx=>{
 const f=fixture(ctx),p=new PrivatePanels(f.db,f.env),expiry=Date.now()+60000;
 await p.write({'1':{epoch:f.t.epoch,send:{token:'public-original',expires:expiry},panel:{token:'public-original',expires:expiry,ref:'@original',hand:f.t.handNo,version:-1},retire:[]}});
 await p.sync(f.t);assert(f.requests.some(r=>r.method==='GET'));assert(f.requests.filter(r=>r.method==='PATCH').every(r=>r.body.embeds.length===0&&r.body.attachments.length===0));assert(!JSON.stringify(f.requests).includes('你的手牌'));assert.equal((await p.read())['1'],undefined);
 await p.write({'1':{epoch:f.t.epoch,panel:{token:'unknown',expires:expiry,ref:'@original',hand:f.t.handNo,version:-1},retire:[]}});ctx.mock.method(globalThis,'fetch',async()=>{throw Error('offline');});await p.sync(f.t);assert.equal((await p.read())['1'],undefined);
});

test('Gateway follows ordinary human and bot messages using only IDs; the new table message does not trigger a repost loop',async()=>{
 const calls=[],tasks=[],gateway=new DiscordGateway({env:{TABLES:{idFromName:n=>n,get:n=>({fetch:async(url,options)=>{calls.push({name:n,...JSON.parse(options.body)});return Response.json({ok:true});}})}},ctx:{waitUntil:p=>tasks.push(p),storage:{}}});gateway.botId='9';
 for(const [id,bot]of [['100',false],['101',true]])gateway.onGuildMessage({id,guild_id:'3',channel_id:'2',author:{id:bot?'9':'1',bot},content:'private text should not be forwarded',mentions:[]});await Promise.all(tasks);
 assert.equal(calls.length,2);assert(calls.every(c=>c.name==='table:3:2'&&c.op==='channelMessage'));assert(!JSON.stringify(calls).includes('private text'));
});

test('legacy private originals require the same Discord recipient; another user never receives the current hand',async ctx=>{
 const f=fixture(ctx),p=new PrivatePanels(f.db,f.env),expiry=Date.now()+60000,requests=[];
 ctx.mock.method(globalThis,'fetch',async(url,opts)=>{
   requests.push({method:opts.method,body:opts.body instanceof FormData?JSON.parse(opts.body.get('payload_json')):opts.body?JSON.parse(opts.body):null});
   return Response.json({id:'444',flags:64,interaction_metadata:{user:{id:'4'}},attachments:[]});
 });
 await p.write({'1':{epoch:f.t.epoch,panel:{token:'other-user',expires:expiry,ref:'@original',hand:f.t.handNo,version:-1},retire:[]}});await p.sync(f.t);
 assert.equal((await p.read())['1'],undefined);assert(requests.filter(r=>r.method==='PATCH').every(r=>r.body.embeds.length===0));assert(!JSON.stringify(requests).includes('你的手牌'));
 requests.length=0;await p.write({'4':{epoch:f.t.epoch,panel:{token:'right-user',expires:expiry,ref:'@original',hand:f.t.handNo,version:-1},retire:[]}});await p.sync(f.t);
 assert.equal((await p.read())['4'].panel.owner,'4');assert(requests.some(r=>r.method==='PATCH'&&r.body.embeds?.[0]?.title==='你的手牌 · 仅自己可见'));
});
