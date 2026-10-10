export const MAX_DIFFICULTY=10;
export const DIFFICULTIES=Object.freeze([
 {level:0,name:'初灯',description:'标准规则，熟悉职业与路线。'},
 {level:1,name:'长夜Ⅰ',description:'普通敌人生命增加8%。'},
 {level:2,name:'长夜Ⅱ',description:'继承前级；精英生命增加12%。'},
 {level:3,name:'长夜Ⅲ',description:'继承前级；敌人每段攻击增加1。'},
 {level:4,name:'长夜Ⅳ',description:'继承前级；营地基础治疗从9降至7。'},
 {level:5,name:'长夜Ⅴ',description:'继承前级；商店商品与服务加价2余烬。'},
 {level:6,name:'长夜Ⅵ',description:'继承前级；初始与最大生命降至28。'},
 {level:7,name:'长夜Ⅶ',description:'继承前级；精英开场获得护盾4。'},
 {level:8,name:'长夜Ⅷ',description:'继承前级；Boss生命增加25%，二阶段攻击再增加1，转阶段架盾5。'},
 {level:9,name:'长夜Ⅸ',description:'继承前级；起手牌组额外加入一张可消耗的旧伤。'},
 {level:10,name:'长夜Ⅹ',description:'继承前级；所有敌人生命再增加40%，每段攻击再增加3，Boss生命65%时提前转阶段。'},
]);
export function getDifficultyRules(level=0){
 if(!Number.isInteger(level)||level<0||level>MAX_DIFFICULTY)throw new RangeError('进阶难度必须为0至10的整数');
 return {level,allHpMultiplier:level>=10?1.4:1,bossHpMultiplier:level>=8?1.25:1,normalHpMultiplier:level>=1?1.08:1,eliteHpMultiplier:level>=2?1.12:1,attackBonus:(level>=3?1:0)+(level>=10?3:0),campHealAmount:level>=4?7:9,shopSurcharge:level>=5?2:0,maxHp:level>=6?28:30,eliteOpeningShield:level>=7?4:0,bossPhaseAttackBonus:level>=8?1:0,phaseShield:level>=8?5:3,bossPhaseThreshold:level>=10?.65:.5,starterWound:level>=9};
}
