import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isMarriageCommand,weddingParty,weddingReplyText,sendWeddingReply,handleMarriageCommand,MARRIAGE_COPY} from './marriage.mjs';
import {renderWeddingHall} from './marriage-image.mjs';
import {getBotKnowledge} from './bot-knowledge.mjs';
import {imageAsset,serveArt} from './tavern-art.mjs';
import {setStaticAssetTestBinding} from './static-art.mjs';

const bot='999000000000000001',groom='999000000000000002',bride='999000000000000003',guest='999000000000000004';

test('marriage intent is a direct mention command and ignores questions or unrelated chat',()=>{
  assert.equal(isMarriageCommand('<@!'+bot+'> 结婚 <@'+groom+'> <@'+bride+'>',bot),true);
  assert.equal(isMarriageCommand('请举办婚礼 <@'+groom+'> <@'+bride+'>',bot),true);
  assert.equal(isMarriageCommand('小红说结婚吧',bot),false);
  assert.equal(isMarriageCommand('不要结婚',bot),false);
  assert.equal(isMarriageCommand('为什么要举行婚礼？',bot),false);
});

test('the first two distinct real-user mentions set the couple in text order',()=>{
  const message={content:`<@${bot}> 结婚 <@${groom}> <@${bride}> <@${guest}>`,mentions:[
    {id:guest,username:'宾客'},{id:bride,username:'新娘'},{id:bot,username:'红豆粉',bot:true},{id:groom,username:'新郎'}
  ]};
  const party=weddingParty(message,bot);
  assert.equal(party.groom.id,groom);assert.equal(party.bride.id,bride);
  assert.deepEqual(party.people.map(person=>person.id),[groom,bride,guest]);
  assert.deepEqual(weddingParty({...message,content:`<@${bot}> 结婚 <@${groom}>`},bot),{error:'举行婚礼请依次 @新郎 @新娘；后续提及的人也会出现在礼堂现场图里。'});
  assert.match(weddingParty({...message,content:`<@${bot}> 结婚 <@${groom}> <@${groom}> <@${bride}>`},bot).error,/两位不同/);
});

test('random ceremony copy always fills both user mentions',()=>{
  assert.equal(MARRIAGE_COPY.length,10);
  const party={groom:{id:groom},bride:{id:bride}};
  const line=weddingReplyText(party,()=>7);
  assert.match(line,new RegExp(`<@${groom}>`));assert.match(line,new RegExp(`<@${bride}>`));
  assert.doesNotMatch(line,/\{(?:groom|bride)\}/);
  assert.equal(weddingReplyText(party,()=>0),MARRIAGE_COPY[0].replace('{groom}',`<@${groom}>`).replace('{bride}',`<@${bride}>`));
  assert.match(getBotKnowledge('结婚 新郎 新娘 红盖头 礼堂'),/按消息中的提及顺序/);
});

test('the live hall PNG has the expected dimensions, guests, and preview attachment',async()=>{
  const people=[{id:groom,name:'新郎'},{id:bride,name:'新娘'},{id:guest,name:'来客'}];
  const hall=await renderWeddingHall(people);
  const bytes=new Uint8Array(await hall.png.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const view=new DataView(bytes.buffer,bytes.byteOffset);
  assert.equal(view.getUint32(16),hall.width);assert.equal(view.getUint32(20),hall.height);
  assert.equal(hall.width,1080);assert.equal(hall.guestCount,1);assert.ok(hall.height>=500);
  let request;
  const posted=await sendWeddingReply({BOT_TOKEN:'test'},{id:'marriage-test',channel_id:'channel'},{groom:people[0],bride:people[1],people},{fetcher:async(url,options)=>{request={url,options};return new Response('{}');},randomIndex:()=>3});
  assert.equal(posted.attendeeCount,3);assert.equal(request.url,'https://discord.com/api/v10/channels/channel/messages');
  const form=await request.options.body, payload=JSON.parse(form.get('payload_json'));
  assert.equal(payload.embeds.length,2);assert.equal(payload.embeds[0].image.url,'https://discord-holdem.aliceneko.workers.dev/art/wedding/v1.jpg');
  assert.equal(payload.embeds[1].image.url,'attachment://wedding-hall.png');
  assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.equal(payload.enforce_nonce,true);
  assert.match(payload.attachments[0].description,/新郎.*新娘.*来客/);
  assert.match(payload.content,/<@999000000000000002>/);assert.match(payload.content,/<@999000000000000003>/);
  assert.ok(form.get('files[0]').size>1000);
});

test('command dispatcher replies once and leaves non-marriage mentions to chat',async()=>{
  let sent=0;
  const message={id:'m-handler',channel_id:'channel',content:`<@${bot}> 结婚 <@${groom}> <@${bride}>`,mentions:[{id:groom,username:'新郎'},{id:bride,username:'新娘'}]};
  const fetcher=async()=>{sent++;return new Response('{}');};
  const result=await handleMarriageCommand({BOT_TOKEN:'test'},message,bot,{fetcher,randomIndex:()=>2});
  assert.equal(result.handled,true);assert.equal(result.attendeeCount,2);assert.equal(sent,1);
  assert.equal(await handleMarriageCommand({BOT_TOKEN:'test'},{...message,content:`<@${bot}> 你好`},bot,{fetcher}),null);
  assert.equal(sent,1);
});

test('maximum supported roster renders each of the 98 non-couple guests',async()=>{
  const people=Array.from({length:100},(_,i)=>({id:String(999000000000000000n+BigInt(i+1)),name:`来客${i+1}`}));
  const hall=await renderWeddingHall(people);
  assert.equal(hall.guestCount,98);assert.equal(hall.width,1080);assert.equal(hall.height,405+10*72);
});

test('wedding source art is registered and served with its immutable image headers',async()=>{
  const bytes=await readFile(new URL('./assets/art/wedding-v1.jpg',import.meta.url));
  const asset=imageAsset('wedding');
  assert.equal(asset.width,960);assert.equal(asset.height,640);assert.equal(asset.bytes,bytes.byteLength);
  assert.equal(asset.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(asset.filename,'wedding-v1.jpg');
  setStaticAssetTestBinding({fetch:async request=>new URL(request.url).pathname==='/art/wedding/v1.jpg'?new Response(bytes,{headers:{'Content-Type':'image/jpeg'}}):new Response('Not found',{status:404})});
  try{
    const response=await serveArt(new Request('https://example.test/art/wedding/v1.jpg'),{});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'public, max-age=31536000, immutable');
    assert.equal(response.headers.get('etag'),`"${asset.sha256}"`);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(bytes));
  }finally{setStaticAssetTestBinding(null);}
});
