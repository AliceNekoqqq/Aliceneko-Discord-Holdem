import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { beginBattle, legalCards } from './rogue-battle.mjs';
import { createRun, expireRun, runAction, RunActionError, RULE_VERSION } from './rogue-run.mjs';

const HOUR = 60 * 60 * 1000;
const jsonCopy = (value) => JSON.parse(JSON.stringify(value));

function step(run, action, now) {
  return runAction(run, action, now);
}

function allSlash(run) {
  const copy = jsonCopy(run);
  copy.deck = copy.deck.map((entity) => ({ ...entity, cardId: 'slash', upgraded: false }));
  return copy;
}

function winFixtureBattle(run, now) {
  assert.equal(run.phase, 'BATTLE');
  // Make this a deterministic, one-hit fixture for station and reward transitions.
  run.battle.enemyHp = 1;
  run.battle.enemyArmor = 0;
  run.battle.enemyShield = 0;
  const legal = legalCards(run.battle);
  const attack = legal.find((entity) => {
    const def = CATALOG.cards[entity.cardId];
    const effects = entity.upgraded ? def.upgrade.effects : def.effects;
    return effects.some((effect) => effect.kind === 'damage' && effect.value > 0);
  });
  assert.ok(attack, 'fixture hand should contain a playable attack');
  return step(run, { type: 'PLAY', uid: attack.uid }, now);
}

function reachActOneCheckpoint(now = 1_000) {
  let run = createRun({ runId: `checkpoint-${now}`, owner: 'p1', guild: 'g1', seed: 7, now });
  run = step(run, { type: 'BLESSING', relicId: 'brooch' }, now + 1);
  run = allSlash(run);
  run = step(run, { type: 'ROUTE', choice: 'ash_guard' }, now + 2);
  run = winFixtureBattle(run, now + 3);
  assert.equal(run.phase, 'REWARD');
  const savedReward = jsonCopy(run.reward);
  run = JSON.parse(JSON.stringify(run));
  assert.deepEqual(run.reward, savedReward);
  run = step(run, { type: 'REWARD', choice: run.reward.queue[0].candidates[0] }, now + 4);
  assert.equal(run.completed, 1);
  run = allSlash(run);
  run = step(run, { type: 'ROUTE', choice: 'camp' }, now + 5);
  run = step(run, { type: 'CAMP', choice: 'upgrade', uid: 0 }, now + 6);
  assert.equal(run.completed, 2);
  run = allSlash(run);
  run = winFixtureBattle(run, now + 7);
  assert.equal(run.phase, 'CHECKPOINT');
  assert.equal(run.completed, 3);
  assert.equal(run.completedActs, 1);
  return run;
}

test('run survives JSON round-trip without rerolling route, shop, or battle state', () => {
  let run = createRun({ runId: 'restore', owner: 'p1', guild: 'g1', seed: 'fixed', now: 10 });
  assert.equal(run.mode, 'normal');
  run = step(run, { type: 'BLESSING', relicId: null }, 11);
  const routeBefore = jsonCopy(run.room);
  run = JSON.parse(JSON.stringify(run));
  assert.deepEqual(run.room, routeBefore);
  run = step(run, { type: 'ROUTE', choice: run.room.choices[0] }, 12);
  const battleBefore = jsonCopy(run.battle);
  run = JSON.parse(JSON.stringify(run));
  assert.deepEqual(run.battle, battleBefore);
  assert.equal(run.phase, 'BATTLE');
});

test('shop randomness stays in its own stream and cannot change saved route candidates or battle seed', () => {
  const makeActTwoRoute = () => {
    let run = createRun({ runId: 'scope', owner: 'p1', guild: 'g1', seed: 'scope-seed', now: 100 });
    run.act = 2;
    run.completed = 3;
    run.completedActs = 1;
    run.room = { type: 'blessing', candidates: [...CATALOG.acts[1].chapterRelics] };
    return step(run, { type: 'BLESSING', relicId: null }, 101);
  };

  const beforeShop = makeActTwoRoute();
  const routeSnapshot = jsonCopy(beforeShop.room);
  const routeStream = beforeShop.rngStreams['2:1:route'];
  const shopBranch = step(jsonCopy(beforeShop), { type: 'ROUTE', choice: 'shop' }, 102);
  assert.equal(shopBranch.phase, 'ROOM');
  assert.equal(shopBranch.room.type, 'shop');
  assert.ok(shopBranch.rngStreams['2:1:shop'] !== undefined);
  assert.equal(shopBranch.rngStreams['2:1:route'], routeStream);
  assert.deepEqual(beforeShop.room, routeSnapshot);

  const baselineBattle = step(jsonCopy(beforeShop), { type: 'ROUTE', choice: 'normal' }, 103);
  const afterShopDraw = jsonCopy(beforeShop);
  afterShopDraw.rngStreams = jsonCopy(shopBranch.rngStreams);
  const isolatedBattle = step(afterShopDraw, { type: 'ROUTE', choice: 'normal' }, 103);
  assert.equal(isolatedBattle.room.enemyId, baselineBattle.room.enemyId);
  assert.deepEqual(isolatedBattle.battle, baselineBattle.battle);
});

test('checkpoint retreat ends at the completed act without granting next-act blessing', () => {
  const now = 20_000;
  const checkpoint = reachActOneCheckpoint(now);
  assert.equal(checkpoint.phase, 'CHECKPOINT');
  assert.equal(checkpoint.relics.includes('a2_prism_ember'), false);
  const result = step(checkpoint, { type: 'RETREAT', confirmed: true }, now + 8);
  assert.equal(result.phase, 'RESULT');
  assert.deepEqual(result.result, { type: 'RETREAT', at: now + 8 });
  assert.equal(result.relics.includes('a2_prism_ember'), false);
  assert.equal(checkpoint.phase, 'CHECKPOINT', 'input remains unchanged');
});

test('shops cannot overdraw, successful purchases and removals never reuse entity ids, and a full run reaches CLEAR at station 9', () => {
  let now = 30_000;
  let run = reachActOneCheckpoint(now);
  run.embers = 100; // Isolate shop transaction assertions from combat rewards.
  run = step(run, { type: 'CONTINUE' }, ++now);
  run = step(run, { type: 'BLESSING', relicId: 'a2_prism_ember' }, ++now);
  run = step(run, { type: 'ROUTE', choice: 'shop' }, ++now);
  const stockAtEntry = [...run.room.stock];
  assert.equal(run.completed, 3, 'entering a room is not station completion');
  const poor = jsonCopy(run);
  poor.embers = 0;
  const beforePoorBuy = JSON.stringify(poor);
  assert.throws(
    () => step(poor, { type: 'SHOP', choice: 'buy', cardId: stockAtEntry[0] }, ++now),
    (error) => error instanceof RunActionError && error.code === 'INSUFFICIENT_EMBERS',
  );
  assert.equal(JSON.stringify(poor), beforePoorBuy);

  run = JSON.parse(JSON.stringify(run));
  assert.deepEqual(run.room.stock, stockAtEntry);
  run = step(run, { type: 'SHOP', choice: 'buy', cardId: stockAtEntry[0] }, ++now);
  const firstBoughtUid = run.deck.at(-1).uid;
  run = step(run, { type: 'SHOP', choice: 'buy', cardId: stockAtEntry[1] }, ++now);
  const secondBoughtUid = run.deck.at(-1).uid;
  assert.ok(secondBoughtUid > firstBoughtUid);
  run = step(run, { type: 'SHOP', choice: 'remove', uid: 0 }, ++now);
  assert.equal(run.deck.some((entity) => entity.uid === 0), false);
  const nextUidAfterRemove = run.nextUid;
  run = step(run, { type: 'SHOP', choice: 'leave' }, ++now);
  assert.equal(run.completed, 4);

  run = allSlash(run);
  run = step(run, { type: 'ROUTE', choice: 'camp' }, ++now);
  run = step(run, { type: 'CAMP', choice: 'leave' }, ++now);
  assert.equal(run.completed, 5);
  run = winFixtureBattle(run, ++now);
  assert.equal(run.phase, 'CHECKPOINT');
  assert.equal(run.completed, 6);
  run = step(run, { type: 'CONTINUE' }, ++now);
  run = step(run, { type: 'BLESSING', relicId: 'a3_cinder_toll' }, ++now);
  run = step(run, { type: 'ROUTE', choice: 'event' }, ++now);
  const eventCard = run.room.candidates[0];
  run = step(run, { type: 'EVENT', choice: 'card', cardId: eventCard }, ++now);
  assert.equal(run.completed, 7);
  const eventCardEntity = run.deck.find((entity) => entity.cardId === eventCard);
  assert.ok(eventCardEntity.uid >= nextUidAfterRemove, 'new entity id advances past removed ids');
  run = allSlash(run);
  run = step(run, { type: 'ROUTE', choice: 'camp' }, ++now);
  run = step(run, { type: 'CAMP', choice: 'leave' }, ++now);
  assert.equal(run.completed, 8);
  run = winFixtureBattle(run, ++now);
  assert.equal(run.phase, 'RESULT');
  assert.deepEqual(run.result, { type: 'CLEAR', at: now });
  assert.equal(run.completedActs, 3);
  assert.equal(run.completed, 9);
  assert.equal(run.ruleVersion, RULE_VERSION);
  assert.equal(run.version, 24);
});

test('a valid action extends TTL; expiry is a versioned terminal result and does not change lastActionAt', () => {
  const start = 50_000;
  const run = createRun({ runId: 'expiry', owner: 'p1', guild: 'g1', seed: 1, now: start });
  const activeAt = start + 71 * HOUR;
  const active = step(run, { type: 'BLESSING', relicId: null }, activeAt);
  const beforeExpiry = expireRun(active, activeAt + 72 * HOUR - 1);
  assert.equal(beforeExpiry.phase, 'ROUTE');
  assert.equal(beforeExpiry.version, active.version);
  const expired = expireRun(active, activeAt + 72 * HOUR);
  assert.equal(expired.phase, 'RESULT');
  assert.deepEqual(expired.result, { type: 'EXPIRED', at: activeAt + 72 * HOUR });
  assert.equal(expired.version, active.version + 1);
  assert.equal(expired.lastActionAt, activeAt);
  assert.equal(active.phase, 'ROUTE');
});
