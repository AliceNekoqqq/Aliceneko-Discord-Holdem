import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { renderCardImage, imageMessage } from './card-image.mjs';
import * as game from './engine.mjs';
import { handPanel } from './ui.mjs';

test('PNG is decodable, compact, deterministic and shows red/black cards with empty positions',async()=>{
 const blob=await renderCardImage([12,24],[38,39,8]),png=Buffer.from(await blob.arrayBuffer());
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png.readUInt32BE(16),760);assert.equal(png.readUInt32BE(20),580);assert(png.length<60000);
 let pos=8;const compressed=[];while(pos<png.length){const length=png.readUInt32BE(pos),type=png.toString('ascii',pos+4,pos+8);if(type==='IDAT')compressed.push(png.subarray(pos+8,pos+8+length));pos+=length+12;}
 const rgb=inflateSync(Buffer.concat(compressed));assert.equal(rgb.length,(760*3+1)*580);
 const pixel=(x,y)=>[...rgb.subarray(y*(760*3+1)+1+x*3,y*(760*3+1)+4+x*3)];
 assert.deepEqual(pixel(290,162),[32,39,53]);assert.deepEqual(pixel(468,162),[184,48,76]);assert.deepEqual(pixel(495,401),[45,62,78]);
 assert.deepEqual(Buffer.from(await (await renderCardImage([12,24],[38,39,8])).arrayBuffer()),png);
 const changed=Buffer.from(await (await renderCardImage([11,24],[38,39,8])).arrayBuffer());assert.notDeepEqual(changed,png);
 await assert.rejects(renderCardImage([52,1]),/Invalid cards/);await assert.rejects(renderCardImage([0,1],[0]),/Invalid cards/);
});
test('private multipart carries only the viewer hand, reuses unchanged images and retains text fallback',async()=>{
 const t=game.newTable('1','2','3');game.join(t,'4');game.start(t,'1');
 const data={...handPanel(t,'1'),flags:64},result=await imageMessage(t,'1',data);
 assert(result.body instanceof FormData);const payload=JSON.parse(result.body.get('payload_json'));
 assert.equal(payload.flags,64);assert.equal(payload.attachments.length,1);assert.equal(result.body.get('files[0]').type,'image/png');assert(payload.attachments[0].description.includes(game.cardsText(t.players[0].cards)));
 assert(!payload.attachments[0].description.includes(game.cardsText(t.players[1].cards)));assert(!data.embeds[0].image);
 const retained=await imageMessage(t,'1',data,{id:'987',signature:result.signature});assert(!(retained.body instanceof FormData));assert.deepEqual(retained.body.attachments,[{id:'987',filename:'hand-1.png'}]);
 const hidden=await imageMessage(t,'1',{content:'底牌已收起。',embeds:[]},{id:'987',signature:result.signature});assert.deepEqual(hidden.body.attachments,[]);
});
