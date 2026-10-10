import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { CATALOG_V06, ITEMS, PROFESSIONS, getCatalog } from './rogue-content-v06.mjs';

const effectKinds = new Set([
  'damage', 'block', 'burn', 'heal', 'prepare', 'mark', 'sift', 'exhaust_other', 'retain',
  'counter', 'echo_next', 'self_echo', 'delay_burn', 'damage_from_shield', 'summon',
  'pet_attack', 'sacrifice', 'forge', 'weapon_attack',
]);

test('version lookup keeps legacy catalog intact and selects expanded catalog only for v0.6', () => {
  assert.equal(getCatalog('0.3'), CATALOG);
  assert.equal(getCatalog('0.4'), CATALOG);
  assert.equal(getCatalog('lantern-rules-v0.6'), CATALOG_V06);
  assert.equal(CATALOG.version, '0.3');
  assert.equal(CATALOG_V06.version, '0.6');
  assert.equal(CATALOG_V06.player.maxHp, 30);
  assert.equal(CATALOG_V06.player.draw, 4);
  assert.equal(CATALOG_V06.player.energy, 2);
  assert.equal(CATALOG_V06.player.playLimit, 2);
  assert.equal(CATALOG_V06.player.turnLimit, 12);
  assert.deepEqual(CATALOG_V06.starterRelics, [], 'v0.6 profession relic replaces the legacy opening choice');
  assert.deepEqual(CATALOG_V06.acts[0].chapterRelics, [], 'no first-act duplicate blessing');
});

test('all eight professions have valid eight-entity starter decks and a unique direct starter relic', () => {
  assert.deepEqual(Object.keys(PROFESSIONS), ['traveler', 'warden', 'brewer', 'messenger', 'smith', 'medic', 'tamer', 'forger']);
  for (const [id, profession] of Object.entries(PROFESSIONS)) {
    assert.equal(profession.starterDeck.length, 8, `${id} deck size`);
    assert.ok(profession.starterDeck.every((cardId) => CATALOG_V06.cards[cardId]), `${id} starter card reference`);
    assert.ok(CATALOG_V06.relics[profession.starterRelic], `${id} starter relic reference`);
    const definitions = profession.starterDeck.map((cardId) => CATALOG_V06.cards[cardId]);
    assert.ok(definitions.filter((entry) => entry.effects.some((effect) => ['damage', 'pet_attack', 'sacrifice', 'weapon_attack', 'damage_from_shield'].includes(effect.kind))).length >= 2, `${id} attack cards`);
    assert.ok(definitions.filter((entry) => entry.effects.some((effect) => effect.kind === 'block')).length >= 2, `${id} defense cards`);
    assert.ok(definitions.some((entry) => entry.effects.some((effect) => effect.kind === 'heal')), `${id} finite recovery`);
  }
  assert.equal(new Set(Object.values(PROFESSIONS).map((entry) => entry.starterRelic)).size, 8);
  const requiredMechanics = {
    traveler: ['mark', 'prepare'], warden: ['counter', 'block'], brewer: ['burn', 'block'],
    messenger: ['exhaust_other', 'retain'], smith: ['prepare', 'self_echo'], medic: ['heal', 'mark'],
    tamer: ['summon', 'pet_attack'], forger: ['forge', 'weapon_attack'],
  };
  for (const [id, kinds] of Object.entries(requiredMechanics)) {
    const starterKinds = new Set(PROFESSIONS[id].starterDeck.flatMap((cardId) => CATALOG_V06.cards[cardId].effects.map((effect) => effect.kind)));
    for (const kind of kinds) assert.ok(starterKinds.has(kind), `${id} starts with ${kind}`);
  }
  assert.ok(Object.values(CATALOG_V06.cards).some((entry) => entry.effects.some((effect) => effect.kind === 'sift')));
});

test('expanded cards are complete, varied, and above the total catalog target', () => {
  assert.ok(Object.keys(CATALOG_V06.cards).length >= 52);
  const addedIds = Object.keys(CATALOG_V06.cards).filter((id) => !(id in CATALOG.cards));
  for (const id of addedIds) {
    const entry = CATALOG_V06.cards[id];
    assert.ok(entry.name && entry.description && Array.isArray(entry.effects) && entry.effects.length, `${id} name/description/effects`);
    assert.ok(Number.isInteger(entry.cost) && entry.cost >= 0, `${id} cost`);
    assert.ok(Number.isInteger(entry.selfCost) && entry.selfCost >= 0, `${id} self cost`);
    assert.equal(typeof entry.exhaust, 'boolean', `${id} exhaust flag`);
    assert.equal(typeof entry.replayable, 'boolean', `${id} replay flag`);
    assert.ok(Array.isArray(entry.upgrade?.effects) && Number.isInteger(entry.upgrade.cost), `${id} upgrade`);
    assert.ok(Array.isArray(entry.tags) && entry.tags.length, `${id} tags`);
    assert.ok([1, 2, 3].includes(entry.rewardAct), `${id} reward act`);
    for (const effect of [...entry.effects, ...entry.upgrade.effects]) assert.ok(effectKinds.has(effect.kind), `${id} unsupported effect ${effect.kind}`);
    assert.doesNotMatch(entry.description, /damage|block|burn|heal|prepare|mark|sift|exhaust_other|retain|counter|echo_next|self_echo|delay_burn|summon|pet_attack|sacrifice|forge|weapon_attack/, `${id} description should use player-facing Chinese`);
  }
  assert.ok(addedIds.length >= 32);
  assert.ok(CATALOG_V06.cards.call_lanternfox.effects.some((effect) => effect.kind === 'summon'));
  assert.ok(CATALOG_V06.cards.fox_pounce.effects.some((effect) => effect.kind === 'pet_attack'));
  assert.ok(CATALOG_V06.cards.last_command.effects.some((effect) => effect.kind === 'sacrifice'));
  assert.ok(CATALOG_V06.cards.bell_timing.effects.some((effect) => effect.kind === 'prepare'));
  assert.ok(CATALOG_V06.cards.echo_ward.effects.some((effect) => effect.kind === 'self_echo'));
  assert.ok(CATALOG_V06.cards.forged_weapon.effects.some((effect) => effect.kind === 'weapon_attack'));
});

test('relic, enemy, act pools and item references satisfy the content contract', () => {
  assert.ok(Object.keys(CATALOG_V06.relics).length >= 24);
  assert.ok(Object.keys(CATALOG_V06.enemies).length >= 24);
  const allNewRelicIds = Object.keys(CATALOG_V06.relics).filter((id) => !(id in CATALOG.relics));
  assert.equal(allNewRelicIds.length, 13);
  assert.ok(allNewRelicIds.every((id) => CATALOG_V06.eliteRelics.includes(id)), 'every new relic is in the elite reward pool');
  assert.ok(['traveler_lantern', 'brewer_flask', 'messenger_seal', 'smith_rivet'].every((id) => CATALOG_V06.eliteRelics.includes(id)), 'some profession starters can be won cross-profession');
  assert.equal(CATALOG_V06.relics.warden_badge.trigger, 'first_block_per_turn');
  assert.equal(CATALOG_V06.relics.brewer_flask.trigger, 'burn_block');
  assert.equal(CATALOG_V06.relics.splinter_awl.trigger, 'other_exhaust_pierce');
  const relicTriggers = new Set(['first_attack_burn', 'first_block_per_turn', 'first_attack_damage', 'burn_bonus', 'reflect', 'echo', 'block_burn', 'echo_block', 'self_block', 'active_exhaust_block', 'other_exhaust_prepare', 'prepare_block', 'mark_block', 'burn_mark', 'echo_burn', 'other_exhaust_pierce', 'start_pet', 'pet_attack_block', 'forge_block', 'weapon_bonus', 'camp_heal', 'shop_discount', 'burn_block']);
  for (const id of allNewRelicIds) assert.ok(relicTriggers.has(CATALOG_V06.relics[id].trigger), `${id} uses a documented trigger`);
  assert.equal(Object.keys(ITEMS).length, 6);
  assert.equal(CATALOG_V06.items, ITEMS);
  for (const item of Object.values(ITEMS)) assert.ok(item.name && item.description && Array.isArray(item.effects) && item.effects.length);
  const intentKinds = new Set(['attack', 'guard', 'charge', 'burn', 'cleanse', 'heal', 'conditional', 'thorns']);
  for (const [id, enemy] of Object.entries(CATALOG_V06.enemies)) {
    assert.ok(enemy.hp > 0 && Array.isArray(enemy.intents) && enemy.intents.length, `${id} encounter data`);
    for (const intent of enemy.intents) {
      assert.ok(intentKinds.has(intent.kind), `${id} supported intent ${intent.kind}`);
      if (intent.kind === 'conditional') {
        assert.ok(intent.onAttack && intent.onOther, `${id} reveals both conditional outcomes`);
        assert.ok(['attack', 'guard', 'charge'].includes(intent.onAttack.kind));
        assert.ok(['attack', 'guard', 'charge'].includes(intent.onOther.kind));
      }
      if (intent.kind === 'charge') {
        const next = enemy.intents[(enemy.intents.indexOf(intent) + 1) % enemy.intents.length];
        assert.equal(next.kind, 'attack', `${id} charge is followed by its attack`);
        assert.equal(next.value, intent.value, `${id} charged per-hit damage matches`);
        assert.equal(next.hits ?? 1, intent.hits ?? 1, `${id} charged hit count matches`);
      }
    }
  }
  for (const act of CATALOG_V06.acts) {
    for (const key of ['normalPool', 'elitePool', 'bossPool', 'newCardRewards']) {
      assert.ok(Array.isArray(act[key]) && act[key].length, `act ${act.index} ${key}`);
    }
    assert.ok(act.bossPool.length >= 2, `act ${act.index} has at least two boss choices`);
    assert.ok(act.normalPool.every((id) => CATALOG_V06.enemies[id]), `act ${act.index} normal enemy references`);
    assert.ok(act.elitePool.every((id) => CATALOG_V06.enemies[id]), `act ${act.index} elite references`);
    assert.ok(act.bossPool.every((id) => CATALOG_V06.enemies[id]), `act ${act.index} boss references`);
    assert.ok(act.newCardRewards.every((id) => CATALOG_V06.cards[id]), `act ${act.index} reward references`);
    assert.ok(act.chapterRelics.every((id) => CATALOG_V06.relics[id]), `act ${act.index} chapter relic references`);
    if (act.index > 1) {
      assert.ok(allNewRelicIds.filter((id) => !Object.values(PROFESSIONS).some((profession) => profession.starterRelic === id)).every((id) => act.chapterRelics.includes(id)), `act ${act.index} can offer every new non-starter relic`);
      assert.ok(act.chapterRelics.every((id) => !Object.values(PROFESSIONS).some((profession) => profession.starterRelic === id)), `act ${act.index} does not offer a duplicate profession starter relic`);
    }
  }
  assert.ok(CATALOG_V06.eliteRelics.every((id) => CATALOG_V06.relics[id]));
  assert.ok(CATALOG_V06.cards.quick_dispatch.effects.some((effect) => effect.kind === 'exhaust_other'), '信使起手可主动消耗另一张手牌');
  assert.match(CATALOG_V06.cards.quick_dispatch.description, /直接伤害|手牌|消耗堆/);
  assert.doesNotMatch(CATALOG_V06.cards.quick_dispatch.description, /damage|exhaust_other/);
  assert.ok(CATALOG_V06.enemies.patrol_apprentice.intents.some((intent, i, list) => intent.kind === 'charge' && list[i + 1]?.kind === 'attack' && list[i + 1].value === intent.value));
  assert.ok(CATALOG_V06.enemies.ember_feeder.intents.some((intent, i, list) => intent.kind === 'charge' && list[i + 1]?.kind === 'attack' && list[i + 1].value === intent.value));
});
