import test from 'node:test';
import assert from 'node:assert/strict';
import {rareRevealMoment,createRevealPresentation} from './web/auction/assets/reveal-stage.mjs';
const item=(id,quality,value=100)=>({id,name:id,quality,value,width:1,height:2,secret:'do not project'});
const receipt=(count,items,extra={})=>({token:'one',status:'settled',reveal:{count},items,...extra});

test('only newly disclosed gold/red artifacts can create a moment and fixed receipt values survive projection',()=>{
 const gold=item('gold',4,54321),red=item('red',5,123456),before=receipt(1,[gold,null]),next=receipt(2,[gold,red]);
 const m=rareRevealMoment(before,next);assert.equal(m.index,1);assert.equal(m.item.value,123456);assert.equal(m.added,1);
 assert.equal(m.item.secret,undefined);assert.equal(rareRevealMoment(next,next),null);assert.equal(rareRevealMoment(null,next),null);
 assert.equal(rareRevealMoment(before,{...next,token:'another'}),null);
 assert.equal(rareRevealMoment(before,{...next,status:'active'}),null);
 assert.equal(rareRevealMoment(receipt(0,[null]),receipt(1,[item('blue',2)])),null);
});
test('a batch or catch-up selects one highest-quality newly opened artifact rather than replaying a queue',()=>{
 const xs=[item('old-red',5,999999),item('gold',4,10000),item('red-low',5,200),item('red-high',5,300)],
  m=rareRevealMoment(receipt(1,[xs[0],null,null,null]),receipt(4,xs));
 assert.equal(m.item.id,'red-high');assert.equal(m.added,3);
 assert.equal(rareRevealMoment(receipt(0,[null,null]),receipt(1,[xs[1],xs[2]])),null,'objects beyond confirmed progress do not create a moment');
 assert.equal(rareRevealMoment(receipt(1,[null,null]),receipt(0,[null,null])),null);
});

function harness(){
 let key='one',id=0;const timers=new Map(),sounds=[],changes=[],all=[];
 const p=createRevealPresentation({isCurrent:x=>key===x,schedule:(fn,ms)=>{timers.set(++id,{fn,ms});all.push(fn);return id;},cancel:id=>timers.delete(id),onReveal:(q,m)=>sounds.push([q,m?.item.id]),onChange:()=>changes.push(p.state?.phase??null)});
 return {p,timers,sounds,changes,all,switchKey:x=>key=x,flush(){const [id,t]=timers.entries().next().value;timers.delete(id);t.fn();}};
}
const moment={item:item('red',5),index:0,count:1,added:1};
test('spin, reveal and rest proceed once while the inline moment remains inspectable',async()=>{
 const {p,timers,sounds,flush}=harness(),done=p.play({key:'one',index:0,quality:5,moment,spin:100,hold:200});
 assert.equal(p.state.phase,'spin');assert.equal(sounds.length,0);flush();assert.equal(p.state.phase,'hero');
 assert.deepEqual(sounds,[[5,'red']]);flush();assert.equal(await done,true);assert.equal(p.state.phase,'rest');assert.equal(p.state.active,false);assert.equal(p.state.moment,moment);assert.equal(timers.size,0);
});
test('clear resolves a cancelled animation and stale timer callbacks cannot reveal or clear a newer session',async()=>{
 const h=harness(),old=h.p.play({key:'one',index:0,quality:5,moment,spin:100,hold:200}),stale=h.all[0];
 h.switchKey('two');h.p.clear();assert.equal(await old,false);
 const next=h.p.play({key:'two',index:1,quality:4,moment:null,spin:100});
 stale();assert.equal(h.p.state.key,'two');assert.equal(h.p.state.phase,'spin');assert.equal(h.sounds.length,0);
 h.flush();assert.equal(await next,true);assert.deepEqual(h.sounds,[[4,undefined]]);
});
test('skip settles the same receipt without a mutation, duplicate sound or hanging timer',async()=>{
 const h=harness(),done=h.p.play({key:'one',index:0,quality:5,moment,spin:100,hold:200});
 h.p.skip();assert.equal(await done,true);assert.equal(h.timers.size,0);assert.equal(h.p.state.phase,'rest');
 h.p.skip();assert.equal(h.sounds.length,1);
});
test('reduced motion skips waits and cancelled background callbacks do not play a late sound',async()=>{
 const h=harness();assert.equal(await h.p.play({key:'one',index:0,quality:5,moment,spin:100,hold:200,reduced:true}),true);
 assert.equal(h.timers.size,0);assert.equal(h.sounds.length,1);
 const pending=h.p.play({key:'one',index:1,quality:4,spin:100});h.switchKey('off-page');h.flush();
 assert.equal(await pending,false);assert.equal(h.p.state,null);assert.equal(h.sounds.length,1);
});
test('a queued hold timer cannot finish the next presentation after replacement',async()=>{
 const h=harness(),a=h.p.play({key:'one',index:0,quality:5,moment,hold:200}),stale=h.all.at(-1),
  b=h.p.play({key:'one',index:1,quality:4,spin:100});
 assert.equal(await a,false);stale();assert.equal(h.p.state.phase,'spin');h.flush();assert.equal(await b,true);
});
