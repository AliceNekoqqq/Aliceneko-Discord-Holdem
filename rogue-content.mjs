import { CATALOG_V22 } from './rogue-content-v22.mjs';
import { CATALOG_V21 } from './rogue-content-v21.mjs';
import { CATALOG_V20 } from './rogue-content-v20.mjs';
import { CATALOG_V19 } from './rogue-content-v19.mjs';
import { CATALOG_V15, getCatalog as getCatalogV15 } from './rogue-content-v15.mjs';
import { CATALOG_V16 } from './rogue-content-v16.mjs';
import { CATALOG_V17 } from './rogue-content-v17.mjs';
import { CATALOG_V18 } from './rogue-content-v18.mjs';

export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.22(?:$|[^0-9])/.test(version)) return CATALOG_V22;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.21(?:$|[^0-9])/.test(version)) return CATALOG_V21;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.20(?:$|[^0-9])/.test(version)) return CATALOG_V20;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.19(?:$|[^0-9])/.test(version)) return CATALOG_V19;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.18(?:$|[^0-9])/.test(version)) return CATALOG_V18;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.17(?:$|[^0-9])/.test(version)) return CATALOG_V17;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.16(?:$|[^0-9])/.test(version)) return CATALOG_V16;
  if (typeof version === 'string' && /(?:^|[^0-9])0\.15(?:$|[^0-9])/.test(version)) return CATALOG_V15;
  return getCatalogV15(version);
}
