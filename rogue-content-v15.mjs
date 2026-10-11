import { CATALOG_V14, EVENTS as EVENTS_V14, DIFFICULTIES, getCatalog as getCatalogV14 } from './rogue-content-v14.mjs';

const clone = value => structuredClone(value);
export const CATALOG_V15 = clone(CATALOG_V14);
CATALOG_V15.version = '0.15';
export const PROFESSIONS = CATALOG_V15.professions;
export const ITEMS = CATALOG_V15.items;
export const EVENTS = clone(EVENTS_V14);
CATALOG_V15.events = EVENTS;

for (const enemy of Object.values(CATALOG_V15.enemies).filter(e => e.role === 'Boss')) {
  for (const pool of [enemy.intents, enemy.phaseIntents].filter(Boolean)) {
    for (let n = 0; n < pool.length; n++) {
      if (pool[n].kind === 'charge') pool[n].next = clone(pool[(n + 1) % pool.length]);
    }
  }
}
for (const pool of [CATALOG_V15.enemies.dark_lantern.intents, CATALOG_V15.enemies.dark_lantern.phaseIntents]) {
  for (const intent of pool) if (intent.kind === 'charge') intent.chargeBreak = { threshold: 8, reduction: 4 };
}
for (const intent of CATALOG_V15.enemies.a3_unlit_bellmaster.phaseIntents) {
  if (intent.kind === 'charge') intent.chargeBreak = { threshold: 12, reduction: 2 };
}

const regent = CATALOG_V15.enemies.a2_mirror_regent;
const phase = regent.phaseIntents;
const tempo = { kind: 'tempo', playThreshold: 2,
  onCalm: { kind: 'guard', value: 8, label: '架盾' },
  onRush: { kind: 'attack', value: 4, hits: 2, label: '攻击' }, label: '节奏检验' };
regent.phaseIntents = [tempo, ...phase.slice(0, -1)];

export { DIFFICULTIES };
export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.15(?:$|[^0-9])/.test(version)) return CATALOG_V15;
  return getCatalogV14(version);
}
