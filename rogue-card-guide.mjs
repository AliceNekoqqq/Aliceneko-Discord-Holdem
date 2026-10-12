// Presentation only: legality and effects remain owned by the battle engine.
export const DIRECT_EFFECTS = new Set(['damage','pet_attack','weapon_attack','sacrifice','damage_from_shield']);
export const TARGET_EFFECTS = new Set(['sift','retain','exhaust_other']);
const GROUPS = [
 {label:'攻击',color:[205,112,96],kinds:[...DIRECT_EFFECTS]},
 {label:'守御',color:[106,169,207],kinds:['block','counter']},
 {label:'恢复',color:[130,188,131],kinds:['heal','cleanse_player']},
 {label:'火种',color:[229,158,84],kinds:['burn','delay_burn']},
 {label:'召唤',color:[219,178,104],kinds:['summon']},
 {label:'铸器',color:[173,179,192],kinds:['forge']},
 {label:'技巧',color:[179,151,210],kinds:['prepare','mark','draw','sift','retain','exhaust_other','echo_next','self_echo']},
];
export function cardGroups(def) {
 const kinds=new Set((def?.effects||[]).map(e=>e.kind));
 return GROUPS.filter(g=>g.kinds.some(k=>kinds.has(k)));
}
export function cardEffectLines(def,{echoManual=false}={}) {
 return (def?.effects||[]).map(e=>{
  if(echoManual&&e.kind==='echo_next')return `回声蓄能${e.value}：之后可选可回声牌安排到下轮`;
  if(echoManual&&e.kind==='self_echo')return `本牌下轮免费重放${e.value}次`;
  return ({
  damage:`伤害${e.value}${e.ignoreArmor?'（穿甲）':''}`,block:`护盾${e.value}`,burn:`灼烧${e.value}`,heal:`治疗${e.value}`,draw:`抽牌${e.value}`,cleanse_player:`净化${e.value}`,
  prepare:`备势${e.value}`,mark:`标记${e.value}`,sift:'弃目标并抽1张',exhaust_other:'消耗目标手牌',retain:'保留目标至下轮',counter:`格挡后反击${e.value}`,
  echo_next:'后续可回声牌下轮重放',self_echo:'本牌下轮重放一次',delay_burn:`下轮灼烧${e.value}`,
  damage_from_shield:`耗盾≤${e.maxSpend??6}，伤害${e.value}+耗盾`,summon:`伙伴生命+${e.value}`,pet_attack:`伙伴攻击${e.value}`,sacrifice:`牺牲伙伴，伤害${e.value}`,forge:`锻值+${e.value}`,weapon_attack:`伤害${e.value}+锻值`,
 }[e.kind]??`${e.kind}${e.value??''}`);
 });
}
export function cardWarnings(entity,def,hp) {
 const out=[];
 if(entity?.upgraded)out.push('已强化');
 if(def?.selfCost)out.push(`自损${def.selfCost}${Number.isFinite(hp)&&def.selfCost>=hp?'（会倒下）':''}`);
 if(def?.exhaust)out.push('消耗：本战不再抽到');
 return out;
}
export function unavailableReason(b,def,playLimit,legal,uid) {
 if(b.result)return '战斗已结束';
 if((b.plays??0)>=playLimit)return '本轮出牌次数已满';
 if(legal.has(uid))return '';
 if(def?.cost>(b.energy??0))return '能量不足';
 const effects=def?.effects||[];
 if(effects.length&&effects.every(e=>e.kind==='heal')&&b.hp>=b.maxHp)return '生命已满，纯治疗牌不可用';
 if(effects.length&&effects.every(e=>e.kind==='pet_attack'||e.kind==='sacrifice')&&!(b.petHp>0))return '需要存活的伙伴';
 if(effects.length&&effects.every(e=>TARGET_EFFECTS.has(e.kind))&&(b.hand?.length??0)<2)return '没有合法目标';
 return '当前不可打出';
}
export function battleHints(b,defs,playLimit) {
 const lines=[`先看意图，再选牌。还可打${Math.max(0,playLimit-(b.plays??0))}张；能量与出牌次数分别消耗。`];
 if(b.intent?.kind==='conditional')lines.push(`条件分支看本轮首张牌：${b.firstCardKind==='attack'?'已选攻击分支':b.firstCardKind==='other'?'已选其他分支':'首张含直接伤害效果→攻击分支，否则→其他分支'}。`);
 else if(b.intent?.kind==='attack')lines.push(`敌人将攻击${b.intent.value??0}×${b.intent.hits??1}；护盾在敌人行动后清空。`);
 if(defs.some(d=>d.cost===0))lines.push('0能量牌仍占一次出牌，可给高费用牌留下能量。');
 const kinds=new Set(defs.flatMap(d=>(d?.effects||[]).map(e=>e.kind)));
 if(kinds.has('prepare')||kinds.has('mark'))lines.push('备势／标记加到下一次直伤并被消耗；可先蓄势，再打攻击。');
 else if(kinds.has('weapon_attack')||kinds.has('forge'))lines.push('先锻造可提高后续武器伤害；锻值保留到本战结束。');
 else if(kinds.has('pet_attack')||kinds.has('sacrifice'))lines.push('伙伴攻击与牺牲需要存活的伙伴；伙伴也会替你承受剩余攻击伤害。');
 else if([...kinds].some(k=>TARGET_EFFECTS.has(k)))lines.push('带箭头的选项会操作另一张手牌；先核对目标编号。');
 if(defs.some(d=>d?.selfCost))lines.push('自损直接扣生命，护盾挡不住；生命不足时仍能出牌，会倒下。');
 if(b.echoReady)lines.push((b.echoEligibleUids?.length??0)>0?`回声已蓄能${b.echoCharges??1}次；按“使用回声”选择牌面带“可回声”的牌，下轮免费重放。`:'回声已蓄能；先打出一张“可回声”牌，再按“使用回声”选择它。');
 return lines.slice(0,4);
}
export function playGuide({draw=5,energy=3,playLimit=3,modern=true,echoManual=false,turnLimit=12}={}) {
 return [
  `【一轮怎么打】抽${draw}张，${energy}能量，最多打${playLimit}张。先看敌人意图，再安排防御与输出。打满次数或没有可用牌／道具时，系统会自动结束本轮。`,
  '【怎么认牌】费用圆圈是能量；彩色标签是效果类别，混合牌可有多个类别。#编号对应这一张实体牌，同名牌也各有编号。强化后的费用与效果以当前显示为准。',
  '【怎么出牌】在下拉框选择牌。→#编号表示要操作的另一张手牌；“不选目标”只执行基础效果。灰牌附不可用原因。',
  '【伤害与风险】数字是基础效果；护甲、敌盾、遗物与状态会影响实际结算。自损不经过护盾，生命不足会倒下。消耗牌本战不再抽到，下一场恢复。',
  '【轮末】未打出的牌通常进弃牌堆；保留牌留到下轮。护盾挡敌人的攻击，敌人行动后清空；灼烧在轮末扣血并衰减，护盾挡不住。',
  ...(modern?['【组合】备势／标记会自动加到下一次直伤；锻造提高武器攻击；召唤后才能打伙伴攻击／牺牲牌；反击牌要等护盾实际挡住攻击后触发。这些效果不需要另按按钮。',echoManual?'【回声操作】打出有“蓄能”的牌后，再打出一张标有“可回声”的牌；按“使用回声”并选择它，下轮开始时免费重放。每次蓄能可安排1至2张，全战最多3次；治疗牌不能回声，自损会再次支付。“本牌回声”会自动排队。':'【回声】标有“可回声”的牌能在安排回声后于下轮重放，治疗牌不能回声，每战最多3次；自损也会再次支付。条件意图按本轮首张牌的类别分支。']:[]),
  `【节奏】${turnLimit==null?'战斗没有回合数上限':'每战最多'+turnLimit+'轮'}；道具本战最多用1件，不占出牌次数。玩法提示帮助理解规则，选择仍由你决定。`,
 ].join('\n\n');
}
