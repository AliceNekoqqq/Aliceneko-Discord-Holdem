import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { CATALOG_V06 } from './rogue-content-v06.mjs';
import { CATALOG_V07 } from './rogue-content-v07.mjs';
import { CATALOG_V08, PROFESSIONS, ITEMS, EVENTS, DIFFICULTIES, getCatalog } from './rogue-content-v08.mjs';

test('v0.8 catalog preserves version routing and profession deck structure',()=>{
  assert.equal(CATALOG_V08.version,'0.8');
  assert.equal(getCatalog('lantern-rules-v0.8'),CATALOG_V08);
  assert.equal(getCatalog('lantern-rules-v0.7'),CATALOG_V07);
  assert.equal(getCatalog('lantern-rules-v0.6'),CATALOG_V06);
  assert.equal(getCatalog('lantern-rules-v0.4'),CATALOG);
  assert.deepEqual(Object.keys(PROFESSIONS),['traveler','warden','brewer','messenger','smith','medic','tamer','forger']);
  for(const [id,p] of Object.entries(PROFESSIONS)){
    assert.equal(p.starterDeck.length,8,id);
    assert.deepEqual(p.starterDeck.slice(0,4),['slash','pierce','guard','bandage']);
    const unique=p.starterDeck.slice(4);
    assert.equal(new Set(unique).size,4,id);
    const cards=unique.map(cardId=>CATALOG_V08.cards[cardId]);
    assert.ok(cards.every(Boolean),`${id} starter cards exist`);
    const effects=cards.flatMap(card=>card.effects);
    assert.ok(effects.some(e=>['damage','pet_attack','weapon_attack'].includes(e.kind)),`${id} has an attack`);
    assert.ok(effects.some(e=>e.kind==='block'),`${id} has defense`);
    assert.ok(effects.some(e=>e.kind==='heal'),`${id} has limited recovery`);
    for(const card of cards.filter(card=>card.effects.some(e=>e.kind==='heal'))){
      assert.equal(card.exhaust,true,`${id} recovery exhausts`);
      assert.equal(card.replayable,false,`${id} recovery cannot echo`);
    }
    assert.ok(CATALOG_V08.relics[p.starterRelic],`${id} starter relic`);
  }
  const remedies=Object.values(PROFESSIONS).map(p=>CATALOG_V08.cards[p.starterDeck[7]]);
  assert.equal(new Set(remedies.map(c=>JSON.stringify(c.effects))).size,remedies.length,'profession recovery cards have distinct effects');
  assert.equal(DIFFICULTIES.length,11);
});

test('all boss and elite phase cycles are individual, thematic, and engine-supported',()=>{
  const combatants=Object.entries(CATALOG_V08.enemies).filter(([,e])=>['Boss','精英'].includes(e.role));
  assert.equal(combatants.filter(([,e])=>e.role==='Boss').length,6);
  assert.ok(combatants.filter(([,e])=>e.role==='精英').length>=9);
  const allowed=new Set(['attack','guard','burn','cleanse','heal','conditional','thorns','charge']);
  const cycleSignatures=new Set();
  for(const [id,enemy] of combatants){
    assert.ok(enemy.phaseName && enemy.phaseName.length<=8,`${id} has short phase name`);
    assert.ok(enemy.phaseIntents?.length>=3,`${id} has a complete phase cycle`);
    assert.notDeepEqual(enemy.phaseIntents,enemy.intents,`${id} phase changes its cycle`);
    const signature=JSON.stringify(enemy.phaseIntents);
    assert.ok(!cycleSignatures.has(signature),`${id} has its own cycle`);
    cycleSignatures.add(signature);
    for(let index=0;index<enemy.phaseIntents.length;index++){
      const intent=enemy.phaseIntents[index];
      assert.ok(allowed.has(intent.kind),`${id} uses supported intent ${intent.kind}`);
      assert.ok(intent.label && intent.label.length>2,`${id} intent has readable label`);
      if(intent.kind==='conditional'){
        assert.ok(['attack','guard','burn','cleanse','heal','thorns'].includes(intent.onAttack.kind),`${id} conditional attack branch`);
        assert.ok(['attack','guard','burn','cleanse','heal','thorns'].includes(intent.onOther.kind),`${id} conditional other branch`);
      }
      if(intent.kind==='charge'){
        const next=enemy.phaseIntents[index+1];
        assert.equal(intent.next.kind,'attack',`${id} charge announces attack`);
        assert.equal(intent.next.value,next.value,`${id} charge value matches following attack`);
        assert.equal(intent.next.hits??1,next.hits??1,`${id} charge hit count matches following attack`);
      }
    }
  }
});

test('profession differentiation, wound reward removal, relic and item balance are explicit',()=>{
  assert.equal(CATALOG_V08.relics.cinder_scoop.trigger,'block_burn');
  assert.match(CATALOG_V08.relics.cinder_scoop.description,/挡住敌方攻击后/);
  assert.deepEqual(ITEMS.ember_flare_item.effects,[{kind:'burn',value:2},{kind:'mark',value:1}]);
  assert.match(ITEMS.ember_flare_item.description,/2层灼烧.*1点追猎标记/);
  for(const act of CATALOG_V08.acts) assert.ok(!act.newCardRewards.includes('v07_wound'));
  const messenger=PROFESSIONS.messenger.starterDeck.slice(4).map(id=>CATALOG_V08.cards[id]);
  assert.ok(messenger.some(c=>c.effects.some(e=>e.kind==='retain')));
  assert.ok(messenger.some(c=>c.effects.some(e=>e.kind==='sift')));
  assert.ok(messenger.some(c=>c.effects.some(e=>e.kind==='draw')));
});

test('three consequence events expose pact labels, consequence text, and free leave',()=>{
  const expected={
    cinder_loan:{kind:'debt',emberAmount:12,attackBonus:1,battles:2},
    sealed_relic:{kind:'sacrifice',hpCost:4,campPenalty:2},
    boss_bargain:{kind:'boss_weaken',emberCost:12,bossHpMultiplier:0.85},
  };
  for(const [eventId,consequence] of Object.entries(expected)){
    const event=EVENTS.find(e=>e.eventId===eventId);
    assert.ok(event,`${eventId} exists`);
    assert.deepEqual(event.choices,['pact','leave']);
    assert.equal(event.consequence.kind,consequence.kind);
    assert.deepEqual(event.consequence,consequence);
    assert.ok(event.pactLabel && event.consequenceText && event.description);
  }
  assert.equal(new Set(EVENTS.map(e=>e.eventId)).size,EVENTS.length);
  assert.equal(EVENTS.length,15);
});
