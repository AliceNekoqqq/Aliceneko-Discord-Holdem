import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { beginBattle, battleAction, legalCards } from './rogue-battle.mjs';

const starterDeck = CATALOG.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false }));
const copy = (value) => JSON.parse(JSON.stringify(value));

function configureHand(battle, uids) {
  const state = copy(battle);
  const byUid = new Map(state.deck.map((entity) => [entity.uid, entity]));
  state.hand = uids.map((uid) => copy(byUid.get(uid)));
  state.draw = state.deck.filter((entity) => !uids.includes(entity.uid)).map(copy);
  state.discard = [];
  state.exhaust = [];
  return state;
}

function pileUids(state) {
  return ['hand', 'draw', 'discard', 'exhaust'].flatMap((pile) => state[pile].map((entity) => entity.uid));
}

test('beginBattle and battleAction preserve input and survive JSON round trips', () => {
  const deck = copy(starterDeck);
  const relics = ['badge'];
  const deckBefore = JSON.stringify(deck);
  const relicsBefore = JSON.stringify(relics);
  const started = beginBattle({ enemyId: 'dark_lantern', deck, relics, hp: 30, seed: 'json-state' });
  assert.equal(JSON.stringify(deck), deckBefore);
  assert.equal(JSON.stringify(relics), relicsBefore);
  const restored = JSON.parse(JSON.stringify(started));
  const snapshot = JSON.stringify(restored);
  const next = battleAction(restored, { type: 'END_TURN' });
  assert.equal(JSON.stringify(restored), snapshot);
  assert.notEqual(next, restored);
  assert.equal(typeof next.rngState, 'number');
  assert.equal(new Set(pileUids(next)).size, pileUids(next).length);
  assert.deepEqual(new Set(pileUids(next)), new Set(next.deck.map((entity) => entity.uid)));
});

test('two-card order can prevent a life-cost defeat; lethal first card stops the second', () => {
  const started = beginBattle({ enemyId: 'dark_lantern', deck: starterDeck, relics: [], hp: 2, seed: 4 });
  const setup = configureHand(started, [7, 6]); // bandage, then rush
  setup.intent = { kind: 'charge', value: 0, label: 'test' };
  const saved = battleAction(setup, { type: 'PLAY', uid: 7 });
  assert.equal(saved.hp, 6);
  assert.deepEqual(saved.picked, ['bandage']);
  const survived = battleAction(saved, { type: 'PLAY', uid: 6 });
  assert.equal(survived.hp, 4);
  assert.deepEqual(survived.picked, ['bandage', 'rush']);
  assert.equal(survived.result, null);

  const reverse = configureHand(started, [7, 6]);
  reverse.intent = { kind: 'charge', value: 0, label: 'test' };
  const defeated = battleAction(reverse, { type: 'PLAY', uid: 6 });
  assert.equal(defeated.hp, 0);
  assert.equal(defeated.result, 'DEFEAT');
  assert.deepEqual(defeated.picked, ['rush']);
  assert.equal(defeated.energy, 1); // the unplayed bandage cost was not charged
});

test('multihit attacks consume shield per hit and reflect kill truncates remaining hits', () => {
  const started = beginBattle({ enemyId: 'dark_lantern', deck: starterDeck, relics: ['reflect'], hp: 10, seed: 2 });
  const state = configureHand(started, []);
  state.enemyHp = 2;
  state.enemyArmor = 0;
  state.shield = 1;
  state.intent = { kind: 'attack', value: 4, hits: 3, label: '4×3' };
  const result = battleAction(state, { type: 'END_TURN' });
  assert.equal(result.result, 'WIN');
  assert.equal(result.enemyHp, 0);
  assert.equal(result.hp, 7);
  assert.equal(result.attacksTaken, 1);
});

test('pure healing is illegal at full health but a block-heal card remains legal', () => {
  const deck = [...starterDeck, { uid: 8, cardId: 'a3_counterweight', upgraded: false }];
  const started = beginBattle({ enemyId: 'dark_lantern', deck, relics: [], hp: 30, seed: 11 });
  const pureHeal = configureHand(started, [7]);
  assert.deepEqual(legalCards(pureHeal), []);

  const hybrid = configureHand(started, [8]);
  hybrid.intent = { kind: 'attack', value: 8, hits: 1, label: 'test attack' };
  assert.deepEqual(legalCards(hybrid).map((entity) => entity.uid), [8]);
  const played = battleAction(hybrid, { type: 'PLAY', uid: 8 });
  assert.equal(played.hp, 30);
  assert.equal(played.shield, 0); // the 12 shield blocked the hit before end-of-turn clearing
  assert.deepEqual(played.exhaust.map((entity) => entity.uid), [8]);
});

test('echo replays an exhaust card snapshot once without active burn relic bonus', () => {
  const deck = [...starterDeck, { uid: 8, cardId: 'a2_long_glint', upgraded: false }];
  const started = beginBattle({ enemyId: 'dark_lantern', deck, relics: ['echo', 'burn_bonus'], hp: 30, seed: 3 });
  const state = configureHand(started, [8]);
  const afterPlay = battleAction(state, { type: 'PLAY', uid: 8 });
  assert.deepEqual(afterPlay.exhaust.map((entity) => entity.uid), [8]);
  assert.equal(afterPlay.echo, null);
  assert.equal(afterPlay.turn, 2);
  assert.equal(afterPlay.enemyBurn, 16); // active 9, tick to 8, replay adds 8 without bonus
  assert.equal(afterPlay.battleFlags.includes('echo'), true);
  assert.deepEqual(afterPlay.exhaust.map((entity) => entity.cardId), ['a2_long_glint']);
});

test('battle victory clears a queued echo instead of carrying it forward', () => {
  const started = beginBattle({ enemyId: 'dark_lantern', deck: starterDeck, relics: ['echo'], hp: 30, seed: 5 });
  const state = configureHand(started, [0, 1]);
  state.enemyHp = 7;
  state.enemyArmor = 0;
  const first = battleAction(state, { type: 'PLAY', uid: 0 });
  assert.equal(first.enemyHp, 1);
  assert.ok(first.echo);
  const victory = battleAction(first, { type: 'PLAY', uid: 1 });
  assert.equal(victory.result, 'WIN');
  assert.equal(victory.echo, null);
});

test('a guard lasts through the next player turn and clears before the enemy acts again', () => {
  const started = beginBattle({ enemyId: 'dark_lantern', deck: starterDeck, relics: [], hp: 30, seed: 9 });
  const state = configureHand(started, []);
  state.intent = { kind: 'guard', value: 6, label: 'guard' };
  const guarded = battleAction(state, { type: 'END_TURN' });
  assert.equal(guarded.enemyShield, 6);
  assert.equal(guarded.turn, 2);
  assert.equal(guarded.intent.kind, 'attack');
  const next = battleAction(guarded, { type: 'END_TURN' });
  assert.equal(next.enemyShield, 0);
  assert.equal(next.hp, 22);
});

test('a hand with no legal card auto-advances safely to the 12-turn limit', () => {
  const exhaustOnly = [{ uid: 0, cardId: 'a3_counterweight', upgraded: false }];
  const started = beginBattle({ enemyId: 'lantern_rat', deck: exhaustOnly, relics: [], hp: 30, seed: 1 });
  const played = battleAction(started, { type: 'PLAY', uid: 0 });
  assert.ok(['DEFEAT', 'LOST_LIGHT'].includes(played.result));
  assert.ok(played.turn <= 12);
  assert.equal(new Set(pileUids(played)).size, 1);

  const deck = copy(starterDeck);
  const nearLimit = configureHand(beginBattle({ enemyId: 'dark_lantern', deck, relics: [], hp: 30, seed: 1 }), [0]);
  nearLimit.turn = 12;
  nearLimit.intent = { kind: 'charge', value: 0, label: 'test' };
  nearLimit.burn = 0;
  nearLimit.enemyBurn = 0;
  const lostLight = battleAction(nearLimit, { type: 'END_TURN' });
  assert.equal(lostLight.turn, 12);
  assert.equal(lostLight.result, 'LOST_LIGHT');
  assert.deepEqual(legalCards(lostLight), []);
});

test('duplicate relic IDs and duplicate physical entity UIDs are rejected', () => {
  assert.throws(() => beginBattle({ enemyId: 'lantern_rat', deck: starterDeck, relics: ['reflect', 'reflect'], hp: 30, seed: 0 }), /duplicate relic/);
  const badDeck = [...starterDeck, { uid: 0, cardId: 'slash', upgraded: false }];
  assert.throws(() => beginBattle({ enemyId: 'lantern_rat', deck: badDeck, relics: [], hp: 30, seed: 0 }), /duplicate entity uid/);
});
