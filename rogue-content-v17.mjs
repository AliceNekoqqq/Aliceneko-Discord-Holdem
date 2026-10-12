import { CATALOG_V16 } from './rogue-content-v16.mjs';
import { DIFFICULTIES } from './rogue-difficulty-v17.mjs';

export const CATALOG_V17 = structuredClone(CATALOG_V16);
CATALOG_V17.version = '0.17';
CATALOG_V17.player.turnLimit = null;
export const PROFESSIONS = CATALOG_V17.professions;
export const ITEMS = CATALOG_V17.items;
export const EVENTS = CATALOG_V17.events;

// Each burn relic has a finite combat budget; stacking stays possible,
// but no longer supplies extra burn on every turn of a long fight.
for (const id of ['burn_bonus','a2_prism_ember','a3_cinder_toll','shelter_ember','cinder_scoop']) {
  const relic = CATALOG_V17.relics[id];
  relic.value = 1;
  relic.limit = 'turn';
  relic.maxTriggersPerBattle = 3;
  relic.description = relic.trigger === 'burn_bonus'
    ? '每轮首次主动施加灼烧时，额外施加1层灼烧；每战至多触发3次。'
    : '每轮首次用护盾挡住敌方攻击后，对敌人施加1层灼烧；每战至多触发3次。';
}
// Healing cards remain one-use per fight; reduce both faces equally to keep
// upgrades useful. Camp recovery remains the reliable large heal.
for (const [id, card] of Object.entries(CATALOG_V17.cards)) {
  if (['field_wrap','warding_vial'].includes(id)) continue;
  for (const face of [card, card.upgrade].filter(Boolean)) {
    for (const effect of face.effects ?? []) if (effect.kind === 'heal') effect.value = Math.max(1, effect.value - 1);
  }
}
for (const card of Object.values(CATALOG_V17.cards)) {
  const heal = card.effects.find(e => e.kind === 'heal');
  if (heal && card.description) card.description = card.description.replace(/(恢复|治疗)(\d+)(点生命|点|生命)?/g, (_, verb, n, unit = '') => verb + heal.value + unit);
}
export { DIFFICULTIES };
