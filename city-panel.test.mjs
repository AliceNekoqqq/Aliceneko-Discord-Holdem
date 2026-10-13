import test from 'node:test';
import assert from 'node:assert/strict';
import {CityService} from './city-service.mjs';
import {CityPanel,flowerPublicPanel} from './city-panel.mjs';
import {flowerData} from './flower-ui.mjs';
import {cityData} from './city-ui.mjs';
const p={channelId:'10',name:'花店',street:'河西街',kind:'flower',open:true,description:'地点描述'};
function fixture(){const map=new Map(),storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)};storage.transaction=f=>f(storage);const service=new CityService(storage);return {map,storage,service};}
test('concurrent panel creation stores one message, refreshes it and reflects closed status',async()=>{
 const {storage,service,map}=fixture();await service.bind(p);const calls=[];
 const panel=new CityPanel(storage,service,{BOT_TOKEN:'secret'},async(url,o)=>{calls.push({url,...o,body:JSON.parse(o.body)});return Response.json({id:'50'});});
 await Promise.all([panel.publish({guild:'3',channel:'10'}),panel.publish({guild:'3',channel:'10'})]);
 assert.deepEqual(calls.map(c=>c.method),['POST','PATCH']);assert.equal(map.get('city:panel:10').messageId,'50');assert.equal(calls[0].body.enforce_nonce,true);assert.equal(calls[0].body.nonce,'fp10');assert(!JSON.stringify(calls[0].body).includes('secret'));
 await service.bind({...p,open:false});await panel.publish({guild:'3',channel:'10',create:false});const body=calls.at(-1).body;assert(body.embeds[0].description.includes('休息中'));assert.equal(body.components[0].components[0].disabled,true);assert.deepEqual(body.allowed_mentions,{parse:[]});assert.equal(body.components[0].components[1].disabled,undefined);
});
test('deleted message can be recreated, permission errors and unknown sends do not immediately repost',async()=>{
 const {storage,service,map}=fixture();await service.bind(p);map.set('city:panel:10',{messageId:'49'});const calls=[];
 const panel=new CityPanel(storage,service,{},async(u,o)=>{calls.push(o.method);return o.method==='PATCH'?new Response('',{status:404}):Response.json({id:'50'});});await panel.publish({guild:'3',channel:'10'});assert.deepEqual(calls,['PATCH','POST']);
 const denied=new CityPanel(storage,service,{},async()=>new Response('',{status:403}));await assert.rejects(denied.publish({guild:'3',channel:'10'}),/权限/);assert.equal(map.get('city:panel:10').messageId,'50');
 map.delete('city:panel:10');let count=0;const uncertain=new CityPanel(storage,service,{},async()=>{count++;throw Error('network');});await assert.rejects(uncertain.publish({guild:'3',channel:'10'}));assert.equal(count,1);
 await service.bind({...p,kind:'home'});await assert.rejects(panel.publish({guild:'3',channel:'10'}),/类型/);
});
test('public menu belongs to a channel and opens private data for the clicker only; other locations cannot open it',async()=>{
 const {service}=fixture();await service.bind(p);await service.bind({...p,channelId:'20',kind:'home'});
 const env={TABLES:{idFromName:n=>n,get:()=>({fetch:async(u,o)=>{const q=JSON.parse(o.body);return Response.json(q.action==='config'?await service.config():await service.context(q));}})}};
 const i={type:3,guild_id:'3',channel_id:'10',member:{user:{id:'1'}},message:{flags:0},data:{custom_id:'fp:3:10:menu'}};
 assert.equal((await flowerData(env,i)).flags,64);assert(flowerPublicPanel('3',p).embeds[0].image.url.endsWith('shop-background.jpg'));
 await assert.rejects(flowerData(env,{...i,channel_id:'20'}),/所属/);
 await assert.rejects(flowerData(env,{...i,guild_id:'4'}),/所属/);
 await assert.rejects(flowerData(env,{...i,channel_id:'20',data:{custom_id:'fp:3:20:menu'}}),/花店/);
 await assert.rejects(cityData(env,{...i,type:2,member:{user:{id:'1'},permissions:'0'},data:{options:[{name:'面板'}]}}),/管理服务器/);
});

test('default publisher fetch retains the global receiver required by Workers runtime',async()=>{
 const {storage,service}=fixture();await service.bind(p);const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async function(url,options){assert.equal(this,globalThis,'native fetch must not receive CityPanel as this');calls++;return Response.json({id:'70'});};
 try{const panel=new CityPanel(storage,service,{BOT_TOKEN:'test'});await panel.publish({guild:'3',channel:'10'});await panel.publish({guild:'3',channel:'10'});assert.equal(calls,2);}
 finally{globalThis.fetch=previous;}
});
