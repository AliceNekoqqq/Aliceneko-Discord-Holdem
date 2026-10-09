import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TavernService} from './tavern-service.mjs';
import {TavernMapPresentation} from './tavern-map-presentation.mjs';

function host(){
 const db=new DatabaseSync(':memory:'),values=new Map(),storage={sql:{exec(q,...args){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...args);return {toArray:()=>rows,one:()=>rows[0]};}s.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))};
 const h={ctx:{storage},tavern:new TavernService(storage)};return h;
}
test('scene renderer is passive during live refresh, while the legacy map route remains PNG',async()=>{
 const h=host(),view=new TavernMapPresentation(h),now=Date.parse('2026-10-09T12:00:00Z');
 const passive=await view.renderScene({guild:'3',id:'1',channel:'2',passive:true},now);
 assert.equal(passive.visitorCount,0);assert.equal(passive.scene.filename,'tavern-scene.gif');assert.equal(passive.scene.mime,'image/gif');
 assert.equal(h.tavern.map.board(now).visitorCount,0);
 const map=await view.render({guild:'3',id:'1',channel:'2',name:'Alice'},now);
 assert.equal(map.visitorCount,1);assert.equal(new TextDecoder().decode(Uint8Array.from(atob(map.png),c=>c.charCodeAt(0)).slice(1,4)),'PNG');
 assert.equal(h.tavern.rows('SELECT * FROM tavern_members').length,0);
});

test('art updates replace cached images even when the room snapshot has not changed',async()=>{
 const h=host(),view=new TavernMapPresentation(h),now=Date.parse('2026-10-09T12:00:00Z'),p={guild:'3',id:'1',channel:'2',passive:true};
 const snapshot=await view.snapshot(p,now);
 const oldSignature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot))))).map(n=>n.toString(16).padStart(2,'0')).join('');
 await h.ctx.storage.put('tavernSceneImageCache',{signature:oldSignature,filename:'old.gif',mime:'image/gif',data:btoa('stale-image')});
 await h.ctx.storage.put('tavernMapImageCache',{signature:oldSignature,png:btoa('stale-image')});
 const scene=await view.renderScene(p,now),png=await view.render(p,now);
 assert.equal(scene.scene.filename,'tavern-scene.gif');
 assert.equal(atob(scene.scene.data).slice(0,6),'GIF89a');
 assert.deepEqual([...Uint8Array.from(atob(png.png),c=>c.charCodeAt(0)).slice(0,8)],[137,80,78,71,13,10,26,10]);
 assert.notEqual((await h.ctx.storage.get('tavernSceneImageCache')).signature,oldSignature);
 assert.equal(h.tavern.rows('SELECT * FROM tavern_members').length,0);
});
