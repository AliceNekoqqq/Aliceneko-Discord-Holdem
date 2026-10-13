import { CATALOG_V20 } from './rogue-content-v20.mjs';
export const CATALOG_V21=structuredClone(CATALOG_V20);
CATALOG_V21.version='0.21';
const changed={
 riposte_stance:{replayable:false,effects:[{kind:'block',value:3},{kind:'counter',value:3}],upgradeEffects:[{kind:'block',value:4},{kind:'counter',value:4}],description:'护盾3；本轮首次用护盾挡伤后反击3。',upgradeDescription:'护盾4；本轮首次用护盾挡伤后反击4。'},
 measured_thrust:{effects:[{kind:'damage',value:4,ignoreArmor:true,bonus:{condition:'prepared',value:3}}],upgradeEffects:[{kind:'damage',value:5,ignoreArmor:true,bonus:{condition:'prepared',value:4}}],description:'穿甲伤害4；打出前备势至少2时额外伤害3；首段仍消耗备势与标记。',upgradeDescription:'穿甲伤害5；打出前备势至少2时额外伤害4；首段仍消耗备势与标记。'},
 ash_wall:{replayable:false,effects:[{kind:'block',value:3},{kind:'cleanse_guard',value:2}],upgradeEffects:[{kind:'block',value:4},{kind:'cleanse_guard',value:3}],description:'护盾3；清除自身灼烧至多2，每层再获得2盾。',upgradeDescription:'护盾4；清除自身灼烧至多3，每层再获得2盾。'},
 bellwatch:{effects:[{kind:'block',value:3},{kind:'retain',value:1},{kind:'discount_retained',value:1}],upgradeEffects:[{kind:'block',value:4},{kind:'retain',value:1},{kind:'discount_retained',value:1}],description:'护盾3；可保留另一张手牌，下轮该实体减1费（最低0，不叠加）；下轮结束到期。',upgradeDescription:'护盾4；可保留另一张手牌，下轮该实体减1费（最低0，不叠加）；下轮结束到期。'},
 cask_guard:{replayable:false,effects:[{kind:'block',value:2},{kind:'burn_cashout',value:2,multiplier:2}],upgradeEffects:[{kind:'block',value:3},{kind:'burn_cashout',value:3,multiplier:2}],description:'护盾2；消耗敌人灼烧至多2，每层再获得2盾。',upgradeDescription:'护盾3；消耗敌人灼烧至多3，每层再获得2盾。'},
 gatebreak:{replayable:false,effects:[{kind:'damage_from_shield',value:2,maxSpend:4,multiplier:2}],upgradeEffects:[{kind:'damage_from_shield',value:3,maxSpend:5,multiplier:2}],description:'消耗当前护盾至多4，造成2+消耗护盾×2的伤害；仍受护甲与屏障减免。',upgradeDescription:'消耗当前护盾至多5，造成3+消耗护盾×2的伤害；仍受护甲与屏障减免。'},
};
for(const [id,{upgradeEffects,upgradeDescription,...update}] of Object.entries(changed)){
 Object.assign(CATALOG_V21.cards[id],update);
 Object.assign(CATALOG_V21.cards[id].upgrade,{effects:upgradeEffects,description:upgradeDescription});
}
CATALOG_V21.cards.folded_note.description='护盾5；可保留另一张手牌到下轮，下轮手牌总数仍不超过5。';
CATALOG_V21.cards.folded_note.upgrade.description='护盾7；可保留另一张手牌到下轮，下轮手牌总数仍不超过5。';
export const PROFESSIONS=CATALOG_V21.professions;
export const ITEMS=CATALOG_V21.items;
export const EVENTS=CATALOG_V21.events;
export { DIFFICULTIES } from './rogue-content-v17.mjs';
