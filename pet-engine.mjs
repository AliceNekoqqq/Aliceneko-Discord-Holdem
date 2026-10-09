import { HABITS, PETS, STAGES } from './pet-catalog.mjs';

export const RULE_VERSION = 'twin-hearts-v1';
const SPECIES = new Set(PETS.map((pet) => pet.id));
const HABIT_IDS = new Set(HABITS.map((habit) => habit.id));
const INTENTS = ['sniff', 'friend', 'fetch'];
const INTENT_NAMES = { sniff: '闻一闻', friend: '交朋友', fetch: '叼回家' };

function hashSeed(seed) {
  let h = 2166136261;
  for (const ch of String(seed ?? '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
function intentAt(seed, step) { return INTENTS[hashSeed(`${seed}:intent:${step}`) % INTENTS.length]; }
function clone(value) { return structuredClone(value); }
function unique(values) { return [...new Set(values)]; }
function capacity(walk) { return walk.habits.includes('light-traveler') ? 2 : 3; }

export function createPet(species, name, now = new Date().toISOString()) {
  if (!SPECIES.has(species)) throw new RangeError(`没有这种宠物形象：${species}`);
  const safeName = String(name ?? '').trim();
  if (!safeName || safeName.length > 32) throw new RangeError('名字需要是1到32个字符。');
  return {
    id: `pet-${hashSeed(`${species}:${safeName}:${now}`).toString(36)}`, species, name: safeName,
    growth: 0, habits: [], unlockedHabits: [], memories: [], experiences: [], createdAt: now,
  };
}

function goalDeck(seed) {
  const all = [
    { id: 'explore', name: '发现一条新线索', category: 'exploration' },
    { id: 'friend', name: '结识一位街坊', category: 'friendship' },
    { id: 'keepsake', name: '带回一件纪念物', category: 'collection' },
    { id: 'craft', name: '做一件纸玩具', category: 'craft' },
  ];
  const start = hashSeed(seed) % all.length;
  return [all[start], all[(start + 1 + ((hashSeed(seed) >>> 3) % 3)) % all.length]];
}

export function createWalk(pet, { id, seed, day = null, rewarded = false, now = new Date().toISOString() } = {}) {
  if (!pet || !SPECIES.has(pet.species)) throw new TypeError('需要一只有效的小伙伴。');
  const chosenHabits = unique(pet.habits ?? []).filter((habit) => HABIT_IDS.has(habit));
  const unlocked = unique(pet.unlockedHabits ?? []);
  const habits = chosenHabits.filter((habit) => unlocked.includes(habit));
  if (habits.length > (pet.growth >= 175 ? 2 : pet.growth >= 50 ? 1 : 0)) throw new RangeError('已装备的习惯超过当前开放的槽位。');
  const light = habits.includes('light-traveler');
  const goals = goalDeck(seed);
  const walkId = id ?? `walk-${hashSeed(`${pet.id}:${seed}:${day}`).toString(36)}`;
  return {
    id: walkId, petId: pet.id, version: 0, step: 0, phase: 'playing', energy: 7, bag: [],
    bagCapacity: light ? 2 : 3, redirects: light ? 3 : 2, goals, completedGoals: [],
    flags: {}, memories: [], experiences: [], seed: String(seed ?? ''), day, rewarded: Boolean(rewarded),
    ruleVersion: RULE_VERSION, habits, createdAt: now,
    intent: intentAt(seed, 0),
  };
}

const OPTIONS = [
  [
    { id: 'alley-scent', label: '循着雨后的花香走石阶', cost: 1, intent: 'sniff', effect: 'scent', description: '记下铃兰气味，发现新线索。' },
    { id: 'alley-greet', label: '向门口的邻居问好', cost: 1, intent: 'friend', effect: 'greet', description: '听邻居讲起附近街坊。' },
    { id: 'alley-paper', label: '叼起檐下的干净纸片', cost: 1, intent: 'fetch', effect: 'paper', description: '带回一张纸片。' },
  ],
  [
    { id: 'bakery-smell', label: '闻闻面包香飘来的方向', cost: 1, intent: 'sniff', effect: 'bakery-clue', description: '记住面包铺的位置。' },
    { id: 'bakery-friend', label: '和摊主聊聊雨天生意', cost: 1, intent: 'friend', effect: 'meet-baker', description: '结识摊主米叔，得到一段细绳。' },
    { id: 'bakery-fetch', label: '叼回摊边的旧纸袋', cost: 1, intent: 'fetch', effect: 'paper', description: '带回一张纸片。' },
  ],
  [
    { id: 'drain-smell', label: '顺着水声找一条近路', cost: 1, intent: 'sniff', effect: 'water-clue', description: '记下一处雨水线索。' },
    { id: 'drain-friend', label: '请路过的小孩指路', cost: 1, intent: 'friend', effect: 'helper', description: '认识一位热心的小帮手。' },
    { id: 'drain-fetch', label: '叼回漂来的纸船', cost: 1, intent: 'fetch', effect: 'paper-boat', description: '带回一只纸船。' },
  ],
  [
    { id: 'fork-flower', label: '循线索去花圃看看', cost: 1, intent: 'sniff', effect: 'flower', description: '发现新地点，带回小花。' },
    { id: 'fork-neighbor', label: '向花匠打听街区故事', cost: 1, intent: 'friend', effect: 'gardener', description: '认识花匠，发现一条线索。' },
    { id: 'fork-scrap', label: '从篱边叼回一卷细绳', cost: 1, intent: 'fetch', effect: 'thread', description: '带回一段细绳。' },
  ],
  [
    { id: 'porch-scent', label: '闻闻门廊熟悉的木头香', cost: 2, intent: 'sniff', effect: 'home', description: '回到酒馆；成本已含返程。' },
    { id: 'porch-friend', label: '请米叔一起做纸风车', cost: 2, intent: 'friend', effect: 'craft', needs: ['paper', 'thread'], needsBaker: true, description: '需要纸片、细绳和面包铺的交情；返程成本已含。' },
    { id: 'porch-fetch', label: '叼着最喜欢的东西回家', cost: 2, intent: 'fetch', effect: 'keepsake', description: '把找到的纪念物带回酒馆。成本已含返程。' },
  ],
];

function optionsFor(walk, pet) {
  const options = OPTIONS[walk.step].map((option) => ({ ...option }));
  const has = (habit) => walk.habits.includes(habit);
  if (walk.step === 0 && has('slow-observer')) options.push({
    id: 'alley-observe', label: '多花片刻看清墙上的水痕', cost: 2, intent: 'sniff', effect: 'observe',
    description: '多耗1脚力记下秘密花圃线索，第四站会打开隐藏路线。',
  });
  if (walk.step === 1 && has('friendly')) options.push({
    id: 'bakery-introductions', label: '请熟客介绍附近街坊', cost: 2, intent: 'friend', effect: 'introductions',
    description: '多耗1脚力结识街坊；不拿细绳。',
  });
  if (walk.step === 1 && has('nostalgic') && hasBakeryMemory(pet)) options.push({
    id: 'bakery-revisit', label: '回访记得你的米叔', cost: 2, intent: 'friend', effect: 'revisit-baker',
    description: '多耗1脚力重温旧情；不发现新线索，也没有细绳。',
  });
  if (walk.step === 2 && has('collector')) options.push({
    id: 'drain-scrap', label: '从石缝里仔细回收金属片', cost: 2, intent: 'fetch', effect: 'scrap-metal',
    description: '多耗1脚力并占1格背包，带回一片金属。',
  });
  if (walk.step === 3 && walk.flags.extraClue) options.push({
    id: 'fork-hidden-garden', label: '循水痕进入隐藏花圃', cost: 1, intent: 'sniff', effect: 'hidden-flower',
    description: '沿先前线索发现隐蔽小路，带回小花。',
  });
  if (walk.step === 4 && has('paper-lover')) options.push({
    id: 'porch-self-craft', label: '自己把纸片和细绳折成风车', cost: 2, intent: 'friend', effect: 'craft-alone', needs: ['paper', 'thread'],
    description: '需要纸片与细绳；不需要米叔，但这次不会完成结交朋友目标。成本含返程。',
  });
  return options;
}

function hasBakeryMemory(pet) {
  return (pet.memories ?? []).some((memory) => memory.kind === 'first-pinwheel' || memory.place === '面包铺') ||
    (pet.experiences ?? []).some((experience) => String(experience.event ?? '').includes('面包铺结识米叔'));
}

function optionEffect(walk, option) {
  const flags = walk.flags;
  switch (option.effect) {
    case 'scent': flags.explored = true; flags.scent = true; break;
    case 'greet': flags.explored = true; flags.neighbor = true; break;
    case 'paper': addBag(walk, 'paper'); break;
    case 'observe': flags.explored = true; flags.extraClue = true; break;
    case 'bakery-clue': flags.explored = true; break;
    case 'meet-baker': flags.friend = true; flags.baker = true; addBag(walk, 'thread'); break;
    case 'introductions': flags.friend = true; flags.introductions = true; break;
    case 'revisit-baker': flags.friend = true; flags.revisitedBaker = true; break;
    case 'paper-boat': addBag(walk, 'paper'); flags.keepsake = true; break;
    case 'water-clue': flags.explored = true; break;
    case 'helper': flags.friend = true; break;
    case 'flower': flags.explored = true; addBag(walk, 'flower'); break;
    case 'gardener': flags.explored = true; flags.friend = true; break;
    case 'thread': addBag(walk, 'thread'); break;
    case 'scrap-metal': flags.keepsake = true; flags.recovered = true; addBag(walk, 'metal'); break;
    case 'hidden-flower': flags.explored = true; flags.hiddenGarden = true; addBag(walk, 'flower'); break;
    case 'craft':
      if (option.needs.every((item) => walk.bag.includes(item)) && flags.baker) {
        removeBag(walk, 'paper'); removeBag(walk, 'thread'); addBag(walk, 'pinwheel'); flags.crafted = true;
      } else flags.keepsake = walk.bag.length > 0;
      break;
    case 'craft-alone':
      if (option.needs.every((item) => walk.bag.includes(item))) {
        removeBag(walk, 'paper'); removeBag(walk, 'thread'); addBag(walk, 'pinwheel'); flags.crafted = true; flags.selfCrafted = true;
      }
      break;
    case 'keepsake': flags.keepsake = walk.bag.length > 0 || flags.friend; break;
    default: flags.home = true;
  }
}
function addBag(walk, item) { if (walk.bag.length < walk.bagCapacity) walk.bag.push(item); else walk.flags.bagFull = true; }
function removeBag(walk, item) { const index = walk.bag.indexOf(item); if (index >= 0) walk.bag.splice(index, 1); }
function completed(walk) {
  return walk.goals.filter((goal) => ({
    explore: walk.flags.explored, friend: walk.flags.friend, keepsake: walk.flags.keepsake || walk.bag.length > 0,
    craft: walk.flags.crafted,
  })[goal.id]).map((goal) => goal.id);
}
function remainingMinCost(step) { return STAGES.slice(step).reduce((sum, stage) => sum + stage.safeCost, 0); }

export function walkView(walk, pet) {
  if (!walk || walk.petId !== pet?.id) throw new TypeError('同行记录与小伙伴不匹配。');
  const stage = STAGES[Math.min(walk.step, STAGES.length - 1)];
  if (walk.phase !== 'playing') return { location: stage.name, intent: walk.intent, text: walk.phase === 'done' ? '这趟同行已经结束。' : '这趟同行已放弃。', choices: [], phase: walk.phase };
  const options = optionsFor(walk, pet);
  const choices = options.map((raw) => {
    const option = { ...raw };
    const preferred = option.intent === walk.intent;
    // A matching intention lets the pet lead the way, saving one local effort point.
    // The fifth choice keeps its full return cost even when the intention matches.
    const attunementDiscount = preferred && walk.step < STAGES.length - 1 ? 1 : 0;
    const cost = Math.max(0, option.cost - attunementDiscount);
    const minAfter = remainingMinCost(walk.step + 1);
    const disabled = walk.energy - cost < minAfter || walk.energy < cost;
    const capacityBlock = ['paper', 'paper-boat', 'flower', 'thread', 'scrap-metal'].includes(option.effect) && walk.bag.length >= walk.bagCapacity;
    const missing = (option.needs ?? []).filter((item) => !walk.bag.includes(item));
    const needsBlock = missing.length > 0;
    const effect = `${preferred ? `顺着当前心意，${walk.step < STAGES.length - 1 ? '省1脚力；' : '返程成本不变；'}` : '按这条路线行动；'}${option.description}`;
    const bakerBlock = option.needsBaker && !walk.flags.baker;
    const reason = capacityBlock ? '背包已满；选择其他安全路线。' : needsBlock ? `还缺少：${missing.map((item) => ({ paper: '纸片', thread: '细绳' }[item] ?? item)).join('、')}。` : bakerBlock ? '需要先在面包铺结识米叔；或用纸玩具爱好者的独自制作路线。' : disabled ? '脚力不足以完成剩余站点。' : undefined;
    return { id: option.id, label: option.label, cost, effect, preferred, disabled: Boolean(reason), ...(reason ? { reason } : {}) };
  });
  const goalProgress = walk.goals.map((goal) => ({ id: goal.id, name: goal.name, complete: completed(walk).includes(goal.id) }));
  return {
    location: stage.name, intent: walk.intent, intentName: INTENT_NAMES[walk.intent], text: `${pet.name}在${stage.name}${walk.step === 4 ? '准备返程' : '停下脚步'}，看起来想“${INTENT_NAMES[walk.intent]}”。`,
    step: walk.step, energy: walk.energy, bag: [...walk.bag], bagCapacity: walk.bagCapacity, redirects: walk.redirects,
    goals: clone(walk.goals), goalProgress, completedGoals: completed(walk), choices, phase: walk.phase,
  };
}

export function actWalk(walk, pet, choiceId) {
  const view = walkView(walk, pet);
  if (walk.phase !== 'playing') throw new Error('这趟同行已经结束，不能继续选择路线。');
  const displayed = view.choices.find((choice) => choice.id === choiceId);
  if (!displayed) throw new RangeError(`没有这条路线：${choiceId}`);
  if (displayed.disabled) throw new RangeError(displayed.reason ?? '这条路线目前无法选择。');
  const next = clone(walk);
  const option = optionsFor(next, pet).find((entry) => entry.id === choiceId);
  next.energy -= displayed.cost;
  optionEffect(next, option);
  next.step += 1; next.version += 1;
  if (next.step < STAGES.length) next.intent = intentAt(next.seed, next.step);
  next.completedGoals = completed(next);
  if (next.step === STAGES.length) next.phase = 'done';
  return next;
}

export function redirectWalk(walk, pet, intent) {
  walkView(walk, pet);
  if (walk.phase !== 'playing') throw new Error('这趟同行已经结束，不能再调整心意。');
  if (!INTENTS.includes(intent)) throw new RangeError(`不认识这个心意：${intent}`);
  if (walk.intent === intent) throw new RangeError('现在已经是这个心意了。');
  if (walk.redirects <= 0) throw new RangeError('这趟同行已经用完调整心意的次数。');
  const next = clone(walk); next.intent = intent; next.redirects -= 1; next.version += 1; return next;
}

export function finishWalk(walk, pet) {
  if (walk.phase !== 'done') throw new Error('完成五站后才能结算这趟同行。');
  if (walk.petId !== pet?.id) throw new TypeError('同行记录与小伙伴不匹配。');
  const stars = walk.completedGoals.length;
  const experiences = [
    ...(walk.flags.explored ? [{ category: 'exploration', event: '雨后街区发现新线索' }] : []),
    ...(walk.flags.friend ? [{ category: 'friendship', event: walk.flags.revisitedBaker ? '回访面包铺的米叔' : walk.flags.introductions ? '请熟客介绍了街坊' : walk.flags.baker ? '在面包铺结识米叔' : '在街区结识热心邻居' }] : []),
    ...(walk.flags.keepsake || walk.bag.length ? [{ category: 'collection', event: '带回一件街区纪念物' }] : []),
    ...(walk.flags.crafted ? [{ category: 'craft', event: walk.flags.selfCrafted ? '自己用纸片和细绳做成纸风车' : '和米叔一起做成纸风车' }] : []),
    ...(walk.flags.extraClue ? [{ category: 'exploration', event: '观察水痕找到隐藏花圃' }] : []),
    ...(walk.flags.recovered ? [{ category: 'collection', event: '从排水沟石缝回收金属片' }] : []),
  ];
  const existing = new Set(pet.unlockedHabits ?? []);
  const unlockedHabits = HABITS.filter((habit) => habit.unlockEvent && experiences.some((event) => event.category === habit.unlockEvent) && !existing.has(habit.id)).map((habit) => habit.id);
  const memory = { id: `${walk.id}:memory`, kind: walk.flags.crafted ? 'first-pinwheel' : 'rainy-street-walk', place: walk.flags.revisitedBaker ? '面包铺' : undefined, text: walk.flags.crafted ? `${pet.name}${walk.flags.selfCrafted ? '自己' : '和米叔一起'}做了纸风车。` : walk.flags.revisitedBaker ? `${pet.name}回访了面包铺的米叔。` : `${pet.name}完成了雨后街区同行（${stars}个目标）。`, seed: walk.seed };
  return { stars, memories: [memory], experiences, unlockedHabits, rewardEligible: walk.rewarded, localItems: [...walk.bag], moneySpent: 0, ruleVersion: walk.ruleVersion };
}

export function setPetHabits(pet, habits) {
  const chosen = unique(habits);
  if (chosen.some((id) => !HABIT_IDS.has(id))) throw new RangeError('没有这个习惯。');
  const slots = pet.growth >= 175 ? 2 : pet.growth >= 50 ? 1 : 0;
  if (chosen.length > slots) throw new RangeError(`目前只开放了${slots}个习惯槽。`);
  if (chosen.some((id) => !(pet.unlockedHabits ?? []).includes(id))) throw new RangeError('这个习惯还没有发现。');
  return { ...clone(pet), habits: chosen };
}
