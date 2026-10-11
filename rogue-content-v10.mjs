import { CATALOG_V09, PROFESSIONS as PROFESSIONS_V09, ITEMS as ITEMS_V09, EVENTS as EVENTS_V09, DIFFICULTIES, getCatalog as getCatalogV09 } from './rogue-content-v09.mjs';

const clone = (value) => structuredClone(value);

// v0.10 starts from a private deep clone so no catalog object from v0.9 can
// be changed by v0.10 reward-pool adjustments.
export const PROFESSIONS = clone(PROFESSIONS_V09);
export const ITEMS = clone(ITEMS_V09);
export const EVENTS = clone(EVENTS_V09);
export const CATALOG_V10 = clone(CATALOG_V09);
CATALOG_V10.version = '0.10';
CATALOG_V10.professions = PROFESSIONS;
CATALOG_V10.items = ITEMS;

// Put the existing messenger retain tool and medic cleanse response earlier.
// Their effects and numbers stay intact; this only changes when the rewards
// enter the eligible pool.
for (const id of ['quiet_hour', 'clean_cut']) {
  for (const act of CATALOG_V10.acts) act.newCardRewards = act.newCardRewards.filter((cardId) => cardId !== id);
  CATALOG_V10.acts[0].newCardRewards.push(id);
  CATALOG_V10.cards[id].rewardAct = 1;
}

export { DIFFICULTIES };
export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.10(?:$|[^0-9])/.test(version)) return CATALOG_V10;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.9(?:$|[^0-9])/.test(version)) return CATALOG_V09;
  return getCatalogV09(version);
}
