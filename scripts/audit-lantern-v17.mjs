import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as Router17 from '../rogue-run-v17.mjs';
import * as Router16 from '../rogue-run-v16.mjs';
import * as Battle17 from '../rogue-battle-v17.mjs';
import * as Battle16 from '../rogue-battle-v16.mjs';
import { CATALOG_V17 } from '../rogue-content-v17.mjs';

import { CATALOG_V16 } from '../rogue-content-v16.mjs';
const previous = process.argv.includes('--v16');
const Router = previous ? Router16 : Router17;
const Battle = previous ? Battle16 : Battle17;
const CATALOG = previous ? CATALOG_V16 : CATALOG_V17;
const professions = Object.keys(CATALOG.professions);
const version = previous ? 'lantern-rules-v0.16' : 'lantern-rules-v0.17';
const stamp = new Date().toISOString();

function score(run) {
  const battle = run.battle;
  if (run.phase === 'RESULT') return run.result.type === 'CLEAR' ? 1000 : -1000 + run.completed * 30;
  if (!battle) return 500;
  return 3 * battle.hp - 2 * battle.enemyHp + battle.shield * 0.8 + battle.enemyBurn * 2
    + battle.forge * 2 + battle.petHp * 0.8 + battle.prepare * 0.4 + battle.mark * 0.4
    + battle.energy * 0.1 + battle.items.length * 0.2;
}

function legalActions(run) {
  const battle = run.battle;
  return [
    ...Battle.legalItems(battle).map(x => ({ type: 'ITEM', itemIndex: x.itemIndex })),
    ...Battle.legalCards(battle).flatMap(entry => {
      const card = entry.upgraded
        ? { ...CATALOG.cards[entry.cardId], ...CATALOG.cards[entry.cardId].upgrade }
        : CATALOG.cards[entry.cardId];
      return card?.effects?.some(effect => ['sift', 'exhaust_other', 'retain'].includes(effect.kind))
        ? [{ type: 'PLAY', uid: entry.uid }, ...battle.hand.filter(target => target.uid !== entry.uid)
          .map(target => ({ type: 'PLAY', uid: entry.uid, targetUid: target.uid }))]
        : [{ type: 'PLAY', uid: entry.uid }];
    }),
    ...Battle.legalEchoes(battle).map(entry => ({ type: 'ECHO', uid: entry.uid })),
    { type: 'END_TURN' },
  ];
}

function battleChoice(run) {
  let best = null;
  let bestScore = -Infinity;
  for (const action of legalActions(run)) {
    let next;
    try { next = Router.runAction(run, action, 0); } catch { continue; }
    let actionScore = score(next);
    if (next.phase === 'BATTLE' && next.battle.turn === run.battle.turn) {
      let secondScore = -Infinity;
      for (const second of legalActions(next)) {
        try { secondScore = Math.max(secondScore, score(Router.runAction(next, second, 0))); } catch {}
      }
      if (secondScore > -Infinity) actionScore = secondScore;
    }
    if (actionScore > bestScore) { bestScore = actionScore; best = action; }
  }
  return best ?? { type: 'END_TURN' };
}

function routeChoice(run) {
  const nodes = run.room.nodes.filter(node => run.room.choices.includes(node.id));
  const find = type => nodes.find(node => node.type === type);
  if (run.hp <= 24 && find('camp')) return find('camp');
  return nodes.find(node => node.type === 'normal' && !node.dangerous)
    ?? find('normal') ?? find('camp') ?? find('event') ?? find('elite') ?? nodes[0];
}

function appendLines(before = [], after = []) {
  for (let overlap = Math.min(before.length, after.length); overlap >= 0; overlap--) {
    if (overlap === 0) return after;
    if (before.slice(-overlap).every((line, index) => line === after[index])) return after.slice(overlap);
  }
  return after;
}

function simulate(professionId, seedIndex) {
  const seed = `whole-${professionId}-${seedIndex}`;
  let run = Router.createRun({ runId: 'v17-balance-audit', owner: 'audit', guild: 'audit',
    ruleVersion: version, professionId, difficulty: 0, seed, now: 0 });
  let steps = 0;
  const combats = [];
  const camps = [];
  let active = null;
  while (run.phase !== 'RESULT' && steps++ < 800) {
    let action;
    if (run.phase === 'BATTLE') {
      if (!active) active = { enemyId: run.battle.enemyId,
        role: CATALOG.enemies[run.battle.enemyId]?.role ?? null,
        startHp: run.battle.hp, startEnemyHp: run.battle.enemyHp, startTurn: run.battle.turn };
      action = battleChoice(run);
    } else if (run.phase === 'ROUTE') {
      action = { type: 'ROUTE', choice: routeChoice(run).id };
    } else if (run.phase === 'REWARD') action = { type: 'REWARD_CLAIM' };
    else if (run.phase === 'ROOM' && run.room.type === 'camp') {
      action = { type: 'CAMP', choice: run.hp <= 24 ? 'heal' : 'leave' };
      const before = run.hp;
      const act = run.act;
      run = Router.runAction(run, action, 0);
      camps.push({ act, choice: action.choice, hpBefore: before, hpAfter: run.hp, hpRestored: run.hp - before });
      run = JSON.parse(JSON.stringify(run));
      continue;
    } else if (run.phase === 'ROOM' && run.room.type === 'blessing') {
      action = { type: 'BLESSING', relicId: run.room.candidates[0] ?? null };
    } else if (run.phase === 'ROOM' && run.room.type === 'event') {
      action = { type: 'EVENT', choice: run.room.choices.includes('gain') ? 'gain' : 'leave' };
    } else if (run.phase === 'ROOM' && run.room.type === 'shop') action = { type: 'SHOP', choice: 'leave' };
    else if (run.phase === 'CHECKPOINT') action = { type: 'CONTINUE' };
    else throw new Error(`Unexpected state ${run.phase}/${run.room?.type}`);

    const before = run;
    run = Router.runAction(run, action, 0);
    if (before.phase === 'BATTLE' && active) {
      active.battleHealing = (active.battleHealing ?? 0)
        + Math.max(0, (run.battle?.heals ?? 0) - (before.battle.heals ?? 0));
      if (run.phase !== 'BATTLE') {
        active.endHp = run.battle?.hp ?? run.hp;
        active.turns = run.battle?.turn ?? before.battle.turn;
        active.result = run.result?.type === 'DEFEAT' ? 'DEFEAT' : 'WIN';
        active.hpLostBeforeHealing = Math.max(0, active.startHp - active.endHp + active.battleHealing);
        active.enemyHpLost = Math.max(0, active.startEnemyHp - (run.battle?.enemyHp ?? 0));
        active.terminalLog = appendLines(before.battle.log ?? [], run.battle?.log ?? []);
        combats.push(active);
        active = null;
      }
    }
    run = JSON.parse(JSON.stringify(run));
  }
  return { professionId, seedIndex, seed, outcome: steps >= 800 ? 'TIMEOUT' : run.result?.type ?? run.phase,
    stationsCompleted: run.completed, endingHp: run.hp, steps,
    camps, combats };
}

const runs = [];
for (const professionId of professions) for (let seedIndex = 1; seedIndex <= 4; seedIndex++) {
  runs.push(simulate(professionId, seedIndex));
}
const summarize = group => ({
  runs: group.length,
  clears: group.filter(run => run.outcome === 'CLEAR').length,
  defeats: group.filter(run => run.outcome === 'DEFEAT').length,
  timeouts: group.filter(run => run.outcome === 'TIMEOUT').length,
  meanEndingHp: Number((group.reduce((sum, run) => sum + run.endingHp, 0) / group.length).toFixed(2)),
  combatHpLostBeforeHealing: group.reduce((sum, run) => sum + run.combats.reduce((n, battle) => n + battle.hpLostBeforeHealing, 0), 0),
  battleHealing: group.reduce((sum, run) => sum + run.combats.reduce((n, battle) => n + battle.battleHealing, 0), 0),
  campHealUses: group.reduce((sum, run) => sum + run.camps.filter(camp => camp.choice === 'heal').length, 0),
  campHpRestored: group.reduce((sum, run) => sum + run.camps.reduce((n, camp) => n + camp.hpRestored, 0), 0),
});

const priorV16 = {
  cohort: 'same 8 professions × 4 seeds, run previously against frozen v16 at difficulty 0',
  summary: { runs: 32, clears: 30, defeats: 2, timeouts: 0, meanEndingHp: 22.47,
    combatHpLostBeforeHealing: 925, battleHealing: 659, campHealUses: 3, campHpRestored: 25 },
  medic: [
    { seedIndex: 1, outcome: 'CLEAR', endingHp: 25 }, { seedIndex: 2, outcome: 'CLEAR', endingHp: 14 },
    { seedIndex: 3, outcome: 'CLEAR', endingHp: 17 }, { seedIndex: 4, outcome: 'CLEAR', endingHp: 22 },
  ],
};
const byProfession = Object.fromEntries(professions.map(professionId => [professionId,
  summarize(runs.filter(run => run.professionId === professionId))]));
const report = {
  generatedAt: stamp,
  rules: version,
  scope: `8 professions × 4 paired seeds × difficulty 0 = 32 ${previous?'v16':'v17'} full runs`,
  method: 'Two-action legal greedy battle lookahead; explicit legal ECHO choices; normal route preference, choose camp when HP <= 24, heal at camp when HP <= 24; claim default rewards; no injected HP; JSON roundtrip after every action.',
  limits: 'Deterministic small automated sample, not evidence of human fun or population balance. Seed cohort is paired to prior v16 audit.',
  v16Baseline: priorV16,
  [previous ? 'v16' : 'v17']: { summary: summarize(runs), byProfession,
    runs: runs.map(run => ({ professionId: run.professionId, seedIndex: run.seedIndex,
      outcome: run.outcome, stationsCompleted: run.stationsCompleted, endingHp: run.endingHp,
      campUses: run.camps.filter(camp => camp.choice === 'heal').length,
      campHpRestored: run.camps.reduce((sum, camp) => sum + camp.hpRestored, 0),
      camps: run.camps.filter(camp => camp.choice === 'heal') })) },
};
const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
const target = output ? resolve(output) : null;
if (target) await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ target, rules: version, summary: report[previous ? 'v16' : 'v17'].summary,
  medic: runs.filter(run => run.professionId === 'medic').map(run => ({ seedIndex: run.seedIndex,
    outcome: run.outcome, endingHp: run.endingHp, stationsCompleted: run.stationsCompleted })) }, null, 2));
