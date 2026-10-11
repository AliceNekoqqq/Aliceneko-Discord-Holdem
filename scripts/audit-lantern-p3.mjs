import assert from 'node:assert/strict';
import * as V12 from '../rogue-run-v12.mjs';
import * as V13 from '../rogue-run-v13.mjs';
import { legalCards as legalCardsV12, legalItems as legalItemsV12 } from '../rogue-battle-v12.mjs';
import { legalCards as legalCardsV13, legalItems as legalItemsV13 } from '../rogue-battle-v13.mjs';
import { PROFESSIONS, getCatalog as getCatalogV12 } from '../rogue-content-v12.mjs';
import { CATALOG_V13, getCatalog as getCatalogV13 } from '../rogue-content-v13.mjs';

const professions = Object.keys(PROFESSIONS);
const configs = [
  { label: 'v12', router: V12, catalog: getCatalogV12, legalCards: legalCardsV12, legalItems: legalItemsV12, version: 'lantern-rules-v0.12' },
  { label: 'v13', router: V13, catalog: getCatalogV13, legalCards: legalCardsV13, legalItems: legalItemsV13, version: 'lantern-rules-v0.13' },
];

function value(run) {
  const b = run.battle;
  if (run.phase === 'RESULT') return run.result.type === 'CLEAR' ? 1000 : -1000 + run.completed * 30;
  if (!b) return 500;
  return 3 * b.hp - 2 * b.enemyHp + b.shield * 0.8 + b.enemyBurn * 2 + b.forge * 2 + b.petHp * 0.8 + b.prepare * 0.4 + b.mark * 0.4 + b.energy * 0.1 + b.items.length * 0.2;
}

function actions(run, cfg) {
  const b = run.battle;
  const catalog = cfg.catalog(run.ruleVersion);
  return [
    { type: 'END_TURN' },
    ...cfg.legalItems(b).map(x => ({ type: 'ITEM', itemIndex: x.itemIndex })),
    ...cfg.legalCards(b).flatMap(entry => {
      const def = catalog.cards[entry.cardId];
      return def?.effects?.some(effect => ['sift', 'exhaust_other', 'retain'].includes(effect.kind))
        ? [{ type: 'PLAY', uid: entry.uid }, ...b.hand.filter(target => target.uid !== entry.uid).map(target => ({ type: 'PLAY', uid: entry.uid, targetUid: target.uid }))]
        : [{ type: 'PLAY', uid: entry.uid }];
    }),
  ];
}

// Same two-step legal greedy battle policy as P2; only the router/catalog differ.
function battleChoice(run, cfg) {
  let best = null, bestScore = -Infinity;
  for (const action of actions(run, cfg)) {
    let next;
    try { next = cfg.router.runAction(run, action, 0); } catch { continue; }
    let score = value(next);
    if (next.phase === 'BATTLE' && next.battle.turn === run.battle.turn) {
      let subScore = -Infinity;
      for (const second of actions(next, cfg)) {
        try { subScore = Math.max(subScore, value(cfg.router.runAction(next, second, 0))); } catch {}
      }
      score = subScore;
    }
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best ?? { type: 'END_TURN' };
}

function routeChoice(run) {
  const nodes = run.room.nodes.filter(node => run.room.choices.includes(node.id));
  const byType = type => nodes.find(node => node.type === type);
  if (run.hp < 24 && byType('camp')) return byType('camp');
  return nodes.find(node => node.type === 'normal' && !node.dangerous)
    ?? byType('normal') ?? byType('camp') ?? byType('event') ?? byType('elite') ?? nodes[0];
}

function appendedLogLines(before = [], after = []) {
  const maxOverlap = Math.min(before.length, after.length);
  for (let overlap = maxOverlap; overlap >= 0; overlap--) {
    if (overlap === 0) return after;
    if (before.slice(-overlap).every((line, index) => line === after[index])) return after.slice(overlap);
  }
  return after;
}

function runOne(cfg, professionId, difficulty, seed) {
  const { router } = cfg;
  let run = router.createRun({ runId: 'p3-audit', owner: '1', guild: '1', ruleVersion: cfg.version, professionId, difficulty, seed, now: 0 });
  const initialDeck = run.deck.map(card => card.cardId);
  let steps = 0;
  const combat = [];
  let activeCombat = null;
  while (run.phase !== 'RESULT' && steps++ < 400) {
    let action;
    if (run.phase === 'BATTLE') {
      if (!activeCombat) activeCombat = { enemyId: run.battle.enemyId, startHp: run.battle.hp, startEnemyHp: run.battle.enemyHp, turns: 0, chargeBreaks: 0 };
      action = battleChoice(run, cfg);
    } else if (run.phase === 'ROUTE') action = { type: 'ROUTE', choice: routeChoice(run).id };
    else if (run.phase === 'REWARD') action = { type: 'REWARD_CLAIM' };
    else if (run.phase === 'ROOM' && run.room.type === 'camp') action = { type: 'CAMP', choice: run.hp < 24 ? 'heal' : 'leave' };
    else if (run.phase === 'ROOM' && run.room.type === 'blessing') action = { type: 'BLESSING', relicId: run.room.candidates[0] ?? null };
    else if (run.phase === 'ROOM' && run.room.type === 'event') action = { type: 'EVENT', choice: run.room.choices.includes('gain') ? 'gain' : 'leave' };
    else if (run.phase === 'ROOM' && run.room.type === 'shop') action = { type: 'SHOP', choice: 'leave' };
    else if (run.phase === 'CHECKPOINT') action = { type: 'CONTINUE' };
    else throw new Error(`Unexpected state: ${run.phase}/${run.room?.type}`);

    const before = run;
    run = router.runAction(run, action, 0);
    if (before.phase === 'BATTLE' && activeCombat) {
      const newLog = appendedLogLines(before.battle.log ?? [], run.battle?.log ?? []);
      activeCombat.chargeBreaks += newLog.filter(line => /破势|charge break/i.test(line)).length;
      if (run.phase !== 'BATTLE') {
        activeCombat.result = run.battle?.result ?? (run.phase === 'REWARD' ? 'WIN' : 'OTHER');
        activeCombat.turns = run.battle?.turn ?? before.battle.turn;
        activeCombat.endHp = run.battle?.hp ?? run.hp;
        activeCombat.enemyLoss = Math.max(0, activeCombat.startEnemyHp - (run.battle?.enemyHp ?? 0));
        combat.push(activeCombat);
        activeCombat = null;
      }
    }
    // Exercise the save/restore boundary after every action for both versions.
    run = JSON.parse(JSON.stringify(run));
  }
  const path = run.path.map(node => `${node.act}.${node.slot}:${node.type}${node.dangerous ? '!' : ''}`);
  return {
    rules: cfg.label, ruleVersion: run.ruleVersion, professionId, difficulty, seed,
    result: steps >= 400 && run.phase !== 'RESULT' ? 'TIMEOUT' : run.result?.type ?? run.phase,
    completed: run.completed, hp: run.hp, steps, path, initialDeck,
    finalDeck: run.deck.map(card => card.cardId), combat,
  };
}

assert.equal(V12.CURRENT_RULE_VERSION, 'lantern-rules-v0.12');
assert.equal(V13.CURRENT_RULE_VERSION, 'lantern-rules-v0.13');
assert.equal(getCatalogV13('lantern-rules-v0.13'), CATALOG_V13);
assert.equal(CATALOG_V13.enemies.patrol_apprentice.intents.find(intent => intent.kind === 'charge').chargeBreak.threshold, 6);
assert.equal(getCatalogV12('lantern-rules-v0.12').enemies.patrol_apprentice.intents.find(intent => intent.kind === 'charge').chargeBreak, undefined);
assert.equal(professions.length, 8);
const rows = [];
for (const cfg of configs) for (const difficulty of [0, 6]) for (const professionId of professions) for (const seedIndex of [1, 2]) {
  rows.push(runOne(cfg, professionId, difficulty, `p3-${professionId}-d${difficulty}-s${seedIndex}`));
}
assert.equal(rows.length, 64);
const grouped = Object.fromEntries(configs.map(cfg => [cfg.label, rows.filter(row => row.rules === cfg.label)]));
console.log(JSON.stringify({
  scope: '8 professions × difficulty 0/6 × 2 paired seeds × v12/v13 = 64 runs',
  policy: 'P2 two-step legal greedy battle policy; safe route heuristic; shop leave; all actions JSON round-tripped',
  limitations: 'Small deterministic automated sample; not evidence of human fun or balance.',
  summary: Object.fromEntries(Object.entries(grouped).map(([version, group]) => [version, {
    clears: group.filter(row => row.result === 'CLEAR').length,
    timeouts: group.filter(row => row.result === 'TIMEOUT').length,
    hpAtEnd: group.reduce((sum, row) => sum + row.hp, 0),
    byProfessionDifficulty: Object.fromEntries(professions.flatMap(id => [0, 6].map(difficulty => [`${id}-d${difficulty}`, {
      clears: group.filter(row => row.professionId === id && row.difficulty === difficulty && row.result === 'CLEAR').length,
      hp: group.filter(row => row.professionId === id && row.difficulty === difficulty).reduce((sum, row) => sum + row.hp, 0),
      chargeBreaks: group.filter(row => row.professionId === id && row.difficulty === difficulty).flatMap(row => row.combat).reduce((sum, battle) => sum + battle.chargeBreaks, 0),
    }]))),
  }])),
  rows,
}, null, 2));
