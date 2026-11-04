import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AUCTION_OPPONENTS,AUCTION_NPC_STYLES} from './tavern-auction-opponents.mjs';
import {npcAuctionBid} from './tavern-auction.mjs';

test('the three public NPC identities reuse the approved portraits byte for byte and carry distinct bounded styles',()=>{
 const hashes=['444ef8bd77250261ee0f339ea4a1901eacd01e4777f2cd4d7bfee802ab317be9','b6611725a720d8ca48a4f5f7a6af0cb32d7a09d7a000b96205e7c7f726580d66','aec43b5db92bc2996e5f82d766086a26068c7aa9c8bfefcc26232cf47db8379d'];
 assert.equal(new Set(AUCTION_OPPONENTS.map(x=>x.key)).size,3);assert.deepEqual(AUCTION_OPPONENTS.map(x=>x.style),[0,1,2]);
 let total=0;for(const [i,p]of AUCTION_OPPONENTS.entries()){
  const data=readFileSync(new URL('.'+p.portrait.replace('/auction/','/web/auction/'),import.meta.url));total+=data.length;
  assert.equal(data.subarray(1,4).toString(),'PNG');assert.equal(data.readUInt32BE(16),512);assert.equal(data.readUInt32BE(20),512);
  assert.equal(createHash('sha256').update(data).digest('hex'),hashes[i]);
 }assert(total<900000);
});

test('making room NPC styles consistent cannot increase the two formerly aggressive offers on identical information and random draws',()=>{
 assert.deepEqual(AUCTION_NPC_STYLES.map(x=>x.factor),[.78,.94,1.08]);
 for(const budget of [4000000,7000000,11000000,17000000])for(let round=1;round<=5;round++)for(let roll=0;roll<=20;roll++){
  const random=n=>n===12?1:roll,value=budget*.8,quote=style=>npcAuctionBid({},round,style,random,100000,undefined,undefined,budget,()=>value),
   before=quote(2),aji=quote(0),cat=quote(1);
  assert(aji<=cat&&cat<=before);assert(before<=budget);assert(before<value);
 }
});
