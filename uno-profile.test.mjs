import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as game from './uno-engine.mjs';
import {AVATARS,ACCENTS,avatarEmoji,normalizedProfile} from './uno-profile.mjs';
import {emojiBitmap,paintEmoji} from './emoji-art.mjs';
import {Canvas} from './card-image.mjs';
import {board,socialMenu,command,HELP} from './uno-ui.mjs';
import {publicTableSnapshot,boardImageMessage,renderTableImage,seatLayout} from './uno-image.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function table(){const t=game.newTable('1','2','3');game.join(t,'4');t.players.forEach((p,n)=>{p.name=['ALICE','BOB'][n];p.cards=[1,2,3];});t.phase='active';t.turn='1';t.color='red';t.discard=[3];t.deadline=Date.now()+60000;return t;}
const bytes=async r=>Buffer.from(await r.body.get('files[0]').arrayBuffer());
test('all eighteen emoji are distinct RGBA sprites, can be painted offline, and invalid profiles use safe defaults',async()=>{
 const seen=new Set(),old=globalThis.fetch;globalThis.fetch=()=>{throw Error('emoji must be offline');};try{for(const key of Object.keys(AVATARS)){const bits=await emojiBitmap(key);assert.equal(bits.length,64*64*4);seen.add(digest(bits));const c=new Canvas(64,64),before=digest(c.pixels);paintEmoji(c,bits,4,4,56);assert.notEqual(digest(c.pixels),before);}assert.equal(seen.size,18);assert.equal(await emojiBitmap('unknown'),await emojiBitmap('butterfly'));}finally{globalThis.fetch=old;}assert.deepEqual(normalizedProfile({avatar:'http://example.com',accent:'__proto__'}),{avatar:'butterfly',accent:'rose',entrance:'none',victory:'none',entranceApp:'none',victoryApp:'none'});assert.equal(avatarEmoji({bot:true}),'🤖');
});
test('appearance invalidates public picture, contains no private cards, and changes leave layout/turn untouched',async()=>{
 const t=table(),before=publicTableSnapshot(t),a=await boardImageMessage(t,board(t));assert(a.body instanceof FormData);t.players[0].avatar='fox';t.players[0].accent='sky';const after=publicTableSnapshot(t),b=await boardImageMessage(t,board(t),{signature:a.signature,id:'old'});assert(b.body instanceof FormData);assert.notEqual(a.signature,b.signature);assert.notEqual(digest(await bytes(a)),digest(await bytes(b)));assert.equal(after.turn,before.turn);assert.deepEqual(seatLayout(before.seats.length),seatLayout(after.seats.length));for(const forbidden of ['cards','deck','handBefore','token'])assert(!JSON.stringify(after).includes(forbidden));assert.equal(after.seats[0].avatar,'fox');assert(JSON.stringify(board(t)).includes('🦊'));t.players[0].cards=[17,38,60];assert.deepEqual(publicTableSnapshot(t),after);
});
test('king crown decorates chosen emoji without changing active green outline; expiry removes crown and gold plate',async()=>{
 const t=table();t.players[0].avatar='cat';t.crown={id:'1',choice:'title',validUntil:Date.now()+60000};const m=publicTableSnapshot(t);assert.equal(m.seats[0].avatar,'cat');assert.equal(m.seats[0].crown,true);const calls=[],original=Canvas.prototype.rect;try{Canvas.prototype.rect=function(x,y,w,h,color,radius){calls.push({x,y,w,h,color});return original.call(this,x,y,w,h,color,radius);};await renderTableImage(m);}finally{Canvas.prototype.rect=original;}assert(calls.some(r=>r.w===184&&r.h===112&&String(r.color)==='114,241,176'));assert(calls.some(r=>r.w===111&&r.h===30&&String(r.color)==='82,62,29'));
 const expired=publicTableSnapshot(t,t.crown.validUntil+1);assert(!expired.seats[0].crown);assert.equal(expired.seats[0].avatar,'cat');const before=Buffer.from(await(await renderTableImage(m)).arrayBuffer()),after=Buffer.from(await(await renderTableImage(expired)).arrayBuffer());assert.notEqual(digest(before),digest(after));t.crown.choice='role';assert(!publicTableSnapshot(t).seats[0].crown);
});
test('single-seat menu is explicit, settings entry is universal and Discord command/help expose personal settings',()=>{
 const t=game.newTable('1','2','3'),data=socialMenu(t,'1');assert(data.content.includes('只有你一位'));assert.equal(data.components.length,0);assert(!JSON.stringify(data).includes('options'));const controls=board(t).components.flatMap(r=>r.components);assert(controls.some(c=>c.custom_id==='v:3:any:open'));assert(command.options.some(o=>o.name==='个人设置'));assert(HELP.includes('/uno 个人设置'));assert(HELP.length<=2000);for(const c of controls)assert(c.custom_id.length<=100);
});

test('victory emotes appear only for eligible winners, including both unsurrendered teammates',async()=>{
 const t=table();t.phase='settled';t.winner='1';t.roundPoints=42;t.players[0].victory='fire';t.players[1].victory='cat';let data=board(t);assert(JSON.stringify(data).includes('🔥 ALICE 的胜利表情'));assert(!JSON.stringify(data).includes('🐱 BOB 的胜利表情'));const a=await renderTableImage(publicTableSnapshot(t));t.players[0].victory='none';const b=await renderTableImage(publicTableSnapshot(t));assert.notEqual(digest(Buffer.from(await a.arrayBuffer())),digest(Buffer.from(await b.arrayBuffer())));t.mode='teams';t.winningTeam=0;t.players.push({id:'5',name:'TEAMMATE',cards:[],victory:'star'});assert(JSON.stringify(board(t)).includes('⭐ TEAMMATE 的胜利表情'));t.players[2].surrendered=true;assert(!JSON.stringify(board(t)).includes('TEAMMATE 的胜利表情'));
});
