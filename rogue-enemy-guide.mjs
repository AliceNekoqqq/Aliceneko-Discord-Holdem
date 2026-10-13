// Factual decision cues shared by text and raster views.
export function enemyApproach(enemy) {
  if (!enemy) return '';
  const intents = [...(enemy.intents ?? []),...(enemy.role==='Boss' ? enemy.phaseIntents ?? [] : [])].flatMap(i=>i.kind==='conditional'?[i,i.onAttack,i.onOther]:[i]), cues = [];
  if(intents.some(i=>i.furnaceCharge))cues.push('破炉盾削重锤，散热可爆发');
  if(intents.some(i=>i.recordMode))cues.push('本轮记录决定下轮反制');
  if(enemy.phaseAtCycleEnd)cues.push('半血后完成当前循环再换阶段');
  if(enemy.pressure)cues.push('长战斗有上限增压');
  if(intents.some(i=>i.shieldAfter))cues.push('攻击后架盾');
  if (intents.some(i=>i.kind==='tempo'))cues.push('第三张牌改变应对');
  if (intents.some(i => i.armor < 0)) cues.push('蓄力时护甲降低');
  if (intents.some(i => i.chargeBreak)) cues.push('蓄力可破势');
  else if (intents.some(i => i.kind === 'charge')) cues.push('蓄力后重击');
  if (intents.some(i => i.kind === 'conditional')) cues.push('首牌决定分支');
  if (intents.some(i => (i.hits ?? 1) > 1)) cues.push('多段攻击');
  if (enemy.armor > 0) cues.push(`${intents.some(i=>i.armor<0)?'基础':'常驻'}护甲${enemy.armor}`);
  if (intents.some(i => i.kind === 'burn')) cues.push('施加灼烧');
  if (intents.some(i => i.kind === 'cleanse')) cues.push('清除自身灼烧');
  if (!cues.length && intents.some(i => i.kind === 'guard')) cues.push('攻击与架盾交替');
  return cues.slice(0, 3).join(' · ');
}

export function enemyDecisionCue(b) {
  const i = b?.intent;
  if (!i) return '';
  if(i.recordMode)return `当前预判下轮${compactIntent(b.responsePreview)}；本轮结束按${i.recordMode==='first'?'首牌类型':'最终张数'}锁定`;
  if(i.kind==='tempo')return `本轮已出${b.plays??0}张，当前${((b.plays??0)<=i.playThreshold?i.onCalm:i.onRush).kind==='guard'?'架盾分支':compactIntent((b.plays??0)<=i.playThreshold?i.onCalm:i.onRush)}；第三张前再确认意图，结束回合按最终张数结算`;
  if(i.furnaceCharge)return `本轮蓄力不攻击；炉盾剩余${b.enemyShield}，${b.furnaceBroken?'已破盾，下轮削弱':'本轮击破可削弱下一击'}；下轮${compactIntent(i.next)}`;
  if (i.kind === 'charge' && i.next?.kind && i.next.kind !== 'attack') return `换阶段覆盖重击：下轮${i.next.kind === 'guard' ? `架盾${i.next.value}` : '按新阶段意图行动'}${i.chargeBreak ? '，本次破势不顺延' : ''}`;
  if (i.kind === 'charge' && i.chargeBreak) {
    const { threshold, reduction } = i.chargeBreak;
    const damage = Math.max(0, b.chargeDamage ?? 0);
    return `${i.armor < 0 ? `破绽：本轮护甲${b.enemyArmor}；` : ''}破势 ${Math.min(damage, threshold)}/${threshold}：${damage >= threshold ? '已达标' : `本轮敌生命损失需达${threshold}`}，下轮重击每段-${reduction}，最低1；盾与护甲减免不计`;
  }
  if (i.kind === 'charge') return '本轮蓄力不攻击；下轮重击，护盾不会跨轮保留';
  if (i.kind === 'conditional') return b.firstCardKind == null
    ? '首张牌决定分支；未出牌走非直伤分支'
    : `分支已锁定：${b.firstCardKind === 'attack' ? '首牌含直伤' : '首牌不含直伤'}，后续牌不会改分支`;
  if(i.kind==='attack'&&i.shieldAfter)return `攻击结算后获得${i.shieldAfter}护盾；不会抵挡你本轮提前造成的伤害`;
  if (i.kind === 'guard') return `本轮不攻击；行动后架盾${i.value}，现在可先输出`;
  if (i.kind === 'cleanse') return `行动时先清除自身${i.value}层灼烧，再结算余下灼烧`;
  if (i.kind === 'burn') return `施加${i.value}层灼烧，本轮末开始扣血；护盾无法抵挡`;
  if (i.kind === 'thorns' || i.thorns) return `本轮首次主动直伤造成生命损失时反伤${i.thorns ?? i.value}`;
  if (i.kind === 'attack' && (i.hits ?? 1) > 1) return `${i.hits}段攻击分别结算；每段先消耗护盾，再由伙伴挡伤`;
  return '';
}

// Keep the image's single tactical line short enough for a phone screen.
export function enemyImageCue(b) {
 const cue=baseEnemyImageCue(b);
 if(b?.pressurePlan)return `${b.enemyPressure?'攻压+'+b.enemyPressure:'第'+b.pressurePlan.startTurn+'轮增压'}${cue?' · '+cue:''}`;
 return cue;
}
function baseEnemyImageCue(b) {
  if (!['lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(b?.ruleVersion)) return '';
  if(['lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(b.ruleVersion) && b.phaseNextIntent && b.phaseStartTurn>b.turn)return `下轮阶段开场 ${compactIntent(b.phaseNextIntent)}`;
  const i=b.intent;
  if(i?.recordMode)return `下轮预判 ${compactIntent(b.responsePreview)}`;
  if(i?.furnaceCharge)return `炉盾${b.enemyShield} ${b.furnaceBroken?'已破削弱':'击破可削弱'} 下轮${compactIntent(i.next)}`;
  if(i?.furnaceStrike)return `${i.furnaceWeakened?'已破盾削弱':'未破盾全力'} ${compactIntent(i)}`;
  if(i?.kind==='attack'&&i.shieldAfter)return `攻击后架盾${i.shieldAfter}`;
  if(i?.kind==='tempo')return `已出${b.plays??0}张 当前${(b.plays??0)<=i.playThreshold?'架盾':'攻击'}分支 第三张牌会改分支`;
  if (i?.kind === 'charge' && i.next?.kind && i.next.kind !== 'attack') return `换阶段覆盖重击${i.chargeBreak ? ' 本次破势不顺延' : ''}`;
  if (i?.chargeBreak) {
    return `${i.armor < 0 ? `本轮护甲${b.enemyArmor} ` : ''}破势 ${Math.min(b.chargeDamage??0,i.chargeBreak.threshold)}/${i.chargeBreak.threshold} 达标下轮每段减${i.chargeBreak.reduction}`;
  }
  if (['lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(b.ruleVersion) && i?.kind === 'conditional') return b.firstCardKind == null
    ? '首牌决定分支 后续出牌不会改变'
    : `分支已锁定 ${b.firstCardKind === 'attack' ? '首牌含直伤' : '首牌不含直伤'}`;
  return '';
}

function compactIntent(i){
 if(i.kind==='tempo')return `至多${i.playThreshold}张 架盾${i.onCalm.value} / 超过${i.playThreshold}张 攻击${i.onRush.value}×${i.onRush.hits??1}`;
 if(i.kind==='conditional')return '首牌决定分支';
 if(i.kind==='charge')return `蓄力 后续重击${i.next?.value??i.value}×${i.next?.hits??i.hits??1}`;
 return `${i.kind==='attack'?'攻击':i.kind==='guard'?'架盾':i.kind==='burn'?'灼烧':'阶段行动'}${i.value??''}${i.kind==='attack'?`×${i.hits??1}`:''}`;
}
