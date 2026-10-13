import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivatePanels} from './private-panels.mjs';
import * as game from './duel-roulette-model.mjs';
const storage=()=>{const map=new Map();return {map,async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},async delete(k){for(const x of Array.isArray(k)?k:[k])map.delete(x);}};};
test('roulette privately starts both panels, refreshes a continuing turn, alerts only the incoming player, and settles both',async tst=>{
 const st=storage(),env={BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'},p=new PrivatePanels(st,env),t=game.create('devil_roulette','1','2','3','甲');game.accept(t,'4','乙');
 t.turn=t.state.turnPlayerId='1';t.state.shells=[false,true,true,false,true,false];t.state.pointer=0;t.state.knownShells={'1':{1:true},'4':{}};
 for(const id of ['1','4'])await p.remember(t,{token:`roulette-secret-${id}`,member:{user:{id}},data:{}},{type:4,data:{flags:64}});
 const requests=[];let seq=100;const old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);globalThis.fetch=async(url,o)=>{requests.push({url,method:o.method,body:o.body?JSON.parse(o.body):null});return Response.json({id:String(++seq),flags:64});};
 await p.sync(t);let posts=requests.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/'));assert.equal(posts.length,2);
 assert(posts.find(r=>r.url.includes('secret-1')).body&&JSON.stringify(posts.find(r=>r.url.includes('secret-1')).body).includes('往后第 1 发是实弹'));
 assert(!JSON.stringify(posts.find(r=>r.url.includes('secret-4')).body).includes('往后第 1 发是实弹'));
 assert(posts.find(r=>r.url.includes('secret-1')).body.components.flatMap(r=>r.components).some(c=>c.label.includes('向对手开枪')));
 assert(!posts.find(r=>r.url.includes('secret-4')).body.components.flatMap(r=>r.components).some(c=>c.label.includes('向对手开枪')));
 game.shootOrItem(t,'1','shoot_self');t.version++;await p.sync(t);assert.equal(t.panelTurn,0);assert.equal(requests.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/')).length,2);
 game.shootOrItem(t,'1','shoot_opponent');t.version++;await new PrivatePanels(st,env).sync(t);posts=requests.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/'));assert.equal(posts.length,3);assert(posts.at(-1).url.includes('secret-4'));assert(posts.at(-1).body.content.includes('轮到你'));
 t.state.hp['1']=1;game.shootOrItem(t,'4','shoot_opponent');t.version++;await p.sync(t);
 posts=requests.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/'));assert.equal(posts.length,5);assert(posts.slice(-2).every(r=>r.body.content.includes('获胜')));
 const winner=posts.slice(-2).find(r=>r.url.includes('secret-4'));assert(winner.body.components.flatMap(r=>r.components).some(c=>c.custom_id.endsWith('p~4~mute')));
 const result=requests.filter(r=>r.method==='POST'&&r.url.includes('/channels/')&&r.body?.content?.includes('恶魔轮盘'));assert.equal(result.length,1);assert(result[0].body.content.includes('恶魔轮盘'));assert(!result[0].body.content.includes('往后第'));assert(result[0].body.enforce_nonce);
 assert(!requests.some(r=>r.method==='PATCH'&&r.url.includes('/webhooks/')&&r.url.endsWith('/@original')));
 assert(!JSON.stringify([...st.map]).includes('roulette-secret-'));
 const count=requests.length;await p.sync(t);assert.equal(requests.length,count);
});
test('roulette timeout from a legacy snapshot pushes the next player without leaking either private intel',async tst=>{
 const st=storage(),p=new PrivatePanels(st,{BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'}),t=game.create('devil_roulette','1','2','3','甲');game.accept(t,'4','乙');delete t.panelTurn;
 t.turn=t.state.turnPlayerId='1';t.state.shells=[false,true,false,true];t.state.pointer=0;
 for(const id of ['1','4'])await p.remember(t,{token:`timeout-${id}`,member:{user:{id}},data:{}},{type:4,data:{flags:64}});
 let seq=100;const sent=[];const old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);globalThis.fetch=async(url,o)=>{sent.push({url,method:o.method,body:o.body?JSON.parse(o.body):null});return Response.json({id:String(++seq)});};
 await p.sync(t);game.expire(t,t.deadline);t.version++;await p.sync(t);assert.equal(t.turn,'4');assert.equal(t.panelTurn,1);assert.equal(sent.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/')).length,3);assert(sent.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/')).at(-1).url.includes('timeout-4'));
});
test('duel automatically delivers both players each round, revealed results and winner-only adjudication, surviving restart',async tst=>{
 const st=storage(),env={BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'},p=new PrivatePanels(st,env),t=game.create('duel','1','2','3','甲');
 const requests=[];let seq=100;const old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,o={})=>{requests.push({url,method:o.method,body:o.body?JSON.parse(o.body):null});return Response.json({id:String(++seq),flags:64});};
 const remember=async(id)=>p.remember(t,{token:`secret-${id}`,member:{user:{id}},data:{}},{type:4,data:{content:'已记录',flags:64}});
 await remember('1');await p.sync(t);assert.equal(requests.length,0);
 game.accept(t,'4','乙');t.version++;await remember('4');await p.sync(t);
 let posts=requests.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/'));assert.equal(posts.length,2);
 for(const r of posts){assert.equal(r.body.flags,64);assert.equal(r.body.components[0].components.length,3);}
 assert(!JSON.stringify([...st.map]).includes('secret-'));assert(!JSON.stringify(t).includes('secret-'));
 game.choose(t,'1','rock',1);t.version++;await p.sync(t);assert(!requests.some(r=>r.url.includes('/channels/')));
 game.choose(t,'4','scissors',1);t.version++;
 const reboot=new PrivatePanels(st,env);await reboot.sync(t);
 posts=requests.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/'));assert.equal(posts.length,4);
 assert(posts.slice(-2).every(r=>r.body.content.includes('石头')&&r.body.content.includes('剪刀')&&r.body.content.includes('第 2 轮')));
 game.choose(t,'1','paper',2);game.choose(t,'4','rock',2);t.version++;await reboot.sync(t);
 posts=requests.filter(r=>r.method==='POST'&&r.url.includes('/webhooks/'));assert.equal(posts.length,6);
 const final=posts.slice(-2);assert(final.every(r=>r.body.content.includes('获胜')));
 assert.equal(final.find(r=>r.url.includes('secret-1')).body.components[0].components.length,2);
 assert.equal(final.find(r=>r.url.includes('secret-4')).body.components.length,0);
 const publicPosts=requests.filter(r=>r.method==='POST'&&r.url.includes('/channels/'));assert.equal(publicPosts.length,2);assert(publicPosts.every(r=>r.body.enforce_nonce));
 const count=requests.length;await reboot.sync(t);assert.equal(requests.length,count);
});
test('ambiguous private delivery failures never duplicate a followup and public results use bounded idempotent retries',async tst=>{
 const st=storage(),p=new PrivatePanels(st,{BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'}),t=game.create('duel','1','2','3','甲');game.accept(t,'4','乙');
 await p.remember(t,{token:'private-token',member:{user:{id:'1'}},data:{}},{type:4,data:{flags:64}});
 let privatePosts=0,publicPosts=0;const old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);globalThis.fetch=async(url)=>{if(url.includes('/webhooks/'))privatePosts++;else publicPosts++;throw Error('timeout');};
 await p.sync(t);await p.sync(t);assert.equal(privatePosts,1);
 game.choose(t,'1','rock',1);game.choose(t,'4','paper',1);
 for(let n=0;n<5;n++)await p.sync(t);assert.equal(publicPosts,3);assert.equal(privatePosts,2);
});
test('both-player timeout delivers cancellation with no punishment controls',async tst=>{
 const st=storage(),p=new PrivatePanels(st,{BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'}),t=game.create('duel','1','2','3','甲');game.accept(t,'4','乙');
 for(const id of ['1','4'])await p.remember(t,{token:`token-${id}`,member:{user:{id}},data:{}},{type:4,data:{flags:64}});
 game.expire(t,t.deadline);const old=globalThis.fetch;tst.after(()=>globalThis.fetch=old);const sent=[];globalThis.fetch=async(url,o)=>{sent.push(JSON.parse(o.body));return Response.json({id:'100'});};
 await p.sync(t);assert(sent.every(m=>m.content.includes('取消')));assert(sent.filter(m=>m.flags===64).every(m=>m.components.length===0));assert(!t.penalty);
});
