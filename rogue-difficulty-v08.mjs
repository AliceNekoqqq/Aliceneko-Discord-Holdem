export const MAX_DIFFICULTY=10;
const HP=[1,1,1.04,1.08,1.12,1.16,1.20,1.24,1.28,1.34,1.40];
export function getDifficultyRules(level=0){
 if(!Number.isInteger(level)||level<0||level>MAX_DIFFICULTY)throw new RangeError('进阶难度必须为0至10的整数');
 return {level,allHpMultiplier:HP[level],bossHpMultiplier:1+Math.min(5,Math.max(0,level-3))*.05,normalHpMultiplier:level>=1?1.08:1,eliteHpMultiplier:level>=2?1.12:1,attackBonus:[0,0,0,1,1,1,2,2,2,3,4][level],campHealAmount:level>=4?7:9,shopSurcharge:level>=5?2:0,maxHp:level>=6?28:30,eliteOpeningShield:level>=7?4:0,bossPhaseAttackBonus:level>=8?1:0,phaseShield:level>=8?5:3,bossPhaseThreshold:level>=10?.65:.5,starterWound:level>=9};
}
const additions=['标准规则。','普通敌人生命额外增加8%。','精英生命额外增加12%。','敌人每段攻击额外增加1。','营地基础治疗降至7；Boss生命逐级提高。','商店商品与服务加价2余烬。','初始/最大生命降至28；敌人攻击累计增加2。','精英开场护盾4。','Boss生命累计额外增加25%；二阶段攻击再增加1、阶段盾5。','起手增加1张消耗旧伤；敌人攻击累计增加3。','敌人攻击累计增加4；Boss生命65%时提前转阶段。'];
export const DIFFICULTIES=Object.freeze(additions.map((description,level)=>({level,name:level===0?'初灯':`长夜${level}`,description:`${level?'继承前级；':''}${description}${level>=2?`全敌人生命系数累计${Math.round((HP[level]-1)*100)}%。`:''}`})));
