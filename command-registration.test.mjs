import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCommands,commandInventory,sameCommand} from './command-registration.mjs';
const env={BOT_TOKEN:'must-not-leak',DISCORD_APPLICATION_ID:'123'};
const storage=()=>{const m=new Map();return {get:async k=>m.get(k),put:async(k,v)=>m.set(k,v)};};
test('registration requires actual Discord command inventory before caching success',async()=>{
 const s=storage(),commands=[{name:'城市'}];let present=false;
 const fetcher=async(url,o)=>Response.json(o.method==='POST'?{id:'1',name:'城市'}:present?[{name:'城市'}]:[]);
 assert.equal((await registerCommands(env,s,commands,'v',fetcher)).registered,false);assert.equal(await s.get('commandVersion'),undefined);
 present=true;assert.equal((await registerCommands(env,s,commands,'v',fetcher)).registered,true);assert.equal(await s.get('commandVersion'),'v');
});
test('Discord validation failure identifies command and leaves registration retryable',async()=>{
 const s=storage();const fetcher=async(url,o)=>o.method==='POST'?Response.json({code:50035,message:'Invalid Form Body',errors:{options:{}}},{status:400}):Response.json([]);
 const d=await registerCommands(env,s,[{name:'城市'}],'v',fetcher);assert.equal(d.registered,false);assert.equal(d.failures[0].name,'城市');assert.equal(d.failures[0].code,50035);assert(!JSON.stringify(await s.get('commandDiagnostics')).includes(env.BOT_TOKEN));
});
test('inventory is read-only and does not return credentials or full Discord objects',async()=>{
 const d=await commandInventory(env,async(url,o)=>{assert.equal(o.method,undefined);return Response.json([{name:'城市',other:'private'}]);});assert.deepEqual(d,{ok:true,status:200,names:['城市']});
});

test('unchanged commands are skipped, missing city is first and server backoff suppresses retries',async()=>{
 const s=storage(),writes=[];const commands=[{name:'ai',description:'existing'},{name:'城市',description:'new'}];
 const fetcher=async(url,o)=>{if(o.method==='POST'){writes.push(JSON.parse(o.body));return Response.json({message:'rate limited',retry_after:120},{status:429});}return Response.json([{name:'ai',description:'existing',id:'100',type:1,options:[]}]);};
 const d=await registerCommands(env,s,commands,'v',fetcher);assert.deepEqual(writes,[commands[1]]);assert(d.retryAt>Date.now()+119000);
 await registerCommands(env,s,commands,'v',fetcher);assert.equal(writes.length,1);
});
test('successful missing city creation makes complete inventory cacheable without rewriting other commands',async()=>{
 const s=storage(),rows=[{name:'ai',description:'existing'}],writes=[];const commands=[...rows,{name:'城市',description:'new'}];
 const fetcher=async(url,o)=>{if(o.method==='POST'){const c=JSON.parse(o.body);writes.push(c.name);rows.push(c);return Response.json(c);}return Response.json(rows);};
 const d=await registerCommands(env,s,commands,'v',fetcher);assert(d.registered);assert.deepEqual(writes,['城市']);assert.equal(await s.get('commandVersion'),'v');
 assert(sameCommand({name:'城市',options:[{name:'地图',type:1}]},{id:'99',name:'城市',options:[{name:'地图',type:1,options:[]}]}));
 assert(!sameCommand({name:'城市',options:[{name:'地图',type:1}]},{name:'城市',options:[{name:'地图',type:1},{name:'位置',type:1}]}));
});
