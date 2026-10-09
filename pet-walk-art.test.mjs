import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./worker.mjs',import.meta.url),'utf8').replace(/import \{ DurableObject \} from 'cloudflare:workers';/, 'class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source.replace(/from '\.\//g,`from '${new URL('./',import.meta.url).href}`).replace(/import\('\.\//g,`import('${new URL('./',import.meta.url).href}`)).toString('base64'))).default;
import {STAGES} from './pet-catalog.mjs';
import scenes from './pet-walk-art-data.mjs';
import maps from './pet-walk-map-data.mjs';
import {servePetWalkArt,petWalkMapEmbed,petWalkSceneEmbed,petHomeSceneEmbed,getPetWalkArtUrl} from './pet-walk-map.mjs';
const root='https://test.local';
test('six independent scene assets and six map states match committed bytes and fingerprints',async()=>{
 assert.deepEqual(Object.keys(scenes).sort(),['home',...STAGES.map(x=>x.id)].sort());
 assert.deepEqual(Object.keys(maps).sort(),['0','1','2','3','4','done']);
 for(const [type,records] of [['scenes',scenes],['maps',maps]])for(const [id,record]of Object.entries(records)){
  const isScene=type==='scenes',path=`./assets/pet-walk/${isScene?'':'maps/'}${id}.${isScene?'jpg':'png'}`;
  const bytes=await readFile(new URL(path,import.meta.url));assert.deepEqual(Buffer.from(record.base64,'base64'),bytes);
  assert.equal(bytes.length,record.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  if(isScene){assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert.equal(record.width,960);assert.equal(record.height,540);}
  else {assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),520);}
 }
 assert.equal(new Set(Object.values(scenes).map(x=>x.sha256)).size,6);
 assert.equal(new Set(Object.values(maps).map(x=>x.sha256)).size,6);
});
test('each scene and map public route supports GET, HEAD and conditional cache without accessing player state',async()=>{
 for(const [type,records,ext] of [['scenes',scenes,'jpg'],['maps',maps,'png']])for(const [id,record]of Object.entries(records)){
  const url=`${root}/art/pet-walk/${type}/${id}/v1.${ext}`;
  const response=await worker.fetch(new Request(url),{},{});assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),ext==='jpg'?'image/jpeg':'image/png');
  assert.equal(response.headers.get('Content-Length'),String(record.bytes));assert.match(response.headers.get('Cache-Control'),/immutable/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  const head=await servePetWalkArt(new Request(url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  const hit=await servePetWalkArt(new Request(url,{headers:{'If-None-Match':response.headers.get('ETag')}}));assert.equal(hit.status,304);assert.equal((await hit.arrayBuffer()).byteLength,0);
 }
});
test('unknown ids and versions rejected, assets read-only',async()=>{
 for(const path of ['scenes/unknown/v1.jpg','scenes/home/v2.jpg','maps/-1/v1.png','maps/5/v1.png','maps/0/v1.jpg','scenes/home/v1.png','scenes/constructor/v1.jpg'])assert.equal((await servePetWalkArt(new Request(`${root}/art/pet-walk/${path}`))).status,404);
 const r=await servePetWalkArt(new Request(`${root}/art/pet-walk/scenes/home/v1.jpg`,{method:'POST'}));assert.equal(r.status,405);assert.equal(r.headers.get('Allow'),'GET, HEAD');
 assert.equal(getPetWalkArtUrl('unknown'),null);
});
test('map and scene track actual stage, independent of action version and player identity',()=>{
 for(let step=0;step<5;step++){
  const view={pet:{name:'private-owner',species:'cat'},balance:9837,walk:{step,version:step+14,phase:'playing'}};
  const map=petWalkMapEmbed(view),scene=petWalkSceneEmbed(view);assert.match(map.image.url,new RegExp(`/maps/${step}/v1.png$`));assert.equal(scene.image.url,getPetWalkArtUrl(STAGES[step].id));
  assert.doesNotMatch(JSON.stringify([map,scene]),/private-owner|9837/);
 }
 assert.match(petWalkMapEmbed({pet:{},walk:{step:5,phase:'done'}}).image.url,/maps\/done\//);
 assert.equal(petWalkSceneEmbed({pet:{},walk:{step:5,phase:'done'}}).image.url,getPetWalkArtUrl('tavern-porch'));
 assert.equal(petWalkMapEmbed({pet:{},walk:{step:9,phase:'playing'}}),null);assert.equal(petWalkSceneEmbed({pet:{},walk:{step:9,phase:'playing'}}),null);
 assert.equal(petWalkMapEmbed({pet:{}}),null);assert.equal(petWalkSceneEmbed({}),null);assert.equal(petHomeSceneEmbed({}),null);assert.equal(petHomeSceneEmbed({pet:{}}).image.url,getPetWalkArtUrl('home'));
});
