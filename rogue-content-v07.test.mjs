import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { CATALOG_V06 } from './rogue-content-v06.mjs';
import { CATALOG_V07, PROFESSIONS, ITEMS, EVENTS, DIFFICULTIES, getCatalog } from './rogue-content-v07.mjs';

test('v0.7 catalog, professions, and difficulty ladder satisfy the contract',()=>{
 assert.equal(CATALOG_V07.version,'0.7');assert.equal(getCatalog('lantern-rules-v0.7'),CATALOG_V07);assert.equal(getCatalog('lantern-rules-v0.6'),CATALOG_V06);assert.equal(getCatalog('lantern-rules-v0.4'),CATALOG);assert.equal(CATALOG.version,'0.3');
 assert.deepEqual(Object.keys(PROFESSIONS),['traveler','warden','brewer','messenger','smith','medic','tamer','forger']);
 for(const [id,p] of Object.entries(PROFESSIONS)){
  assert.equal(p.starterDeck.length,8,id);assert.deepEqual(p.starterDeck.slice(0,4),['slash','pierce','guard','bandage']);
  const unique=p.starterDeck.slice(4);assert.equal(new Set(unique).size,4,id);assert.ok(unique.every(c=>!(c in CATALOG_V06.cards)),`${id} unique starters`);
  const effects=unique.map(c=>CATALOG_V07.cards[c]).flatMap(c=>c.effects);
  assert.ok(effects.some(e=>['damage','pet_attack','weapon_attack','damage_from_shield'].includes(e.kind)),`${id} has attack`);
  assert.ok(effects.some(e=>e.kind==='block'),`${id} has defense`);assert.ok(effects.some(e=>e.kind==='heal'),`${id} has recovery`);
  assert.ok(CATALOG_V07.relics[p.starterRelic],`${id} starter relic`);
 }
 assert.equal(DIFFICULTIES.length,11);assert.deepEqual(DIFFICULTIES.map(x=>x.level),[0,1,2,3,4,5,6,7,8,9,10]);
 assert.equal(CATALOG_V07.player.maxHp,30);assert.equal(CATALOG_V07.player.energy,3);assert.equal(CATALOG_V07.player.draw,5);assert.equal(CATALOG_V07.player.playLimit,3);assert.equal(CATALOG_V07.player.turnLimit,12);
});

test('new cards, relics, items, and all twelve events are real catalog content',()=>{
 const newCards=Object.keys(CATALOG_V07.cards).filter(id=>!(id in CATALOG_V06.cards));assert.ok(newCards.length>=16,newCards.length);
 for(const id of newCards){const c=CATALOG_V07.cards[id];assert.ok(c.name&&c.description&&c.effects.length&&c.upgrade.effects.length);assert.ok(c.effects.every(e=>Number.isFinite(e.value)));}
 const newRelics=Object.keys(CATALOG_V07.relics).filter(id=>!(id in CATALOG_V06.relics));assert.ok(newRelics.length>=6);assert.ok(newRelics.every(id=>CATALOG_V07.eliteRelics.includes(id)), 'all added relics can be rewarded');
 assert.ok(Object.keys(ITEMS).length>=10);assert.equal(CATALOG_V07.items,ITEMS);assert.equal(EVENTS.length,12);assert.equal(new Set(EVENTS.map(e=>e.eventId)).size,12);
 const choices=new Set(['heal','card','trade','item','upgrade','remove','gain','leave']);
 for(const event of EVENTS){assert.ok(event.title&&event.description);assert.ok(event.choices.includes('leave'));assert.ok(event.choices.every(c=>choices.has(c)),event.eventId);}
 for(const act of CATALOG_V07.acts){for(const id of [...act.normalPool,...act.elitePool,...act.bossPool])assert.ok(CATALOG_V07.enemies[id],id);}
 for(const id of CATALOG_V07.acts.flatMap(a=>a.bossPool))assert.ok(CATALOG_V07.enemies[id].phaseIntents?.length,`${id} phase two`);
});
