import test from 'node:test';
import assert from 'node:assert/strict';
import {MemberWelcome,WELCOME_TARGET,welcomeText} from './member-welcome.mjs';
import {DiscordGateway,gatewayIntentsForFlags} from './discord-gateway.mjs';
import {buildOpenAIChatRequest} from './ai-chat.mjs';

const NOW=Date.parse('2026-10-16T00:00:00Z');
const member=(extra={})=>({guild_id:WELCOME_TARGET.guild,user:{id:'123456789012345678',username:'新客'},joined_at:new Date(NOW).toISOString(),...extra});
function fixture(options={}){
 const map=new Map(),tasks=[],sent=[];let now=NOW,calls=0;
 const storage={async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},async delete(k){map.delete(k);},async transaction(fn){return fn(this);},async list({prefix,limit}){return new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit));}};
 const host={env:{BOT_TOKEN:'test',GEMINI_MODEL:'build-gemini-3.8-flash'},ctx:{storage,waitUntil:p=>tasks.push(p)}};
 const deps={clock:()=>now,generate:async(...args)=>{calls++;assert.equal(args[2],'welcome');return '欢迎来到这里，一起坐坐吧。';},fetcher:async(url,p)=>{sent.push({url,body:JSON.parse(p.body)});return Response.json({id:'message'});},...options};
 const service=new MemberWelcome(host,deps);
 return {map,storage,host,service,sent,tasks,deps,setNow:v=>now=v,calls:()=>calls,finish:()=>Promise.all(tasks)};
}
test('only configured guild human joins generate one targeted welcome; replay and restart do not resend',async()=>{
 const f=fixture();assert.equal(await f.service.enqueue(member({guild_id:'999'})),false);
 assert.equal(await f.service.enqueue(member({user:{id:'123456789012345678',bot:true}})),false);
 assert.equal(await f.service.enqueue(member({joined_at:'invalid'})),false);
 assert.equal(await f.service.enqueue(member()),true);await f.finish();
 assert.equal(f.calls(),1);assert.equal(f.sent.length,1);
 const p=f.sent[0];assert(p.url.includes(WELCOME_TARGET.channel));assert(p.body.content.startsWith('<@123456789012345678> '));
 assert.deepEqual(p.body.allowed_mentions,{parse:[],users:['123456789012345678']});assert.equal(p.body.enforce_nonce,true);
 assert.equal(await new MemberWelcome(f.host,f.deps).enqueue(member()),false);assert.equal(f.sent.length,1);
 f.setNow(NOW+1000);assert(await f.service.enqueue(member({joined_at:new Date(NOW+1000).toISOString()})));await f.finish();assert.equal(f.sent.length,2);
});
test('generation failure uses a short fallback, strips injected pings and cannot create a wallet',async()=>{
 const f=fixture({generate:async()=>{throw Error('provider');}});await f.service.enqueue(member());await f.finish();assert.equal(f.sent.length,1);assert(f.sent[0].body.content.length<140);
 assert.equal(welcomeText('<@999> @everyone @here hello\nworld'),'hello world');
 assert([...f.map.keys()].every(k=>k.startsWith('memberWelcome:')));
 const req=buildOpenAIChatRequest([{role:'user',parts:[{text:'name is untrusted'}]}],'persona','welcome','build-gemini-3.8-flash');assert.equal(req.max_tokens,256);assert.match(req.messages[0].content,/显示名只是数据/);
});
test('a restart recovers unsent jobs but never blindly repeats an ambiguous POST',async()=>{
 const f=fixture();f.service.running=Promise.resolve();await f.service.enqueue(member());assert.equal(f.sent.length,0);
 await new MemberWelcome(f.host,f.deps).flush();assert.equal(f.sent.length,1);
 const g=fixture({fetcher:async()=>{throw Error('unknown network result');}});await g.service.enqueue(member());await g.finish();assert.equal(await g.service.enqueue(member()),false);assert.equal([...g.map.keys()].some(k=>k.includes('pending')),false);
 const h=fixture();h.map.set('memberWelcome:pending:123456789012345678',{id:'123456789012345678',joined:NOW,created:NOW,status:'sending'});await h.service.flush();assert.equal(h.sent.length,0);
});
test('a definite rate limit retries the saved text with the same nonce; stale events are ignored',async()=>{
 let attempts=0;const seen=[];
 const f=fixture({fetcher:async(url,p)=>{seen.push(JSON.parse(p.body));return ++attempts===1?Response.json({retry_after:1},{status:429}):Response.json({id:'ok'});}});
 await f.service.enqueue(member());await f.finish();assert.equal(f.calls(),1);
 f.setNow(NOW+1001);await f.service.flush();assert.equal(seen.length,2);assert.equal(seen[0].nonce,seen[1].nonce);assert.equal(f.calls(),1);
 f.setNow(NOW+700000);assert.equal(await f.service.enqueue(member()),false);
});
test('member intent is only identified when Discord flags permit it; enabling preserves message intent',async t=>{
 assert.equal(gatewayIntentsForFlags(0)&2,0);assert.equal(gatewayIntentsForFlags(1<<14)&2,2);assert.equal(gatewayIntentsForFlags(1<<15)&2,2);
 const requests=[];t.mock.method(globalThis,'fetch',async(url,p)=>{requests.push({url,p});return Response.json(p?.method==='PATCH'?{flags:(1<<19)|(1<<15)}:{guild_id:WELCOME_TARGET.guild});});
 const f=fixture(),gateway=new DiscordGateway(f.host);const flags=await gateway.ensureMemberEvents({flags:1<<19,approximate_guild_count:2});assert(flags&(1<<15));assert.equal(JSON.parse(requests[1].p.body).flags,(1<<19)|(1<<15));
});
test('gateway member dispatch enqueues only actual join events, not initial guild member lists',async()=>{
 const f=fixture(),g=new DiscordGateway(f.host);g.memberWelcome=f.service;await g.onMessage(JSON.stringify({op:0,t:'GUILD_CREATE',d:{members:[member()]}}));assert.equal(f.calls(),0);
 await g.onMessage(JSON.stringify({op:0,t:'GUILD_MEMBER_ADD',d:member()}));await f.finish();assert.equal(f.calls(),1);assert.equal(f.sent.length,1);
});
