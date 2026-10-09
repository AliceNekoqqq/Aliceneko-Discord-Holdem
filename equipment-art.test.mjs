import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {MENU} from './tavern-catalog.mjs';
import {RENOVATION_ITEMS} from './tavern-renovation-catalog.mjs';
import {equipmentAsset,equipmentArtUrl,serveEquipmentArt} from './equipment-art.mjs';
import {getArtUrl,serveArt,loadArt} from './tavern-art.mjs';
import manifest from './equipment-art-manifest.mjs';
const expected=[...RENOVATION_ITEMS.filter(x=>x.artId).map(x=>x.artId),...MENU.filter(x=>x.requiresEquipment).map(x=>x.id)];
test('all four devices and nine recipes have independent matching published JPEGs',async()=>{
 assert.equal(expected.length,13);assert.equal(Object.keys(manifest).length,13);
 for(const id of expected){
  const a=equipmentAsset(id);assert(a.bytes>1000,id);assert.equal(a.width,768);assert.equal(a.height,768);
  const original=readFileSync(new URL(a.file,import.meta.url));assert.equal(original.length,a.bytes);assert.equal(createHash('sha256').update(original).digest('hex'),a.sha256);
  assert.equal(getArtUrl(id),equipmentArtUrl(id));const art=await loadArt(id);assert.deepEqual(art.data,new Uint8Array(original));
  const r=await serveArt(new Request(equipmentArtUrl(id)));assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/jpeg');assert.match(r.headers.get('Cache-Control'),/immutable/);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array(original));
 }
});
test('new product image routes handle HEAD, ETag, allowed methods and strict paths',async()=>{
 const url=equipmentArtUrl('cappuccino'),get=await serveEquipmentArt(new Request(url));
 const head=await serveEquipmentArt(new Request(url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('Content-Length'),get.headers.get('Content-Length'));
 const cached=await serveEquipmentArt(new Request(url,{headers:{'If-None-Match':get.headers.get('ETag')}}));assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
 assert.equal((await serveEquipmentArt(new Request(url,{method:'POST'}))).status,405);
 for(const path of ['constructor/v1.jpg','cappuccino/v2.jpg','cappuccino/v1.jpg/extra','unknown/v1.jpg'])assert.equal((await serveEquipmentArt(new Request('https://example.com/art/equipment/'+path))).status,404);
 assert.equal(equipmentArtUrl('../cappuccino'),null);assert.equal(equipmentAsset('toString'),null);
});
