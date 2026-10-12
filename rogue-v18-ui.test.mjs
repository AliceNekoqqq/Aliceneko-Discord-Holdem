import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRun, runAction } from './rogue-run-v18.mjs';
import { beginBattle, battleAction } from './rogue-battle-v18.mjs';
import { CATALOG_V18 } from './rogue-content-v18.mjs';
import { CATALOG_V17 } from './rogue-content-v17.mjs';
import { renderRogue, renderRogueReading, renderRogueSettings, parseRogueAction } from './rogue-ui.mjs';
import { describeRogueImage, renderRogueImage } from './rogue-image.mjs';
import { dispatchRogue } from './rogue-interactions.mjs';

function fixture(){
 const run=createRun({runId:'v18-ui',owner:'2',guild:'1',professionId:'messenger',seed:'ui',now:0});
 run.deck=['mail_redirect','shared_breath','shared_discount','shared_break','shared_mirror'].map((cardId,uid)=>({cardId,uid,upgraded:false}));
 const b=beginBattle({enemyId:'lantern_rat',deck:run.deck,professionId:'messenger',relics:[],hp:30});
 Object.assign(b,{hand:structuredClone(run.deck),draw:[],discard:[],energy:5,enemyHp:999,enemyMaxHp:999,enemyArmor:0,intent:{kind:'guard',value:0}});
 Object.assign(run,{phase:'BATTLE',battle:b,room:{type:'battle',battleType:'normal',rewardGranted:false}});return run;
}
test('private target selections only list useful legal targets, update costs and keep temporary upgrades local',()=>{
 let run=fixture();
 const panel=renderRogue(run),pick=panel.data.components.flatMap(r=>r.components).find(c=>c.type===3);
 const choices=pick.options.filter(o=>o.value.startsWith('p:0:'));
 assert.ok(choices.length);assert.ok(choices.every(o=>o.value!=='p:0:t:0'));assert.ok(choices.every(o=>o.value!=='p:0:n'));
 assert.equal(pick.options.some(o=>o.value==='p:2:t:2'),false);
 const chosen=choices.find(o=>o.value==='p:0:t:3');assert.ok(chosen);
 const parsed=parseRogueAction(pick.custom_id,[chosen.value]);assert.deepEqual(parsed.action,{type:'PLAY',uid:0,targetUid:3});
 const service={guild:'1',act(p){run=runAction(run,p.action,1);return run;}};
 const response=dispatchRogue(service,{id:'99',type:3,guild_id:'1',member:{user:{id:'2'}},message:{flags:64},data:{custom_id:pick.custom_id,values:[chosen.value]}});
 assert.equal(response.type,7);
 assert.equal(describeRogueImage(run).cards.find(c=>c.id===3).cost,0);
 assert.match(JSON.stringify(response),/拆盾突围＋.*0能量|拆盾突围＋.*0费/);
 const updated=renderRogue(run).data.components.flatMap(r=>r.components).find(c=>c.type===3);
 assert.equal(updated.options.some(o=>o.value==='p:2:t:3'),false,'already-free targets cannot receive the pure discount card');
});
test('extra action and exclusive markers agree across text and rendered image models',async()=>{
 const run=fixture();run.battle=battleAction(run.battle,{type:'PLAY',uid:1});
 assert.equal(describeRogueImage(run).playLimit,4);
 assert.match(JSON.stringify(renderRogue(run)),/已出牌 1\/4/);
 const model=describeRogueImage(run);assert.ok(model.cards.find(c=>c.id===0).categories.some(g=>g.label==='专属'));
 const png=await renderRogueImage(run);assert.ok(png.size>1000);
 await writeFile('/tmp/v18-battle-preview.png',new Uint8Array(await png.arrayBuffer()));
 assert.match(JSON.stringify(renderRogueReading('guide',undefined,{run})),/战内强化只到本战结束/);
 // Reading an old catalog must not alter current settings' exclusive count.
 renderRogueSettings({professionId:'messenger',catalogVersion:'0.17'});
 assert.match(JSON.stringify(renderRogueSettings({professionId:'messenger'})),/职业专属池：6张/);
});
test('all 28 new cards execute both base and upgraded effects in explicitly synthetic legal setups',()=>{
 const added=Object.keys(CATALOG_V18.cards).filter(id=>!CATALOG_V17.cards[id]);assert.equal(added.length,28);
 for(const id of added)for(const upgraded of [false,true]){
  const card=CATALOG_V18.cards[id],professionId=card.professionOnly??'traveler';
  const deck=[id,'slash','guard','shared_break','shared_fireline'].map((cardId,uid)=>({cardId,uid,upgraded:uid===0&&upgraded}));
  let b=beginBattle({enemyId:'lantern_rat',deck,professionId,relics:[],hp:30});
  Object.assign(b,{hand:structuredClone(deck).filter(e=>e.uid!==2),draw:[],discard:[structuredClone(deck[2])],exhaust:[],energy:5,hp:10,enemyHp:999,enemyMaxHp:999,enemyArmor:0,enemyShield:6,enemyBurn:6,mark:2,shield:8,burn:3,petHp:8,forge:6,intent:{kind:'guard',value:0}});
  if(id==='clock_tune'){b.pendingEchoes=[{cardId:'slash',definition:{...CATALOG_V18.cards.slash,cardId:'slash',uid:1,upgraded:false}}];b.echoCount=1;}
  const target=card.effects.some(e=>['discount_target','upgrade_target'].includes(e.kind))?1:undefined;
  assert.doesNotThrow(()=>{b=battleAction(b,{type:'PLAY',uid:0,...(target==null?{}:{targetUid:target})});},`${id} upgraded=${upgraded}`);
 }
});
