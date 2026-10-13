import test from 'node:test';
import assert from 'node:assert/strict';
import {CityService} from './city-service.mjs';
import {canView,canManage,cityData,cityCommand,cityChatContext} from './city-ui.mjs';
import {makeSystemInstruction,replyToMention} from './ai-chat.mjs';
function storage(){
 const map=new Map();let pending=Promise.resolve();
 const s={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),list:async o=>new Map([...map].filter(([k])=>k.startsWith(o.prefix)&&(!o.startAfter||k>o.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,o.limit))};
 s.transaction=fn=>{const next=pending.then(()=>fn(s));pending=next.catch(()=>{});return next;};return s;
}
const p={channelId:'10',name:'酒馆',street:'河西街',kind:'tavern',description:'现场资料'};
test('city positions survive service recreation; private threads and main scene are isolated',async()=>{
 const s=storage(),a=new CityService(s);await a.bind(p);
 await a.context({channel:'10',user:'1',message:{id:'100',name:'A',content:'大厅消息'}});
 await a.context({channel:'11',parent:'10',user:'1',message:{id:'101',name:'A',content:'包间消息'}});
 const b=new CityService(s);assert.equal((await b.position('1')).sceneId,'11');
 assert.equal((await b.context({channel:'10',user:'2'})).recent[0].content,'大厅消息');
 assert.equal((await b.context({channel:'11',parent:'10',user:'2'})).recent[0].content,'包间消息');
 assert.equal(await b.context({channel:'99',user:'1'}),null);
 await b.leave('1');assert.equal(await b.position('1'),null);
});
test('scene transcript deduplicates, bounds history and expires after 24 hours',async()=>{
 const a=new CityService(storage());await a.bind(p);const now=Date.now();
 await Promise.all(Array.from({length:22},(_,n)=>a.context({channel:'10',user:'1',message:{id:String(100+n),name:'A',content:String(n)},now:now+n})));
 const prior=await a.context({channel:'10',user:'1',now:now+100});assert.equal(prior.recent.length,12);assert.equal(prior.recent.at(-1).content,'21');
 await a.context({channel:'10',user:'1',message:{id:'121',content:'重复'},now:now+101});
 assert.equal((await a.context({channel:'10',user:'1',now:now+102})).recent.at(-1).content,'21');
 assert.equal((await a.context({channel:'10',user:'1',now:now+86401000})).recent.length,0);
 assert.equal((await a.position('1',now+86401000+1800001)).status,'away');
});
test('user erasure removes their scene messages and replies while preserving another user',async()=>{
 const s=storage(),a=new CityService(s);await a.bind(p);
 for(const user of ['1','2']){await a.context({channel:'11',parent:'10',user,message:{id:user,content:'问答'}});await a.recordReply({channel:'11',placeId:'10',messageId:user,user,content:'回复'});}
 await a.clear({user:'1'});const rows=(await a.context({channel:'11',parent:'10',user:'2'})).recent;assert.equal(rows.length,2);assert.equal(rows[0].speakerId,'2');assert.equal(rows[1].replyTo,'2');
 await a.unbind('10');await a.clear({placeId:'10'});assert.equal(await a.position('2'),null);await a.bind(p);assert.equal((await a.context({channel:'11',parent:'10',user:'2'})).recent.length,0);
});
test('permissions apply everyone, combined role overwrites, member overrides and admin',()=>{
 const roles=[{id:'3',permissions:'1024'},{id:'4',permissions:'0'}],m={roles:['4'],user:{id:'1'}};
 assert.equal(canView({permission_overwrites:[]},'3',m,roles),true);
 const c={permission_overwrites:[{id:'3',type:0,deny:'1024',allow:'0'}]};assert.equal(canView(c,'3',m,roles),false);
 c.permission_overwrites.push({id:'4',type:0,deny:'0',allow:'1024'});assert.equal(canView(c,'3',m,roles),true);
 c.permission_overwrites.push({id:'1',type:1,deny:'1024',allow:'0'});assert.equal(canView(c,'3',m,roles),false);
 assert.equal(canView(c,'3',m,[...roles,{id:'4',permissions:'8'}]),true);
 assert.equal(canManage({permissions:'32'}),true);assert.equal(canManage({permissions:'16'}),false);
});
function fixture(){
 const service=new CityService(storage());const env={BOT_TOKEN:'secret',TABLES:{idFromName:n=>n,get:()=>({fetch:async(url,init)=>{const q=JSON.parse(init.body);if(q.op!=='city')return Response.json({});const x=q.action==='config'?await service.config():q.action==='context'?await service.context(q):q.action==='position'?await service.position(q.user):q.action==='bind'?await service.bind(q.place):q.action==='recordReply'?await service.recordReply(q):null;return Response.json(x);}})}};
 const i={guild_id:'3',channel_id:'10',member:{user:{id:'1'},permissions:'0',roles:[]},data:{name:'城市',options:[{name:'地图'}]}};
 return {service,env,i};
}
test('city map hides forbidden channels and destination entry cannot bypass permissions',async()=>{
 const {service,env,i}=fixture();await service.bind(p);await service.bind({...p,channelId:'20',name:'秘密店铺'});
 const old=globalThis.fetch;globalThis.fetch=async url=>Response.json(url.endsWith('/roles')?[{id:'3',permissions:'1024'}]:url.endsWith('/channels')?[{id:'10',permission_overwrites:[]},{id:'20',permission_overwrites:[{id:'3',type:0,deny:'1024'}]}]:{owner_id:'99'});
 try{const d=await cityData(env,i);assert.equal(d.flags,64);assert(JSON.stringify(d).includes('酒馆'));assert(!JSON.stringify(d).includes('秘密'));
 i.data.options=[{name:'进入',options:[{name:'频道',value:'20'}]}];await assert.rejects(cityData(env,i),/无权/);assert.equal(await service.position('1'),null);
 i.data.options=[{name:'绑定',options:[]}];await assert.rejects(cityData(env,i),/管理服务器/);
 }finally{globalThis.fetch=old;}
});
test('map pagination stays within Discord total embed length and includes all pages',async()=>{
 const {service,env,i}=fixture();for(let n=0;n<45;n++)await service.bind({...p,channelId:String(100+n),name:'长地点'.repeat(25),street:'长街道'.repeat(25)});
 const old=globalThis.fetch;globalThis.fetch=async url=>Response.json(url.endsWith('/roles')?[{id:'3',permissions:'1024'}]:url.endsWith('/channels')?Array.from({length:45},(_,n)=>({id:String(100+n),permission_overwrites:[]})):{owner_id:'99'});
 try{for(let page=1;page<=3;page++){i.data.options=[{name:'地图',options:[{name:'页码',value:page}]}];const d=await cityData(env,i);assert(d.embeds.reduce((n,e)=>n+e.description.length,0)<6000);assert(d.embeds.length<=10);assert(d.embeds[0].description.includes(`${page}/3页`));}}
 finally{globalThis.fetch=old;}
});
test('scene context resolves thread parent, updates position but does not save chat before memory settings',async()=>{
 const {service,env}=fixture();await service.bind(p);const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'11',parent_id:'10',guild_id:'3',type:12});
 try{const c=await cityChatContext(env,{guild_id:'3',channel_id:'11',author:{id:'1',username:'A'},id:'100',content:'不应提前保存'});assert(c.scene.thread);assert.equal(c.recent.length,0);assert.equal((await service.context({channel:'11',parent:'10',user:'1'})).recent.length,0);}
 finally{globalThis.fetch=old;}
});
test('city changes scene instruction without replacing persona or pretending shops are implemented',()=>{
 const s=makeSystemInstruction('原有人设','chat',[],'','',{city:{place:{name:'花店'}}});assert(s.includes('程序提供的city.place'));assert(s.includes('原有人设'));assert(s.includes('未实现的新店业务'));assert(!s.includes('默认模拟发生在小酒馆'));
 assert.equal(cityCommand.options.length,10);
});

test('actual city chat excludes global personal history, stays local and honors memory off',async()=>{
 const {service,env}=fixture();await service.bind({...p,kind:'shop'});let enabled=1;const writes=[],requests=[];
 const db={prepare(sql){return {args:[],bind(...a){this.args=a;return this;},async first(){return sql.includes('ai_member_settings')?{memory_enabled:enabled}:null;},async all(){return {results:sql.includes('FROM ai_chat_history')?[{user_id:'1',role:'user',content:'跨频道旧秘密'}]:[]};},async run(){writes.push(sql);return {meta:{changes:1}};}};},async batch(qs){for(const q of qs)await q.run();}};
 Object.assign(env,{CHAT_DB:db,GEMINI_API_KEY:'test',GEMINI_API_BASE_URL:'https://example.test/v1',AI_REQUEST_LOG_ENABLED:'false'});
 const old=globalThis.fetch;globalThis.fetch=async(url,o)=>{if(url.includes('example.test')){requests.push(JSON.parse(o.body));return Response.json({choices:[{message:{content:'你好。'}}]});}return Response.json({});};
 try{
  await replyToMention(env,{id:'500',guild_id:'3',channel_id:'10',author:{id:'1',username:'A'},content:'<@9> 你好'},'9');
  assert.equal(requests.length,1);assert(!JSON.stringify(requests[0]).includes('跨频道旧秘密'));assert(JSON.stringify(requests[0]).includes('city.place'));
  assert(!writes.some(sql=>sql.includes('INSERT INTO ai_chat_history')));assert.equal((await service.context({channel:'10',user:'1'})).recent.length,2);
  enabled=0;
  await replyToMention(env,{id:'501',guild_id:'3',channel_id:'10',author:{id:'1',username:'A'},content:'<@9> 本轮不保存'},'9');
  assert.equal((await service.context({channel:'10',user:'1'})).recent.length,2);assert(!JSON.stringify(requests.at(-1)).includes('跨频道旧秘密'));
 }finally{globalThis.fetch=old;}
});
