import { CATALOG_V21 } from './rogue-content-v21.mjs';
export const CATALOG_V22=structuredClone(CATALOG_V21);
CATALOG_V22.version='0.22';
const A=(value,hits=1,extra={})=>({kind:'attack',value,hits,label:'攻击',...extra});
const rest=armor=>({kind:'guard',value:0,armor:-armor,clearShield:true,phaseRest:true,label:'整理：不攻击，护甲归零'});
const furnaceCycle=(open,shield,strong,weak,hits,armor)=>[
 A(open,1,{shieldAfter:shield,opensFurnace:true,label:'合壳'}),
 {kind:'charge',value:strong,hits,furnaceCharge:true,next:A(strong,hits),label:'蓄锤：炉盾未破则重击'},
 A(strong,hits,{furnaceStrike:true,weakValue:weak,label:'炉锤'}),
 {...rest(armor),label:'散热：不攻击，护甲与盾归零'},
];
const record=(value,mode,responses)=>({...A(value),recordMode:mode,responses,label:mode==='first'?'记录首牌':'记录最终张数'});
Object.assign(CATALOG_V22.enemies,{
 a2_mirror_pursuer:{name:'镜面追击者',role:'精英',hp:48,armor:1,phaseAtCycleEnd:true,
  intents:[{kind:'tempo',playThreshold:2,onCalm:A(7),onRush:A(4,3),label:'追击节奏'},rest(1),A(8)],
  phaseIntents:[{kind:'tempo',playThreshold:2,onCalm:A(10),onRush:A(5,3),label:'追击节奏'},rest(1),A(9)]},
 a2_furnace_guard:{name:'铸炉卫士',role:'精英',hp:46,armor:2,phaseAtCycleEnd:true,
  intents:furnaceCycle(6,8,12,7,1,2),phaseIntents:furnaceCycle(7,10,14,9,1,2)},
 a3_reverse_hunter:{name:'逆拍猎手',role:'精英',hp:56,armor:1,phaseAtCycleEnd:true,
  intents:[A(3,3),{kind:'charge',value:18,armor:-1,chargeBreak:{threshold:10,reduction:6},next:A(18),label:'重击蓄力'},A(18),rest(1)],
  phaseIntents:[A(4,3),{kind:'charge',value:20,armor:-1,chargeBreak:{threshold:12,reduction:6},next:A(20),label:'重击蓄力'},A(20),rest(1)]},
 a2_mirror_adjudicator:{name:'镜厅裁决者',role:'Boss',hp:64,armor:1,phaseAtCycleEnd:true,
  intents:[record(5,'first',{attack:A(6,1,{startShield:8,label:'封镜反制'}),other:A(5,2,{label:'双刺反制'})}),{kind:'respond',label:'执行反制'},rest(1)],
  phaseIntents:[record(6,'count',{few:A(14,1,{label:'单段裁决'}),many:A(5,3,{label:'三段裁决'})}),{kind:'respond',label:'执行反制'},rest(1)]},
 a3_molten_colossus:{name:'熔钟巨像',role:'Boss',hp:80,armor:2,phaseAtCycleEnd:true,
  intents:furnaceCycle(6,10,9,6,2,2),phaseIntents:furnaceCycle(8,12,11,7,2,2)},
});
CATALOG_V22.acts[1].elitePool.push('a2_mirror_pursuer','a2_furnace_guard');
CATALOG_V22.acts[2].elitePool.push('a3_reverse_hunter');
CATALOG_V22.acts[1].bossPool.push('a2_mirror_adjudicator');
CATALOG_V22.acts[2].bossPool.push('a3_molten_colossus');
for(const act of CATALOG_V22.acts)for(const id of [...act.normalPool,...act.elitePool,...act.bossPool]){
 const e=CATALOG_V22.enemies[id];e.actIndex=act.index;
 e.actAttackBudget=({普通:[0,1,2],精英:[0,2,3],Boss:[1,2,4]}[e.role])[act.index-1];
 if(!e.pressure&&e.role!=='普通')e.pressure={startTurn:7,step:4,max:e.role==='Boss'?2:1};
}
export const PROFESSIONS=CATALOG_V22.professions;
export const ITEMS=CATALOG_V22.items;
export const EVENTS=CATALOG_V22.events;
export { DIFFICULTIES } from './rogue-content-v17.mjs';
