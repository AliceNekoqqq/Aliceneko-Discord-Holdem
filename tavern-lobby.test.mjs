import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {answerTavern,handleNaturalTavern,immediateTavernReply,parseTavernIntent,tavernCommand,tavernInteraction} from './tavern-ui.mjs';
import {tavernDeferredReply} from './tavern-renovation-ui.mjs';
import {tavernLobbyGames} from './tavern-lobby.mjs';
function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));}};
}
function env(){const service=new TavernService(storage());return {service,TABLES:{idFromName:n=>n,get:()=>({fetch:async(_u,o)=>{const p=JSON.parse(o.body);try{return Response.json(await service.dispatch(p));}catch(e){return Response.json({error:e.message});}}})}};}
const ctx={guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}}};
function i(action,owner='any',flags=0){return {type:3,...ctx,message:{flags},data:{custom_id:`t:3:${owner}:${action}`}};}
function bounds(data){assert(data.content.length<=2000);assert(data.components.length<=5);for(const r of data.components){assert(r.components.length<=5);for(const c of r.components)assert(c.custom_id.length<=100);}}

test('public lobby renders its shared board without creating a wallet and links every area',async()=>{
 const e=env(),interaction=i('lobby');assert.equal(immediateTavernReply(interaction),null);assert.deepEqual(tavernDeferredReply(interaction),{type:6});
 const data=await answerTavern(e,interaction);bounds(data);assert(data.content.includes('大厅'));assert(data.content.includes('共同建设'));assert(!data.content.includes('余额'));
 assert.equal(e.service.rows('SELECT * FROM tavern_members').length,0);
 const actions=data.components.flatMap(r=>r.components).map(c=>c.custom_id.split(':')[3]);
 for(const action of ['lobbyMenu','lobbyWallet','lobbyCard','lobbyRoom','renoEnter','renoHistory~0','renoLeaders','lobbyGames','lobby'])assert(actions.includes(action));
 assert.equal(tavernCommand.options[0].name,'大厅');
 assert(data.content.includes('还没有玩家添置的陈设'));
});

test('public lobby entries open private wallet, card and bar order; identity and guild are checked',async()=>{
 const e=env();
 for(const [action,needle] of [['lobbyWallet','余额'],['lobbyCard','常客卡'],['lobbyMenu','今日菜单']]){
  const interaction=i(action);assert.deepEqual(tavernDeferredReply(interaction),{type:5,data:{flags:64}});const data=await answerTavern(e,interaction);bounds(data);assert(data.content.includes(needle));assert(data.components.flatMap(r=>r.components).some(c=>c.custom_id.endsWith(':lobby')));
 }
 const forged=i('lobbyWallet','9');assert.equal(immediateTavernReply(forged).type,4);
 const wrongGuild=i('lobby','any');wrongGuild.data.custom_id='t:4:any:lobby';assert.equal(immediateTavernReply(wrongGuild).type,4);
});

test('game lobby exposes exactly the five worker-owned game actions without tavern interception',()=>{
 const data=tavernLobbyGames('3');bounds(data);const buttons=data.components.flatMap(r=>r.components),plays=buttons.filter(c=>c.custom_id.includes(':lobbyPlay~'));
 assert.deepEqual(plays.map(c=>c.custom_id.split('~')[1]),['poker','uno','ghost','liar','table']);
 assert.deepEqual(plays.map(c=>c.label),['♠️ 德州','🃏 UNO','👻 抽鬼牌','🃏 骗子酒馆','🎴 当前牌桌']);
 for(const b of plays){const interaction=i(b.custom_id.split(':')[3]);assert.equal(tavernInteraction(interaction),false);assert.equal(tavernDeferredReply(interaction),null);}
});

test('natural language opens a public lobby without a model request or welcome wallet',async t=>{
 const e=env(),sent=[],old=globalThis.fetch;globalThis.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return Response.json({id:'out'});};t.after(()=>globalThis.fetch=old);
 for(const phrase of ['打开酒馆','打开小酒馆','走进酒馆','进酒馆','小酒馆'])assert.deepEqual(parseTavernIntent(phrase),{action:'lobby'});
 const msg={guild_id:'3',channel_id:'2',id:'333',author:{id:'1',username:'Alice'},member:{nick:'Alice'}};
 assert(await handleNaturalTavern(e,msg,'走进酒馆'));assert.equal(e.service.rows('SELECT * FROM tavern_members').length,0);
 assert(sent[0].body.content.includes('大厅'));assert(!sent.some(x=>x.url.includes('model')));assert.equal(sent[0].body.allowed_mentions.parse.length,0);
});
