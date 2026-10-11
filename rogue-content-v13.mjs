import { CATALOG_V12, PROFESSIONS as PROFESSIONS_V12, ITEMS as ITEMS_V12, EVENTS as EVENTS_V12, DIFFICULTIES, getCatalog as getCatalogV12 } from './rogue-content-v12.mjs';

const clone = (value) => structuredClone(value);
export const PROFESSIONS = clone(PROFESSIONS_V12);
export const ITEMS = clone(ITEMS_V12);
export const CATALOG_V13 = clone(CATALOG_V12);
CATALOG_V13.version = '0.13';
CATALOG_V13.professions = PROFESSIONS;
CATALOG_V13.items = ITEMS;
// Events are catalog-owned so each ruleset sees an isolated event pool.
export const EVENTS = clone(CATALOG_V13.events ?? EVENTS_V12);
CATALOG_V13.events = EVENTS;
// Charge breaks are public, numeric rules attached only to these three
// ordinary enemies. Keep their announced next intent aligned with the cycle.
for (const [id, threshold, reduction] of [['patrol_apprentice',6,3],['a2_seam_duelist',8,2],['a3_dust_mender',10,2]]) {
  const enemy = CATALOG_V13.enemies[id];
  if(id==='patrol_apprentice') {
    const cycle=enemy.intents;
    enemy.intents=[cycle.find(i=>i.kind==='charge'),cycle.find(i=>i.kind==='attack'&&i.value===7),cycle.find(i=>i.kind==='guard'&&i.value===3),cycle.find(i=>i.kind==='attack'&&i.value===3),cycle.find(i=>i.kind==='attack'&&i.value===5)];
  }
  for (let n=0;n<enemy.intents.length;n++) {
    const intent=enemy.intents[n];
    if(intent.kind==='charge') {
      const next=enemy.intents[(n+1)%enemy.intents.length];
      intent.next={kind:'attack',value:next.value,hits:next.hits??1,...(next.label?{label:next.label}:{})};
      intent.chargeBreak={threshold,reduction};
    }
  }
}
const dancer=CATALOG_V13.enemies.mirror_dancer;
dancer.intents[dancer.intents.length-1]={kind:'conditional',onAttack:{kind:'attack',value:4,label:'粉刃'},onOther:{kind:'guard',value:5,label:'镜幕'},label:'镜幕'};
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
  if (typeof version === 'string' && /(?:^|[^0-9])0\.13(?:$|[^0-9])/.test(version)) return CATALOG_V13;
  return getCatalogV12(version);
}
