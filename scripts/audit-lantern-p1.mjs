import { createRun, runAction, CURRENT_RULE_VERSION } from '../rogue-run-v10.mjs';
import { legalCards, legalItems } from '../rogue-battle.mjs';
import { CATALOG_V10 as C, PROFESSIONS } from '../rogue-content-v10.mjs';

function value(run) {
  const b = run.battle;
  if (run.phase === 'RESULT') return run.result.type === 'CLEAR' ? 1000 : -1000 + run.completed * 30;
  if (!b) return 500;
  return 3 * b.hp - 2 * b.enemyHp + b.shield * 0.8 + b.enemyBurn * 2 + b.forge * 2 + b.petHp * 0.8 + b.prepare * 0.4 + b.mark * 0.4 + b.energy * 0.1 + b.items.length * 0.2;
}

function actions(run) {
  const b = run.battle;
  return [
    { type: 'END_TURN' },
    ...legalItems(b).map((x) => ({ type: 'ITEM', itemIndex: x.itemIndex })),
    ...legalCards(b).flatMap((entry) => {
      const def = C.cards[entry.cardId];
      return def.effects.some((e) => ['sift', 'exhaust_other', 'retain'].includes(e.kind))
        ? [{ type: 'PLAY', uid: entry.uid }, ...b.hand.filter((target) => target.uid !== entry.uid).map((target) => ({ type: 'PLAY', uid: entry.uid, targetUid: target.uid }))]
        : [{ type: 'PLAY', uid: entry.uid }];
    }),
  ];
}

function battleChoice(run) {
  let best = null;
  let bestScore = -Infinity;
  for (const action of actions(run)) {
    let next;
    try { next = runAction(run, action, 0); } catch { continue; }
    let score = value(next);
    if (next.phase === 'BATTLE' && next.battle.turn === run.battle.turn) {
      let sub = -Infinity;
      for (const second of actions(next)) {
        try { sub = Math.max(sub, value(runAction(next, second, 0))); } catch {}
      }
      score = sub;
    }
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best;
}

function cardScore(id) {
  const def = C.cards[id];
  return def.effects.reduce((sum, effect) => sum + (
    ['damage', 'weapon_attack'].includes(effect.kind) ? effect.value * 0.7
      : effect.kind === 'burn' ? effect.value * 1.9
        : effect.kind === 'block' ? effect.value * 0.75
          : effect.kind === 'forge' ? effect.value * 1.8
            : effect.kind === 'heal' ? effect.value * 0.5
              : effect.kind === 'pet_attack' ? effect.value * 0.6 : 1
  ), 0) / Math.max(1, def.cost);
}

export function play(professionId, difficulty, seed) {
  let run = createRun({ runId: 'p1-audit', owner: '1', guild: '1', ruleVersion: CURRENT_RULE_VERSION, professionId, difficulty, seed, now: 0 });
  let steps = 0;
  while (run.phase !== 'RESULT' && steps++ < 400) {
    let action;
    if (run.phase === 'BATTLE') action = battleChoice(run);
    else if (run.phase === 'ROUTE') {
      const choices = run.room.nodes.filter((node) => run.room.choices.includes(node.id));
      const chosen = (run.hp < 24 ? choices.find((node) => node.type === 'camp') : null)
        ?? choices.find((node) => node.type === 'normal' && !node.dangerous)
        ?? choices.find((node) => node.type === 'normal')
        ?? choices.find((node) => node.type === 'camp')
        ?? choices.find((node) => node.type === 'event')
        ?? choices.find((node) => node.type === 'elite')
        ?? choices[0];
      action = { type: 'ROUTE', choice: chosen.id };
    } else if (run.phase === 'REWARD') action = { type: 'REWARD_CLAIM' };
    else if (run.phase === 'ROOM' && run.room.type === 'camp') {
      const uid = run.deck.filter((entry) => !entry.upgraded).sort((a, b) => cardScore(b.cardId) - cardScore(a.cardId))[0]?.uid;
      action = { type: 'CAMP', choice: run.hp < 24 ? 'heal' : uid != null ? 'upgrade' : 'leave', uid };
    } else if (run.phase === 'ROOM' && run.room.type === 'blessing') action = { type: 'BLESSING', relicId: run.room.candidates[0] };
    else if (run.phase === 'ROOM' && run.room.type === 'event') action = { type: 'EVENT', choice: run.room.choices.includes('gain') ? 'gain' : 'leave' };
    else if (run.phase === 'ROOM' && run.room.type === 'shop') action = { type: 'SHOP', choice: 'leave' };
    else if (run.phase === 'CHECKPOINT') action = { type: 'CONTINUE' };
    else throw new Error(`Unexpected state: ${run.phase}/${run.room?.type}`);
    run = runAction(run, action, 0);
  }
  return { professionId, difficulty, seed, result: run.result?.type, reason: run.result?.reason ?? null, completed: run.completed, hp: run.hp, steps, path: run.path.map((node) => `${node.act}.${node.slot}:${node.type}${node.dangerous ? '!' : ''}`), finalDeckSize: run.deck.length };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const rows = [];
  for (const difficulty of [0, 6]) {
    const seed = `v10-p1-fixed-d${difficulty}`;
    for (const professionId of Object.keys(PROFESSIONS)) rows.push(play(professionId, difficulty, seed));
  }
  console.log(JSON.stringify({ ruleVersion: CURRENT_RULE_VERSION, policy: 'safe two-step greedy', runs: rows }, null, 2));
}
