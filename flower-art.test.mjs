import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FLOWERS} from './flower-shop.mjs';
test('each sale item has an independent served JPEG with bounded payload',async()=>{for(const x of FLOWERS){const bytes=await readFile(new URL(`./public/art/flowers/${x.id}.jpg`,import.meta.url));assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert(bytes.length>10000&&bytes.length<100000);assert(x.description.length>10);}});
