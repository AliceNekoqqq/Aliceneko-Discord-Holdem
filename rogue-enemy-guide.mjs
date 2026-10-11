// Factual decision cues shared by text and raster views.
export function enemyApproach(enemy) {
  if (!enemy) return '';
  const intents = enemy.intents ?? [], cues = [];
  if (intents.some(i => i.chargeBreak)) cues.push('蓄力可破势');
  else if (intents.some(i => i.kind === 'charge')) cues.push('蓄力后重击');
  if (intents.some(i => i.kind === 'conditional')) cues.push('首牌决定分支');
  if (intents.some(i => (i.hits ?? 1) > 1)) cues.push('多段攻击');
  if (enemy.armor > 0) cues.push(`常驻护甲${enemy.armor}`);
  if (intents.some(i => i.kind === 'burn')) cues.push('施加灼烧');
  if (intents.some(i => i.kind === 'cleanse')) cues.push('清除自身灼烧');
  if (!cues.length && intents.some(i => i.kind === 'guard')) cues.push('攻击与架盾交替');
  return cues.slice(0, 3).join(' · ');
}

export function enemyDecisionCue(b) {
  const i = b?.intent;
  if (!i) return '';
  if (i.kind === 'charge' && i.chargeBreak) {
    const { threshold, reduction } = i.chargeBreak;
    const damage = Math.max(0, b.chargeDamage ?? 0);
    return `破势 ${Math.min(damage, threshold)}/${threshold}：${damage >= threshold ? '已达标' : `本轮敌生命损失需达${threshold}`}，下轮重击每段-${reduction}，最低1；盾与护甲减免不计`;
  }
  if (i.kind === 'charge') return '本轮蓄力不攻击；下轮重击，护盾不会跨轮保留';
  if (i.kind === 'conditional') return b.firstCardKind == null
    ? '首张牌决定分支；未出牌走非直伤分支'
    : `分支已锁定：${b.firstCardKind === 'attack' ? '首牌含直伤' : '首牌不含直伤'}，后续牌不会改分支`;
  if (i.kind === 'guard') return `本轮不攻击；行动后架盾${i.value}，现在可先输出`;
  if (i.kind === 'cleanse') return `行动时先清除自身${i.value}层灼烧，再结算余下灼烧`;
  if (i.kind === 'burn') return `施加${i.value}层灼烧，本轮末开始扣血；护盾无法抵挡`;
  if (i.kind === 'thorns' || i.thorns) return `本轮首次主动直伤造成生命损失时反伤${i.thorns ?? i.value}`;
  if (i.kind === 'attack' && (i.hits ?? 1) > 1) return `${i.hits}段攻击分别结算；每段先消耗护盾，再由伙伴挡伤`;
  return '';
}
