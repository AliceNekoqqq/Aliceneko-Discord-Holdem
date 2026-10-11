import assert from 'node:assert/strict';
import * as B13 from '../rogue-battle-v13.mjs';
import * as B14 from '../rogue-battle-v14.mjs';
import { CATALOG_V13, PROFESSIONS as PROFESSIONS13 } from '../rogue-content-v13.mjs';
import { CATALOG_V14, PROFESSIONS as PROFESSIONS14 } from '../rogue-content-v14.mjs';
import { getDifficultyRules } from '../rogue-difficulty-v08.mjs';

const configs = [
  { version: 'v13', battle: B13, catalog: CATALOG_V13, professions: PROFESSIONS13 },
  { version: 'v14', battle: B14, catalog: CATALOG_V14, professions: PROFESSIONS14 },
];
const enemies = ['cracked_sergeant', 'chain_duelist'];
const difficulties = [0, 6];
const seeds = ['elite-p3-a', 'elite-p3-b'];
const professions = Object.keys(PROFESSIONS13);
const clone = value => JSON.parse(JSON.stringify(value));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function newLogLines(before = [], after = []) {
  for (let n = Math.min(before.length, after.length); n >= 0; n--) {
    if (n === 0 || before.slice(-n).every((line, i) => line === after[i])) return after.slice(n);
  }
  return after;
}

// Only the two named elite enemy records may differ between the catalogs.
const c13 = clone(CATALOG_V13), c14 = clone(CATALOG_V14);
delete c13.version; delete c14.version;
for (const id of enemies) { delete c13.enemies[id]; delete c14.enemies[id]; }
assert.deepEqual(stable(c14), stable(c13), 'v14 catalog changed content outside the two audited elites');
assert.deepEqual(stable(PROFESSIONS14), stable(PROFESSIONS13), 'starter profession content changed');
assert.equal(professions.length, 8);

function cardActions(state, cfg) {
  return cfg.battle.legalCards(state).flatMap(card => {
    const def = card.upgraded ? { ...cfg.catalog.cards[card.cardId], ...cfg.catalog.cards[card.cardId].upgrade } : cfg.catalog.cards[card.cardId];
    const targetable = def.effects.some(e => ['sift', 'retain', 'exhaust_other'].includes(e.kind));
    return targetable
      ? [{ type: 'PLAY', uid: card.uid }, ...state.hand.filter(x => x.uid !== card.uid).map(x => ({ type: 'PLAY', uid: card.uid, targetUid: x.uid }))]
      : [{ type: 'PLAY', uid: card.uid }];
  });
}

function actions(state, cfg) {
  return [
    { type: 'END_TURN' },
    ...cfg.battle.legalItems(state).map(x => ({ type: 'ITEM', itemIndex: x.itemIndex })),
    ...cardActions(state, cfg),
  ];
}

function value(state) {
  if (state.result) return state.result === 'WIN' ? 1000 + state.hp : -1000 + state.hp;
  return 3 * state.hp - 2 * state.enemyHp + 0.8 * state.shield - 0.8 * state.enemyShield + 2 * state.enemyBurn + 2 * state.forge + 0.8 * state.petHp + 0.4 * state.prepare + 0.4 * state.mark + 0.1 * state.energy + 0.2 * state.items.length;
}

function choose(state, cfg) {
  let best, bestScore = -Infinity;
  for (const action of actions(state, cfg)) {
    let next;
    try { next = cfg.battle.battleAction(state, action); } catch { continue; }
    let score = value(next);
    if (!next.result && next.turn === state.turn) {
      let secondScore = -Infinity;
      for (const second of actions(next, cfg)) {
        try { secondScore = Math.max(secondScore, value(cfg.battle.battleAction(next, second))); } catch {}
      }
      if (secondScore > -Infinity) score = secondScore;
    }
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best ?? { type: 'END_TURN' };
}

function snapshot(s) {
  return {
    turn: s.turn, hp: s.hp, enemyHp: s.enemyHp, enemyShield: s.enemyShield, enemyArmor: s.enemyArmor,
    intent: clone(s.intent), enemyPhase: s.enemyPhase, firstCardKind: s.firstCardKind,
    attacksTaken: s.attacksTaken,
    chargeDamage: s.chargeDamage, chargeBreakReady: s.chargeBreakReady, chargeBreakPending: s.chargeBreakPending,
    hand: s.hand.map(c => c.cardId), plays: s.plays, energy: s.energy, result: s.result,
  };
}

function runOne(cfg, professionId, difficulty, enemyId, seed) {
  const profession = cfg.professions[professionId];
  const deck = profession.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false }));
  const hp = getDifficultyRules(difficulty).maxHp;
  let state = cfg.battle.beginBattle({ enemyId, deck, relics: [profession.starterRelic], hp, seed, professionId, difficulty });
  assert.equal(state.ruleVersion, `lantern-rules-v0.${cfg.version.slice(1)}`);
  const transcript = [];
  let firstCardOutcomes = [];
  let branchResolutions = [];
  let chargeObserved = { armorZeroChargeTurns: 0, breakTriggered: 0, reducedImmediateAttack: 0, phaseOverrideCancelled: 0, incorrectImmediateForecasts: 0 };
  const chargeTurns = new Set();
  let phaseObserved = { entered: false, announcedIntent: null, phaseStartTurn: null, telegraphMatches: null };
  let steps = 0;
  while (!state.result && steps++ < 160) {
    const before = snapshot(state);
    const action = choose(state, cfg);
    const beforeLog = state.log.slice();
    state = cfg.battle.battleAction(state, action);
    // Explicitly exercise the persistent state boundary after every real battle action.
    state = JSON.parse(JSON.stringify(state));
    const logDelta = newLogLines(beforeLog, state.log);
    if (before.intent?.kind === 'charge' && before.intent.armor === -3 && !chargeTurns.has(before.turn)) {
      chargeTurns.add(before.turn);
      chargeObserved.armorZeroChargeTurns += Number(before.enemyArmor === 0);
    }
    if (before.intent?.kind === 'charge' && logDelta.some(line => /破势：紧接攻击/.test(line))) {
      chargeObserved.breakTriggered++;
      if (state.turn > before.turn && state.intent?.kind === 'attack') {
        const enemy = cfg.catalog.enemies[enemyId];
        const nextTurn = before.turn + 1;
        const nextIsPhase = state.enemyPhase === 2 && nextTurn >= state.phaseStartTurn;
        const pool = nextIsPhase ? enemy.phaseIntents : enemy.intents;
        const offset = nextIsPhase ? nextTurn - state.phaseStartTurn : nextTurn - 1;
        const raw = pool[offset % pool.length];
        const rawValue = raw.kind === 'attack' ? raw.value + state.attackBonus : null;
        const expected = rawValue == null ? null : Math.max(1, rawValue - before.intent.chargeBreak.reduction);
        if (expected === state.intent.value) chargeObserved.reducedImmediateAttack++;
        else chargeObserved.incorrectImmediateForecasts++;
      }
    }
    if (logDelta.some(line => /阶段切换覆盖破势/.test(line))) chargeObserved.phaseOverrideCancelled++;
    if (before.enemyPhase === 1 && state.enemyPhase === 2) {
      phaseObserved.entered = true;
      phaseObserved.announcedIntent = clone(cfg.catalog.enemies[enemyId].phaseIntents?.[0] ?? null);
      phaseObserved.phaseStartTurn = state.phaseStartTurn;
    }
    if (before.turn === 1 && before.intent?.kind === 'conditional' && before.firstCardKind === null && action.type === 'PLAY') {
      firstCardOutcomes.push({ firstAction: action, lockedAs: state.firstCardKind, resultingIntent: clone(state.intent) });
    }
    if (enemyId === 'chain_duelist' && before.intent?.kind === 'conditional' && before.turn > 0 && state.turn > before.turn) {
      const resolved = {
        turn: before.turn,
        phase: before.enemyPhase,
        firstCardKind: before.firstCardKind,
        branch: before.firstCardKind === 'attack' ? 'onAttack' : 'onOther',
        attacksTaken: state.attacksTaken - before.attacksTaken,
        hpAfterResolution: state.hp,
      };
      // `attacksTaken` can increase only while the conditional attack resolves.
      branchResolutions.push(resolved);
    }
    if (phaseObserved.entered && state.turn === phaseObserved.phaseStartTurn && !phaseObserved.telegraphMatches) {
      const expected = clone(phaseObserved.announcedIntent);
      const enhance = i => {
        if (['attack', 'charge'].includes(i.kind)) i.value += state.attackBonus + (i.kind && cfg.catalog.enemies[enemyId].role === 'Boss' ? state.bossPhaseAttackBonus : 0);
        if (i.kind === 'conditional') { enhance(i.onAttack); enhance(i.onOther); }
        if (i.kind === 'charge' && i.next) enhance(i.next);
      };
      if (expected) enhance(expected);
      phaseObserved.telegraphMatches = expected ? JSON.stringify(stable(state.intent)) === JSON.stringify(stable(expected)) : null;
    }
    transcript.push({ n: steps, action, before, after: snapshot(state), logDelta });
  }
  assert.ok(state.result, `${cfg.version}/${professionId}/${difficulty}/${enemyId}/${seed} exceeded action cap`);
  const firstAttack = transcript.find(row => row.before.intent?.kind === 'conditional' && row.before.turn === 1);
  const firstAttackResult = firstAttack ? transcript.find(row => row.before.turn === 1 && row.before.firstCardKind === null && row.action.type === 'PLAY') : null;
  const actualInitialBranch = firstAttackResult?.after.intent;
  return {
    version: cfg.version, ruleVersion: state.ruleVersion, professionId, difficulty, enemyId, seed,
    result: state.result, hp: state.hp, turns: state.turn, actions: steps,
    enemyInitialHp: Math.ceil(cfg.catalog.enemies[enemyId].hp * (cfg.catalog.enemies[enemyId].role === '精英' ? getDifficultyRules(difficulty).eliteHpMultiplier : getDifficultyRules(difficulty).normalHpMultiplier) * getDifficultyRules(difficulty).allHpMultiplier),
    breakCount: chargeObserved.breakTriggered, chargeObserved, firstCardOutcomes,
    firstTurnBranchLock: actualInitialBranch ? { lockedFirstCardKind: firstAttackResult.after.firstCardKind, announcedConditional: actualInitialBranch } : null,
    phaseObserved, branchResolutions, transcript,
  };
}

const rows = [];
for (const cfg of configs) for (const difficulty of difficulties) for (const professionId of professions) for (const enemyId of enemies) for (const seed of seeds) {
  rows.push(runOne(cfg, professionId, difficulty, enemyId, seed));
}
assert.equal(rows.length, 128);
const v14Sergeant = rows.filter(r => r.version === 'v14' && r.enemyId === 'cracked_sergeant');
const v14ChainPhaseBranches = rows.filter(r => r.version === 'v14' && r.enemyId === 'chain_duelist').flatMap(r => r.branchResolutions).filter(x => x.phase === 2);
assert.ok(v14Sergeant.some(r => r.chargeObserved.armorZeroChargeTurns > 0), 'sergeant never presented a zero-armor charge window');
assert.ok(v14Sergeant.some(r => r.chargeObserved.breakTriggered > 0), 'sergeant charge break never triggered');
assert.ok(v14Sergeant.some(r => r.chargeObserved.reducedImmediateAttack > 0), 'sergeant immediate attack reduction never resolved');
assert.equal(v14Sergeant.reduce((n, r) => n + r.chargeObserved.incorrectImmediateForecasts, 0), 0, 'sergeant immediate attack forecast differed from catalog-derived value');
assert.ok(v14ChainPhaseBranches.some(x => x.branch === 'onAttack') && v14ChainPhaseBranches.some(x => x.branch === 'onOther'), 'chain phase branches did not both resolve');
assert.ok(rows.filter(r => r.version === 'v14' && r.enemyId === 'chain_duelist').filter(r => r.phaseObserved.telegraphMatches === true).length > 0, 'chain phase telegraph was never observed');

const summary = Object.fromEntries(configs.map(cfg => [cfg.version, {
  wins: rows.filter(r => r.version === cfg.version && r.result === 'WIN').length,
  losses: rows.filter(r => r.version === cfg.version && r.result !== 'WIN').length,
  averageHp: Number((rows.filter(r => r.version === cfg.version).reduce((n, r) => n + r.hp, 0) / 64).toFixed(2)),
  averageTurns: Number((rows.filter(r => r.version === cfg.version).reduce((n, r) => n + r.turns, 0) / 64).toFixed(2)),
  byProfessionDifficulty: Object.fromEntries(professions.flatMap(p => difficulties.map(d => {
    const group = rows.filter(r => r.version === cfg.version && r.professionId === p && r.difficulty === d);
    return [`${p}-d${d}`, { wins: group.filter(r => r.result === 'WIN').length, hp: group.reduce((n, r) => n + r.hp, 0), turns: Number((group.reduce((n, r) => n + r.turns, 0) / group.length).toFixed(2)) }];
  }))),
  byElite: Object.fromEntries(enemies.map(e => {
    const group = rows.filter(r => r.version === cfg.version && r.enemyId === e);
    return [e, { wins: group.filter(r => r.result === 'WIN').length, averageHp: Number((group.reduce((n, r) => n + r.hp, 0) / group.length).toFixed(2)), turns: Number((group.reduce((n, r) => n + r.turns, 0) / group.length).toFixed(2)), chargeBreaks: group.reduce((n, r) => n + r.breakCount, 0), armorZeroChargeTurns: group.reduce((n, r) => n + r.chargeObserved.armorZeroChargeTurns, 0), immediateAttackReductions: group.reduce((n, r) => n + r.chargeObserved.reducedImmediateAttack, 0), phaseCrossings: group.filter(r => r.phaseObserved.entered).length, phaseTelegraphsPresented: group.filter(r => r.phaseObserved.telegraphMatches !== null).length, phaseTelegraphMatches: group.filter(r => r.phaseObserved.telegraphMatches === true).length, firstTurnBranch: { attack: group.filter(r => r.firstTurnBranchLock?.lockedFirstCardKind === 'attack').length, other: group.filter(r => r.firstTurnBranchLock?.lockedFirstCardKind === 'other').length }, branchResolutions: group.reduce((n, r) => n + r.branchResolutions.length, 0), phaseBranchResolutions: group.reduce((n, r) => n + r.branchResolutions.filter(x => x.phase === 2).length, 0) }];
  })),
}]));

console.log(JSON.stringify({
  scope: '8 professions × d0/d6 × 2 elites × 2 seeds × v13/v14 = 128 independent real battle loops',
  policy: 'two-step legal greedy; starter deck + starter relic; no run-map generation; JSON round-trip after every battle action; cap 12 turns/160 actions',
  limitation: 'Deterministic automated sample for mechanics and obvious extremes; not human balance or fun evidence.',
  catalogCheck: 'v13/v14 catalog equal outside version tag and the two audited elite records; profession starters equal.',
  summary, rows,
}, null, 2));
