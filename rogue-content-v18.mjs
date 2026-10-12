import { newEffectLine } from './rogue-card-text-v18.mjs';
import { CATALOG_V17 } from './rogue-content-v17.mjs';

export const CATALOG_V18 = structuredClone(CATALOG_V17);
CATALOG_V18.version = '0.18';
export const PROFESSIONS = CATALOG_V18.professions;
export const ITEMS = CATALOG_V18.items;
export const EVENTS = CATALOG_V18.events;

// Existing profession starter cards remain available only to their owner.
for (const [professionId, profession] of Object.entries(PROFESSIONS)) {
  for (const id of profession.starterDeck.slice(4)) CATALOG_V18.cards[id].professionOnly = professionId;
}

const cards = [
  ['trail_exchange','追迹换步','traveler',1,[{kind:'damage',value:4,bonus:{condition:'marked',value:2}},{kind:'draw',value:1,condition:'marked'}],[{kind:'damage',value:5,bonus:{condition:'marked',value:2}},{kind:'draw',value:1,condition:'marked'}],'造成4点伤害；目标每有追猎，额外造成2点伤害。目标有追猎时抽1张牌。'],
  ['trail_ambush','岔路设伏','traveler',1,[{kind:'bank_shield',value:3},{kind:'mark',value:2}],[{kind:'bank_shield',value:4},{kind:'mark',value:2}],'储存3点护盾，于下回合获得；施加2层追猎。'],
  ['gate_reserve','闭门蓄盾','warden',1,[{kind:'bank_shield',value:6},{kind:'block',value:2}],[{kind:'bank_shield',value:7},{kind:'block',value:2}],'储存6点护盾，于下回合获得；获得2点护盾。'],
  ['gate_wedge','断刃楔','warden',1,[{kind:'damage',value:3},{kind:'guard_next_hit',value:4}],[{kind:'damage',value:4},{kind:'guard_next_hit',value:4}],'造成3点伤害；本回合首次受到的攻击伤害减少4点。'],
  ['fire_cashout','收火兑杯','brewer',1,[{kind:'burn_cashout',value:4,mode:'block',multiplier:2}],[{kind:'burn_cashout',value:5,mode:'block',multiplier:2}],'消耗至多4层敌方灼烧，每层获得2点护盾。'],
  ['fire_seal','封坛留火','brewer',1,[{kind:'bank_burn',value:3},{kind:'block',value:3}],[{kind:'bank_burn',value:4},{kind:'block',value:3}],'消耗至多3层敌方灼烧，并令其下回合开始时受到等量灼烧；获得3点护盾。'],
  ['mail_return','退件重投','messenger',1,[{kind:'recover_card',filter:'cheap'},{kind:'mark',value:1}],[{kind:'recover_card',filter:'cheap'},{kind:'mark',value:2}],'从弃牌堆取回最近一张费用不高于1的其他牌；施加1层追猎。'],
  ['mail_redirect','急递改签','messenger',1,[{kind:'upgrade_target',value:1},{kind:'discount_target',value:1}],[{kind:'upgrade_target',value:1},{kind:'discount_target',value:2}],'本场战斗中强化一张目标牌，并使其本回合费用减少1；消耗。'],
  ['clock_borrow','隔拍借钟','smith',1,[{kind:'bank_shield',value:4},{kind:'echo_next',value:1}],[{kind:'bank_shield',value:5},{kind:'echo_next',value:1}],'储存4点护盾，于下回合获得；追加1次回声。'],
  ['clock_tune','回声校准','smith',0,[{kind:'tune_echo',value:1}],[{kind:'tune_echo',value:1},{kind:'block',value:2}],'强化队列中的第1次回声；消耗。'],
  ['medic_triage','战地分流','medic',1,[{kind:'triage',value:3,block:5}],[{kind:'triage',value:4,block:5}],'生命低于一半时恢复3点生命，否则获得5点护盾；消耗。'],
  ['medic_shield_suture','缝合拆盾','medic',1,[{kind:'shield_heal',value:4},{kind:'mark',value:1}],[{kind:'shield_heal',value:5},{kind:'mark',value:1}],'消耗至多4点自身护盾，每消耗2点恢复1点生命；施加1层追猎；消耗。'],
  ['pet_guard_swap','换位护主','tamer',1,[{kind:'pet_guard',value:3}],[{kind:'pet_guard',value:4}],'消耗至多3点宠物准备值，每点获得2点护盾。'],
  ['pet_recall_hunt','归巢蓄猎','tamer',1,[{kind:'recall_pet',value:3,draw:1}],[{kind:'recall_pet',value:4,draw:1}],'消耗至多3点准备值，按宠物生命值一半获得准备值并抽1张牌；摧毁宠物；消耗。'],
  ['forge_emergency','拆铆急挡','forger',1,[{kind:'forge_spend',value:3,multiplier:2},{kind:'draw',value:1,condition:'forge_spent'}],[{kind:'forge_spend',value:4,multiplier:2},{kind:'draw',value:1,condition:'forge_spent'}],'消耗至多3点锻造值，每点获得2点护盾；消耗至少2点锻造值时抽1张牌。'],
  ['forge_recast','退火重铸','forger',0,[{kind:'forge_reset',energy:2,block:3}],[{kind:'forge_reset',energy:2,block:4}],'重置锻造值；获得至多2点能量及3点护盾；消耗。'],
  ['shared_breath','手札换气',null,1,[{kind:'draw',value:2},{kind:'tempo',value:1}],[{kind:'draw',value:2},{kind:'tempo',value:1},{kind:'block',value:2}],'抽2张牌；本回合额外获得1次出牌次数；消耗。'],
  ['shared_sprint','借火冲刺',null,0,[{kind:'energy',value:1}],[{kind:'energy',value:1},{kind:'block',value:2}],'获得1点能量，并失去2点生命；消耗。'],
  ['shared_break','拆盾突围',null,1,[{kind:'shield_break',value:4},{kind:'damage',value:4}],[{kind:'shield_break',value:5},{kind:'damage',value:5}],'移除敌方至多4点护盾；造成4点伤害。'],
  ['shared_bank','以守待援',null,1,[{kind:'bank_shield',value:4},{kind:'draw',value:1}],[{kind:'bank_shield',value:5},{kind:'draw',value:1}],'储存4点护盾，于下回合获得；抽1张牌。'],
  ['shared_discount','借势贴签',null,0,[{kind:'discount_target',value:1}],[{kind:'discount_target',value:2}],'使一张目标牌本回合费用减少1；消耗。'],
  ['shared_recover','封口回收',null,1,[{kind:'recover_card',filter:'guard'},{kind:'prepare',value:1}],[{kind:'recover_card',filter:'guard'},{kind:'prepare',value:2}],'从弃牌堆取回最近一张有护盾效果的其他牌；获得1点准备值。'],
  ['shared_ultimatum','最后通牒',null,1,[{kind:'damage',value:4,bonus:{condition:'last_play',value:4}}],[{kind:'damage',value:5,bonus:{condition:'last_play',value:4}}],'造成4点伤害；本回合已达到出牌次数上限时，额外造成4点伤害。'],
  ['shared_fireline','流火引线',null,1,[{kind:'damage',value:3,bonus:{condition:'burning',value:3}},{kind:'burn',value:1}],[{kind:'damage',value:4,bonus:{condition:'burning',value:3}},{kind:'burn',value:1}],'造成3点伤害；目标有至少4层灼烧时额外造成3点伤害；施加1层灼烧。'],
  ['shared_mirror','镜面反手',null,1,[{kind:'guard_next_hit',value:3},{kind:'counter',value:2}],[{kind:'guard_next_hit',value:4},{kind:'counter',value:2}],'本回合首次受到的攻击伤害减少3点；获得2点反击。'],
  ['shared_ash_aid','灰烬急救',null,1,[{kind:'cleanse_guard',value:3},{kind:'draw',value:1}],[{kind:'cleanse_guard',value:4},{kind:'draw',value:1}],'移除自身至多3层灼烧，每层获得2点护盾；抽1张牌；消耗。'],
  ['shared_recall','撤回照应',null,1,[{kind:'recall_cover',block:4,draw:2}],[{kind:'recall_cover',block:5,draw:2}],'摧毁宠物，获得等同宠物生命值且不超过4点的护盾，并抽2张牌；消耗。'],
  ['shared_wrench','火线扳手',null,1,[{kind:'forge',value:1},{kind:'shield_break',value:3},{kind:'block',value:2}],[{kind:'forge',value:2},{kind:'shield_break',value:4},{kind:'block',value:3}],'获得1点锻造值；移除敌方至多3点护盾；获得2点护盾。'],
];

for (const [id, name, professionOnly, cost, effects, upgradeEffects, description] of cards) {
  const rewardAct = id === 'shared_sprint' || id === 'clock_tune' || id === 'forge_recast' ? 2 : 1;
  CATALOG_V18.cards[id] = {
    name, cost, selfCost: id === 'shared_sprint' ? 2 : 0,
    exhaust: ['mail_redirect','clock_tune','medic_triage','medic_shield_suture','pet_recall_hunt','forge_recast','shared_breath','shared_sprint','shared_discount','shared_ash_aid','shared_recall'].includes(id),
    replayable: ['shared_break','shared_ultimatum','shared_fireline'].includes(id),
    effects: structuredClone(effects),
    upgrade: { cost, selfCost: id === 'shared_sprint' ? 2 : 0, effects: structuredClone(upgradeEffects) },
    tags: professionOnly ? [professionOnly] : ['通用'], rewardAct, description,
    ...(professionOnly ? { professionOnly } : {}),
  };
}

for (const profession of Object.values(PROFESSIONS)) {
  for (const id of profession.starterDeck.slice(4)) {
    if (!CATALOG_V18.acts[CATALOG_V18.cards[id].rewardAct-1].newCardRewards.includes(id)) CATALOG_V18.acts[CATALOG_V18.cards[id].rewardAct-1].newCardRewards.push(id);
  }
}
for (const [id, card] of Object.entries(CATALOG_V18.cards)) {
  if (Object.hasOwn(CATALOG_V17.cards, id)) continue;
  const act = CATALOG_V18.acts[card.rewardAct - 1];
  if (!act.newCardRewards.includes(id)) act.newCardRewards.push(id);
}
export { DIFFICULTIES } from './rogue-content-v17.mjs';

for (const [id, card] of Object.entries(CATALOG_V18.cards)) {
 if (Object.hasOwn(CATALOG_V17.cards,id)) continue;
 const line=e=>newEffectLine(e)??({damage:`伤害${e.value}`,block:`护盾${e.value}`,draw:`抽${e.value}张（手牌上限5）`,mark:`标记${e.value}`,prepare:`备势${e.value}`,burn:`灼烧${e.value}`,forge:`锻值+${e.value}`,counter:`挡伤后反击${e.value}`,echo_next:`回声蓄能${e.value}`}[e.kind]??e.kind);
 card.tags=[card.professionOnly?PROFESSIONS[card.professionOnly].name:'通用'];
 card.description=card.effects.map(line).join('；')+(card.exhaust?'；本战消耗。':'。');
 card.upgrade.description=card.upgrade.effects.map(line).join('；')+(card.exhaust?'；本战消耗。':'。');
}

CATALOG_V18.cardRewards = [...new Set(CATALOG_V18.acts.flatMap(act=>act.newCardRewards))];
