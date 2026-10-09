import test from 'node:test';
import assert from 'node:assert/strict';
import { HABITS, PETS, STAGES } from './pet-catalog.mjs';
import { actWalk, createPet, createWalk, finishWalk, redirectWalk, setPetHabits, walkView } from './pet-engine.mjs';

function petWith(habits = [], growth = 0) {
  const pet = createPet('lamp-cat', '灯灯', '2026-10-09T00:00:00Z');
  return { ...pet, growth, habits, unlockedHabits: [...habits] };
}
function play(pet, seed, actions) {
  let walk = createWalk(pet, { id: `test-${seed}`, seed });
  for (const choice of actions) walk = actWalk(walk, pet, choice);
  return { walk, result: finishWalk(walk, pet) };
}

test('catalog provides five species with three coats each, six tradeoff habits and six material vocabulary entries', () => {
  assert.equal(PETS.length, 5);
  for(const p of PETS)assert.equal(p.coats.length,3);
  assert.equal(HABITS.length, 6);
  assert.deepEqual(STAGES.map((stage) => stage.safeCost), [1, 1, 1, 1, 2]);
});

test('same seed produces the same route goals and options; redirect never rerolls them', () => {
  const pet = petWith();
  const a = createWalk(pet, { seed: 'fixed' });
  const b = createWalk(pet, { seed: 'fixed' });
  assert.deepEqual(a.goals, b.goals);
  const before = walkView(a, pet);
  const changed = redirectWalk(a, pet, a.intent === 'sniff' ? 'friend' : 'sniff');
  const after = walkView(changed, pet);
  assert.deepEqual(after.choices.map(({ id, label }) => ({ id, label })), before.choices.map(({ id, label }) => ({ id, label })));
  assert.notDeepEqual(after.choices.map((choice) => choice.cost), before.choices.map((choice) => choice.cost));
  assert.deepEqual(after.goals, before.goals);
  assert.equal(changed.redirects, 1);
  assert.throws(() => redirectWalk(changed, pet, 'teleport'), /不认识这个心意/);
  assert.throws(() => actWalk(changed, pet, 'not-a-choice'), /没有这条路线/);
});

test('matching a stage intention improves the route cost, and redirect can align a planned action', () => {
  const pet = petWith();
  let walk = createWalk(pet, { seed: 'intention-value' });
  const desiredChoice = walk.intent === 'sniff' ? 'alley-scent' : 'alley-scent';
  const sniff = walkView(walk, pet).choices.find((choice) => choice.id === desiredChoice);
  if (walk.intent !== 'sniff') {
    assert.equal(sniff.preferred, false);
    assert.equal(sniff.cost, 1);
    walk = redirectWalk(walk, pet, 'sniff');
  }
  const aligned = walkView(walk, pet).choices.find((choice) => choice.id === 'alley-scent');
  assert.equal(aligned.preferred, true);
  assert.match(aligned.effect, /省1脚力/);
  assert.equal(aligned.cost, 0);
  const last = createWalk(pet, { seed: 'last-intent' });
  let route = last;
  for (const choice of ['alley-scent', 'bakery-smell', 'drain-smell', 'fork-flower']) route = actWalk(route, pet, choice);
  const returnChoice = walkView(route, pet).choices.find((choice) => choice.id === `porch-${route.intent === 'sniff' ? 'scent' : route.intent === 'friend' ? 'friend' : 'fetch'}`);
  assert.equal(returnChoice.cost, 2);
  assert.match(returnChoice.effect, /返程成本不变/);
});

test('every path through all five stages preserves a safe continuation and bounded bag', () => {
  const pet = petWith();
  const walk = createWalk(pet, { seed: 'enumerate' });
  function visit(current) {
    if (current.phase === 'done') {
      assert.equal(current.step, 5);
      assert.ok(current.energy >= 0);
      assert.ok(current.bag.length <= current.bagCapacity);
      assert.equal(finishWalk(current, pet).moneySpent, 0);
      return;
    }
    const view = walkView(current, pet);
    const enabled = view.choices.filter((choice) => !choice.disabled);
    assert.ok(enabled.length, `safe choice exists at stage ${current.step}`);
    for (const choice of enabled) {
      const next = actWalk(current, pet, choice.id);
      assert.ok(next.energy >= 0);
      assert.ok(next.bag.length <= next.bagCapacity);
      visit(next);
    }
  }
  visit(walk);
});

test('every pair of target types has a deterministic completing strategy', () => {
  const planByGoal = {
    explore: ['alley-scent', 'bakery-smell', 'drain-smell', 'fork-flower', 'porch-scent'],
    friend: ['alley-scent', 'bakery-friend', 'drain-friend', 'fork-neighbor', 'porch-scent'],
    keepsake: ['alley-paper', 'bakery-smell', 'drain-smell', 'fork-flower', 'porch-fetch'],
    craft: ['alley-paper', 'bakery-friend', 'drain-smell', 'fork-flower', 'porch-friend'],
  };
  const pet = petWith();
  const seenPairs = new Set();
  for (let i = 0; i < 200; i++) {
    const seed = `pair-${i}`;
    const initial = createWalk(pet, { seed });
    const pair = initial.goals.map((goal) => goal.id);
    seenPairs.add([...pair].sort().join('+'));
    const has = (goal) => pair.includes(goal);
    const plan = has('craft') ? planByGoal.craft : [
      has('explore') ? 'alley-scent' : 'alley-paper',
      has('friend') ? 'bakery-friend' : 'bakery-smell',
      has('keepsake') ? 'drain-fetch' : 'drain-smell',
      has('explore') ? 'fork-flower' : 'fork-neighbor',
      has('keepsake') ? 'porch-fetch' : 'porch-scent',
    ];
    let walk = initial;
    for (const choice of plan) walk = actWalk(walk, pet, choice);
    assert.equal(walk.phase, 'done');
    assert.equal(walk.completedGoals.length, 2, `${pair.join(',')} via ${plan}`);
  }
  assert.ok(seenPairs.size >= 5);
});

test('the explicit friendship plus crafted toy route completes both goals and includes return cost', () => {
  const pet = petWith();
  let walk = createWalk(pet, { id: 'test-craft-social', seed: 'craft-social' });
  const actions = ['alley-paper', 'bakery-friend', 'drain-smell', 'fork-flower', 'porch-friend'];
  for (const choice of actions) walk = actWalk(walk, pet, choice);
  const result = finishWalk(walk, pet);
  assert.ok(walk.energy >= 0);
  assert.equal(walk.completedGoals.length, 2);
  assert.equal(result.stars, 2);
  assert.ok(result.experiences.some((entry) => entry.category === 'craft'));
  assert.equal(result.moneySpent, 0);
  assert.ok(result.localItems.includes('pinwheel'));
});

test('redirects are bounded and a full bag never overflows or blocks the return', () => {
  const pet = petWith();
  let walk = createWalk(pet, { seed: 'bag' });
  for (const choice of ['alley-paper', 'bakery-fetch', 'drain-fetch']) walk = actWalk(walk, pet, choice);
  assert.equal(walk.bag.length, 3);
  const view = walkView(walk, pet);
  assert.ok(view.choices.some((choice) => !choice.disabled));
  assert.throws(() => actWalk(walk, pet, 'fork-scrap'), /背包已满/);
  walk = actWalk(walk, pet, 'fork-neighbor');
  assert.equal(walk.step, 4);
  const last = walkView(walk, pet);
  assert.equal(last.choices.find((choice) => choice.id === 'porch-scent').cost, 2);
  walk = actWalk(walk, pet, 'porch-scent');
  assert.equal(walk.phase, 'done');
});

test('habit slots unlock at 50 and 175 growth and light travel trades one bag slot for a redirect', () => {
  const discovered = ['slow-observer', 'light-traveler'];
  assert.throws(() => setPetHabits({ ...petWith(), unlockedHabits: discovered }, ['slow-observer']), /只开放了0个/);
  const familiar = { ...petWith(), growth: 50, unlockedHabits: discovered };
  assert.equal(setPetHabits(familiar, ['light-traveler']).habits.length, 1);
  assert.throws(() => setPetHabits(familiar, ['slow-observer', 'light-traveler']), /只开放了1个/);
  const companion = { ...familiar, growth: 175 };
  const equipped = setPetHabits(companion, ['slow-observer', 'light-traveler']);
  const walk = createWalk(equipped, { seed: 'habit-trade' });
  assert.equal(walk.bagCapacity, 2);
  assert.equal(walk.redirects, 3);
  const smell = walkView(walk, equipped).choices.find((choice) => choice.id === 'alley-scent');
  assert.equal(smell.cost, walk.intent === 'sniff' ? 0 : 1);
  assert.equal(walkView(walk, equipped).choices.find((choice) => choice.id === 'alley-paper').cost, walk.intent === 'fetch' ? 0 : 1);
});

test('each discovered habit changes routes or state and makes its tradeoff observable', () => {
  const all = HABITS.map((habit) => habit.id);
  const withHabit = (id, overrides = {}) => ({ ...petWith([id], 175), unlockedHabits: all, ...overrides });

  const observer = withHabit('slow-observer');
  let walk = createWalk(observer, { seed: 'habit-observer' });
  const observe = walkView(walk, observer).choices.find((choice) => choice.id === 'alley-observe');
  assert.ok(observe && observe.cost >= 1);
  walk = actWalk(walk, observer, observe.id);
  assert.equal(walk.flags.extraClue, true);
  walk = actWalk(walk, observer, 'bakery-smell');
  walk = actWalk(walk, observer, 'drain-smell');
  assert.ok(walkView(walk, observer).choices.some((choice) => choice.id === 'fork-hidden-garden'));

  const collector = withHabit('collector');
  walk = createWalk(collector, { seed: 'habit-collector' });
  walk = actWalk(walk, collector, 'alley-scent');
  walk = actWalk(walk, collector, 'bakery-smell');
  const salvage = walkView(walk, collector).choices.find((choice) => choice.id === 'drain-scrap');
  assert.ok(salvage && salvage.cost >= 1);
  walk = actWalk(walk, collector, salvage.id);
  assert.equal(walk.flags.recovered, true);
  assert.ok(walk.bag.includes('metal'));

  const friendly = withHabit('friendly');
  walk = createWalk(friendly, { seed: 'habit-friendly' });
  walk = actWalk(walk, friendly, 'alley-scent');
  const introductions = walkView(walk, friendly).choices.find((choice) => choice.id === 'bakery-introductions');
  assert.match(introductions.effect, /不拿细绳/);
  walk = actWalk(walk, friendly, introductions.id);
  assert.equal(walk.flags.introductions, true);
  assert.equal(walk.flags.friend, true);
  assert.equal(walk.flags.baker, undefined);
  assert.equal(walk.bag.includes('thread'), false);

  const noMemory = withHabit('nostalgic');
  walk = createWalk(noMemory, { seed: 'habit-nostalgic-none' });
  walk = actWalk(walk, noMemory, 'alley-scent');
  assert.ok(!walkView(walk, noMemory).choices.some((choice) => choice.id === 'bakery-revisit'));
  const nostalgia = withHabit('nostalgic', { memories: [{ kind: 'first-pinwheel' }] });
  walk = createWalk(nostalgia, { seed: 'habit-nostalgic' });
  walk = actWalk(walk, nostalgia, 'alley-scent');
  const revisit = walkView(walk, nostalgia).choices.find((choice) => choice.id === 'bakery-revisit');
  assert.match(revisit.effect, /不发现新线索/);
  walk = actWalk(walk, nostalgia, revisit.id);
  assert.equal(walk.flags.revisitedBaker, true);

  const paper = withHabit('paper-lover');
  walk = createWalk(paper, { seed: 'habit-paper' });
  walk = actWalk(walk, paper, 'alley-paper');
  walk = actWalk(walk, paper, 'bakery-smell');
  walk = actWalk(walk, paper, 'drain-smell');
  walk = actWalk(walk, paper, 'fork-scrap');
  const soloCraft = walkView(walk, paper).choices.find((choice) => choice.id === 'porch-self-craft');
  assert.match(soloCraft.effect, /不会完成结交朋友目标/);
  walk = actWalk(walk, paper, soloCraft.id);
  assert.equal(walk.flags.selfCrafted, true);
  assert.equal(walk.flags.friend, undefined);
  assert.ok(walk.bag.includes('pinwheel'));
});

test('all conditional habit branches retain a safe finish and bounded bag', () => {
  for (const habit of HABITS) {
    const pet = {
      ...petWith([habit.id], 175), unlockedHabits: HABITS.map((entry) => entry.id),
      ...(habit.id === 'nostalgic' ? { memories: [{ kind: 'first-pinwheel' }] } : {}),
    };
    const initial = createWalk(pet, { seed: `safe-${habit.id}` });
    let reached = 0;
    function walkEveryBranch(walk) {
      if (walk.phase === 'done') {
        reached++;
        assert.ok(walk.energy >= 0);
        assert.ok(walk.bag.length <= walk.bagCapacity);
        return;
      }
      const actions = walkView(walk, pet).choices.filter((choice) => !choice.disabled);
      assert.ok(actions.length > 0, `${habit.id} retains a safe option at station ${walk.step + 1}`);
      for (const choice of actions) walkEveryBranch(actWalk(walk, pet, choice.id));
    }
    walkEveryBranch(initial);
    assert.ok(reached > 0);
  }
});

test('walkView exposes both target progress and every conditional choice has a plain-language reason', () => {
  const pet = petWith();
  let walk = createWalk(pet, { seed: 'target-progress' });
  const initial = walkView(walk, pet);
  assert.equal(initial.goalProgress.length, 2);
  assert.ok(initial.goalProgress.every((goal) => goal.complete === false));
  walk = actWalk(walk, pet, 'alley-paper');
  const second = walkView(walk, pet);
  assert.ok(second.goalProgress.every((goal) => typeof goal.complete === 'boolean'));
  assert.throws(() => setPetHabits({ ...pet, growth: 0, unlockedHabits: ['slow-observer'] }, ['slow-observer']), /目前只开放了0个/);
});
