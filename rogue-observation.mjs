export const OBSERVATION_RETENTION_MS=14*24*60*60*1000;
export const OBSERVATION_MAX_ENTRIES=160;
export const OBSERVATION_MAX_COUNT=1_000_000;
const emptyCounts=()=>({routes:0,rewardsTaken:0,rewardsSkipped:0,upgrades:0,removals:0,shopPurchases:0,campChoices:0,itemUses:0,battles:0,battleRounds:0,defeats:0});
const validAt=x=>Number.isFinite(x)&&x>=0;
const trimEntries=(entries,now)=>entries.filter(e=>e&&validAt(e.at)&&now-e.at<OBSERVATION_RETENTION_MS).slice(-OBSERVATION_MAX_ENTRIES);
export function pruneObservation(observation,now){
 const counts=emptyCounts(),source=observation?.counts&&typeof observation.counts==='object'?observation.counts:{};
 for(const key of Object.keys(counts)){const value=source[key];counts[key]=Number.isSafeInteger(value)?Math.min(OBSERVATION_MAX_COUNT,Math.max(0,value)):0;}
 const entries=trimEntries(Array.isArray(observation?.entries)?observation.entries:[],now).map(e=>({at:e.at,type:String(e.type||'action').slice(0,24),act:boundedInt(e.act),slot:boundedInt(e.slot),detail:typeof e.detail==='string'?e.detail.slice(0,100):''}));
 return {counts,entries};
}
const boundedInt=n=>Number.isInteger(n)?Math.max(0,Math.min(99,n)):null;
const append=(o,type,run,now,detail='')=>o.entries.push({at:now,type,act:boundedInt(run?.act),slot:boundedInt(run?.slot),detail:String(detail).slice(0,100)});
const cardIds=run=>(run?.deck??[]).map(c=>`${c.cardId}${c.upgraded?'^':''}`);
const changed=(before=[],after=[])=>{const left=[...before],out=[];for(const x of after){const i=left.indexOf(x);if(i<0)out.push(x);else left.splice(i,1);}return out;};

// Record only successful v0.9 state transitions. No action payload is persisted.
export function recordObservation(before,after,now,action={}){
 const o=pruneObservation(before?.observation,now);
 if(after?.version===before?.version||!['lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13','lantern-rules-v0.14'].includes(before?.ruleVersion)||after?.ruleVersion!==before?.ruleVersion)return o;
 if(action?.type==='ROUTE'){
  const picked=(after.path??[]).find(p=>p.act===before.act&&p.slot===before.slot);
  if(picked){append(o,'route',before,now,`${picked.type} ${picked.nodeId}`);o.counts.routes++;}
 }
 const newCards=changed(cardIds(before),cardIds(after));
 const newRelics=changed(before.relics??[],after.relics??[]),newItems=changed(before.inventory??[],after.inventory??[]);
 if(before.room?.type==='blessing'&&newRelics.length){append(o,'reward',before,now,`拿取遗物 ${newRelics.slice(0,3).join('、')}`);o.counts.rewardsTaken++;}
 const rewardsClaimed=before.phase==='REWARD'&&after.phase!=='REWARD'&&after.completed>before.completed;
 if(rewardsClaimed){const skipped=action.type==='REWARD_SKIP'||(!newCards.length&&!newRelics.length&&!newItems.length);const skippedKinds=(before.reward?.queue??[]).filter(q=>!q.done&&!(before.reward?.selections?.[q.kind]?.id??before.reward?.selections?.[q.kind])).map(q=>q.kind);const detail=skipped?'跳过奖励':`拿取 ${[...newCards,...newRelics,...newItems].slice(0,5).join('、')||'奖励'}${skippedKinds.length?`；跳过 ${skippedKinds.join('、')}`:''}`;append(o,skipped?'reward-skipped':'reward',before,now,detail);o.counts[skipped?'rewardsSkipped':'rewardsTaken']++;}
 const upgraded=(after.deck??[]).filter(c=>c.upgraded&&!before.deck?.find(b=>b.uid===c.uid)?.upgraded);
 if(upgraded.length){const card=upgraded[0];append(o,'upgrade',before,now,`升级 UID ${card.uid} ${card.cardId}`);o.counts.upgrades+=upgraded.length;}
 const removed=(before.deck??[]).filter(c=>!(after.deck??[]).some(n=>n.uid===c.uid));
 if(removed.length){const card=removed.find(c=>c.uid===action.uid)??removed[0];append(o,'remove',before,now,`删牌 UID ${card.uid} ${card.cardId}`);o.counts.removals+=removed.length;}
 const spent=Math.max(0,(before.embers??0)-(after.embers??0));
 if(spent&&before.room?.type==='shop'){const choice=action.choice,detail=choice==='buy'?`购买牌 ${action.cardId}`:choice==='item'?`购买道具 ${action.itemId}`:choice==='upgrade'||choice==='remove'?`商店${choice==='upgrade'?'升级':'删牌'} ${before.deck?.find(c=>c.uid===action.uid)?.cardId??''}`:`商店消费 ${spent} 余烬`;append(o,'shop-spend',before,now,`${detail}，${spent} 余烬`);o.counts.shopPurchases++;}
 if(before.room?.type==='camp'&&after.completed>before.completed){const choice=action.choice==='upgrade'?`升级 ${before.deck?.find(c=>c.uid===action.uid)?.cardId??''}`:action.choice==='heal'?'治疗':'离开';append(o,'camp',before,now,`营地：${choice}`);o.counts.campChoices++;}
 if(action.type==='ITEM'){append(o,'item-use',before,now,`使用道具 ${before.inventory?.[action.itemIndex]??'道具'}`);o.counts.itemUses++;}
 if(before.phase==='BATTLE'&&after.phase!=='BATTLE'&&before.battle&&['PLAY','ITEM','END_TURN'].includes(action.type)){const rounds=Math.max(0,Number.isInteger(after.battle?.turn)?after.battle.turn:Number.isInteger(before.battle.turn)?before.battle.turn:0),lost=after.result?.type==='DEFEAT';append(o,'battle-end',before,now,`战斗结束：${rounds} 轮${lost?`，失败 ${after.result.reason??'未知原因'}`:'，胜利'}`);o.counts.battles++;o.counts.battleRounds+=rounds;if(lost)o.counts.defeats++;}
 if(after.phase==='RESULT'&&before.phase!=='RESULT'&&['ABANDON','RETREAT'].includes(action.type))append(o,'exit',before,now,action.type==='ABANDON'?'主动放弃远征':'幕间撤退');
 o.entries=trimEntries(o.entries,now).slice(-OBSERVATION_MAX_ENTRIES);return o;
}
export function summarizeObservation(run,now=Date.now()){
 const o=pruneObservation(run?.observation,now);
 return {ruleVersion:run?.ruleVersion??null,runId:String(run?.runId??'').slice(0,80),counts:o.counts,entries:o.entries.map(e=>({...e})),entryLimit:OBSERVATION_MAX_ENTRIES,retentionDays:14};
}
export function summarizeObservationLines(run,now=Date.now()){
 if(!run?.observation)return [];
 const {counts}=summarizeObservation(run,now);
 return [
  `路线 ${counts.routes} 次；奖励拿取 ${counts.rewardsTaken} 次、跳过 ${counts.rewardsSkipped} 次。`,
  `升级 ${counts.upgrades} 张、删牌 ${counts.removals} 张；商店消费 ${counts.shopPurchases} 次；营地 ${counts.campChoices} 次。`,
  `道具使用 ${counts.itemUses} 次；战斗 ${counts.battles} 场、合计 ${counts.battleRounds} 轮。`,
  `失败 ${counts.defeats} 场。`
 ].map(line=>line.slice(0,120));
}
