import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from './uno-engine.mjs';
import {board} from './uno-ui.mjs';
import {glyphs} from './card-glyphs.mjs';
import {Canvas} from './card-image.mjs';
import {publicTableSnapshot,seatLayout,renderTableImage,boardImageMessage} from './uno-image.mjs';
function table(count=4,mode='round'){
 const t=game.newTable('1','2','3',mode);game.addComputers(t,'1',count-1);t.phase='active';t.turn='1';t.handNo=1;t.color='red';t.discard=[3];t.players[0].name='红豆粉🐈';t.players.forEach(p=>p.cards=[11,33,70]);return t;
}
const pngBytes=async r=>Buffer.from(await r.body.get('files[0]').arrayBuffer());
test('public table model exposes only seat order and counts, never private identities or challenge snapshots',async()=>{
 const t=table();t.deck=[77,88];t.pending={kind:'draw4',count:6,handBefore:[104,16]};t.selectedWild={id:'1',card:105};
 const a=publicTableSnapshot(t);for(const key of ['handBefore','deck','selectedWild','cards'])assert(!JSON.stringify(a).includes(key));assert.equal(a.seats[0].count,3);
 t.players[0].cards=[1,2,4];t.deck=[100];t.pending.handBefore=[9];t.selectedWild.card=106;assert.deepEqual(publicTableSnapshot(t),a);
});
test('table image cache includes turn, count, seats, names, direction, penalty, teams and winner, but ignores private choices',async()=>{
 const t=table(),a=await boardImageMessage(t,board(t));assert(a.body instanceof FormData);const existing={signature:a.signature,id:'image'};
 const same=await boardImageMessage(t,board(t),existing);assert(!(same.body instanceof FormData));assert.equal(same.body.attachments[0].id,'image');
 for(const mutate of [t=>t.turn=t.players[1].id,t=>t.direction=-1,t=>t.players[0].cards.push(44),t=>t.players[0].name='NEW NAME',t=>t.mode='teams',t=>t.pending={kind:'draw2',count:8},t=>t.players.reverse(),t=>{t.phase='settled';t.winner='1';}]){
  const changed=structuredClone(t);mutate(changed);const r=await boardImageMessage(changed,board(changed),existing);assert(r.body instanceof FormData);assert.notEqual(r.signature,a.signature);assert.notDeepEqual(await pngBytes(r),await pngBytes(a));
 }
 t.selectedWild={id:'1',card:104};t.pages={'1':2};const privateChoice=await boardImageMessage(t,board(t),existing);assert.equal(privateChoice.signature,a.signature);
});
test('fixed clockwise seats fit without overlaps for 2–10 players; 2v2 teammates are opposite',()=>{
 for(let n=2;n<=10;n++){const seats=seatLayout(n);assert.equal(seats.length,n);assert.deepEqual(seats[0],{x:480,y:156,angle:-Math.PI/2});for(let i=0;i<n;i++){const a=seats[i];assert(a.x>=92&&a.x<=868&&a.y>=101&&a.y<=714);for(let j=i+1;j<n;j++){const b=seats[j];assert(Math.abs(a.x-b.x)>=184||Math.abs(a.y-b.y)>=112,`${n} seats: ${i}/${j} overlap`);}}}
 const s=seatLayout(4);assert.equal(s[0].x,s[2].x);assert.equal(s[1].y,s[3].y);assert.equal(s[0].y+s[2].y,860);assert.equal(s[1].x+s[3].x,960);
 const t=table(4,'teams');assert.deepEqual(publicTableSnapshot(t).seats.map(s=>s.team),[0,1,0,1]);
});
test('jump window expiry changes next-player waiting to active green without moving seats; settled table has no stale turn',async()=>{
 const t=table();t.jumpWindow={until:Date.now()+60000};const open=publicTableSnapshot(t),expired=publicTableSnapshot(t,t.jumpWindow.until+1);assert(open.jumping);assert(!expired.jumping);assert.deepEqual(open.seats,expired.seats);assert.notDeepEqual(Buffer.from(await(await renderTableImage(open)).arrayBuffer()),Buffer.from(await(await renderTableImage(expired)).arrayBuffer()));
 t.phase='settled';t.winner='1';const settled=publicTableSnapshot(t);assert.equal(settled.turn,null);assert(settled.seats[0].winner);
});
test('lobby and unusual nicknames produce images; closure clears image; full Unicode names survive in alt text',async()=>{
 for(const count of [2,4,10]){const t=table(count);t.phase='lobby';t.turn=null;t.discard=[];t.players[0].name='🌸紅豆粉🙂长名字';const r=await boardImageMessage(t,board(t));assert(r.body instanceof FormData);const bytes=await pngBytes(r);assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),820);const body=JSON.parse(r.body.get('payload_json'));assert(body.attachments[0].description.includes(t.players[0].name));t.phase='closed';const closed=await boardImageMessage(t,board(t));assert.deepEqual(closed.body.attachments,[]);assert(!closed.body.embeds[0].image);}
});
test('all supported player names are visibly drawn instead of disappearing during width fitting',async()=>{
 const t=table();t.players[0].name='AliceNeko';const m=publicTableSnapshot(t);const drawn=[];const orig=Canvas.prototype.text;try{Canvas.prototype.text=function(value,x,y,size,...args){assert(Number.isFinite(size));assert([...value].every(c=>glyphs[c]),value);drawn.push(value);return orig.call(this,value,x,y,size,...args);};await renderTableImage(m);}finally{Canvas.prototype.text=orig;}
 assert(drawn.includes('AliceNeko'));assert(drawn.includes('行动中'));
});
