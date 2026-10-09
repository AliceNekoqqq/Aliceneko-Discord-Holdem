import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PETS} from './pet-catalog.mjs';
import records from './pet-art-data.mjs';
import {getPetArtUrl,petArtEmbed,servePetArt} from './pet-art.mjs';

test('all fifteen coat portraits have stable JPEG URLs and the exact generated repository bytes',async()=>{
 const pairs=PETS.flatMap(p=>p.coats.map(c=>[p.id,c.id]));assert.equal(pairs.length,15);assert.equal(Object.keys(records).length,15);
 for(const[species,coat]of pairs){
  const url=getPetArtUrl(species,coat),data=records[`${species}:${coat}`],disk=readFileSync(new URL(`./assets/pets/${species}-${coat}-v1.jpg`,import.meta.url));
  assert.match(url,new RegExp(`/art/pets/${species}/${coat}/v1.jpg$`));assert.equal(petArtEmbed(species,coat)[0].image.url,url);
  assert.equal(disk.length,data.bytes);assert.equal(createHash('sha256').update(disk).digest('hex'),data.sha256);assert.deepEqual(Buffer.from(data.base64,'base64'),disk);
  const reply=await servePetArt(new Request(url));assert.equal(reply.status,200);assert.equal(reply.headers.get('Content-Type'),'image/jpeg');assert.deepEqual(Buffer.from(await reply.arrayBuffer()),disk);
  const cached=await servePetArt(new Request(url,{headers:{'If-None-Match':reply.headers.get('ETag')}}));assert.equal(cached.status,304);assert.equal(await cached.text(),'');
 }
});
test('portrait HEAD, version validation and unknown species or coat never expose another image',async()=>{
 const url=getPetArtUrl('lamp-cat','amber'),head=await servePetArt(new Request(url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Length'),String(records['lamp-cat:amber'].bytes));
 assert.equal(getPetArtUrl('lamp-cat'),url);assert.equal(getPetArtUrl('unknown','amber'),null);
 for(const path of ['/art/pets/lamp-cat/unknown/v1.jpg','/art/pets/lamp-cat/amber/v2.jpg','/art/pets/constructor/amber/v1.jpg','/art/pets/lamp-cat/amber/v1.jpg/extra'])assert.equal((await servePetArt(new Request('https://unit.test'+path))).status,404);
 assert.equal((await servePetArt(new Request(url,{method:'POST'}))).status,405);
});
