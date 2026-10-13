export function threatValue(enemy,packet){
 return packet.value+Math.ceil((enemy.actAttackBudget??0)/(packet.hits??1));
}
export function limitThreatValue(enemy,packet,difficulty=0){
 if(enemy?.actIndex!==3||!['Boss','精英'].includes(enemy.role)||!['attack','charge'].includes(packet.kind))return packet.value;
 const total=difficulty>=6?24:22;
 return Math.min(packet.value,Math.max(1,Math.floor(total/(packet.hits??1))));
}
export function limitEnemyHp(enemy,value,difficulty=0){
 return enemy?.actIndex===3&&enemy.role==='Boss'?Math.min(value,80+difficulty):value;
}
