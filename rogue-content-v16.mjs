import { CATALOG_V15, DIFFICULTIES } from './rogue-content-v15.mjs';

const clone = value => structuredClone(value);
export const CATALOG_V16 = clone(CATALOG_V15);
CATALOG_V16.version = '0.16';
export const PROFESSIONS = CATALOG_V16.professions;
export const ITEMS = CATALOG_V16.items;
export const EVENTS = CATALOG_V16.events;

// Bring one-energy attacks and defenses closer together. Damage cards at 3–4
// gain two points, those at 5 gain one; already-strong 6+ damage is untouched.
// Reduce base defense outliers to a 5–6 point ceiling; upgrades keep their
// original improvement over the base card.
function damageGain(value) { return value <= 4 ? 2 : value === 5 ? 1 : 0; }
function blockReduction(value) { return value >= 9 ? 3 : value >= 7 ? 2 : value >= 6 ? 1 : 0; }
for (const card of Object.values(CATALOG_V16.cards)) {
  if (card.cost !== 1) continue;
  const counts = new Map();
  for (const effect of card.effects ?? []) {
    const ordinal = counts.get(effect.kind) ?? 0;
    counts.set(effect.kind, ordinal + 1);
    const upgradeEffect = (card.upgrade?.effects ?? []).filter(candidate => candidate.kind === effect.kind)[ordinal];
    if (effect.kind === 'damage') {
      const gain = damageGain(effect.value);
      effect.value += gain;
      if (upgradeEffect) upgradeEffect.value += gain;
    } else if (effect.kind === 'block') {
      const reduction = blockReduction(effect.value);
      effect.value = Math.max(0, effect.value - reduction);
      if (upgradeEffect) upgradeEffect.value = Math.max(0, upgradeEffect.value - reduction);
    }
  }
}

export { DIFFICULTIES };
