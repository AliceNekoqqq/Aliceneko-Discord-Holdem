import { CATALOG } from './rogue-catalog.mjs';
import { beginBattle, battleAction, legalCards } from './rogue-battle.mjs';

export const RULE_VERSION = 'lantern-rules-v0.4';

const HOUR = 60 * 60 * 1000;
const RUN_TTL = 72 * HOUR;
const clone = (value) => JSON.parse(JSON.stringify(value));

export class RunActionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunActionError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new RunActionError(code, message); };

function timestamp(value) {
  const result = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(result)) fail('INVALID_TIME', 'now must be a finite timestamp or Date');
  return result;
}

function hashSeed(seed) {
  const text = String(seed ?? 'lantern-v0.4');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 0x6d2b79f5;
}

function nextRandom(stream) {
  let x = stream.state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  stream.state = x >>> 0 || 0x6d2b79f5;
  return stream.state / 0x100000000;
}

function shuffle(stream, values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(stream) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sample(run, values, count, scope) {
  if (!scope) fail('INVALID_RANDOM_SCOPE', 'A random scope is required');
  const key = `${run.act}:${run.slot}:${scope}`;
  const stream = {
    state: run.rngStreams[key] ?? hashSeed(`${run.seed}|${run.act}|${run.slot}|${scope}`),
  };
  const selected = shuffle(stream, values).slice(0, Math.min(count, values.length));
  run.rngStreams[key] = stream.state;
  return selected;
}

function currentAct(run) {
  const act = CATALOG.acts.find((entry) => entry.index === run.act);
  if (!act) fail('INVALID_ACT', 'No catalog entry for current act');
  return act;
}

function unlockedCards(actIndex) {
  return CATALOG.acts
    .filter((entry) => entry.index <= actIndex)
    .flatMap((entry) => entry.newCardRewards);
}

function makeRoute(run, slot) {
  run.slot = slot;
  run.phase = 'ROUTE';
  if (slot === 1) {
    const act = currentAct(run);
    if (run.act === 1) {
      run.room = { type: 'route', choices: [...act.normalEnemies] };
    } else {
    const alternatives = sample(run, act.normalEnemies, 1, 'route');
      run.room = {
        type: 'route',
        choices: ['normal', run.act === 2 ? 'shop' : 'event'],
        normalEnemyId: alternatives[0],
      };
    }
    return;
  }
  run.room = { type: 'route', choices: ['camp', 'elite'] };
}

function battleSeed(run) {
  return `${run.seed}:${run.act}:${run.slot}:${run.room.enemyId}`;
}

function startBattle(run, enemyId, kind) {
  const enemy = CATALOG.enemies[enemyId];
  if (!enemy) fail('UNKNOWN_ENEMY', `Unknown enemy ${enemyId}`);
  run.phase = 'BATTLE';
  run.room = {
    type: 'battle',
    battleType: kind,
    enemyId,
    rewardGranted: false,
  };
  run.battle = beginBattle({
    enemyId,
    deck: clone(run.deck),
    relics: [...run.relics],
    hp: run.hp,
    seed: battleSeed(run),
  });
  syncBattle(run);
}

function syncBattle(run) {
  if (!run.battle) return;
  run.hp = Math.max(0, run.battle.hp);
  if (Array.isArray(run.battle.deck)) run.deck = clone(run.battle.deck);
  if (Array.isArray(run.battle.relics)) run.relics = [...run.battle.relics];
}

function grantEmbers(run, amount) {
  run.embers += amount;
}

function addCard(run, cardId) {
  if (!CATALOG.cards[cardId]) fail('UNKNOWN_CARD', `Unknown card ${cardId}`);
  run.deck.push({ uid: run.nextUid, cardId, upgraded: false });
  run.nextUid += 1;
}

function completeCurrentStation(run) {
  const expected = (run.act - 1) * 3 + (run.slot - 1);
  if (run.completed !== expected) fail('INVALID_PROGRESS', 'Completed station count does not match current station');
  run.completed += 1;
  run.room = null;
  run.battle = null;
  run.reward = null;

  if (run.slot === 1) {
    makeRoute(run, 2);
    return;
  }
  if (run.slot === 2) {
    run.slot = 3;
    startBattle(run, currentAct(run).bossEnemy, 'boss');
    return;
  }

  run.completedActs = run.act;
  if (run.act === 3) {
    run.phase = 'RESULT';
    run.result = { type: 'CLEAR' };
    return;
  }
  run.phase = 'CHECKPOINT';
  run.room = { type: 'checkpoint', completedAct: run.act };
}

function advanceReward(run) {
  while (run.reward.index < run.reward.queue.length) {
    const stage = run.reward.queue[run.reward.index];
    if (!stage.done && stage.candidates.length > 0) return;
    stage.done = true;
    run.reward.index += 1;
  }
  run.reward.completed = true;
  run.phase = 'REWARD';
  completeCurrentStation(run);
}

function startRewards(run, source) {
  const cardCandidates = sample(run, unlockedCards(run.act), 3, 'reward-card');
  const queue = [{ kind: 'card', candidates: cardCandidates, done: false, selected: null }];
  if (source === 'elite') {
    const availableRelics = CATALOG.eliteRelics.filter((id) => !run.relics.includes(id));
    queue.push({ kind: 'relic', candidates: sample(run, availableRelics, 3, 'reward-relic'), done: false, selected: null });
  }
  run.phase = 'REWARD';
  run.reward = { source, queue, index: 0, completed: false };
  advanceReward(run);
}

function resolveBattle(run) {
  syncBattle(run);
  if (!run.battle?.result) return;
  const outcome = run.battle.result;
  if (outcome !== 'WIN') {
    run.phase = 'RESULT';
    run.result = {
      type: 'DEFEAT',
      reason: outcome === 'LOST_LIGHT' ? 'LOST_LIGHT' : 'HP_ZERO',
    };
    return;
  }

  const room = run.room;
  if (!room || room.type !== 'battle' || room.rewardGranted) fail('BATTLE_ALREADY_SETTLED', 'Battle result was already processed');
  room.rewardGranted = true;
  const act = currentAct(run);
  if (room.battleType === 'normal') {
    grantEmbers(run, act.normalEmbers);
    startRewards(run, 'normal');
    return;
  }
  if (room.battleType === 'elite') {
    grantEmbers(run, act.eliteEmbers);
    run.eliteWins += 1;
    startRewards(run, 'elite');
    return;
  }
  grantEmbers(run, act.bossEmbers);
  room.rewardGranted = true;
  completeCurrentStation(run);
}

function findEntity(run, uid) {
  return run.deck.find((entity) => entity.uid === uid);
}

function assertUpgradeTarget(run, uid) {
  const entity = findEntity(run, uid);
  if (!entity) fail('UNKNOWN_ENTITY', `Unknown card entity ${uid}`);
  if (entity.upgraded) fail('ALREADY_UPGRADED', `Card entity ${uid} is already upgraded`);
  if (!CATALOG.cards[entity.cardId]?.upgrade) fail('NO_UPGRADE', `Card ${entity.cardId} has no upgrade`);
  return entity;
}

function startRouteChoice(run, choice) {
  const room = run.room;
  if (!room || room.type !== 'route' || !room.choices.includes(choice)) fail('INVALID_ROUTE', 'Choice is not available at this route');
  room.selected = choice;

  if (run.slot === 1) {
    if (run.act === 1) {
      startBattle(run, choice, 'normal');
      return;
    }
    if (choice === 'normal') {
      startBattle(run, room.normalEnemyId, 'normal');
      return;
    }
    if (choice === 'shop' && run.act === 2) {
      const stock = sample(run, unlockedCards(run.act), 2, 'shop');
      run.phase = 'ROOM';
      run.room = { type: 'shop', stock, services: { upgrade: false, remove: false } };
      return;
    }
    if (choice === 'event' && run.act === 3) {
      run.phase = 'ROOM';
      run.room = { type: 'event', candidates: sample(run, currentAct(run).newCardRewards, 3, 'event') };
      return;
    }
    fail('INVALID_ROUTE', 'Route choice is unavailable in this act');
  }

  if (choice === 'camp') {
    run.phase = 'ROOM';
    run.room = { type: 'camp' };
    return;
  }
  if (choice === 'elite') {
    startBattle(run, currentAct(run).eliteEnemy, 'elite');
    return;
  }
  fail('INVALID_ROUTE', 'Route choice is unavailable in this slot');
}

function actionBlessing(run, action) {
  if (run.phase !== 'ROOM' || run.room?.type !== 'blessing') fail('INVALID_PHASE', 'No blessing choice is open');
  const { relicId = null } = action;
  if (relicId !== null) {
    if (!run.room.candidates.includes(relicId)) fail('INVALID_RELIC', 'Relic is not in the current blessing candidates');
    if (run.relics.includes(relicId)) fail('DUPLICATE_RELIC', 'Relic is already owned');
    run.relics.push(relicId);
  }
  run.room = null;
  makeRoute(run, 1);
}

function actionRoute(run, action) {
  if (run.phase !== 'ROUTE') fail('INVALID_PHASE', 'No route choice is open');
  startRouteChoice(run, action.choice);
}

function actionBattle(run, action) {
  if (run.phase !== 'BATTLE' || !run.battle || run.battle.result) fail('INVALID_PHASE', 'No live battle is open');
  if (action.type === 'PLAY') {
    const legal = legalCards(run.battle);
    if (!legal.some((card) => card.uid === action.uid)) fail('ILLEGAL_CARD', 'Card entity is not legally playable now');
    run.battle = battleAction(run.battle, { type: 'PLAY', uid: action.uid });
  } else if (action.type === 'END_TURN') {
    run.battle = battleAction(run.battle, { type: 'END_TURN' });
  } else {
    fail('INVALID_ACTION', 'Unknown battle action');
  }
  resolveBattle(run);
}

function actionReward(run, action) {
  if (run.phase !== 'REWARD' || !run.reward || run.reward.completed) fail('INVALID_PHASE', 'No reward is open');
  const stage = run.reward.queue[run.reward.index];
  if (!stage || stage.done) fail('INVALID_REWARD', 'No pending reward item');
  const choice = action.choice ?? null;
  if (choice !== null && !stage.candidates.includes(choice)) fail('INVALID_REWARD', 'Choice is not in the current reward candidates');
  if (choice !== null) {
    if (stage.kind === 'card') addCard(run, choice);
    else {
      if (run.relics.includes(choice)) fail('DUPLICATE_RELIC', 'Relic is already owned');
      run.relics.push(choice);
    }
  }
  stage.selected = choice;
  stage.done = true;
  run.reward.index += 1;
  advanceReward(run);
}

function actionCamp(run, action) {
  if (run.phase !== 'ROOM' || run.room?.type !== 'camp') fail('INVALID_PHASE', 'No camp choice is open');
  const choice = action.choice;
  if (choice === 'heal') {
    if (run.hp >= CATALOG.player.maxHp) fail('FULL_HEALTH', 'Healing is unavailable at full health');
    run.hp = Math.min(CATALOG.player.maxHp, run.hp + Math.floor(CATALOG.player.maxHp * 0.3));
  } else if (choice === 'upgrade') {
    const entity = assertUpgradeTarget(run, action.uid);
    entity.upgraded = true;
  } else if (choice !== 'leave') {
    fail('INVALID_CHOICE', 'Camp choice must be heal, upgrade, or leave');
  }
  completeCurrentStation(run);
}

function actionShop(run, action) {
  if (run.phase !== 'ROOM' || run.room?.type !== 'shop') fail('INVALID_PHASE', 'No shop is open');
  const room = run.room;
  if (action.choice === 'buy') {
    const index = room.stock.indexOf(action.cardId);
    if (index < 0) fail('SOLD_OUT', 'Card is not in current shop stock');
    const card = CATALOG.cards[action.cardId];
    const cost = CATALOG.shop.cardCostByEnergy[String(card.cost)];
    if (!Number.isFinite(cost)) fail('INVALID_CATALOG', 'Shop has no price for this card cost');
    if (run.embers < cost) fail('INSUFFICIENT_EMBERS', 'Not enough embers');
    run.embers -= cost;
    addCard(run, action.cardId);
    room.stock.splice(index, 1);
    return;
  }
  if (action.choice === 'upgrade') {
    if (room.services.upgrade) fail('SERVICE_USED', 'Shop upgrade service was already used');
    if (run.embers < CATALOG.shop.upgradeCost) fail('INSUFFICIENT_EMBERS', 'Not enough embers');
    const entity = assertUpgradeTarget(run, action.uid);
    run.embers -= CATALOG.shop.upgradeCost;
    entity.upgraded = true;
    room.services.upgrade = true;
    return;
  }
  if (action.choice === 'remove') {
    if (room.services.remove) fail('SERVICE_USED', 'Shop removal service was already used');
    if (run.deck.length <= CATALOG.shop.minimumDeck) fail('MINIMUM_DECK', 'Cannot remove a card below minimum deck size');
    if (run.embers < CATALOG.shop.removeCost) fail('INSUFFICIENT_EMBERS', 'Not enough embers');
    const index = run.deck.findIndex((entity) => entity.uid === action.uid);
    if (index < 0) fail('UNKNOWN_ENTITY', `Unknown card entity ${action.uid}`);
    run.embers -= CATALOG.shop.removeCost;
    run.deck.splice(index, 1);
    room.services.remove = true;
    return;
  }
  if (action.choice === 'leave') {
    completeCurrentStation(run);
    return;
  }
  fail('INVALID_CHOICE', 'Shop choice must be buy, upgrade, remove, or leave');
}

function actionEvent(run, action) {
  if (run.phase !== 'ROOM' || run.room?.type !== 'event' || run.act !== 3) fail('INVALID_PHASE', 'No repair event is open');
  if (action.choice === 'heal') {
    if (run.hp >= CATALOG.player.maxHp) fail('FULL_HEALTH', 'Repair is unavailable at full health');
    if (run.embers < CATALOG.event.healCost) fail('INSUFFICIENT_EMBERS', 'Not enough embers');
    run.embers -= CATALOG.event.healCost;
    run.hp = Math.min(CATALOG.player.maxHp, run.hp + CATALOG.event.healAmount);
    completeCurrentStation(run);
    return;
  }
  if (action.choice === 'card') {
    if (!run.room.candidates.includes(action.cardId)) fail('INVALID_CARD', 'Card is not in current event candidates');
    if (run.embers < CATALOG.event.cardCost) fail('INSUFFICIENT_EMBERS', 'Not enough embers');
    run.embers -= CATALOG.event.cardCost;
    addCard(run, action.cardId);
    completeCurrentStation(run);
    return;
  }
  if (action.choice === 'leave') {
    completeCurrentStation(run);
    return;
  }
  fail('INVALID_CHOICE', 'Event choice must be heal, card, or leave');
}

export function createRun({ runId, owner, guild, mode = 'normal', seed, startDay, rewardEligible = false, now = Date.now() }) {
  if (runId === undefined || owner === undefined || guild === undefined) fail('INVALID_RUN_META', 'runId, owner, and guild are required');
  const at = timestamp(now);
  const deck = CATALOG.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false }));
  const run = {
    ruleVersion: RULE_VERSION,
    runId,
    owner,
    guild,
    mode,
    seed: String(seed ?? runId),
    startDay: startDay ?? null,
    rewardEligible: Boolean(rewardEligible),
    phase: 'ROOM',
    act: 1,
    slot: 1,
    completed: 0,
    completedActs: 0,
    eliteWins: 0,
    hp: CATALOG.player.maxHp,
    embers: 0,
    deck,
    relics: [],
    nextUid: deck.length,
    version: 0,
    lastActionAt: at,
    rngStreams: {},
    battle: null,
    room: { type: 'blessing', candidates: [...currentAct({ act: 1 }).chapterRelics] },
    reward: null,
    result: null,
  };
  return run;
}

export function runAction(run, action, now = Date.now()) {
  if (!run || typeof run !== 'object' || !action || typeof action !== 'object') fail('INVALID_INPUT', 'run and action objects are required');
  const at = timestamp(now);
  if (run.phase === 'RESULT') fail('RUN_FINISHED', 'No actions are accepted after RESULT');
  if (action.expectedVersion !== undefined && action.expectedVersion !== run.version) fail('STALE_VERSION', 'Action was created from an older run version');
  const next = clone(run);

  if (action.type === 'BLESSING') actionBlessing(next, action);
  else if (action.type === 'ROUTE') actionRoute(next, action);
  else if (action.type === 'PLAY' || action.type === 'END_TURN') actionBattle(next, action);
  else if (action.type === 'REWARD') actionReward(next, action);
  else if (action.type === 'CAMP') actionCamp(next, action);
  else if (action.type === 'SHOP') actionShop(next, action);
  else if (action.type === 'EVENT') actionEvent(next, action);
  else if (action.type === 'CONTINUE') {
    if (next.phase !== 'CHECKPOINT' || next.act >= 3) fail('INVALID_PHASE', 'No next act is available');
    next.act += 1;
    next.slot = 1;
    next.phase = 'ROOM';
    next.room = { type: 'blessing', candidates: [...currentAct(next).chapterRelics] };
  } else if (action.type === 'RETREAT') {
    if (next.phase !== 'CHECKPOINT' || action.confirmed !== true) fail('INVALID_PHASE', 'Retreat requires a checkpoint and explicit confirmation');
    next.phase = 'RESULT';
    next.room = null;
    next.result = { type: 'RETREAT' };
  } else if (action.type === 'ABANDON') {
    if (action.confirmed !== true) fail('CONFIRMATION_REQUIRED', 'Abandon requires explicit confirmation');
    next.phase = 'RESULT';
    next.room = null;
    next.result = { type: 'ABANDON' };
  } else {
    fail('INVALID_ACTION', `Unknown action type ${String(action.type)}`);
  }

  next.version = run.version + 1;
  next.lastActionAt = at;
  if (next.phase === 'RESULT' && next.result) next.result.at = at;
  return next;
}

export function expireRun(run, now = Date.now()) {
  if (!run || typeof run !== 'object') fail('INVALID_INPUT', 'run object is required');
  const at = timestamp(now);
  const next = clone(run);
  if (next.phase === 'RESULT' || at - next.lastActionAt < RUN_TTL) return next;
  next.phase = 'RESULT';
  next.room = null;
  next.result = {
    type: 'EXPIRED',
    at,
  };
  next.version += 1;
  return next;
}

