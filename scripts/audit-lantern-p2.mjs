import assert from 'node:assert/strict';
import { createRun, runAction, CURRENT_RULE_VERSION as V11 } from '../rogue-run-v11.mjs';
import * as runRouter from '../rogue-run.mjs';
import { legalCards, legalItems } from '../rogue-battle.mjs';
import { CATALOG_V11 as C, PROFESSIONS, getCatalog } from '../rogue-content-v11.mjs';
import { CATALOG_V10 } from '../rogue-content-v10.mjs';
import { isConnectedPlan, nextNodeIds, reachableNodeIds, routeAvailability } from '../rogue-route-graph.mjs';
import { connectedPlanFor, nextRouteLabels, routeSupplyLines } from '../rogue-route-view.mjs';
import { describeRogueImage } from '../rogue-image.mjs';
import { renderRogue, renderRogueDetails } from '../rogue-ui.mjs';

const professions = Object.keys(PROFESSIONS);
const makeRun = (professionId, difficulty, seed) => createRun({
  runId: 'p2-audit', owner: '1', guild: '1', ruleVersion: V11, professionId, difficulty, seed, now: 0,
});

function auditGraphSeeds(count = 2000) {
  let edgeCount = 0;
  const campRows = new Set();
  for (let i = 0; i < count; i++) {
    const run = makeRun('traveler', 0, `p2-graph-${i}`);
    assert.equal(run.ruleVersion, V11);
    assert.deepEqual(JSON.parse(JSON.stringify(run)).mapPlan, run.mapPlan);
    for (const plan of run.mapPlan) {
      assert.ok(isConnectedPlan(plan), `invalid plan for seed ${i}, act ${plan.act}`);
      edgeCount += plan.edges.length;
      assert.equal(plan.nodes.length, 4);
      assert.ok(plan.nodes.every(row => row.length === 3));
      assert.ok(plan.nodes[0].every(node => node.type === 'normal'));
      assert.equal(plan.nodes[0].filter(node => node.dangerous).length, 1);
      assert.equal(plan.nodes[0][1].dangerous, true);
      assert.ok(plan.nodes[0].every(node => node.type !== 'elite'));
      const camps = plan.nodes.flat().filter(node => node.type === 'camp');
      assert.equal(camps.length, 1);
      const campRow = plan.nodes.findIndex(row => row.some(node => node.type === 'camp'));
      assert.ok(campRow === 1 || campRow === 2);
      campRows.add(campRow + 1);
      if (campRow === 1) assert.deepEqual(plan.nodes[campRow].map(n => n.type).sort(), ['camp', 'event', 'shop']);
      if (campRow === 2) assert.deepEqual(plan.nodes[campRow].map(n => n.type).sort(), ['camp', 'elite', 'normal']);
      const campId = camps[0].id;
      for (const first of plan.nodes[0]) assert.ok(reachableNodeIds(plan, first.id).includes(campId), `${first.id} cannot reach ${campId}`);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const node = plan.nodes[row][col];
        const expectedCols = col === 1 ? [0, 1, 2] : [col, 1];
        assert.deepEqual(nextNodeIds(plan, node.id).sort(), expectedCols.map(c => plan.nodes[row + 1][c].id).sort());
      }
      assert.deepEqual(nextNodeIds(plan, plan.nodes[3][0].id), [`a${plan.act}s5boss`]);
      assert.deepEqual(nextNodeIds(plan, `a${plan.act}s5boss`), []);
      assert.equal(plan.edges.length, 24);
    }
  }
  assert.deepEqual([...campRows].sort(), [2, 3]);
  return { seeds: count, plans: count * 3, edges: edgeCount, campRows: [...campRows].sort() };
}

function routeBoundaryChecks() {
  let run = makeRun('traveler', 0, 'p2-route-boundary');
  const plan = run.mapPlan[0];
  run = runAction(run, { type: 'BLESSING', relicId: null }, 1);
  const first = plan.nodes[0][0];
  run.path.push({ act: 1, slot: 1, nodeId: first.id, type: first.type });
  run.completed = 1;
  run.slot = 2;
  run.phase = 'ROUTE';
  run.room = { type: 'route', slot: 2, ...routeAvailability(run, plan, 2) };
  const jumped = plan.nodes[2][0];
  assert.throws(() => runAction(run, { type: 'ROUTE', choice: jumped.id }, 3), error => error.code === 'INVALID_ROUTE');
  const restored = JSON.parse(JSON.stringify(run));
  const legal = restored.room.nodes.find(n => restored.room.choices.includes(n.id));
  assert.ok(legal);
  const next = runAction(restored, { type: 'ROUTE', choice: legal.id }, 3);
  assert.equal(next.path.at(-1).nodeId, legal.id, 'JSON-restored route choices remain usable');

  const old = runRouter.createRun({ runId: 'p2-old-save', owner: '1', guild: '1', seed: 'p2-old', ruleVersion: 'lantern-rules-v0.10', now: 0 });
  assert.equal(old.ruleVersion, 'lantern-rules-v0.10');
  assert.equal(runRouter.SUPPORTED_RULE_VERSIONS.includes('lantern-rules-v0.10'), true);
  assert.equal(runRouter.CURRENT_RULE_VERSION, V11);
  const oldRoundTrip = JSON.parse(JSON.stringify(old));
  assert.equal(runRouter.runAction(oldRoundTrip, { type: 'BLESSING', relicId: null }, 1).ruleVersion, 'lantern-rules-v0.10');
  return { jumpRejected: true, jsonRecoveryContinues: true, v10SaveRemainsV10: true, supportedVersions: [...runRouter.SUPPORTED_RULE_VERSIONS] };
}

function routeViewChecks() {
  const run = makeRun('traveler', 0, 'p2-view-boundary');
  run.phase = 'ROUTE';
  const plan = run.mapPlan[0];
  const choices = plan.nodes[0].map(node => node.id);
  run.room = { type: 'route', slot: 1, choices, nodes: plan.nodes[0].map(node => ({ ...node, available: true, disabledReason: null })) };
  const ui = renderRogue(run);
  const routeText = JSON.stringify(ui.data);
  assert.match(routeText, /沿连线选择支路/);
  const supply = routeSupplyLines(run, plan);
  assert.equal(supply.length, 2);
  const image = describeRogueImage(run, 'map').acts[0];
  assert.equal(image.connected, true);
  assert.deepEqual(image.edges, plan.edges);
  const modelEdges = new Set(image.edges.map(edge => `${edge.from}>${edge.to}`));
  for (const node of plan.nodes[0]) {
    const labels = nextRouteLabels(plan, node.id);
    const expected = nextNodeIds(plan, node.id).map(id => plan.nodes[1].find(n => n.id === id).title);
    assert.equal(labels.length, expected.length);
    assert.ok(labels.every(label => label.includes('第2站')));
    assert.ok(nextNodeIds(plan, node.id).every(id => modelEdges.has(`${node.id}>${id}`)));
  }
  assert.ok(renderRogueDetails(run, 'map'));
  const branch = routeSupplyExample();
  return { textRouteHasConnectedInstructions: true, imageEdgesMatchPlan: true, nodeLabelsMatchEdges: true, supplyLines: supply, branch };
}

function routeSupplyExample() {
  let run, plan, camp;
  for (let i = 0; i < 500; i++) {
    const candidate = makeRun('traveler', 0, `p2-supply-${i}`);
    const map = candidate.mapPlan[0];
    const campRow = map.nodes.findIndex(row => row.some(node => node.type === 'camp'));
    const campNode = map.nodes[campRow].find(node => node.type === 'camp');
    if (campRow === 1) { run = candidate; plan = map; camp = campNode; break; }
  }
  assert.ok(run && plan && camp, 'could not produce a side-lane camp example');
  run = runAction(run, { type: 'BLESSING', relicId: null }, 1);
  const first = plan.nodes[0][0];
  run.path.push({ act: 1, slot: 1, nodeId: first.id, type: first.type });
  run.completed = 1; run.slot = 2; run.phase = 'ROUTE';
  run.room = { type: 'route', slot: 2, ...routeAvailability(run, plan, 2) };
  const campLineBefore = routeSupplyLines(run, plan).find(line => line.startsWith('营地：'));
  assert.match(campLineBefore, /后续可达/);
  const nextOnPath = run.room.nodes.find(node => run.room.choices.includes(node.id) && node.type !== 'camp');
  assert.ok(nextOnPath);
  run.path.push({ act: 1, slot: 2, nodeId: nextOnPath.id, type: nextOnPath.type });
  run.completed = 2; run.slot = 3; run.phase = 'ROUTE';
  run.room = { type: 'route', slot: 3, ...routeAvailability(run, plan, 3) };
  const campLineAfter = routeSupplyLines(run, plan).find(line => line.startsWith('营地：'));
  assert.match(campLineAfter, /已错过/);
  return { seed: run.seed, camp: camp.id, before: campLineBefore, after: campLineAfter, chosenPath: [first.id, nextOnPath.id] };
}

function value(run) {
  const b = run.battle;
  if (run.phase === 'RESULT') return run.result.type === 'CLEAR' ? 1000 : -1000 + run.completed * 30;
  if (!b) return 500;
  return 3 * b.hp - 2 * b.enemyHp + b.shield * 0.8 + b.enemyBurn * 2 + b.forge * 2 + b.petHp * 0.8 + b.prepare * 0.4 + b.mark * 0.4 + b.energy * 0.1 + b.items.length * 0.2;
}

function actions(run) {
  const b = run.battle;
  const catalog = getCatalog(run.ruleVersion);
  return [
    { type: 'END_TURN' },
    ...legalItems(b).map(x => ({ type: 'ITEM', itemIndex: x.itemIndex })),
    ...legalCards(b).flatMap(entry => {
      const def = catalog.cards[entry.cardId];
      return def?.effects?.some(effect => ['sift', 'exhaust_other', 'retain'].includes(effect.kind))
        ? [{ type: 'PLAY', uid: entry.uid }, ...b.hand.filter(target => target.uid !== entry.uid).map(target => ({ type: 'PLAY', uid: entry.uid, targetUid: target.uid }))]
        : [{ type: 'PLAY', uid: entry.uid }];
    }),
  ];
}

function battleChoice(run) {
  let best = null, bestScore = -Infinity;
  for (const action of actions(run)) {
    let next;
    try { next = runRouter.runAction(run, action, 0); } catch { continue; }
    let score = value(next);
    if (next.phase === 'BATTLE' && next.battle.turn === run.battle.turn) {
      let subScore = -Infinity;
      for (const second of actions(next)) {
        try { subScore = Math.max(subScore, value(runRouter.runAction(next, second, 0))); } catch {}
      }
      score = subScore;
    }
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best ?? { type: 'END_TURN' };
}

function routeChoice(run, strategy) {
  const nodes = run.room.nodes.filter(node => run.room.choices.includes(node.id));
  const byType = type => nodes.find(node => node.type === type);
  if (strategy === 'risk-seeking') return byType('elite') ?? nodes.find(node => node.dangerous) ?? byType('normal') ?? byType('event') ?? byType('shop') ?? byType('camp') ?? nodes[0];
  if (strategy === 'shop-seeking') return byType('shop') ?? byType('camp') ?? nodes.find(node => node.type === 'normal' && !node.dangerous) ?? byType('event') ?? byType('elite') ?? nodes[0];
  if (run.hp < 24 && byType('camp')) return byType('camp');
  return nodes.find(node => node.type === 'normal' && !node.dangerous)
    ?? byType('normal') ?? byType('camp') ?? byType('event') ?? byType('elite') ?? nodes[0];
}

function cardScore(id, catalog) {
  const def = catalog.cards[id];
  return def.effects.reduce((sum, effect) => sum + (
    ['damage', 'weapon_attack'].includes(effect.kind) ? effect.value * 0.7
      : effect.kind === 'burn' ? effect.value * 1.9
        : effect.kind === 'block' ? effect.value * 0.75
          : effect.kind === 'forge' ? effect.value * 1.8
            : effect.kind === 'heal' ? effect.value * 0.5
              : effect.kind === 'pet_attack' ? effect.value * 0.6 : 1
  ), 0) / Math.max(1, def.cost);
}

export function play(professionId, difficulty, seed, strategy = 'safe', version = V11) {
  const ruleVersion = version === 'v10' ? 'lantern-rules-v0.10' : V11;
  let run = runRouter.createRun({ runId: 'p2-audit', owner: '1', guild: '1', ruleVersion, professionId, difficulty, seed, now: 0 });
  const catalog = getCatalog(run.ruleVersion);
  let steps = 0;
  while (run.phase !== 'RESULT' && steps++ < 400) {
    let action;
    if (run.phase === 'BATTLE') action = battleChoice(run);
    else if (run.phase === 'ROUTE') action = { type: 'ROUTE', choice: routeChoice(run, strategy).id };
    else if (run.phase === 'REWARD') action = { type: 'REWARD_CLAIM' };
    else if (run.phase === 'ROOM' && run.room.type === 'camp') {
      const uid = run.deck.filter(entry => !entry.upgraded && catalog.cards[entry.cardId]?.upgrade)
        .sort((a, b) => cardScore(b.cardId, catalog) - cardScore(a.cardId, catalog))[0]?.uid;
      action = { type: 'CAMP', choice: run.hp < 24 ? 'heal' : uid != null ? 'upgrade' : 'leave', uid };
    } else if (run.phase === 'ROOM' && run.room.type === 'blessing') action = { type: 'BLESSING', relicId: run.room.candidates[0] ?? null };
    else if (run.phase === 'ROOM' && run.room.type === 'event') action = { type: 'EVENT', choice: run.room.choices.includes('gain') ? 'gain' : 'leave' };
    else if (run.phase === 'ROOM' && run.room.type === 'shop') action = { type: 'SHOP', choice: 'leave' };
    else if (run.phase === 'CHECKPOINT') action = { type: 'CONTINUE' };
    else throw new Error(`Unexpected state: ${run.phase}/${run.room?.type}`);
    run = runRouter.runAction(run, action, 0);
  }
  assert.ok(steps < 400, `${professionId} d${difficulty} ${seed} did not finish`);
  const path = run.path.map(node => {
    const lane = node.nodeId?.match(/n([0-2])$/);
    return `${node.act}.${node.slot}${lane ? `n${Number(lane[1]) + 1}` : ''}:${node.type}${node.dangerous ? '!' : ''}`;
  });
  return { version, professionId, difficulty, seed, strategy, result: run.result?.type, completed: run.completed, hp: run.hp, steps, path,
    camps: run.path.filter(node => node.type === 'camp').length,
    shops: run.path.filter(node => node.type === 'shop').length,
    eliteWins: run.eliteWins,
    dangerous: run.path.filter(node => node.dangerous).length,
    finalDeckSize: run.deck.length };
}

const graph = auditGraphSeeds();
const boundaries = routeBoundaryChecks();
const views = routeViewChecks();
const v11AsV10 = structuredClone(C);
v11AsV10.version = '0.10';
assert.deepEqual(v11AsV10, CATALOG_V10, 'v0.11 must preserve v0.10 card stats and shop prices');
const rows = [];
for (const difficulty of [0, 6]) {
  const seed = `v10-p1-fixed-d${difficulty}`;
  for (const version of ['v10', 'v11']) for (const professionId of professions) rows.push(play(professionId, difficulty, seed, 'safe', version));
}
const sameSeed = ['safe', 'risk-seeking', 'shop-seeking'].map(strategy => play('traveler', 0, 'v11-p2-same-seed-example', strategy));
assert.ok(sameSeed.every(row => row.seed === sameSeed[0].seed));
assert.ok(sameSeed.every(row => row.path.join('|') !== sameSeed[0].path.join('|')) || sameSeed[0].path.join('|') !== sameSeed[1].path.join('|'));
assert.ok(sameSeed.some(row => row.shops > 0), 'shop-seeking strategy should demonstrate an available shop path');
console.log(JSON.stringify({ ruleVersion: V11, graph, boundaries, views, policy: 'safe two-step greedy battle policy; legal route choices only; camp heal below 24 HP; first available reward choices', runs: rows, sameSeedDifferentRoutes: sameSeed }, null, 2));
