export function enemyPressureFor(enemy,turn){
 const p=enemy?.pressure;
 if(!p||turn<p.startTurn)return 0;
 return Math.min(p.max,1+Math.floor((turn-p.startTurn)/p.step));
}
