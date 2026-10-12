import { CATALOG_V15, getCatalog as getCatalogV15 } from './rogue-content-v15.mjs';
import { CATALOG_V16 } from './rogue-content-v16.mjs';
import { CATALOG_V17 } from './rogue-content-v17.mjs';

export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.17(?:$|[^0-9])/.test(version)) return CATALOG_V17;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.16(?:$|[^0-9])/.test(version)) return CATALOG_V16;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.15(?:$|[^0-9])/.test(version)) return CATALOG_V15;
  return getCatalogV15(version);
}
