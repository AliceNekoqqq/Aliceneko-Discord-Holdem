import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('./worker.mjs',import.meta.url),'utf8');
const source=raw.replace("import { DurableObject } from 'cloudflare:workers';","class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}").replace(/from '(\.\/[^']+)'/g,(_,p)=>`from ${JSON.stringify(new URL(p,import.meta.url).href)}`);
const {default:worker,PokerTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function context(){
 const db=new DatabaseSync(':memory:'),map=new Map(),tasks=[];let queue=Promise.resolve();
 const storage={sql:{exec(q,...args){const st=db.prepare(q);if(st.columns().length){const rows=st.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}st.run(...args);return {toArray:()=>[]};}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));},delete:async k=>map.delete(k),setAlarm:async n=>map.set('alarm',n),deleteAlarm:async()=>map.delete('alarm'),transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,map,storage,tasks,blockConcurrencyWhile(fn){const p=queue.then(fn);queue=p.catch(()=>{});return p;},waitUntil:p=>tasks.push(p)};
}
async function setup(t){
 const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const env={DISCORD_APPLICATION_ID:'123',DISCORD_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex'),BOT_TOKEN:'fake-test-token'},instances=new Map(),posts=[];
 env.TABLES={idFromName:n=>n,get:n=>{if(!instances.has(n)){const ctx=context();instances.set(n,{ctx,object:new PokerTable(ctx,env)});}return {fetch:(url,options)=>instances.get(n).object.fetch(new Request(url,options))};}};
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{posts.push({url:String(url),method:options?.method,data:options?.body?JSON.parse(options.body):null});return Response.json({id:'99'});};t.after(()=>{
  globalThis.fetch=original;
  for(const post of posts){const ids=(post.data?.components||[]).flatMap(r=>r.components||[]).map(c=>c.custom_id).filter(Boolean);assert.equal(new Set(ids).size,ids.length,'outgoing Discord message has duplicate custom_id');}
 });
 let serial=0;
 const call=async(extra={},repeatId)=>{
  const i={type:3,application_id:'123',guild_id:'3',channel_id:'2',id:repeatId||String(++serial),token:'transient-test-token',member:{user:{id:'1',username:'Alice'}},message:{id:'55',flags:64},...extra};
  const body=JSON.stringify(i),ts=String(Math.floor(Date.now()/1000)),sig=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(ts+body))).toString('hex'),ctx=context(),before=posts.length;
  const response=await worker.fetch(new Request('https://example/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':sig,'X-Signature-Timestamp':ts}}),env,ctx);await Promise.all(ctx.tasks);
  return {reply:await response.json(),patched:posts.slice(before).filter(p=>p.method==='PATCH').at(-1)?.data,i};
 };
 const action=(a,guild='3')=>({guild_id:guild,data:{custom_id:`p:${guild}:1:${a}`}});
 const adopt=async(guild='3',species='lamp-cat')=>call({...action(`save~${species}`,guild),type:5,data:{custom_id:`p:${guild}:1:save~${species}`,components:[{components:[{custom_id:'petName',value:'灯灯'}]}]}});
 return {env,instances,posts,call,action,adopt};
}
test('signed public entry, private naming, single pet across servers, and no public wallet leak',async t=>{
 const s=await setup(t);
 const opened=await s.call({message:{id:'10',flags:0},data:{custom_id:'t:3:any:lobbyPet'}});
 assert.deepEqual(opened.reply,{type:5,data:{flags:64}});assert(opened.patched.content.includes('领养'));assert(!opened.patched.content.includes('余额'));
 const privateState=s.instances.get('tavern:3').object.tavern;assert.equal(privateState.rows('SELECT * FROM tavern_members').length,0);
 const modal=await s.call(s.action('name~lamp-cat'));assert.equal(modal.reply.type,9);
 const first=await s.adopt();assert.equal(first.reply.data.flags,64);assert(first.patched.content.includes('灯灯'));assert.equal(privateState.pets.profile('1').species,'lamp-cat');
 const again=await s.adopt();assert(again.patched.content.includes('只能领养一只'));assert.equal(privateState.rows("SELECT * FROM tavern_ledger WHERE kind='welcome'").length,1);
 const other=await s.adopt('4','moss-dog');assert(other.patched.content.includes('另一家酒馆')||other.patched.content.includes('服务器'));assert(!s.instances.has('tavern:4'));
 const foreign=await s.call({data:{custom_id:'p:3:2:start'}});assert.equal(foreign.reply.type,4);assert.equal(foreign.reply.data.flags,64);
 const publicAction=await s.call({...s.action('start'),message:{id:'10',flags:0}});assert.equal(publicAction.reply.type,4);assert(publicAction.reply.data.content.includes('私密'));
 for(const p of s.posts){assert(p.url.includes('/webhooks/'));assert.equal(p.method,'PATCH');assert.deepEqual(p.data.allowed_mentions,{parse:[]});assert(!JSON.stringify(p.data).includes('fake-test-token'));}
});
test('signed walks use saved versions, finish once, and the UI resumes after a lost update or instance restart',async t=>{
 const s=await setup(t);await s.adopt();const started=await s.call({...s.action('startMaterial'),data:{custom_id:'p:3:1:startMaterial',values:['metal']}});assert.equal(started.reply.type,6);
 const instance=s.instances.get('tavern:3');let view=instance.object.tavern.pets.view('1');assert(view.walk);
 const initial=view.walk,selected=view.walkView.choices.find(c=>!c.disabled),oldAction=`act~${initial.id}~${initial.version}~${selected.id}`;
 const first=await s.call(s.action(oldAction));assert.equal(first.reply.type,6);
 const stale=await s.call(s.action(oldAction));assert(stale.patched.content.includes('路线已经变化'));
 const plan=['alley-paper','bakery-friend','drain-smell','fork-neighbor','porch-friend'];
 while((view=instance.object.tavern.pets.view('1')).walk){const choice=view.walkView.choices.find(c=>c.id===plan[view.walk.step]&&!c.disabled)||view.walkView.choices.find(c=>!c.disabled);await s.call(s.action(`act~${view.walk.id}~${view.walk.version}~${choice.id}`));}
 assert.equal(instance.object.tavern.rows("SELECT * FROM tavern_ledger WHERE kind='pet'").length,1);
 s.instances.set('tavern:3',{ctx:instance.ctx,object:new PokerTable(instance.ctx,s.env)});
 const resumed=await s.call(s.action('view'));assert(resumed.patched.content.includes('结算'));assert(s.instances.get('tavern:3').object.tavern.pets.view('1').receipt);
 assert(!JSON.stringify([...instance.ctx.map]).includes('transient-test-token'));
});

test('signed rabbit and otter adoption, stable coat changes, and material purchase confirmations',async t=>{
 const s=await setup(t);
 const submit=async(user,species,coat)=>s.call({type:5,member:{user:{id:user,username:`User${user}`}},data:{custom_id:`p:3:${user}:save~${species}~${coat}`,components:[{components:[{custom_id:'petName',value:species==='dusk-rabbit'?'暮暮':'河河'}]}]}});
 const rabbit=await submit('1','dusk-rabbit','moon');assert.equal(rabbit.reply.data.flags,64);
 const instance=s.instances.get('tavern:3').object.tavern,profile=()=>instance.pets.profile('1'),view=()=>instance.pets.view('1');
 assert.equal(profile().species,'dusk-rabbit');assert.equal(profile().coat,'moon');
 assert.equal(rabbit.patched.embeds[0].image.url,'https://discord-holdem.aliceneko.workers.dev/art/pets/dusk-rabbit/moon/v2.jpg');
 const beforePreview=profile().version;
 const preview=await s.call(s.action('coatPreview~peach'));assert.equal(preview.reply.type,6);assert.equal(profile().coat,'moon');assert.equal(profile().version,beforePreview);
 assert.equal(preview.patched.embeds[0].image.url,'https://discord-holdem.aliceneko.workers.dev/art/pets/dusk-rabbit/peach/v2.jpg');
 const confirmed=await s.call(s.action('setCoat~peach'));assert.equal(profile().coat,'peach');assert(confirmed.patched.content.includes('蜜桃侏儒立耳型'));
 const randomPreviewVersion=profile().version,randomPreview=await s.call(s.action('coatRandomPreview'));
 assert.match(randomPreview.patched.content,/确认后免费更换/);assert.equal(profile().version,randomPreviewVersion);
 const randomId='repeat-random-coat-confirm';await s.call(s.action('setCoat~random'),'repeat-random-coat-confirm');
 const randomized=profile().coat,versionAfterRandom=profile().version;assert(['lavender','peach','moon'].includes(randomized));
 await s.call(s.action('setCoat~random'),randomId);assert.equal(profile().coat,randomized);assert.equal(profile().version,versionAfterRandom);

 const balanceBeforeGather=view().balance;
 await s.call({...s.action('gatherMaterial'),data:{custom_id:'p:3:1:gatherMaterial',values:['flower']}});
 assert.equal(view().materials.flower,1);assert.equal(view().materialBudget.gathered,1);assert.equal(view().balance,balanceBeforeGather);
 const balanceBeforePreview=view().balance,clothBeforePreview=view().materials.cloth||0,boughtBeforePreview=view().materialBudget.bought;
 const materialPreview=await s.call(s.action('materialBuyPreview~cloth'));
 assert.match(materialPreview.patched.content,/尚未扣款/);assert.equal(view().balance,balanceBeforePreview);assert.equal(view().materials.cloth||0,clothBeforePreview);assert.equal(view().materialBudget.bought,boughtBeforePreview);
 const purchase=await s.call(s.action('materialBuy~cloth~6~2~materials-v1'));
 assert.equal(view().balance,balanceBeforePreview-6);assert.equal(view().materials.cloth,clothBeforePreview+2);assert.equal(view().materialBudget.bought,boughtBeforePreview+2);assert.match(purchase.patched.content,/购买结果|酒馆币购入/);
 const afterPurchase={balance:view().balance,cloth:view().materials.cloth,bought:view().materialBudget.bought};
 const stale=await s.call(s.action('materialBuy~cloth~5~2~materials-v1'));assert.match(stale.patched.content,/材料铺预览已失效|预览已变化/);
 assert.equal(view().balance,afterPurchase.balance);assert.equal(view().materials.cloth,afterPurchase.cloth);assert.equal(view().materialBudget.bought,afterPurchase.bought);

 const wrongOwner=await s.call({member:{user:{id:'2',username:'Other'}},data:{custom_id:'p:3:1:gatherMaterial',values:['metal']}});
 assert.equal(wrongOwner.reply.type,4);assert.equal(wrongOwner.reply.data.flags,64);assert.equal(view().materials.metal||0,0);
 const publicAction=await s.call({...s.action('materials'),message:{id:'55',flags:0}});
 assert.equal(publicAction.reply.type,4);assert.equal(publicAction.reply.data.flags,64);assert.equal(view().materialBudget.gathered,1);

 const otter=await submit('2','river-otter','honey');const otterProfile=instance.pets.profile('2');
 assert.equal(otterProfile.species,'river-otter');assert.equal(otterProfile.coat,'honey');
 assert.equal(otter.patched.embeds[0].image.url,'https://discord-holdem.aliceneko.workers.dev/art/pets/river-otter/honey/v2.jpg');
 for(const post of s.posts){assert.equal(post.method,'PATCH');assert.deepEqual(post.data.allowed_mentions,{parse:[]});}
});
