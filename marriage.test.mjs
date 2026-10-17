import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {marriageCommand,weddingPartyFromInteraction,weddingReplyText,sendWeddingReply,completeMarriageInteraction,MARRIAGE_COPY,WESTERN_MARRIAGE_COPY} from './marriage.mjs';
import {renderWeddingHall} from './marriage-image.mjs';
import {getBotKnowledge} from './bot-knowledge.mjs';
import {imageAsset,serveArt} from './tavern-art.mjs';
import {setStaticAssetTestBinding} from './static-art.mjs';

const groom='999000000000000002',bride='999000000000000003',guest='999000000000000004';
function interaction(options=[
  {name:'新郎',type:6,value:groom},{name:'新娘',type:6,value:bride},{name:'宾客1',type:6,value:guest}
]){
  return {application_id:'123456789012345678',token:'temporary-token',guild_id:'1',channel_id:'2',member:{user:{id:'5'}},data:{name:'结婚',options,resolved:{
    users:{[groom]:{id:groom,username:'groom'},[bride]:{id:bride,username:'bride'},[guest]:{id:guest,username:'guest'}},
    members:{[groom]:{nick:'新郎'},[bride]:{nick:'新娘'},[guest]:{nick:'宾客'}}
  }}};
}

test('婚礼通过 /结婚 注册斜杠指令，先选新人、可选类型，再选宾客',()=>{
  assert.equal(marriageCommand.name,'结婚');
  assert.deepEqual(marriageCommand.options.slice(0,2).map(option=>[option.name,option.type,option.required]),[['新郎',6,true],['新娘',6,true]]);
  assert.deepEqual(marriageCommand.options[2],{type:3,name:'婚礼类型',description:'选择中式或西式婚礼',required:false,choices:[{name:'中式婚礼',value:'chinese'},{name:'西式婚礼',value:'western'}]});
  assert.deepEqual(marriageCommand.options.slice(3).map(option=>option.name),Array.from({length:8},(_,i)=>`宾客${i+1}`));
  assert.deepEqual(marriageCommand.options.map(option=>option.type),[6,6,3,...Array(8).fill(6)]);
  assert.match(getBotKnowledge('结婚 新郎 新娘 红盖头 礼堂'),/斜杠指令 \/结婚/);
  assert.match(getBotKnowledge('结婚 婚礼类型 西式'),/西式婚礼/);
});

test('named slash options set the couple and optional guests in the live hall',()=>{
  const party=weddingPartyFromInteraction(interaction());
  assert.equal(party.type,'chinese','Chinese ceremony remains the default');
  assert.equal(party.groom.id,groom);assert.equal(party.bride.id,bride);
  assert.deepEqual(party.people.map(person=>[person.id,person.name]),[[groom,'新郎'],[bride,'新娘'],[guest,'宾客']]);
  const western=weddingPartyFromInteraction(interaction([
    {name:'新郎',type:6,value:groom},{name:'新娘',type:6,value:bride},{name:'婚礼类型',type:3,value:'western'}
  ]));
  assert.equal(western.type,'western');
  assert.deepEqual(weddingPartyFromInteraction(interaction([
    {name:'新郎',type:6,value:groom},{name:'新娘',type:6,value:bride},{name:'婚礼类型',type:3,value:'unknown'}
  ])),{error:'请选择有效的婚礼类型。'});
  assert.deepEqual(weddingPartyFromInteraction(interaction([
    {name:'新郎',type:6,value:groom},{name:'新娘',type:6,value:groom}
  ])),{error:'新郎和新娘需要是两位不同的成员。'});
  const botInteraction=interaction();botInteraction.data.resolved.users[guest].bot=true;
  assert.deepEqual(weddingPartyFromInteraction(botInteraction),{error:'新郎、新娘和宾客都需要选择真人账号。'});
});

test('random ceremony copy always fills both user mentions',()=>{
  assert.equal(MARRIAGE_COPY.length,10);assert.equal(WESTERN_MARRIAGE_COPY.length,10);
  const party={groom:{id:groom},bride:{id:bride}};
  const line=weddingReplyText(party,()=>7);
  assert.match(line,new RegExp(`<@${groom}>`));assert.match(line,new RegExp(`<@${bride}>`));
  assert.doesNotMatch(line,/\{(?:groom|bride)\}/);
  assert.equal(weddingReplyText(party,()=>0),MARRIAGE_COPY[0].replace('{groom}',`<@${groom}>`).replace('{bride}',`<@${bride}>`));
  assert.equal(weddingReplyText(party,()=>0,'western'),WESTERN_MARRIAGE_COPY[0].replace('{groom}',`<@${groom}>`).replace('{bride}',`<@${bride}>`));
  assert.notEqual(weddingReplyText(party,()=>0,'western'),weddingReplyText(party,()=>0,'chinese'));
});

test('the live hall PNG is attached to the completed slash response',async()=>{
  const members=interaction(),party=weddingPartyFromInteraction(members),hall=await renderWeddingHall(party.people);
  const westernHall=await renderWeddingHall(party.people,'western');
  assert.equal(hall.type,'chinese');assert.equal(westernHall.type,'western');
  assert.notDeepEqual(new Uint8Array(await westernHall.png.arrayBuffer()),new Uint8Array(await hall.png.arrayBuffer()));
  const bytes=new Uint8Array(await hall.png.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const view=new DataView(bytes.buffer,bytes.byteOffset);
  assert.equal(view.getUint32(16),hall.width);assert.equal(view.getUint32(20),hall.height);
  assert.equal(hall.width,1080);assert.equal(hall.guestCount,1);assert.ok(hall.height>=500);
  let request;
  const posted=await sendWeddingReply({BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123456789012345678'},members,party,{fetcher:async(url,options)=>{request={url,options};return new Response('{}');},randomIndex:()=>3});
  assert.equal(posted.attendeeCount,3);
  assert.equal(request.url,'https://discord.com/api/v10/webhooks/123456789012345678/temporary-token/messages/@original');
  assert.equal(request.options.method,'PATCH');
  const form=request.options.body,payload=JSON.parse(form.get('payload_json'));
  assert.equal(payload.embeds.length,2);assert.equal(payload.embeds[0].image.url,'https://discord-holdem.aliceneko.workers.dev/art/wedding/v1.jpg');
  assert.equal(payload.embeds[1].image.url,'attachment://wedding-hall.png');
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  assert.match(payload.attachments[0].description,/新郎.*新娘.*宾客/);
  assert.match(payload.content,/<@999000000000000002>/);assert.match(payload.content,/<@999000000000000003>/);
  assert.ok(form.get('files[0]').size>1000);
  const westernInteraction=interaction([{name:'新郎',type:6,value:groom},{name:'新娘',type:6,value:bride},{name:'婚礼类型',type:3,value:'western'}]);
  let westernRequest;
  await sendWeddingReply({BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123456789012345678'},westernInteraction,weddingPartyFromInteraction(westernInteraction),{
    fetcher:async(url,options)=>{westernRequest={url,options};return new Response('{}');},randomIndex:()=>0
  });
  const westernPayload=JSON.parse(westernRequest.options.body.get('payload_json'));
  assert.equal(westernPayload.embeds[0].title,'小酒馆 · 西式婚礼');
  assert.equal(westernPayload.embeds[0].image.url,'https://discord-holdem.aliceneko.workers.dev/art/wedding-western/v1.jpg');
  assert.equal(westernPayload.embeds[1].title,'西式礼堂现场');
  assert.match(westernPayload.content,/花拱门/);
  assert.match(westernPayload.attachments[0].description,/西式小酒馆婚礼礼堂现场/);
});

test('slash completion updates invalid input without drawing or sending a ceremony',async()=>{
  const request={...interaction([{name:'新郎',type:6,value:groom}]),data:{name:'结婚',options:[{name:'新郎',type:6,value:groom}]}};
  let call;
  const result=await completeMarriageInteraction({BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123456789012345678'},request,{fetcher:async(url,options)=>{call={url,options};return new Response('{}');}});
  assert.deepEqual(result,{handled:true,error:true});
  assert.equal(call.options.method,'PATCH');
  assert.match(JSON.parse(call.options.body).content,/新娘/);
  assert.deepEqual(JSON.parse(call.options.body).allowed_mentions,{parse:[]});
});

test('a definite image upload rejection clears the deferred reply with a readable error',async()=>{
  const calls=[];
  await assert.rejects(completeMarriageInteraction({BOT_TOKEN:'test',DISCORD_APPLICATION_ID:'123456789012345678'},interaction(),{randomIndex:()=>0,fetcher:async(url,options)=>{
    calls.push({url,options});return new Response('{}',{status:calls.length===1?500:200});
  }}),/discord_reply_failed/);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.method,'PATCH');
  assert.match(JSON.parse(calls[1].options.body).content,/图片暂时没能送出/);
});

test('the image renderer remains bounded and lays out every supported guest',async()=>{
  const people=Array.from({length:10},(_,i)=>({id:String(999000000000000000n+BigInt(i+1)),name:`来客${i+1}`}));
  const hall=await renderWeddingHall(people);
  assert.equal(hall.guestCount,8);assert.equal(hall.width,1080);assert.equal(hall.height,500);
});

test('both wedding source illustrations are registered and served immutably',async()=>{
  for(const id of ['wedding','wedding-western']){
    const bytes=await readFile(new URL(`./assets/art/${id}-v1.jpg`,import.meta.url));
    const asset=imageAsset(id);
    assert.equal(asset.width,960);assert.equal(asset.height,640);assert.equal(asset.bytes,bytes.byteLength);
    assert.equal(asset.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(asset.filename,`${id}-v1.jpg`);
    setStaticAssetTestBinding({fetch:async request=>new URL(request.url).pathname===`/art/${id}/v1.jpg`?new Response(bytes,{headers:{'Content-Type':'image/jpeg'}}):new Response('Not found',{status:404})});
    try{
      const response=await serveArt(new Request(`https://example.test/art/${id}/v1.jpg`),{});
      assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'public, max-age=31536000, immutable');
      assert.equal(response.headers.get('etag'),`"${asset.sha256}"`);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(bytes));
    }finally{setStaticAssetTestBinding(null);}
  }
});
