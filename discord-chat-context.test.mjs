import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewChannel,discordChatContext} from './discord-chat-context.mjs';
const roles=[{id:'10',permissions:'1024'},{id:'20',permissions:'0'},{id:'30',permissions:'8'}];
const guild={id:'10',owner_id:'99'};

test('member visibility follows everyone, role and personal overwrites',()=>{
  const channel={permission_overwrites:[{id:'10',type:0,deny:'1024',allow:'0'},{id:'20',type:0,allow:'1024',deny:'0'},{id:'1',type:1,deny:'1024',allow:'0'}]};
  assert.equal(canViewChannel({user:{id:'2'},roles:[]},roles,channel,guild),false);
  assert.equal(canViewChannel({user:{id:'2'},roles:['20']},roles,channel,guild),true);
  assert.equal(canViewChannel({user:{id:'1'},roles:['20']},roles,channel,guild),false);
  assert.equal(canViewChannel({user:{id:'3'},roles:['30']},roles,channel,guild),true);
  assert.equal(canViewChannel({user:{id:'99'},roles:[]},roles,channel,guild),true);
});

test('reply context names current speaker and original author, preserving image references',async()=>{
  const fetcher=async url=>Response.json(url.endsWith('/roles')?roles:url.endsWith('/guilds/10')?guild:url.includes('/members?')?[{user:{id:'1',username:'alice',global_name:'小猫'},nick:'阿猫',roles:[]},{user:{id:'2',username:'bob',global_name:'小猫'},nick:'阿猫',roles:[]}]:{id:'11',guild_id:'10',type:0,permission_overwrites:[]});
  const reference={id:'101',channel_id:'11',author:{id:'2',username:'bob'},member:{nick:'阿猫'},content:'我画了一只猫',attachments:[{url:'https://cdn.discordapp.com/attachments/11/101/cat.png',content_type:'image/png'}]};
  const result=await discordChatContext({BOT_TOKEN:'token'},{guild_id:'10',channel_id:'11',author:{id:'1',username:'alice'},member:{nick:'阿猫'},content:'阿猫画得怎么样？',message_reference:{message_id:'101',channel_id:'11'},referenced_message:reference},'999',fetcher);
  assert.equal(result.reference,reference);
  assert.match(result.text,/当前发消息的人.*"id":"1"/);
  assert.equal(result.replyReference.author.id,'2');
  assert.equal(result.replyReference.author.kind,'member');
  assert.equal(result.replyReference.content,'我画了一只猫');
  assert.doesNotMatch(result.text,/我画了一只猫/);
  assert.equal(result.reference.attachments[0].content_type,'image/png');
  assert.match(result.text,/同名或匹配不明确时询问/);
  assert.match(result.text,/列表完整/);
});

test('unavailable member listing uses recent authors and declares incomplete scope',async t=>{
  t.mock.method(console,'warn',()=>{});
  const fetcher=async url=>url.includes('/messages?')?Response.json([{author:{id:'4',username:'recent'},member:{nick:'最近成员'},content:'do not inject ordinary channel text'}]):new Response('',{status:403});
  const result=await discordChatContext({BOT_TOKEN:'token'},{guild_id:'50',channel_id:'51',author:{id:'3',username:'caller'},mentions:[{id:'5',username:'mention'}],message_reference:{message_id:'200'},referenced_message:null},'999',fetcher);
  assert.equal(result.reference,null);
  assert.match(result.text,/列表不完整/);
  assert.match(result.text,/recent/);
  assert.match(result.text,/mention/);
  assert.match(result.text,/已删除/);
  assert.equal(result.text.includes('do not inject ordinary channel text'),false);
});

test('missing reply fetch is restricted to the same channel',async t=>{
  t.mock.method(console,'warn',()=>{});
  const requested=[];
  const fetcher=async url=>{requested.push(url);return url.endsWith('/messages/300')?Response.json({id:'300',channel_id:'61',author:{id:'8',username:'original'},content:'原文'}):new Response('',{status:403});};
  const message={guild_id:'60',channel_id:'61',author:{id:'7',username:'current'},message_reference:{message_id:'300',channel_id:'61'}};
  const result=await discordChatContext({BOT_TOKEN:'token'},message,'999',fetcher);
  assert.equal(result.replyReference.content,'原文');
  assert.equal(result.replyReference.author.id,'8');
  assert.doesNotMatch(result.text,/原文/);
  requested.length=0;
  const cross=await discordChatContext({BOT_TOKEN:'token'},{...message,message_reference:{message_id:'301',channel_id:'62'}},'999',fetcher);
  assert.equal(cross.reference,null);
  assert.equal(requested.some(url=>url.includes('/channels/62/')),false);
  assert.match(cross.text,/跨频道/);
});

test('bot reply reference resolves its original member target while preserving same-name accounts and notices',async()=>{
  const botId='999999999999999999',guildId='70',channelId='71';
  const a={id:'700000000000000001',username:'a',global_name:'同名'},b={id:'700000000000000002',username:'b',global_name:'同名'};
  const original={id:'701',channel_id:channelId,author:a,member:{nick:'旧名'},content:'普通成员的原话'};
  const botReply={id:'702',channel_id:channelId,author:{id:botId,username:'bot',bot:true},message_reference:{message_id:original.id,channel_id:channelId},referenced_message:original,content:'本bot的回复'};
  const fetcher=async url=>Response.json(url.endsWith('/roles')?[{id:guildId,permissions:'1024'}]:url.endsWith('/guilds/'+guildId)?{id:guildId,owner_id:'0'}:url.endsWith('/members?limit=1000')?[{user:a,nick:'旧名',roles:[]},{user:b,nick:'旧名',roles:[]}]:{id:channelId,guild_id:guildId,type:0,permission_overwrites:[]});
  const result=await discordChatContext({BOT_TOKEN:'token'},{guild_id:guildId,channel_id:channelId,author:b,member:{nick:'旧名'},message_reference:{message_id:botReply.id,channel_id:channelId},referenced_message:botReply},botId,fetcher);
  assert.equal(result.current.id,b.id);
  assert.equal(result.replyReference.author.kind,'this_bot');
  assert.equal(result.replyReference.replyTo.id,a.id);
  assert.equal(result.replyReference.replyToCurrentUser,false);
  assert.equal(result.people.filter(person=>person.nick==='旧名').length,2);
  assert.equal(result.referenceNotice,'');
  const deleted=await discordChatContext({BOT_TOKEN:'token'},{guild_id:guildId,channel_id:channelId,author:b,message_reference:{message_id:'703'},referenced_message:null},botId,fetcher);
  assert.match(deleted.referenceNotice,/已删除或不可访问/);
  assert.equal(deleted.complete,true);
});

test('empty embedded B message is refreshed by exact ID and cannot become a different message',async t=>{
 t.mock.method(console,'warn',()=>{});
 const m={guild_id:'810',channel_id:'811',author:{id:'1'},message_reference:{message_id:'812'},referenced_message:{id:'812',channel_id:'811',author:{id:'2'},content:'',attachments:[]}};
 const called=[];
 const fetcher=async url=>{called.push(url);return url.endsWith('/messages/812')?Response.json({id:'812',channel_id:'811',guild_id:'810',author:{id:'2',username:'B'},content:'B的原话：一只白猫'}):new Response('',{status:403});};
 const result=await discordChatContext({BOT_TOKEN:'test'},m,'99',fetcher);
 assert.equal(result.replyReference.content,'B的原话：一只白猫');assert.equal(result.replyReference.author.id,'2');
 assert.equal(called.filter(u=>u.endsWith('/messages/812')).length,1);
 const bad=await discordChatContext({BOT_TOKEN:'test'},m,'99',async url=>url.endsWith('/messages/812')?Response.json({id:'999',channel_id:'811',author:{id:'2'},content:'错消息'}):new Response('',{status:403}));
 assert.equal(bad.reference,null);
});


