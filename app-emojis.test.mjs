import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AppEmojis,cleanEmojis,emojiMarkup,emojiImage} from './app-emojis.mjs';
import {UnoProfiles,appProfileData,answerProfile} from './uno-profile.mjs';
import {UnoRankings} from './uno-rankings.mjs';
import {UnoRankBridge} from './uno-rank-bridge.mjs';
import * as game from './uno-engine.mjs';
import {board} from './uno-ui.mjs';
import {BoardSync} from './board-sync.mjs';
const e={id:'12345',name:'happy_cat',animated:true};
function storage(){const map=new Map(),db=new DatabaseSync(':memory:');return {map,sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length)return {toArray:()=>s.all(...args)};s.run(...args);return {toArray:()=>[]};}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),setAlarm:async n=>map.set('alarm',n)};}
test('application list uses only GET with application bot auth, strips uploader data, caches and respects rate limits',async t=>{
 const store=storage(),env={BOT_TOKEN:'fake-app-secret',DISCORD_APPLICATION_ID:'999'},calls=[],old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return Response.json({items:[{...e,user:{id:'PRIVATE_USER'},roles:['PRIVATE_ROLE']},e,{id:'222',name:'静静',animated:false},{id:'333',name:'@everyone'},{id:'444',name:'gone',available:false}]});};
 const service=new AppEmojis(store,env),first=await service.get(100);assert.equal(first.items.length,2);assert.equal(calls[0].url,'https://discord.com/api/v10/applications/999/emojis');assert.equal(calls[0].opts.headers.Authorization,'Bot fake-app-secret');assert(!calls[0].opts.method||calls[0].opts.method==='GET');assert.deepEqual(first.items[0],e);assert(!JSON.stringify([...store.map]).includes('PRIVATE'));assert(!JSON.stringify([...store.map]).includes('fake-app-secret'));await service.get(200);assert.equal(calls.length,1);
 globalThis.fetch=async()=>new Response(JSON.stringify({retry_after:90}),{status:429});const retry=await service.get(300101);assert.equal(retry.nextAt,390101);assert.deepEqual(retry.items,first.items);await service.get(300200);globalThis.fetch=async()=>Response.json({items:[]});const deleted=await service.get(390102);assert.deepEqual(deleted.items,[]);
 assert.equal(emojiMarkup(e),'<a:happy_cat:12345>');assert.equal(emojiMarkup({...e,animated:false}),'<:happy_cat:12345>');assert.equal(emojiMarkup({id:'javascript:',name:'x'}),'');assert(emojiImage(e).endsWith('gif?size=96'));assert.deepEqual(cleanEmojis([e,{...e,name:'dupe'}]),[e]);
});
test('all 2000 application emojis are selectable through bounded owner menus with independent entry/victory choices',()=>{
 const catalog=Array.from({length:2000},(_,n)=>({id:String(n+1),name:'emoji_'+n,animated:n%2===0})),profiles=new UnoProfiles(storage().sql);profiles.set('1','entranceApp','123',catalog);profiles.set('1','victoryApp','456',catalog);assert.equal(profiles.get('1').entranceApp,'123');assert.equal(profiles.get('1').victoryApp,'456');assert.throws(()=>profiles.set('1','victoryApp','99999',catalog));
 for(let page=0;page<84;page++){const data=appProfileData(profiles.get('1'),'1','3',catalog,'victoryApp',page);assert(data.components.length<=5);for(const row of data.components){assert(row.components.length<=5);for(const c of row.components){assert(c.custom_id.length<=100);if(c.options){assert(c.options.length<=25);assert(c.options.filter(o=>o.default).length<=1);assert(c.options.every(o=>typeof o.value==='string'));}}}assert.deepEqual(data.allowed_mentions,{parse:[]});}
 profiles.set('1','victoryApp','none',catalog);assert.equal(profiles.get('1').entranceApp,'123');profiles.set('1','reset');assert.equal(profiles.get('1').entranceApp,'none');
});
test('private app selector reads real catalog, binds sender and guild, saves only known current app ids',async()=>{
 const store=storage(),env={};let catalogCalls=0;env.TABLES={idFromName:n=>n,get:()=>({fetch:async()=>{catalogCalls++;return Response.json({items:[e],status:'ok'});}})};const rank=new UnoRankings(store,env);const callerEnv={TABLES:{idFromName:n=>n,get:()=>({fetch:async(url,opts)=>Response.json(await rank.dispatch(JSON.parse(opts.body)))})}};
 const i={type:3,guild_id:'3',member:{user:{id:'1'}},message:{flags:64},data:{custom_id:'v:3:1:app~victoryApp~0'}};const menu=await answerProfile(callerEnv,i);assert(menu.content.includes('读取到 1 个'));const saved=await answerProfile(callerEnv,{...i,data:{custom_id:'v:3:1:set~victoryApp~0',values:[e.id]}});assert(saved.content.includes('<a:happy_cat:12345>'));assert.equal(rank.profiles.get('1').victoryApp,e.id);
 const before=catalogCalls;await answerProfile(callerEnv,{...i,member:{user:{id:'2'}}});await answerProfile(callerEnv,{...i,message:{flags:0}});assert.equal(catalogCalls,before);await answerProfile(callerEnv,{...i,data:{custom_id:'v:3:1:set~victoryApp~0',values:['99999']}});assert.equal(rank.profiles.get('1').victoryApp,e.id);
});
test('entry and victory application emotes update only the original message, preserve animated thumbnail and fallback after deletion',async t=>{
 const store=storage(),table=game.newTable('1','2','3');table.players[0].name='ALICE';table.players[0].entrancePending=true;const profile={avatar:'cat',accent:'sky',entrance:'hello',victory:'star',entranceApp:e.id,victoryApp:e.id,appEntrance:e,appVictory:e};let catalogPresent=true;
 const host={ctx:{storage:store},env:{TABLES:{idFromName:n=>n,get:()=>({fetch:async()=>Response.json({crown:null,profiles:{'1':catalogPresent?profile:{...profile,appEntrance:null,appVictory:null}}})})}},queuePanels:async()=>{},syncBoard:async()=>{}};const bridge=new UnoRankBridge(host);await store.put('unoRankSyncAt',1);await bridge.flush(table);const clocks=[table.version,table.idleDeadline,table.deadline];const entry=board(table);assert(JSON.stringify(entry).includes('<a:happy_cat:12345>'));assert(entry.embeds[0].thumbnail.url.includes('.gif'));await store.put('unoRankSyncAt',1);await bridge.flush(table);assert.equal(table.events.length,1);
 game.join(table,'4');table.phase='settled';table.winner='1';table.roundPoints=20;const result=board(table);assert(JSON.stringify(result).includes('<a:happy_cat:12345> ALICE 的胜利表情'));assert(!JSON.stringify(result).includes('⭐ ALICE 的胜利表情'));assert(result.embeds[0].thumbnail.url.includes('.gif'));assert.deepEqual([table.version,table.idleDeadline,table.deadline],clocks);
 const old=globalThis.fetch,sends=[];t.after(()=>globalThis.fetch=old);globalThis.fetch=async(url,opts)=>{sends.push({url,method:opts.method});return Response.json({attachments:[]});};table.messageId='77';const sync=new BoardSync(store,{BOT_TOKEN:'fake'});await sync.queue(table,0);await sync.flush(table,1000);assert.equal(sends.length,1);assert.equal(sends[0].method,'PATCH');assert(sends[0].url.endsWith('/channels/2/messages/77'));
 catalogPresent=false;await store.put('unoRankSyncAt',1);await bridge.flush(table);const fallback=board(table);assert(JSON.stringify(fallback).includes('⭐ ALICE 的胜利表情'));assert(!fallback.embeds[0].thumbnail);
});
