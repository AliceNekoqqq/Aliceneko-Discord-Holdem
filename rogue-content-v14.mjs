import { CATALOG_V13, EVENTS as EVENTS_V13, DIFFICULTIES, getCatalog as getCatalogV13 } from './rogue-content-v13.mjs';

const clone = (value) => structuredClone(value);
export const CATALOG_V14 = clone(CATALOG_V13);
CATALOG_V14.version = '0.14';
export const PROFESSIONS = CATALOG_V14.professions;
export const ITEMS = CATALOG_V14.items;
// Each rules version owns a private catalog object and event pool.
export const EVENTS = clone(EVENTS_V13);
CATALOG_V14.events = EVENTS;

const sergeant = CATALOG_V14.enemies.cracked_sergeant;
for (const pool of [sergeant.intents, sergeant.phaseIntents]) for (let n=0;n<pool.length;n++) {
  const intent=pool[n];
  if(intent.kind==='charge') {
    intent.armor=-3;
    intent.chargeBreak={threshold:8,reduction:4};
    intent.next=clone(pool[(n+1)%pool.length]);
  }
}
const chain=CATALOG_V14.enemies.chain_duelist;
chain.intents[0]={kind:'conditional',onAttack:{kind:'attack',value:4,hits:3,label:'镜链三连：4×3'},onOther:{kind:'attack',value:7,label:'抽链'},label:'首牌分支'};
chain.phaseIntents[0]={kind:'conditional',onAttack:{kind:'attack',value:5,hits:3,label:'镜链三旋：5×3'},onOther:{kind:'attack',value:9,label:'攻击'},label:'首牌分支'};

export { DIFFICULTIES };
export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.14(?:$|[^0-9])/.test(version)) return CATALOG_V14;
  return getCatalogV13(version);
}
