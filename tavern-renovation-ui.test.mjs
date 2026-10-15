import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {RENOVATION_ITEMS} from './tavern-renovation-catalog.mjs';
import {answerRenovation,immediateRenovationReply,tavernDeferredReply,tavernRenovationInteraction} from './tavern-renovation-ui.mjs';
import {finishTavern} from './tavern-ui.mjs';
import {immediateTavernReply,TAVERN_HELP} from './tavern-ui.mjs';

function storage(){
 const db=new DatabaseSync(':memory:'),map=new Map();
 return {sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))map.set(key,structuredClone(value));else map.set(k,structuredClone(v));}};
}
function env(){const service=new TavernService(storage());return {service,TABLES:{idFromName:n=>n,get:()=>({fetch:async(_u,o)=>{const p=JSON.parse(o.body);try{return Response.json(await service.dispatch(p));}catch(e){return Response.json({error:e.message});}}})}};}
const base={guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}}};
const comp=(action,{privateView=true,values,components}={})=>({type:3,...base,message:{flags:privateView?64:0},data:{custom_id:`t:3:1:${action}`,...(values?{values}:{}),...(components?{components}:{})}});
const bounds=data=>{assert(data.content.length<=2000);assert(data.components.length<=5);for(const r of data.components){assert(r.components.length<=5);for(const c of r.components){assert(c.custom_id.length<=100);if(c.options)assert(c.options.length<=25);}}};

test('renovation routes separate public reads, private entry and public owner whitelist',async()=>{
 const e=env();
 const publicBoard=comp('renoBoard',{privateView:false});publicBoard.data.custom_id='t:3:any:renoBoard';assert(tavernRenovationInteraction(publicBoard));assert.deepEqual(tavernDeferredReply(publicBoard),{type:6});
 assert.equal(immediateTavernReply(publicBoard),null);
 const enter=comp('renoEnter',{privateView:false});enter.data.custom_id='t:3:any:renoEnter';assert.deepEqual(tavernDeferredReply(enter),{type:5,data:{flags:64}});
 assert.equal(immediateTavernReply(enter),null);
 const open=await answerRenovation(e,enter);assert(open.content.includes('私密余额'));
 for(const action of ['renoConfirm~0123456789abcdef01234567','renoTitle~oak_table','renoCat~lighting']){
  const forged=comp(action,{privateView:false});assert.equal(immediateRenovationReply(forged).type,4);
 }
 const other=comp('renoBoard',{privateView:false});other.member={user:{id:'9'}};assert.equal(immediateRenovationReply(other).type,4);
 const wrongGuild=comp('renoBoard',{privateView:false});wrongGuild.data.custom_id='t:4:any:renoBoard';assert.equal(immediateRenovationReply(wrongGuild).type,4);
 const wrongChannel={...comp('renoSubmit~99~oak_table'),type:5};await assert.rejects(()=>answerRenovation(e,wrongChannel),/原频道/);
});

test('all catalogue entries can be inspected, including locked reasons, within Discord limits',async()=>{
 const e=env(),menu=await answerRenovation(e,{type:2,...base,data:{name:'酒馆',options:[{name:'装修'}]}});
 assert.equal(RENOVATION_ITEMS.length,28);bounds(menu);
 const inspect=menu.components.flatMap(r=>r.components).find(c=>c.custom_id.includes('renoInspect'));
 assert.equal(inspect.options.length,25);assert(inspect.options.every(o=>o.value));
 const category=menu.components.flatMap(r=>r.components).find(c=>c.custom_id.endsWith(':renoCategory'));
 assert.equal(category.options.length,6);assert(category.options.some(o=>o.value==='equipment'));
 assert(menu.content.includes('🔒')||menu.content.includes('可购'));
 const last=inspect.options.at(-1).value,detail=await answerRenovation(e,comp('renoInspect~all',{values:[last]}));bounds(detail);assert(detail.content.includes('各级效果、价格与解锁'));
});

test('public room paginates every asset with long donor names and titles without truncation',async()=>{
 const e=env(),reno=e.service.renovation,who='123456789012345678',longName='红豆粉小酒馆共同装修捐赠者昵称甲乙丙丁戊己庚辛';
 for(const item of RENOVATION_ITEMS)reno.sql.exec('INSERT INTO tavern_reno_assets VALUES(?,?,?,?,?,?,?,?)',item.id,1,'春日窗边微光小店共同装修题名甲乙丙丁',who,longName,who,longName,Date.now());
 const all=[];
 for(let page=0;page<Math.ceil(RENOVATION_ITEMS.length/6);page++){
  const i={type:3,guild_id:who,channel_id:who,member:{user:{id:who,username:longName}},message:{flags:0},data:{custom_id:`t:${who}:any:renoBoard~${page}`}};
  const data=await answerRenovation(e,i);bounds(data);all.push(data.content);
  assert(!data.content.includes('余额'));assert(data.components.flatMap(r=>r.components).every(c=>c.custom_id.length<=100));
 }
 for(const item of RENOVATION_ITEMS)assert(all.join('\n').includes(item.name));
 assert.equal(all.join('\n').split('\n').filter(line=>line.includes('· Lv.')).length,RENOVATION_ITEMS.length);
 const privateMenu=await answerRenovation(e,{type:2,guild_id:who,channel_id:who,member:{user:{id:who,username:longName}},data:{name:'酒馆',options:[{name:'装修'}]}});
 bounds(privateMenu);assert(privateMenu.content.length<2000);assert(privateMenu.content.includes('余额'));
 const inspectMenu=privateMenu.components.flatMap(r=>r.components).find(c=>c.custom_id.includes('renoInspect'));
 assert.equal(inspectMenu.options.length,25);
 const locked=env(),svc=locked.service,lockedReno=svc.renovation;lockedReno.sql.exec('INSERT INTO tavern_reno_assets VALUES(?,?,?,?,?,?,?,?)','sound',1,'原始冠名','123','创始来客','456','升级来客',Date.now());
 const lockedMenu=await answerRenovation(locked,{type:2,guild_id:'3',channel_id:'2',member:{user:{id:'1',username:'Alice'}},data:{name:'酒馆',options:[{name:'装修'}]}});
 assert(lockedMenu.content.includes('店铺达到暖灯酒馆后解锁'));
 assert(TAVERN_HELP.length<2000);
});

test('private title modal, preview and confirmation charge once and yield nonce-deduplicated public announcement',async()=>{
 const e=env();e.service.view('1','Alice');e.service.sql.exec('UPDATE tavern_members SET balance=balance+100 WHERE id=?','1');const modalOpen=comp('renoTitle~coat_rack');const modal=immediateRenovationReply(modalOpen);assert.equal(modal.type,9);assert(modal.data.custom_id.length<=100);
 const submit={type:5,...base,data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'title',value:'邻窗木衣架'}]}]}};
 assert.deepEqual(tavernDeferredReply(submit),{type:5,data:{flags:64}});
 const preview=await answerRenovation(e,submit);bounds(preview);assert(preview.content.includes('尚未扣款'));assert(preview.content.includes('160币'));
 const confirmId=preview.components[0].components[0].custom_id.split(':')[3];
 const receipt=await answerRenovation(e,comp(confirmId));assert(receipt.content.includes('余额 440币'));assert(receipt._renovationAnnouncement.nonce);assert(receipt._renovationAnnouncement.content.includes('邻窗木衣架'));
 const again=await answerRenovation(e,comp(confirmId));assert(again.content.includes('没有再次扣款'));assert.equal(again._renovationAnnouncement,null);
 const publicBoard=comp('renoBoard',{privateView:false});publicBoard.data.custom_id='t:3:any:renoBoard';const publicData=await answerRenovation(e,publicBoard);bounds(publicData);assert(!publicData.content.includes('余额'));
});

test('equipment details, purchase preview and receipt show permanent public menu unlocks and art',async()=>{
 const e=env(),item=RENOVATION_ITEMS.find(x=>x.menuUnlocks?.length);assert(item);
 e.service.view('1','Alice');e.service.sql.exec('UPDATE tavern_members SET balance=balance+? WHERE id=?',item.levels[0].price,'1');
 const detail=await answerRenovation(e,comp('renoInspect~equipment',{values:[item.id]}));bounds(detail);
 for(const dish of item.menuUnlocks)assert(detail.content.includes(dish));
 assert.match(detail.content,/本服务器永久加入公共菜单/);assert.equal(detail.embeds[0]?.image?.url?.includes(`/art/equipment/${item.artId}/v1.jpg`),true);
 const modal=immediateRenovationReply(comp(`renoTitle~${item.id}`));assert.equal(modal.type,9);
 const preview=await answerRenovation(e,{type:5,...base,data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'title',value:'新设备'}]}]}});bounds(preview);
 for(const dish of item.menuUnlocks)assert(preview.content.includes(dish));assert.equal(preview.embeds[0]?.image?.url?.includes(`/art/equipment/${item.artId}/v1.jpg`),true);
 const confirmId=preview.components[0].components[0].custom_id.split(':')[3],receipt=await answerRenovation(e,comp(confirmId));bounds(receipt);
 for(const dish of item.menuUnlocks)assert(receipt.content.includes(dish));assert.equal(receipt.embeds[0]?.image?.url?.includes(`/art/equipment/${item.artId}/v1.jpg`),true);
});

test('a failed public announcement keeps the private receipt and confirmed debit',async t=>{
 const e=env();e.service.view('1','Alice');e.service.sql.exec('UPDATE tavern_members SET balance=balance+100 WHERE id=?','1');const modal=immediateRenovationReply(comp('renoTitle~coat_rack'));
 const preview=await answerRenovation(e,{type:5,...base,data:{custom_id:modal.data.custom_id,components:[{components:[{custom_id:'title',value:'安静衣帽架'}]}]}});
 const confirmId=preview.components[0].components[0].custom_id.split(':')[3],sent=[];
 const old=globalThis.fetch;globalThis.fetch=async(url,options)=>{sent.push({url,body:options.body&&JSON.parse(options.body)});return url.includes('/channels/')?new Response('',{status:500}):Response.json({id:'message'});};t.after(()=>globalThis.fetch=old);
 await finishTavern({TABLES:e.TABLES,BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123'}, {...comp(confirmId),token:'token'});
 assert.equal(e.service.view('1').member.balance,440);const receipt=sent.find(x=>x.url.includes('/webhooks/'));
 assert(receipt.body.content.includes('公告未能送达'));assert(sent.find(x=>x.url.includes('/channels/')).body.enforce_nonce);
});
