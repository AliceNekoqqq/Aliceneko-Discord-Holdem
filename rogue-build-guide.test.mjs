import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRogueBuild, explainRogueCandidate, previewRogueDeckChange } from './rogue-build-guide.mjs';
import { PROFESSIONS } from './rogue-content-v09.mjs';

test('messenger trial reports components and an observable retain gap without declaring a build finished', () => {
  const result = analyzeRogueBuild({ ruleVersion: 'v0.9', professionId: 'messenger', deck: PROFESSIONS.messenger.starterDeck });
  assert.equal(result.analyzed, true);
  assert.deepEqual(result.directions.map((d) => d.id), ['compact_cycle', 'retain_burst']);
  assert.ok(result.directions[0].components.includes('择弃'));
  assert.ok(result.directions[1].gaps.includes('当前牌组没有保留效果'));
  assert.equal('established' in result.directions[0], false);
  assert.ok(result.candidates.length <= 4);
});

test('candidate explanations use catalog effects and profession relic facts, and cover any card ID', () => {
  const messenger = explainRogueCandidate({ ruleVersion: '0.9', professionId: 'messenger', deck: PROFESSIONS.messenger.starterDeck, relics: ['messenger_seal'] }, 'sift_and_cut');
  assert.match(messenger.reason, /护盾4；弃目标并抽1张/);
  assert.match(messenger.reason, /信使封蜡.*每轮首次/);
  const medic = explainRogueCandidate({ ruleVersion: '0.9', professionId: 'medic', deck: PROFESSIONS.medic.starterDeck, relics: ['medic_badge'] }, 'field_medic');
  assert.match(medic.reason, /治疗4；护盾3/);
  assert.match(medic.reason, /医师徽章.*每轮首次/);
  assert.match(explainRogueCandidate({ ruleVersion: '0.9', professionId: 'medic', deck: PROFESSIONS.medic.starterDeck }, 'quick_dispatch').reason, /消耗目标手牌/);
  const withoutRelic = explainRogueCandidate({ ruleVersion: '0.9', professionId: 'medic', deck: PROFESSIONS.medic.starterDeck }, 'field_medic');
  assert.doesNotMatch(withoutRelic.reason, /医师徽章/);
});

test('upgrade previews reflect unupgraded and upgraded entities by UID; removals target a single duplicate', () => {
  const deck = [
    { uid: 10, cardId: 'field_wrap', upgraded: false },
    { uid: 11, cardId: 'field_wrap', upgraded: true },
    { uid: 12, cardId: 'slash', upgraded: false },
    { uid: 13, cardId: 'guard', upgraded: false },
    { uid: 14, cardId: 'pierce', upgraded: false },
  ];
  const base = previewRogueDeckChange({ ruleVersion: '0.9', deck, uid: 10 });
  assert.deepEqual(base.upgrade.before.effects, ['治疗3', '护盾3']);
  assert.deepEqual(base.upgrade.after.effects, ['治疗5', '护盾3']);
  const already = previewRogueDeckChange({ ruleVersion: '0.9', deck, uid: 11 });
  assert.equal(already.available, false);
  assert.match(already.reason, /已经升级/);
  const removal = previewRogueDeckChange({ ruleVersion: '0.9', deck, uid: 10, action: 'remove' });
  assert.equal(removal.uid, 10);
  assert.equal(removal.afterDeckSize, 4);
  assert.deepEqual(removal.remainingUids, [11, 12, 13, 14]);
  assert.match(removal.cycleEffect, /少了「野外包扎」的效果/);
});

test('minimum deck, legacy versions and out-of-pilot professions are handled safely', () => {
  const minimum = previewRogueDeckChange({ ruleVersion: '0.9', deck: ['slash', 'pierce', 'guard', 'bandage'], cardId: 'bandage', action: 'remove' });
  assert.equal(minimum.available, false);
  assert.equal(analyzeRogueBuild({ ruleVersion: 'v0.8', professionId: 'medic' }).fallback, true);
  assert.equal(previewRogueDeckChange({ ruleVersion: 'v0.6' }).fallback, true);
  assert.equal(explainRogueCandidate({ ruleVersion: 'v0.8' }, 'field_wrap').fallback, true);
  assert.equal(analyzeRogueBuild({ ruleVersion: 'v0.9', professionId: 'brewer' }).analyzed, false);
});
