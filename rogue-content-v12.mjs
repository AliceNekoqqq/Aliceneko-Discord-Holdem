import { CATALOG_V11, PROFESSIONS as PROFESSIONS_V11, ITEMS as ITEMS_V11, EVENTS as EVENTS_V11, DIFFICULTIES, getCatalog as getCatalogV11 } from './rogue-content-v11.mjs';

const clone = (value) => structuredClone(value);
export const PROFESSIONS = clone(PROFESSIONS_V11);
export const ITEMS = clone(ITEMS_V11);
export const CATALOG_V12 = clone(CATALOG_V11);
CATALOG_V12.version = '0.12';
CATALOG_V12.professions = PROFESSIONS;
CATALOG_V12.items = ITEMS;
// Events are catalog-owned so each ruleset sees an isolated event pool.
export const EVENTS = clone(CATALOG_V12.events ?? EVENTS_V11);
CATALOG_V12.events = EVENTS;
// Exact scope of existing contracts; no narrative or numerical changes.
const contractText = {
  cinder_loan: ['获得12余烬；之后2场战斗，每段敌方攻击伤害+1。未完成的场数跨幕保留。', '获得12余烬；之后2场战斗每段敌方攻击伤害+1，第二场结束后偿清。'],
  sealed_relic: ['失去4生命并获得一件未拥有遗物；之后所有营地基础治疗减少2，持续至本局结束。', '生命-4；获得本次遗物；之后所有营地基础治疗-2，持续至本局结束，累计最多-4。'],
  boss_bargain: ['支付12余烬，让本幕首领生命降低15%；击败本幕首领后效果结束。', '余烬-12；仅本幕首领生命-15%，不影响后续幕。'],
};
for (const event of EVENTS) {
  const text = contractText[event.eventId];
  if (text) { event.description = text[0]; event.consequenceText = text[1]; }
}

export { DIFFICULTIES };
export function getCatalog(version) {
  if (typeof version === 'string' && /(?:^|[^0-9])0\.12(?:$|[^0-9])/.test(version)) return CATALOG_V12;
  return getCatalogV11(version);
}
