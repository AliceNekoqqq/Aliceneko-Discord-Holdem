import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_V09, PROFESSIONS } from './rogue-content-v09.mjs';
import { analyzeBuild, candidateFit, cardRoles } from './rogue-build-system.mjs';

const entity = (cardId, upgraded = false, uid = 0) => ({ uid, cardId, upgraded });
const run = (professionId, deck, relics = []) => ({ professionId, deck, relics });

test('roles come from actual effect kinds, not tags', () => {
  assert.deepEqual(cardRoles(CATALOG_V09.cards.hot_iron), ['武器输出', '锻造启动']);
  assert.deepEqual(cardRoles(CATALOG_V09.cards.counter_bar), ['护盾', '反击', '备势衔接']);
  assert.deepEqual(cardRoles({ tags: ['重击', '守御'], effects: [] }), []);
});

test('all eight professions get two grounded directions and expose owned components and gaps', () => {
  assert.equal(Object.keys(PROFESSIONS).length, 8);
  for (const [professionId, profession] of Object.entries(PROFESSIONS)) {
    const deck = profession.starterDeck.map((id, uid) => entity(id, false, uid));
    const result = analyzeBuild(run(professionId, deck), CATALOG_V09);
    assert.equal(result.directions.length, 2, professionId);
    for (const direction of result.directions) {
      assert.ok(direction.id && direction.name, professionId);
      assert.ok(Array.isArray(direction.components), professionId);
      assert.ok(Array.isArray(direction.gaps) && direction.gaps.length, professionId);
    }
  }
  const forge = analyzeBuild(run('forger', [entity('anvil_guard'), entity('hot_iron')]), CATALOG_V09);
  assert.ok(forge.directions[0].components.includes(CATALOG_V09.cards.anvil_guard.name));
  assert.ok(forge.directions[0].components.includes(CATALOG_V09.cards.hot_iron.name));
  assert.match(forge.directions[0].gaps.join(' '), /核心机制已齐/);
});

test('resource links require a real producer and consumer, not shared tags', () => {
  const forge = candidateFit(run('forger', [entity('anvil_guard')]), 'hot_iron', CATALOG_V09);
  assert.equal(forge.category, '衔接');
  assert.match(forge.reason, /锻值与武器攻击/);

  const pet = candidateFit(run('tamer', [entity('call_and_cover')]), 'fox_bite', CATALOG_V09);
  assert.equal(pet.category, '衔接');
  assert.match(pet.reason, /召唤资源与伙伴攻击/);

  const shield = candidateFit(run('warden', [entity('iron_wall')]), 'measured_reply', CATALOG_V09);
  assert.match(shield.reason, /护盾可供护盾转伤，或用于触发格挡反击/);

  const unrelated = candidateFit(run('brewer', [entity('coal_foam')]), 'fox_bite', CATALOG_V09);
  assert.equal(unrelated.category, '新方向');
  assert.match(unrelated.reason, /无可验证的资源链/);
});

test('actual owned relics and deck multiplicity affect recommendation explanations', () => {
  const plain = candidateFit(run('medic', [entity('field_wrap')]), 'field_wrap', CATALOG_V09);
  const relic = candidateFit(run('medic', [entity('field_wrap')], ['medic_badge']), 'field_wrap', CATALOG_V09);
  assert.match(relic.reason, /已持治疗触发护盾的徽章/);
  assert.ok(relic.score > plain.score);

  const duplicate = candidateFit(run('forger', [entity('hot_iron'), entity('hot_iron')]), 'hot_iron', CATALOG_V09);
  assert.match(duplicate.reason, /已有重复副本/);
  assert.ok(duplicate.score < candidateFit(run('forger', [entity('hot_iron')]), 'hot_iron', CATALOG_V09).score);
});

test('upgrade entities are recognized, unknown IDs are safe, and analysis is bounded to 96 entities', () => {
  const baseRun = run('messenger', [entity('dispatch_strike', false, 11)]);
  const fit = candidateFit(baseRun, entity('dispatch_strike', false, 11), CATALOG_V09);
  assert.match(fit.reason, /实体未升级/);
  assert.equal(candidateFit(baseRun, 'not_a_card', CATALOG_V09).score, 0);
  assert.equal(candidateFit(baseRun, 'not_a_card', CATALOG_V09).category, '新方向');

  const many = Array.from({ length: 130 }, (_, uid) => entity('slash', false, uid));
  const analysis = analyzeBuild(run('traveler', many), CATALOG_V09);
  assert.equal(analysis.directions.length, 2);
  assert.ok(analysis.directions.every((direction) => direction.components.length <= 4));
});

test('mechanic gaps accept any real card and unsupported routes have no evidence', () => {
  const noSpecifiedCards = analyzeBuild(run('warden', [entity('slash'), entity('guard')]), CATALOG_V09);
  assert.ok(noSpecifiedCards.directions.some((direction) => direction.gaps.some((gap) => gap.includes('反击'))));
  const bridgeByAlternativeCard = candidateFit(run('traveler', [entity('slash'), entity('guard')]), 'trail_mark', CATALOG_V09);
  assert.equal(bridgeByAlternativeCard.evidence, true);
  assert.equal(bridgeByAlternativeCard.category, '衔接');

  const unsupportedPet = candidateFit(run('tamer', [entity('slash'), entity('guard')]), 'fox_bite', CATALOG_V09);
  assert.equal(unsupportedPet.evidence, null);
  assert.equal(unsupportedPet.score, 0.6);
});

test('upgraded deck entities contribute their upgraded effects to route analysis', () => {
  const upgraded = { ...CATALOG_V09.cards.dispatch_strike, effects: CATALOG_V09.cards.dispatch_strike.upgrade.effects };
  const profile = analyzeBuild(run('messenger', [entity('dispatch_strike', true)]), CATALOG_V09);
  assert.ok(profile.directions[0].components.includes(upgraded.name));
  assert.match(profile.directions[1].gaps.join(' '), /保留/);
});

test('traveler setup and recommendation links match every battle DIRECT effect kind', () => {
  const directExamples = ['slash', 'fox_bite', 'hot_iron', 'last_command', 'measured_reply'];
  for (const id of directExamples) {
    const directKind = CATALOG_V09.cards[id].effects.find((effect) =>
      ['damage', 'pet_attack', 'weapon_attack', 'sacrifice', 'damage_from_shield'].includes(effect.kind))?.kind;
    assert.ok(directKind, id);
    const fit = candidateFit(run('traveler', [entity('lantern_step')]), id, CATALOG_V09);
    assert.equal(fit.evidence, true, `${id}:${directKind}`);
    assert.match(fit.reason, /备势\/追猎加成首个直接伤害包/);
  }
});

test('conditional damage routes describe pet and shield prerequisites accurately', () => {
  const pet = candidateFit(run('tamer', [entity('call_and_cover')]), 'fox_bite', CATALOG_V09);
  assert.match(pet.reason, /召唤资源与伙伴攻击相接/);
  const shield = candidateFit(run('warden', [entity('iron_wall')]), 'measured_reply', CATALOG_V09);
  assert.match(shield.reason, /护盾可供护盾转伤，或用于触发格挡反击/);
});
