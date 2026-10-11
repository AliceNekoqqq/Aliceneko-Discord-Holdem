import { CATALOG_V10, PROFESSIONS as PROFESSIONS_V10, ITEMS as ITEMS_V10, EVENTS as EVENTS_V10, DIFFICULTIES, getCatalog as getCatalogV10 } from './rogue-content-v10.mjs';

const clone = (value) => structuredClone(value);
export const PROFESSIONS = clone(PROFESSIONS_V10);
export const ITEMS = clone(ITEMS_V10);
export const EVENTS = clone(EVENTS_V10);
export const CATALOG_V11 = clone(CATALOG_V10);
CATALOG_V11.version = '0.11';
CATALOG_V11.professions = PROFESSIONS;
CATALOG_V11.items = ITEMS;

export { DIFFICULTIES };
export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.11(?:$|[^0-9])/.test(version)) return CATALOG_V11;
  return getCatalogV10(version);
}
