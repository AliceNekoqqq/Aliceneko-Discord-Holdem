import test from 'node:test';
import assert from 'node:assert/strict';
import {replyToMention} from './ai-chat.mjs';
import {MENU} from './tavern-catalog.mjs';
import {prepareChatOrder,decodeOrderReply} from './tavern-chat.mjs';
import {answerTavern} from './tavern-ui.mjs';
const m={id:'8201',guild_id:'820',channel_id:'821',author:{id:'1',username:'A'},mentions:[{id:'99'}],content:'<@99> 给我来一杯红豆牛奶'};
function fixture(t,output){
 const calls=[],posts=[],requests=[];
 const env={BOT_TOKEN:'test',GEMINI_API_KEY:'test',GEMINI_MAX_RETRIES:'0',AI_REQUEST_LOG_ENABLED:'false',TABLES:{idFromName:x=>x,get:()=>({async fetch(url,opts){const p=JSON.parse(opts.body);calls.push(p);if(p.action==='opsMenu')return Response.json(MENU.filter(x=>!x.requiresEquipment));if(p.action==='prepare')return Response.json({id:'draft1',user_id:p.id,item:p.item,price:15*(p.quantity||1),details:{itemName:'红豆牛奶',quantity:p.quantity||1,sweetness:'normal',temperature:'warm',...(p.recipient?{recipientId:p.recipient.id,recipientName:p.recipient.name,payerName:'A'}:{})},expires:Date.now()+180000,status:'pending'});return Response.json({});}})}};
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  if(String(url).includes('generativelanguage')){requests.push(JSON.parse(opts.body));return Response.json({candidates:[{content:{parts:[{text:typeof output==='string'?output:JSON.stringify(output)}]}}]});}
  if(String(url).endsWith('/messages')&&opts?.method==='POST'){posts.push(JSON.parse(opts.body));return Response.json({id:'8202'});}
  if(String(url).endsWith('/guilds/820/members/2'))return Response.json({user:{id:'2',username:'B'},nick:'Bob'});
  if(String(url).endsWith('/messages/819'))return Response.json({id:'819',channel_id:'821',author:{id:'2',username:'B'},content:'B画了一只白猫'});
  if(String(url).endsWith('/roles'))return Response.json([{id:'820',permissions:'1024'}]);
  if(String(url).endsWith('/guilds/820'))return Response.json({id:'820',owner_id:'1'});
  if(String(url).includes('/members?'))return Response.json([{user:m.author,roles:[]},{user:{id:'2',username:'B'},nick:'Bob',roles:[]}]);
  return Response.json({id:'821',guild_id:'820',type:0,permission_overwrites:[]});
 });return {env,calls,posts,requests};
}
const self={reply:'给你准备一杯，确认后就上桌。',order:{itemId:'milk',itemEvidence:'红豆牛奶',quantity:1,recipientKey:'current_user'}};
test('one model call yields normal dialogue plus hidden order, creating only a confirmation draft',async t=>{
 const f=fixture(t,self);await replyToMention(f.env,m,'99');
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].generationConfig.responseMimeType,'application/json');
 assert.equal(f.calls.filter(c=>c.action==='prepare').length,1);assert.equal(f.calls.some(c=>c.action==='confirm'),false);
 assert.match(f.posts[0].content,/尚未扣款/);assert.match(f.posts[0].content,/准备一杯/);
 assert.doesNotMatch(JSON.stringify(f.posts),/itemEvidence|recipientKey|tavernOrderExtraction/);
 assert.equal(f.posts[0].components[0].components[0].custom_id,'t:820:1:review~draft1');
});
test('gift model data resolves actual mentioned member in same guild and never charges automatically',async t=>{
 const f=fixture(t,{...self,order:{...self.order,recipientKey:'member_1',recipientEvidence:'<@2>'}});
 await replyToMention(f.env,{...m,mentions:[{id:'99'},{id:'2',username:'B'}],content:'<@99> 给<@2>来一杯红豆牛奶'},'99');
 const p=f.calls.find(c=>c.action==='prepare');assert.equal(p.recipient.id,'2');assert.equal(p.id,'1');
 assert.match(f.posts[0].content,/收礼：Bob/);assert.equal(f.calls.some(c=>c.action==='confirm'),false);
});
test('A replying to blank embedded B message puts fetched B text and authorship into model background',async t=>{
 const f=fixture(t,'这只白猫画得挺有神。');
 await replyToMention(f.env,{...m,content:'<@99> 你看看她画得怎么样',message_reference:{message_id:'819',channel_id:'821'},referenced_message:{id:'819',channel_id:'821',author:{id:'2'},content:''}},'99');
 const prompt=f.requests[0].systemInstruction.parts[0].text;
 assert.match(prompt,/B画了一只白猫/);assert.match(prompt,/replyReference/);
 assert.equal(f.requests[0].contents.at(-1).parts[0].text,'你看看她画得怎么样');
});
test('invalid model JSON never leaks data and cannot create orders; unknown or quoted products cannot prepare',async t=>{
 const f=fixture(t,'{"reply":"你好","order":');await replyToMention(f.env,m,'99');
 assert.equal(f.calls.some(c=>c.action==='prepare'),false);assert.doesNotMatch(f.posts[0].content,/"order"/);assert.match(f.posts[0].content,/尚未扣款/);
 assert.throws(()=>decodeOrderReply('{"reply":"{\\"order\\":1}","order":null}'));
 await assert.rejects(()=>prepareChatOrder(f.env,m,{...self.order,itemId:'soda'},MENU,{},new Map()),/商品名称/);
 await assert.rejects(()=>prepareChatOrder(f.env,{...m,content:'<@99> 比如给我来一杯红豆牛奶'},self.order,MENU,{},new Map()),/没有明确/);
});
test('recipient alias collisions, foreign users, bots and unsupported quantity are rejected before draft writes',async()=>{
 const env={TABLES:{get(){throw Error('must not create draft')}}};
 const message={...m,content:'请Bob喝一杯红豆牛奶'};
 const order={...self.order,recipientKey:'member_1',recipientEvidence:'Bob'};
 const context={people:[{id:'2',nick:'Bob'},{id:'3',nick:'Bob'}],botId:'99'};
 await assert.rejects(()=>prepareChatOrder(env,message,order,MENU,context,new Map([['2','member_1']])),/重名/);
 await assert.rejects(()=>prepareChatOrder(env,{...message,mentions:[{id:'2'}],content:'送给<@2>一杯红豆牛奶'},{...order,recipientEvidence:'<@2>'},MENU,{},new Map([['2','member_1']]),async()=>Response.json({user:{id:'2',bot:true}})),/真实成员/);
 await assert.rejects(()=>prepareChatOrder(env,m,{...self.order,quantity:2,quantityEvidence:'两'},MENU,{},new Map()),/数量/);
});
test('gift picker uses original payer-owned draft; slash supports recipient and quantity',async t=>{
 const f=fixture(t,self);
 const i={type:3,id:'8208',guild_id:'820',channel_id:'821',member:{user:{id:'1',username:'A'}},message:{flags:64},data:{custom_id:'t:820:1:gift~draft1',values:['2']}};
 await assert.rejects(()=>answerTavern(f.env,{...i,member:{user:{id:'2'}}}),/另一位来客/);
 const slash={...i,type:2,data:{name:'酒馆',options:[{name:'点单',options:[{name:'商品',value:'milk'},{name:'赠给',value:'2'},{name:'数量',value:2}]}]}};
 await answerTavern(f.env,slash);const p=f.calls.find(c=>c.action==='prepare');assert.equal(p.id,'1');assert.equal(p.recipient.id,'2');assert.equal(p.quantity,2);
});
