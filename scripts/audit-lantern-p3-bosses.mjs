import assert from 'node:assert/strict';
import * as V14 from '../rogue-run-v14.mjs';
import * as V15 from '../rogue-run-v15.mjs';
import { legalCards as legalCardsV14, legalItems as legalItemsV14 } from '../rogue-battle-v14.mjs';
import { legalCards as legalCardsV15, legalItems as legalItemsV15, beginBattle as beginBossBattleV15, battleAction as bossBattleActionV15 } from '../rogue-battle-v15.mjs';
import { getDifficultyRules } from '../rogue-difficulty-v08.mjs';
import { CATALOG_V14, PROFESSIONS, getCatalog as getCatalogV14 } from '../rogue-content-v14.mjs';
import { CATALOG_V15, getCatalog as getCatalogV15 } from '../rogue-content-v15.mjs';

const professions = Object.keys(PROFESSIONS);
const configs = [
  { label: 'v14', router: V14, catalog: getCatalogV14, legalCards: legalCardsV14, legalItems: legalItemsV14, version: 'lantern-rules-v0.14' },
  { label: 'v15', router: V15, catalog: getCatalogV15, legalCards: legalCardsV15, legalItems: legalItemsV15, version: 'lantern-rules-v0.15' },
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
      if (!activeCombat) activeCombat = { enemyId: run.battle.enemyId, role: cfg.catalog(run.ruleVersion).enemies[run.battle.enemyId]?.role, startHp: run.battle.hp, startEnemyHp: run.battle.enemyHp, turns: 0, chargeBreaks: 0, tempoOutcomes: [], phasePreviewChecks: [] };
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
    const expectedPhasePreview = before.phase === 'BATTLE' && before.battle.phaseNextIntent ? before.battle.phaseNextIntent : null;
    const tempoAtEnd = before.phase === 'BATTLE' && before.battle.intent?.kind === 'tempo' && ['END_TURN', 'PLAY'].includes(action.type) ? { plays: before.battle.plays + (action.type === 'PLAY' ? 1 : 0), threshold: before.battle.intent.playThreshold, attacksTaken: before.battle.attacksTaken, turn: before.battle.turn } : null;
    run = router.runAction(run, action, 0);
    if (activeCombat && expectedPhasePreview && run.battle?.turn > before.battle.turn) {
      const check = { turn: before.battle.turn, expected: expectedPhasePreview, actual: run.battle.intent };
      assert.deepEqual(check.actual, check.expected, `${cfg.label} ${activeCombat.enemyId}: phaseNextIntent did not match next actual intent`);
      activeCombat.phasePreviewChecks.push(check);
    }
    if (activeCombat && tempoAtEnd && run.battle?.turn > before.battle.turn) {
      const expected = tempoAtEnd.plays <= tempoAtEnd.threshold ? 'calm' : 'rush';
      const attacks = (run.battle?.attacksTaken ?? tempoAtEnd.attacksTaken) - tempoAtEnd.attacksTaken;
      const observed = expected === 'calm' ? (run.battle?.enemyShield === 8 ? 'calm' : 'calm-unverified') : (attacks === 2 ? 'rush' : 'rush-unverified');
      const outcome = { ...tempoAtEnd, expected, observed, attacks };
      assert.equal(observed, expected, `${cfg.label} ${activeCombat.enemyId}: tempo branch mismatch`);
      activeCombat.tempoOutcomes.push(outcome);
    }
    if (before.phase === 'BATTLE' && activeCombat) {
      const newLog = appendedLogLines(before.battle.log ?? [], run.battle?.log ?? []);
      activeCombat.chargeBreaks += newLog.filter(line => /破势|charge break/i.test(line)).length;
      activeCombat.phaseTransitions = (activeCombat.phaseTransitions ?? 0) + newLog.filter(line => /进入第二阶段/.test(line)).length;
      if (run.phase !== 'BATTLE') {
        activeCombat.result = run.battle?.result ?? (run.result?.type === 'DEFEAT' ? 'DEFEAT' : 'WIN');
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

function fixedDeckPhaseScenario() {
  const difficulty = 10, enemyId = 'a2_mirror_regent';
  const rules = getDifficultyRules(difficulty);
  const deck = Array.from({ length: 10 }, (_, index) => ({ uid: index + 1, cardId: 'slash', upgraded: false }));
  let battle = beginBossBattleV15({ enemyId, deck, relics: [], hp: rules.maxHp, difficulty, seed: 'p3-boss-phase-fixed-deck-d10' });
  let steps = 0, transition = null;
  while (!battle.result && battle.enemyPhase === 1 && steps++ < 100) {
    const before = battle;
    const card = legalCardsV15(battle)[0];
    battle = card ? bossBattleActionV15(battle, { type: 'PLAY', uid: card.uid }) : bossBattleActionV15(battle, { type: 'END_TURN' });
    if (before.enemyPhase === 1 && battle.enemyPhase === 2) {
      const expected = structuredClone(CATALOG_V15.enemies[enemyId].phaseIntents[0]);
      const phaseAttackBonus = rules.attackBonus + rules.bossPhaseAttackBonus;
      if (expected.onRush?.kind === 'attack') expected.onRush.value += phaseAttackBonus;
      const actualFirstPhaseIntent = battle.phaseNextIntent ?? battle.intent;
      assert.deepEqual(actualFirstPhaseIntent, expected, 'fixed deck: d10 half-phase first intent must match actual next intent');
      assert.equal(battle.phaseThreshold, 0.65);
      transition = { difficulty, seed: 'p3-boss-phase-fixed-deck-d10', deck: '10 × slash, no upgrades/relics', hpThreshold: 0.65, crossedAtEnemyHp: battle.enemyHp, enemyMaxHp: battle.enemyMaxHp, expected: CATALOG_V15.enemies[enemyId].phaseIntents[0].label, actual: actualFirstPhaseIntent.label, consumedPreviewImmediately: battle.phaseNextIntent === null };
      break;
    }
  }
  assert.ok(transition, 'fixed deck must reach the d10 half-health phase threshold');
  return transition;
}

assert.equal(V14.CURRENT_RULE_VERSION, 'lantern-rules-v0.14');
assert.equal(V15.CURRENT_RULE_VERSION, 'lantern-rules-v0.15');
assert.equal(getCatalogV15('lantern-rules-v0.15'), CATALOG_V15);
assert.equal(Object.values(CATALOG_V15.enemies).filter(enemy => enemy.role === 'Boss').length, 6);
function catalogOutsideBossChanges(catalog) {
  const copy = structuredClone(catalog);
  copy.version = '0.14';
  for (const id of expectedBossChanges) delete copy.enemies[id];
  for (const enemy of Object.values(copy.enemies).filter(enemy => enemy.role === 'Boss')) {
    for (const pool of [enemy.intents, enemy.phaseIntents].filter(Boolean)) {
      for (const intent of pool) if (intent.kind === 'charge') delete intent.next;
    }
  }
  return copy;
}
const expectedBossChanges = ['a2_mirror_regent', 'a3_unlit_bellmaster', 'dark_lantern'];
assert.deepEqual(Object.keys(CATALOG_V14.cards), Object.keys(CATALOG_V15.cards));
assert.deepEqual(CATALOG_V14.cards, CATALOG_V15.cards);
assert.deepEqual(CATALOG_V14.shop, CATALOG_V15.shop);
assert.deepEqual(catalogOutsideBossChanges(CATALOG_V14), catalogOutsideBossChanges(CATALOG_V15));
assert.deepEqual(Object.keys(CATALOG_V14.enemies).filter(id => JSON.stringify(CATALOG_V14.enemies[id]) !== JSON.stringify(CATALOG_V15.enemies[id])).filter(id => !expectedBossChanges.includes(id)).map(id => {
  const a = structuredClone(CATALOG_V14.enemies[id]), b = structuredClone(CATALOG_V15.enemies[id]);
  for (const enemy of [a, b]) for (const pool of [enemy.intents, enemy.phaseIntents].filter(Boolean)) for (const intent of pool) if (intent.kind === 'charge') delete intent.next;
  return JSON.stringify(a) !== JSON.stringify(b) ? id : null;
}).filter(Boolean), []);
const regentPhase = CATALOG_V15.enemies.a2_mirror_regent.phaseIntents;
assert.deepEqual(regentPhase.map(intent => intent.kind), ['tempo', 'charge', 'attack', 'cleanse']);
assert.equal(regentPhase[0].playThreshold, 2);
assert.equal(regentPhase[0].onCalm.kind, 'guard');
assert.equal(regentPhase[0].onRush.kind, 'attack');
assert.equal(regentPhase[0].onRush.value, 4);
assert.equal(regentPhase[0].onRush.hits, 2);
assert.deepEqual([regentPhase[1].value, regentPhase[1].hits, regentPhase[2].value, regentPhase[2].hits, regentPhase[3].kind, regentPhase[3].value], [6, 2, 6, 2, 'cleanse', 3]);
for (const pool of [CATALOG_V15.enemies.dark_lantern.intents, CATALOG_V15.enemies.dark_lantern.phaseIntents]) {
  for (const intent of pool.filter(intent => intent.kind === 'charge')) assert.deepEqual(intent.chargeBreak, { threshold: 8, reduction: 4 });
}
for (const intent of CATALOG_V15.enemies.a3_unlit_bellmaster.phaseIntents.filter(intent => intent.kind === 'charge')) assert.deepEqual(intent.chargeBreak, { threshold: 12, reduction: 2 });
assert.equal(professions.length, 8);
const rows = [];
for (const cfg of configs) for (const difficulty of [0, 6]) for (const professionId of professions) for (const seedIndex of [1, 2]) {
  rows.push(runOne(cfg, professionId, difficulty, `p3-${professionId}-d${difficulty}-s${seedIndex}`));
}
assert.equal(rows.length, 64);
const grouped = Object.fromEntries(configs.map(cfg => [cfg.label, rows.filter(row => row.rules === cfg.label)]));
const specialized = fixedDeckPhaseScenario();
console.log(JSON.stringify({
  specialized,
  scope: '8 professions × difficulty 0/6 × 2 paired seeds × v14/v15 = 64 runs',
  policy: 'P2 two-step legal greedy battle policy; safe route heuristic; shop leave; all actions JSON round-tripped; paired seeds across frozen v14/v15 modules',
  limitations: 'Small deterministic automated sample; not evidence of human fun or balance.',
  summary: Object.fromEntries(Object.entries(grouped).map(([version, group]) => [version, {
    clears: group.filter(row => row.result === 'CLEAR').length,
    timeouts: group.filter(row => row.result === 'TIMEOUT').length,
    hpAtEnd: group.reduce((sum, row) => sum + row.hp, 0),
    byProfessionDifficulty: Object.fromEntries(professions.flatMap(id => [0, 6].map(difficulty => [`${id}-d${difficulty}`, {
      clears: group.filter(row => row.professionId === id && row.difficulty === difficulty && row.result === 'CLEAR').length,
      hp: group.filter(row => row.professionId === id && row.difficulty === difficulty).reduce((sum, row) => sum + row.hp, 0),
      bossEncounters: group.filter(row => row.professionId === id && row.difficulty === difficulty).flatMap(row => row.combat).filter(battle => battle.role === 'Boss').length,
      bossWins: group.filter(row => row.professionId === id && row.difficulty === difficulty).flatMap(row => row.combat).filter(battle => battle.role === 'Boss' && battle.result === 'WIN').length,
      phaseTransitions: group.filter(row => row.professionId === id && row.difficulty === difficulty).flatMap(row => row.combat).reduce((sum, battle) => sum + (battle.phaseTransitions ?? 0), 0),
      chargeBreaks: group.filter(row => row.professionId === id && row.difficulty === difficulty).flatMap(row => row.combat).reduce((sum, battle) => sum + battle.chargeBreaks, 0),
    }]))),
  }])),
  rows,
}, null, 2));
