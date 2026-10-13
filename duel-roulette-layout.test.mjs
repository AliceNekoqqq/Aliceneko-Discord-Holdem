import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from './duel-roulette-model.mjs';
import {panel,key} from './duel-roulette-ui.mjs';
import {PrivatePanels} from './private-panels.mjs';
import {DuelRouletteController} from './duel-roulette-controller.mjs';
import {RouletteShotMessages} from './roulette-shot-messages.mjs';
const storage=()=>{const map=new Map();return {map,async get(k){return structuredClone(map.get(k));},async put(k,v){if(typeof k==='object')for(const [a,b]of Object.entries(k))map.set(a,structuredClone(b));else map.set(k,structuredClone(v));},async delete(k){for(const x of Array.isArray(k)?k:[k])map.delete(x);}};};
const started=()=>{const t=game.create('devil_roulette','1','2','3','甲');game.accept(t,'4','乙');t.turn=t.state.turnPlayerId='1';t.state.shells=[false,false,true,true,false,true];t.state.pointer=0;t.messageId='900';return t;};
test('compact roulette panel separates combat fields from optional item explanations',()=>{
 const t=started();t.state.hp['1']=2;t.state.items['1']=['medicine','adrenaline','inverter'];t.state.knownShells['4']={4:false};
 const p=panel(t,'1'),details=panel(t,'1','',true);assert(p.content.length<80);assert.equal(p.embeds.length,1);
 assert(p.embeds[0].fields.some(f=>f.name==='你的生命'));assert(p.embeds[0].fields.some(f=>f.name==='弹巢'));assert(p.embeds[0].fields.some(f=>f.name==='你的情报'));
 assert(!JSON.stringify(p).includes('40%'));assert(JSON.stringify(details).includes('40%'));assert(!JSON.stringify(p).includes('往后第 4 发'));assert(!JSON.stringify(details).includes('往后第 4 发'));
 assert(p.components.flatMap(r=>r.components).some(c=>c.label==='道具详情'));assert(details.components[0].components[0].label.includes('返回'));
 for(const data of [p,details]){assert.equal(data.flags,64);assert(data.components.length<=5);assert(JSON.stringify(data.embeds).length<6000);for(const r of data.components)assert(r.components.length<=5);}
});
test('item details validates owner and never consumes an item or changes the round',async()=>{
 const st=storage(),t=started(),c=new DuelRouletteController({ctx:{storage:st},env:{BOT_TOKEN:'test'},boards:{async queue(){}},async armAlarm(){}}),before=structuredClone(t);
 const i={id:'details',type:3,member:{user:{id:'1'}},message:{id:'101',flags:64},data:{custom_id:key(t,'p~1~details')}};
 const r=await (await c.dispatch({interaction:i},t)).json();assert.equal(r.type,7);assert(r.data.embeds[0].title.includes('道具说明'));assert.deepEqual(t,before);
 const bad=await (await c.dispatch({interaction:{...i,member:{user:{id:'4'}}}},t)).json();assert(bad.data.content.includes('自己的'));assert(!JSON.stringify(bad).includes('你的情报'));
});
test('details survives background refresh, while returning or starting a new turn restores action view',async tst=>{
 const st=storage(),env={BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'},p=new PrivatePanels(st,env),t=started(),old=globalThis.fetch,calls=[];let n=100;tst.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,o)=>{calls.push({method:o.method,body:o.body?JSON.parse(o.body):null});return Response.json({id:String(++n)});};
 await p.remember(t,{token:'start',member:{user:{id:'1'}},data:{}},{type:4,data:{flags:64}});await p.sync(t);
 const i={token:'detail',type:3,member:{user:{id:'1'}},message:{id:'101',flags:64},data:{custom_id:key(t,'p~1~details')}};
 await p.remember(t,i,{type:7,data:panel(t,'1','',true)});t.version++;await p.sync(t);assert(calls.at(-1).body.embeds[0].title.includes('道具说明'));
 await p.remember(t,{...i,data:{custom_id:key(t,'p~1~panel')}},{type:7,data:panel(t,'1')});assert.equal((await p.read())['1'].view,'panel');
});
test('standalone shot receipts persist during same-player continuation, then delete on turn change or new game',async tst=>{
 const st=storage(),t=started(),out=new RouletteShotMessages(st,{BOT_TOKEN:'test'}),calls=[],old=globalThis.fetch;let seq=100;tst.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,o)=>{calls.push({url,method:o.method,body:o.body?JSON.parse(o.body):null});return o.method==='DELETE'?new Response(null,{status:204}):Response.json({id:String(++seq)});};
 game.shootOrItem(t,'1','shoot_self');await out.sync(t);const first=calls[0];assert.equal(first.body.embeds[0].title,'🔫 开枪结果');assert(first.body.embeds[0].description.includes('空弹'));assert(first.body.enforce_nonce);assert(!JSON.stringify(first.body).includes('knownShells'));
 await new RouletteShotMessages(st,{BOT_TOKEN:'test'}).sync(t);assert.equal(calls.length,1);
 game.shootOrItem(t,'1','shoot_self');await out.sync(t);assert.equal(calls.filter(x=>x.method==='POST').length,2);assert.equal(calls.filter(x=>x.method==='DELETE').length,0);
 game.shootOrItem(t,'1','shoot_opponent');await out.sync(t);assert.equal(calls.filter(x=>x.method==='DELETE').length,2);assert.equal(calls.filter(x=>x.method==='POST').length,3);assert(calls.filter(x=>x.method==='POST').at(-1).body.embeds[0].description.includes('实弹'));
 assert(!calls.some(x=>x.method==='DELETE'&&x.url.endsWith('/900')));
 await out.sync(game.create('devil_roulette','1','2','3','甲'));assert.equal(calls.filter(x=>x.method==='DELETE').length,3);
});
test('reload and automatic shots use the same transient-message cleanup path',async tst=>{
 const st=storage(),t=started(),out=new RouletteShotMessages(st,{BOT_TOKEN:'test'}),calls=[],old=globalThis.fetch;let seq=100;tst.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,o)=>{calls.push({method:o.method,body:o.body?JSON.parse(o.body):null});return o.method==='DELETE'?new Response(null,{status:204}):Response.json({id:String(++seq)});};
 t.state.shells=[false,false];game.shootOrItem(t,'1','shoot_self');await out.sync(t);game.shootOrItem(t,'1','shoot_self');await out.sync(t);assert.equal(calls.filter(x=>x.method==='DELETE').length,1);assert(t.panelTurn>0);
 game.expire(t,t.deadline);await out.sync(t);assert(calls.filter(x=>x.method==='POST').at(-1).body.embeds[0].title.includes('自动开枪'));
});
test('uncertain shot POST uses one nonce and recovers its ID for cleanup after a turn change',async tst=>{
 const st=storage(),t=started(),out=new RouletteShotMessages(st,{BOT_TOKEN:'test'}),old=globalThis.fetch,nonces=[];let first=true,deleted=0;tst.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,o)=>{if(o.method==='DELETE'){deleted++;return new Response(null,{status:204});}const b=JSON.parse(o.body);nonces.push(b.nonce);if(first){first=false;throw Error('response lost after sending');}return Response.json({id:'101'});};
 game.shootOrItem(t,'1','shoot_self');assert(await out.sync(t));t.panelTurn++;
 const jobs=await st.get('rouletteShotMessages');for(const j of Object.values(jobs))j.retryAt=Date.now()-1;await st.put('rouletteShotMessages',jobs);await out.sync(t);
 assert.equal(nonces.length,2);assert.equal(new Set(nonces).size,1);assert.equal(deleted,1);await out.sync(t);assert.equal(deleted,1);
});
test('shot cleanup handles already-deleted messages and bounds repeated API failures',async tst=>{
 const st=storage(),t=started(),out=new RouletteShotMessages(st,{BOT_TOKEN:'test'}),old=globalThis.fetch;let deletes=0;tst.after(()=>globalThis.fetch=old);
 globalThis.fetch=async()=>Response.json({id:'101'});game.shootOrItem(t,'1','shoot_self');await out.sync(t);t.panelTurn++;
 globalThis.fetch=async()=>{deletes++;return new Response('{}',{status:500});};
 for(let n=0;n<6;n++){const jobs=await st.get('rouletteShotMessages');for(const j of Object.values(jobs))j.retryAt=Date.now()-1;await st.put('rouletteShotMessages',jobs);await out.sync(t);}assert.equal(deletes,3);
 const jobs=await st.get('rouletteShotMessages');for(const j of Object.values(jobs)){j.deleteAttempts=0;j.retryAt=0;}await st.put('rouletteShotMessages',jobs);
 globalThis.fetch=async()=>new Response('{}',{status:404});await out.sync(t);assert(Object.values(await st.get('rouletteShotMessages')).every(j=>j.deleted));
});
