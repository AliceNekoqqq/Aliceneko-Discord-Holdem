import { hasUsefulUpgrade } from './rogue-upgrade-validity.mjs';
// Bounded card operations; the frozen battle engine owns timing and damage.
export const NEW_TARGETS = new Set(['discount_target','upgrade_target']);
export const HEAL_KINDS = new Set(['heal','triage','shield_heal']);
export const hasHealing = def => (def.effects??[]).some(e=>HEAL_KINDS.has(e.kind));
export const playLimitFor = s => 3 + (s?.extraPlays??0);
export function discountedDefinition(def,entity,s){
 if(!s?.cardDiscounts?.[entity.uid])return def;
 return {...def,cost:Math.max(0,def.cost-s.cardDiscounts[entity.uid])};
}
export function conditionMet(name,before,s){
 if(name==='prepared')return before.prepare>=2;
 if(name==='marked')return before.mark>0;
 if(name==='burning')return before.enemyBurn>=4;
 if(name==='last_play')return before.plays>=before.playLimit;
 if(name==='forge_spent')return (s.forgeSpentThisCard??0)>=2;
 return !name;
}
export function supportTargetAllowed(s,def,entity,catalog){
 const needsUpgrade=def.effects.some(e=>e.kind==='upgrade_target');
 if(needsUpgrade&&(entity.upgraded||!hasUsefulUpgrade(catalog.cards[entity.cardId])))return false;
 if(!needsUpgrade&&def.effects.some(e=>e.kind==='discount_target')){
  const base=catalog.cards[entity.cardId];
  const target=entity.upgraded?{...base,...base.upgrade}:base;
  if(discountedDefinition(target,entity,s).cost<=0)return false;
 }
 return true;
}
export function supportUnavailable(s,def,catalog){
 const kinds=def.effects.map(e=>e.kind);
 if(kinds.some(k=>NEW_TARGETS.has(k))&&!s.hand.some(e=>e.uid!==def.uid&&supportTargetAllowed(s,def,e,catalog)))return '没有符合条件的手牌目标';
 if(kinds.includes('bank_burn')&&(s.delayed?.length??0)>=2)return '延迟火种槽已满';
 if(kinds.includes('tune_echo')&&(!s.pendingEchoes?.length||s.pendingEchoes[0].definition.upgraded||!hasUsefulUpgrade(catalog.cards[s.pendingEchoes[0].cardId])))return '先安排一个尚未强化的回声';
 if(kinds.some(k=>['pet_guard','recall_pet','recall_cover'].includes(k))&&s.petHp<=0)return '需要存活的伙伴';
 if(kinds.some(k=>['forge_spend','forge_reset'].includes(k))&&s.forge<=0)return '需要已有锻值';
 if(kinds.includes('shield_heal')&&(s.hp>=s.maxHp||s.shield<2))return '需要缺血且至少2点护盾';
 return '';
}

export function applyNewEffect(ctx){
 const {s,e,definition,targetUid,active,catalog,shield,draw,prepare,burnEnemy,metric,trigger,log}=ctx;
 const v=e.value??0;
 const heal=n=>{const h=Math.min(s.maxHp-s.hp,n);s.hp+=h;s.heals+=h;metric(s,'healing',h);metric(s,'overheal',Math.max(0,n-h));if(h>0)trigger(s,'heal_block',(x,r)=>{shield(s,x);if(r.prepare)prepare(s,r.prepare);});};
 const consume=(field,max)=>{const n=Math.min(s[field]??0,max);s[field]-=n;return n;};
 const known=['discount_retained','bank_shield','guard_next_hit','burn_cashout','bank_burn','discount_target','upgrade_target','recover_card','tune_echo','triage','shield_heal','pet_guard','recall_pet','forge_spend','forge_reset','tempo','energy','shield_break','cleanse_guard','recall_cover'];
 if(!known.includes(e.kind))return false;
 // New support operations never run from a replay or item. Shield breaking
 // is the sole new replayable operation and affects no recursive resources.
 if(!active&&e.kind!=='shield_break')return true;
 switch(e.kind){
  case 'discount_retained':{if(targetUid==null)break;const t=s.hand.find(x=>x.uid===targetUid);if(!t)throw new RangeError('保留目标已不可用');s.pendingRetainDiscounts??={};s.pendingRetainDiscounts[targetUid]=Math.min(3,Math.max(s.pendingRetainDiscounts[targetUid]??0,v));log(s,'保留牌下轮减'+v+'费，重复不叠加');break;}
  case 'bank_shield':{const n=consume('shield',v);s.bankedShield=Math.min(30,(s.bankedShield??0)+n);log(s,`暂存护盾${n}：下轮到账`);break;}
  case 'guard_next_hit':s.hitReduction=Math.max(s.hitReduction??0,v);log(s,`本轮下一次攻击首段减伤${v}`);break;
  case 'burn_cashout':{const n=consume('enemyBurn',v);shield(s,n*(e.multiplier??2));log(s,`兑现灼烧${n}层，换取护盾`);break;}
  case 'bank_burn':{if(s.delayed.length>=2)throw new RangeError('延迟火种槽已满');const n=consume('enemyBurn',v);if(n){s.delayed.push({kind:'burn',value:n+1});log(s,`封存火种${n}：下轮施加${n+1}层`);}break;}
  case 'discount_target':{if(targetUid==null)throw new RangeError('请选择手牌目标');const t=s.hand.find(x=>x.uid===targetUid);if(!t)throw new RangeError('目标手牌已不可用');s.cardDiscounts??={};s.cardDiscounts[targetUid]=Math.min(3,(s.cardDiscounts[targetUid]??0)+v);log(s,`#${targetUid}本轮费用降低${v}`);break;}
  case 'upgrade_target':{const t=s.hand.find(x=>x.uid===targetUid);if(!t||t.upgraded||!hasUsefulUpgrade(catalog.cards[t.cardId]))throw new RangeError('请选择未强化手牌');s.temporaryUpgrades??={};s.temporaryUpgrades[targetUid]=false;for(const pile of ['deck','hand','draw','discard','exhaust'])for(const entity of s[pile])if(entity.uid===targetUid)entity.upgraded=true;log(s,`#${targetUid}战内强化，不写入远征牌组`);break;}
  case 'recover_card':{if(s.hand.length>=5){log(s,'手牌已满，无法回收');break;}const index=recoveryIndex(s,definition,e,catalog);if(index>=0){const [t]=s.discard.splice(index,1);s.hand.push(t);if(e.discount){s.cardDiscounts??={};s.cardDiscounts[t.uid]=Math.min(3,(s.cardDiscounts[t.uid]??0)+e.discount);}log(s,`回收${catalog.cards[t.cardId].name}${e.discount?'，本轮减'+e.discount+'费':''}`);}else log(s,'没有符合条件的弃牌');break;}
  case 'tune_echo':{const queued=s.pendingEchoes[0];if(!queued||queued.definition.upgraded||!hasUsefulUpgrade(catalog.cards[queued.cardId]))throw new RangeError('没有可校准的回声');const base=catalog.cards[queued.cardId];queued.definition={...queued.definition,...base.upgrade,upgraded:true};log(s,'首个待重放回声临时强化');break;}
  case 'triage':if(s.hp<=s.maxHp/2)heal(v);else shield(s,e.block??5);break;
  case 'shield_heal':{const n=Math.min(Math.floor(Math.min(s.shield,v)/2),s.maxHp-s.hp);s.shield-=n*2;heal(n);break;}
  case 'pet_guard':{const n=consume('petHp',v);shield(s,n*2);log(s,`伙伴让出${n}生命，换取护盾`);break;}
  case 'recall_pet':{const old=s.petHp;s.petHp=0;prepare(s,Math.min(v,Math.floor(old/2)));draw(s,e.draw??1,'active');log(s,'伙伴归巢，转为备势与抽牌');break;}
  case 'forge_spend':{const n=consume('forge',v);s.forgeSpentThisCard=n;shield(s,n*2);log(s,`拆解锻值${n}，换取护盾`);break;}
  case 'forge_reset':{const old=s.forge;s.forge=0;s.energy=Math.min(5,s.energy+Math.min(e.energy??2,Math.floor(old/3)));shield(s,e.block??3);log(s,'重铸：清空锻值，返还能量');break;}
  case 'tempo':if(!s.turnFlags.includes('tempo-credit')){s.turnFlags.push('tempo-credit');s.extraPlays=1;log(s,'本轮最多可出4张牌；额外行动不叠加');}else log(s,'本轮已获得额外行动，不再叠加');break;
  case 'energy':s.energy=Math.min(5,s.energy+v);log(s,`能量增加${v}，上限5`);break;
  case 'shield_break':{const n=consume('enemyShield',v);log(s,`拆除敌方护盾${n}`);break;}
  case 'cleanse_guard':{const n=consume('burn',v);shield(s,n*2);log(s,`清除自身灼烧${n}，换取护盾`);break;}
  case 'recall_cover':{const old=s.petHp;s.petHp=0;shield(s,Math.min(old,e.block??4));draw(s,e.draw??2,'active');log(s,'撤回伙伴，换取护盾与抽牌');break;}
 }
 return true;
}

const SHIELD_KINDS=new Set(['block','bank_shield','triage','burn_cashout','pet_guard','forge_spend','forge_reset','cleanse_guard','recall_cover']);
export function recoveryIndex(s,def,e,catalog){
 return s.discard.findLastIndex(t=>{if(t.uid===def.uid)return false;const base=catalog.cards[t.cardId];if(!base)return false;const c=t.upgraded?{...base,...base.upgrade}:base;return e.filter==='guard'?c.effects.some(x=>SHIELD_KINDS.has(x.kind)):discountedDefinition(c,t,s).cost<=1;});
}
export function supportPreview(s,def,catalog){
 const lines=[];
 if(def.effects.some(e=>e.kind==='discount_retained'))lines.push('保留目标下轮减1费；改选保留牌或提前打出原目标时不转移');
 for(const e of def.effects){
  if(e.kind==='recover_card'){const i=recoveryIndex(s,def,e,catalog);lines.push(i>=0?`可回收：${catalog.cards[s.discard[i].cardId].name}${e.discount?'（本轮减'+e.discount+'费）':''}`:'当前无符合条件的弃牌');}
  if(e.kind==='shield_heal'){const n=Math.min(Math.floor(Math.min(s.shield,e.value)/2),s.maxHp-s.hp);lines.push(`当前消耗${n*2}盾，治疗${n}`);}
  const count=e.kind==='draw'?e.value:['recall_pet','recall_cover'].includes(e.kind)?e.draw??1:0;
  if(count){const condition=!e.condition||e.condition==='marked'&&s.mark>0||e.condition==='forge_spent'&&s.forge>=2;const available=s.draw.length+s.discard.length+(def.exhaust?0:1);const actual=condition?Math.min(count,Math.max(0,6-s.hand.length),available):0;lines.push(`当前预计抽${actual}/${count}张（手牌上限5）`);}
 }
 return lines.join(' · ');
}
