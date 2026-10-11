// Program-owned scoring and coins. Embers and speed never buy score.
export const ECONOMY_VERSION='lantern-economy-v0.4';
export const REWARDED_STARTS=2;
export const ROGUE_DAILY_CAP=60;
export const ACT_COINS=Object.freeze([0,8,18,30]);
const outcomes=new Set(['CLEAR','RETREAT','DEFEAT','ABANDON','EXPIRED']);
export function scoreRun(run){
 const type=run.result?.type;
 if(!outcomes.has(type))throw Error('冒险尚未结算。');
 if(!Number.isInteger(run.completedActs)||run.completedActs<0||run.completedActs>3||
    !Number.isInteger(run.completed)||run.completed<0||run.completed>(['lantern-rules-v0.7','lantern-rules-v0.8','lantern-rules-v0.9'].includes(run.ruleVersion)?15:9)||
    !Number.isInteger(run.eliteWins)||run.eliteWins<0||run.eliteWins>(['lantern-rules-v0.7','lantern-rules-v0.8','lantern-rules-v0.9'].includes(run.ruleVersion)?6:3))throw Error('冒险进度无效。');
 if(type==='ABANDON'||type==='EXPIRED')return {score:0,baseCoins:0,ranked:false};
 const alive=type==='CLEAR'||type==='RETREAT';
 const health=alive?Math.max(0,Math.min(30,Math.floor(run.hp))):0;
 return {score:1000*run.completedActs+50*run.completed+40*run.eliteWins+health,
         baseCoins:ACT_COINS[run.completedActs],ranked:run.mode==='challenge'};
}
export function rewardAmount(run,{totalEarned=0,rogueEarned=0,totalCap=150}={}){
 const baseCoins=run.settlement?.baseCoins??scoreRun(run).baseCoins;
 return run.rewardEligible?Math.max(0,Math.min(baseCoins,ROGUE_DAILY_CAP-rogueEarned,totalCap-totalEarned)):0;
}
export function dailySeedGroup(guild,day,ruleVersion,difficulty=0){
 if(ruleVersion==='lantern-rules-v0.9'){if(!Number.isInteger(difficulty)||difficulty<0||difficulty>10)throw Error('难度无效');return `lantern/${guild}/${day}/${ruleVersion}/difficulty-${difficulty}/15stations-3energy-5draw-v09-balance`; }
 if(ruleVersion==='lantern-rules-v0.8'){if(!Number.isInteger(difficulty)||difficulty<0||difficulty>10)throw Error('难度无效');return `lantern/${guild}/${day}/${ruleVersion}/difficulty-${difficulty}/15stations-3energy-5draw-v08profiles-pacts`; }
 if(ruleVersion==='lantern-rules-v0.7'){if(!Number.isInteger(difficulty)||difficulty<0||difficulty>10)throw Error('难度无效');return `lantern/${guild}/${day}/${ruleVersion}/difficulty-${difficulty}/15stations-3energy-5draw-v07profiles`;}
 return `lantern/${guild}/${day}/${ruleVersion}/traveler-30hp-2energy-4draw-start8`;
}
