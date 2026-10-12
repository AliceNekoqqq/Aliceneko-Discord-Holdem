export function newEffectLine(e){
 const v=e.value??0;
 if(e.kind==='weapon_attack'&&e.forgePierceThreshold!=null)return `武器伤害${v}+当前锻值；锻值≥${e.forgePierceThreshold}时无视护甲`;
 const bonus={marked:'打出前有标记',burning:'打出前敌人灼烧≥4',last_play:'本轮最后一个出牌名额'};
 if(e.kind==='damage'&&e.bonus)return `伤害${v}；${bonus[e.bonus.condition]}时额外${e.bonus.value}`;
 if(e.kind==='draw'&&e.condition)return `${e.condition==='marked'?'打出前有标记':'本牌拆解锻值≥2'}时抽${v}张`;
 return ({
  bank_shield:`暂存当前护盾≤${v}，下轮到账`,guard_next_hit:`本轮下一次攻击首段减伤${v}（不叠加）`,
  burn_cashout:`消耗敌人灼烧≤${v}，每层换${e.multiplier??2}盾`,bank_burn:`封存敌人灼烧≤${v}，下轮返还实际层数+1`,
  discount_target:`目标手牌本轮减${v}费（最低0）`,upgrade_target:'强化目标手牌至战斗结束',
  recover_card:`${e.discount?'回收后本轮减'+e.discount+'费；':''}回收最近一张${e.filter==='guard'?'含护盾效果':'≤1费'}弃牌（不含本牌；手牌上限5）`,tune_echo:'强化首个未强化的待重放回声，仅限本次重放',
  triage:`生命≤一半时治疗${v}，否则护盾${e.block??5}`,shield_heal:`消耗已有护盾≤${v}，每2盾治疗1${e.evenOnly?"（仅消耗治疗所需的偶数护盾）":""}`,
  pet_guard:`消耗伙伴生命≤${v}，每点换2盾`,recall_pet:`撤回伙伴，备势=min(${v},伙伴生命÷2取整)，抽${e.draw??1}张`,
  forge_spend:`消耗锻值≤${v}，每点换2盾`,forge_reset:`清空锻值，每3点返还1能量（最多${e.energy??2}），护盾${e.block??3}`,
  tempo:'本轮额外1次出牌（每轮最多触发一次，总计4次）',energy:`能量+${v}（上限5）`,
  shield_break:`拆除敌人护盾≤${v}，不影响护甲`,cleanse_guard:`清除自身灼烧≤${v}，每层换2盾`,
  recall_cover:`撤回伙伴，护盾=min(伙伴生命,${e.block??4})，抽${e.draw??2}张`,
 }[e.kind]??null);
}

export function compactEffectLine(e){
 const v=e.value??0;
 if(e.kind==='weapon_attack'&&e.forgePierceThreshold!=null)return `武器${v}+锻，锻${e.forgePierceThreshold}穿甲`;
 if(e.kind==='damage'&&e.bonus)return `伤${v}/${{marked:'标记',burning:'火4+',last_play:'末牌'}[e.bonus.condition]}+${e.bonus.value}`;
 if(e.kind==='draw'&&e.condition)return `${e.condition==='marked'?'有标记':'拆锻≥2'}抽${v}`;
 return ({bank_shield:`存盾≤${v}下轮`,guard_next_hit:`首段减伤${v}`,burn_cashout:`耗火≤${v}换盾`,bank_burn:`存火≤${v}返+1`,discount_target:`目标本轮-${v}费`,upgrade_target:'目标战内强化',recover_card:e.filter==='guard'?'回收护盾弃牌':'回收≤1费弃牌',tune_echo:'强化首个回声',triage:`半血治${v}/盾${e.block??5}`,shield_heal:`耗盾≤${v}治一半`,pet_guard:`耗宠≤${v}换双盾`,recall_pet:`撤宠备势≤${v}`,forge_spend:`拆锻≤${v}换双盾`,forge_reset:`锻清零返能≤${e.energy??2}`,tempo:'额外出牌1次',energy:`能量+${v}`,shield_break:`破盾≤${v}`,cleanse_guard:`净火≤${v}换双盾`,recall_cover:`撤宠换盾抽${e.draw??2}`}[e.kind]??null);
}
