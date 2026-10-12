import { CATALOG_V19 } from './rogue-content-v19.mjs';
export const CATALOG_V20=structuredClone(CATALOG_V19);
CATALOG_V20.version='0.20';
// Offensive guard turns retain each enemy's shield identity.
for(const [id,value] of [['ash_guard',3],['empty_bottle',2],['a2_mirror_moth',3],['rivet_carrier',3],['a3_bell_warden',3],['rusted_scribe',2]]){
 const enemy=CATALOG_V20.enemies[id];
 const index=enemy.intents.findIndex(i=>i.kind==='guard'),old=enemy.intents[index];
 enemy.intents[index]={kind:'attack',value,shieldAfter:old.value,label:'攻击后架盾'};
}
for(const enemy of Object.values(CATALOG_V20.enemies))if(['Boss','精英'].includes(enemy.role))enemy.pressure={startTurn:7,step:4,max:enemy.role==='Boss'?2:1};
const iron=CATALOG_V20.cards.hot_iron;
for(const face of [iron,iron.upgrade]){
 const attack=face.effects.find(e=>e.kind==='weapon_attack'),forge=face.effects.find(e=>e.kind==='forge');
 attack.forgePierceThreshold=4;face.effects=[forge,attack];
 face.description=`先获得${forge.value}锻值，再造成${attack.value}+当前锻值的武器伤害；当前锻值至少4时无视护甲。`;
}
const mail=CATALOG_V20.cards.mail_return;
for(const face of [mail,mail.upgrade]){
 face.effects.find(e=>e.kind==='recover_card').discount=1;
 face.description=`回收最近一张不高于1费的其他弃牌，并使其本轮费用降低1（最低0）；施加${face.effects.find(e=>e.kind==='mark').value}层标记。`;
}
const badge=CATALOG_V20.relics.medic_badge;
badge.prepare=1;badge.description='每轮首次主动实际恢复生命后，获得2点护盾与1点备势；满生命治疗与道具不触发。';
export const PROFESSIONS=CATALOG_V20.professions;
export const ITEMS=CATALOG_V20.items;
export const EVENTS=CATALOG_V20.events;
export { DIFFICULTIES } from './rogue-content-v17.mjs';
