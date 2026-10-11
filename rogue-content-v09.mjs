import { CATALOG_V08, PROFESSIONS as PROFESSIONS_V08, ITEMS as ITEMS_V08, EVENTS as EVENTS_V08, DIFFICULTIES, getCatalog as getCatalogV08 } from './rogue-content-v08.mjs';

const clone = (value) => structuredClone(value);

export const PROFESSIONS = clone(PROFESSIONS_V08);
export const ITEMS = clone(ITEMS_V08);
export const EVENTS = clone(EVENTS_V08);

export const CATALOG_V09 = clone(CATALOG_V08);
CATALOG_V09.version = '0.9';
CATALOG_V09.professions = PROFESSIONS;
CATALOG_V09.items = ITEMS;

// Give previously overlapping cards a distinct tactical job while keeping all
// effects within the battle engine's existing effect vocabulary.
const redesigns = {
  dispatch_strike: {
    cost: 0, effects: [{kind:'damage',value:3},{kind:'draw',value:1}],
    upgrade: {cost:0,selfCost:0,effects:[{kind:'damage',value:5},{kind:'draw',value:1}]},
    description: '0能量：造成3点伤害并抽1张牌；仍占用一次出牌。',
  },
  field_wrap: {
    effects: [{ kind: 'heal', value: 3 }, { kind: 'block', value: 3 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'heal', value: 5 }, { kind: 'block', value: 3 }] },
    description: '恢复3点生命并获得3点护盾；本牌消耗。',
  },
  trail_cut: {
    effects: [{ kind: 'damage', value: 5, ignoreArmor: true }, { kind: 'mark', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'damage', value: 7, ignoreArmor: true }, { kind: 'mark', value: 1 }] },
    description: '造成5点穿甲伤害并施加1点追猎标记。',
  },
  quiet_hour: {
    effects: [{ kind: 'block', value: 4 }, { kind: 'prepare', value: 1 }, { kind: 'retain', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'block', value: 6 }, { kind: 'prepare', value: 1 }, { kind: 'retain', value: 1 }] },
    description: '获得4点护盾和1点备势；选择1张手牌保留到下一轮。',
  },
  measured_reply: {
    effects: [{ kind: 'damage_from_shield', value: 0, maxSpend: 4 }, { kind: 'block', value: 4 }, { kind: 'counter', value: 2 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'damage_from_shield', value: 0, maxSpend: 6 }, { kind: 'block', value: 6 }, { kind: 'counter', value: 3 }] },
    description: '先消耗至多4点已有护盾造成等量伤害，再获得4点护盾；本轮首次挡住攻击后反击2点。',
  },
  paper_screen: {
    effects: [{ kind: 'block', value: 5 }, { kind: 'draw', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'block', value: 7 }, { kind: 'draw', value: 1 }] },
    description: '获得5点护盾并抽1张牌。',
  },
  letter_sift: {
    effects: [{ kind: 'block', value: 4 }, { kind: 'cleanse_player', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'block', value: 6 }, { kind: 'cleanse_player', value: 2 }] },
    name: '清灰信封',
    description: '获得4点护盾并移除1层自身灼烧。',
  },
  hot_iron: {
    effects: [{ kind: 'weapon_attack', value: 3 }, { kind: 'forge', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'weapon_attack', value: 5 }, { kind: 'forge', value: 1 }] },
    description: '造成3点基础武器伤害并获得1点锻值。',
  },
  coal_foam: {
    effects: [{ kind: 'block', value: 4 }, { kind: 'burn', value: 1 }, { kind: 'cleanse_player', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'block', value: 6 }, { kind: 'burn', value: 2 }, { kind: 'cleanse_player', value: 1 }] },
    description: '获得4点护盾、施加1层灼烧，并移除1层自身灼烧。',
  },
  coal_screen: {
    effects: [{ kind: 'block', value: 3 }, { kind: 'burn', value: 2 }, { kind: 'cleanse_player', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'block', value: 5 }, { kind: 'burn', value: 3 }, { kind: 'cleanse_player', value: 2 }] },
    description: '获得3点护盾、施加2层灼烧，并移除1层自身灼烧。',
  },
  bitter_spritz: {
    effects: [{ kind: 'damage', value: 4 }, { kind: 'burn', value: 2 }, { kind: 'cleanse_player', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'damage', value: 6 }, { kind: 'burn', value: 3 }, { kind: 'cleanse_player', value: 2 }] },
    description: '造成4点直接伤害、施加2层灼烧，并移除1层自身灼烧。',
  },
  ember_tea: {
    effects: [{ kind: 'block', value: 4 }, { kind: 'burn', value: 2 }, { kind: 'prepare', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'block', value: 6 }, { kind: 'burn', value: 3 }, { kind: 'prepare', value: 1 }] },
    description: '获得4点护盾、施加2层灼烧并获得1点备势。',
  },
  counter_bar: {
    effects: [{ kind: 'block', value: 5 }, { kind: 'counter', value: 2 }, { kind: 'prepare', value: 1 }],
    upgrade: { cost: 1, selfCost: 0, effects: [{ kind: 'block', value: 7 }, { kind: 'counter', value: 3 }, { kind: 'prepare', value: 1 }] },
    description: '获得5点护盾和1点备势；本轮首次以护盾吸收敌方攻击后，反击造成2点直接伤害。',
  },
};

const redesignedTags = {field_wrap:['治疗','守御'],trail_cut:['追猎','重击'],quiet_hour:['守御','预备','整理'],measured_reply:['守御','反击','重击'],paper_screen:['守御','整理'],letter_sift:['守御','净化'],hot_iron:['铸器','重击'],coal_foam:['守御','灼烧','净化'],coal_screen:['守御','灼烧','净化'],bitter_spritz:['重击','灼烧','净化'],ember_tea:['守御','灼烧','预备'],counter_bar:['守御','反击','预备']};
for (const [id, changes] of Object.entries(redesigns)) {
  if (redesignedTags[id]) changes.tags = redesignedTags[id];
  const card = CATALOG_V09.cards[id];
  if (!card) throw new Error(`v0.9 redesign references missing card: ${id}`);
  Object.assign(card, clone(changes));
}

// Any burn upgrade may improve other parts of a card, but burn itself rises
// by no more than one layer from its base value.
for (const card of Object.values(CATALOG_V09.cards)) {
  if (!card.upgrade?.effects) continue;
  const baseBurns = card.effects.filter((e) => e.kind === 'burn');
  let burnIndex = 0;
  for (const effect of card.upgrade.effects) {
    if (effect.kind !== 'burn') continue;
    const base = baseBurns[burnIndex++];
    if (base && effect.value > base.value + 1) effect.value = base.value + 1;
  }
}

// Organize profession feature cards as two distinct rewards in Act 1 and the
// remaining two in Act 2. Shared starter cards and difficulty wounds are not
// eligible card rewards.
const professionFeatureCards = Object.values(PROFESSIONS).flatMap((p) => p.starterDeck.slice(4));
const featureIds = new Set(professionFeatureCards);
const excluded = new Set(['slash', 'pierce', 'guard', 'bandage', 'v07_wound']);
const acts = CATALOG_V09.acts;
const inheritedPools = acts.map((act) => {
  const seen = new Set();
  return act.newCardRewards.filter((id) => {
    if (excluded.has(id) || featureIds.has(id) || seen.has(id) || !CATALOG_V09.cards[id]) return false;
    seen.add(id);
    return true;
  });
});
const firstAct = new Map();
inheritedPools.forEach((pool, index) => pool.forEach((id) => {
  if (!firstAct.has(id)) firstAct.set(id, index + 1);
}));
const actPools = acts.map(() => []);
for (const [id, actIndex] of firstAct) {
  const declared = CATALOG_V09.cards[id].rewardAct;
  const destination = Number.isInteger(declared) && declared >= 1 && declared <= acts.length ? declared : actIndex;
  CATALOG_V09.cards[id].rewardAct = destination;
  actPools[destination - 1].push(id);
}
for (const p of Object.values(PROFESSIONS)) {
  const features = p.starterDeck.slice(4);
  actPools[0].push(...features.slice(0, 2));
  actPools[1].push(...features.slice(2, 4));
  features.forEach((id, index) => { CATALOG_V09.cards[id].rewardAct = index < 2 ? 1 : 2; });
}
// Move high-cost attacks, repeat effects, and multi-resource cards to the
// final act so each act has its own focused set of new rewards.
const finalActCards = [
  'heavy_blow', 'ember_burst', 'echo_ward', 'forge_stance', 'forged_weapon',
  'gatebreak', 'quick_dispatch', 'ash_mark', 'cinder_bastion', 'restorative_wrap',
  'a2_long_glint', 'iron_hold', 'red_recipe', 'last_message', 'last_command',
  'sacrifice_gear', 'echoing_edge', 'ash_echo',
];
for (const id of finalActCards) {
  const from = actPools.findIndex((pool) => pool.includes(id));
  if (from < 0) throw new Error(`v0.9 final-act reward references missing card: ${id}`);
  actPools[from] = actPools[from].filter((cardId) => cardId !== id);
  if (!actPools[2].includes(id)) actPools[2].push(id);
  CATALOG_V09.cards[id].rewardAct = 3;
}
acts.forEach((act, index) => { act.newCardRewards = [...new Set(actPools[index])]; });

CATALOG_V09.shop.cardCostByEnergy[0] = 10;

// Burn boosters contribute once each turn instead of multiplying every burn card.
for (const relic of Object.values(CATALOG_V09.relics)) if (relic.trigger === 'burn_bonus') {
  relic.limit = 'turn';
  relic.description = `每轮首次主动施加灼烧时，额外施加${relic.value}层灼烧。`;
}

// The v0.9 content expects the engine to implement this once-per-turn trigger
// when a player successfully draws, sifts, or retains a hand card.
CATALOG_V09.relics.messenger_seal = {
  ...CATALOG_V09.relics.messenger_seal,
  trigger: 'hand_manage_prepare',
  value: 1,
  limit: 'turn',
  description: '每轮首次成功整理手牌（抽牌、择弃或保留）后，获得1点备势。',
};

CATALOG_V09.relics.medic_badge = {
  ...CATALOG_V09.relics.medic_badge, trigger:'heal_block', value:2, limit:'turn',
  description:'每轮首次主动恢复生命后，获得2点护盾；满生命治疗与道具不触发。',
};

export { DIFFICULTIES };
export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.9(?:$|[^0-9])/.test(version)) return CATALOG_V09;
  return getCatalogV08(version);
}
