import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareChatOrder,decodeOrderReply} from './tavern-chat.mjs';
import {makeSystemInstruction} from './ai-chat.mjs';
import {FLOWERS} from './flower-shop.mjs';
import {flowerData} from './flower-ui.mjs';
test('natural flower gift validates source evidence and recipient and creates a draft only',async()=>{
 const requests=[],env={DISCORD_APPLICATION_ID:'9',BOT_TOKEN:'test',TABLES:{idFromName:n=>n,get:()=>({fetch:async(u,o)=>{requests.push(JSON.parse(o.body));return Response.json({id:'draft'});}})}};
 const m={id:'100',guild_id:'3',channel_id:'10',author:{id:'1',username:'A'},content:'<@9> 给<@2>买两束玫瑰花束，赠言：生日快乐',mentions:[{id:'2'}]};
 const order={itemId:'rose',itemEvidence:'玫瑰',quantity:2,quantityEvidence:'两',recipientKey:'member_1',recipientEvidence:'<@2>',note:'生日快乐'};
 await prepareChatOrder(env,m,order,FLOWERS,{botId:'9',people:[]},new Map([['1','current_user'],['2','member_1']]),async()=>Response.json({user:{id:'2',username:'B'}}),'flower');
 assert.equal(requests[0].action,'flowerPrepare');assert.equal(requests[0].recipient.id,'2');assert.equal(requests[0].quantity,2);assert.equal(requests[0].note,'生日快乐');
 await assert.rejects(prepareChatOrder(env,m,{...order,note:'编造赠言'},FLOWERS,{botId:'9'},new Map([['2','member_1']]),async()=>Response.json({user:{id:'2',username:'B'}}),'flower'),/赠言/);
 await assert.rejects(prepareChatOrder(env,{...m,content:'比如给<@2>买两束玫瑰花束'},order,FLOWERS,{},new Map(),fetch,'flower'),/明确/);
});
test('NPC uses approved independent identity and extraction protocol without red-bean sister persona',()=>{const s=makeSystemInstruction('原红豆粉人设','chat',[],'','姐姐身份',{cityNPC:{name:'沈清禾'},flowerOrderExtraction:{menu:FLOWERS}});assert(s.includes('独立于红豆粉'));assert(s.includes('recipientKey'));assert(!s.includes('原红豆粉人设'));assert(!s.includes('姐姐身份'));assert.equal(decodeOrderReply('{"reply":"待确认","order":null}').order,null);});
test('public draft review is owner-only and another user cannot open private payment data',async()=>{await assert.rejects(flowerData({}, {type:3,guild_id:'3',channel_id:'10',member:{user:{id:'2'}},message:{flags:0},data:{custom_id:'f:3:1:review~draft'}}),/自己/);});
