export function threatValue(enemy,packet){
 const hits=packet.hits??1;
 let value=packet.value+Math.ceil((enemy.actAttackBudget??0)/hits);
 // Third-act boss heavy single strikes reach 20 at difficulty zero before
 // turn pressure; reductions are applied afterward, so counterplay remains.
 if(enemy.role==='Boss'&&enemy.actIndex===3&&hits===1&&packet.value>=10&&!packet.furnaceWeakened)value=Math.max(value,19);
 return value;
}
