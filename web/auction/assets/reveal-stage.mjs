// Select only artifacts newly disclosed by a confirmed response. Initial reads
// and repeated responses are not new reveals; batch catch-up yields one moment.
export function rareRevealMoment(previous,next){
 if(!previous||!next||(previous.token!==next.token&&(previous.token||next.token))||next.status==='active'||!Array.isArray(previous.items)||!Array.isArray(next.items))return null;
 if(!Number.isInteger(previous.reveal?.count)||!Number.isInteger(next.reveal?.count)||next.reveal.count<=previous.reveal.count)return null;
 const added=next.items.map((item,index)=>({item,index})).filter(({item,index})=>item&&!previous.items[index]),
  rare=added.filter(({item})=>[4,5].includes(item.quality)&&typeof item.id==='string'&&typeof item.name==='string'&&Number.isSafeInteger(item.value)&&item.value>=0);
 rare.sort((a,b)=>b.item.quality-a.item.quality||b.item.value-a.item.value||a.index-b.index);
 if(!rare.length||added.length>next.reveal.count-previous.reveal.count)return null;
 const {item,index}=rare[0];return {index,count:next.reveal.count,added:added.length,
  item:{id:item.id,name:item.name,quality:item.quality,value:item.value,width:item.width,height:item.height}};
}

// Local presentation only. It cannot advance a warehouse or unlock inventory.
// Cancel/skip settle the outstanding promise so the existing reveal loop never
// gets stuck waiting for an animation that belongs to a previous page/session.
export function createRevealPresentation({isCurrent=()=>true,onChange=()=>{},onReveal=()=>{},schedule=setTimeout,cancel=clearTimeout}={}){
 let state=null,timer=null,pending=null,serial=0,impact=null;
 const stopTimer=()=>{if(timer!==null){cancel(timer);timer=null;}};
 function clear(){
  serial++;stopTimer();impact=null;const resolve=pending,changed=state!==null;pending=null;state=null;
  resolve?.(false);if(changed)onChange();
 }
 function finish(){
  stopTimer();impact=null;const resolve=pending;pending=null;
  if(state)state={...state,phase:'rest',active:false};resolve?.(true);onChange();
 }
 function play({key,index,quality,moment=null,spin=0,hold=0,reduced=false}){
  clear();if(!isCurrent(key))return Promise.resolve(false);
  const run=++serial,same=()=>run===serial,valid=()=>same()&&isCurrent(key);
  return new Promise(resolve=>{
   pending=resolve;state={key,index,quality,moment,id:`${key}:${run}`,phase:!reduced&&spin>0?'spin':'hero',active:true};
   const revealNow=()=>{
    if(!valid()){if(same())clear();return;}
    stopTimer();state={...state,phase:'hero'};onReveal(quality,moment);if(!valid())return;onChange();if(!valid())return;
    if(!reduced&&hold>0)timer=schedule(()=>{if(!same())return;if(valid())finish();else clear();},hold);
    else finish();
   };
   impact=revealNow;
   if(!reduced&&spin>0){timer=schedule(revealNow,spin);onChange();}
   else revealNow();
  });
 }
 function skip(){
  if(!pending)return;
  if(!state||!isCurrent(state.key)){clear();return;}
  if(state.phase==='spin')impact?.();
  if(pending)finish();
 }
 return {get state(){return state;},play,clear,skip};
}
