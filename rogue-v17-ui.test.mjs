import test from 'node:test';
import assert from 'node:assert/strict';
import { beginBattle, battleAction } from './rogue-battle-v17.mjs';
import { renderRogue, renderRogueEchoMenu, renderRogueReading, parseRogueAction } from './rogue-ui.mjs';
import { createRun, runAction, CURRENT_RULE_VERSION } from './rogue-run.mjs';
import { dispatchRogue } from './rogue-interactions.mjs';

function fixture(){
 const cards=['echoing_edge','slash','guard'];
 const deck=cards.map((cardId,uid)=>({uid,cardId,upgraded:false}));
 let battle=beginBattle({ruleVersion:CURRENT_RULE_VERSION,enemyId:'lantern_rat',deck,relics:[],hp:30,seed:'v17-ui'});
 battle.enemyHp=200;battle.enemyMaxHp=200;battle.enemyArmor=0;battle.enemyShield=0;
 battle.hand=deck.map(e=>({...e}));battle.draw=[];battle.discard=[];battle.exhaust=[];battle.energy=3;battle.plays=0;battle.turn=1;battle.intent={kind:'guard',value:0};
 battle=battleAction(battle,{type:'PLAY',uid:0});
 battle=battleAction(battle,{type:'PLAY',uid:1});
 const run=createRun({runId:'echo-ui',owner:'2',guild:'1',mode:'normal',seed:'echo-ui',professionId:'traveler',ruleVersion:CURRENT_RULE_VERSION,now:0});
 run.phase='BATTLE';run.room={type:'battle',enemyId:'lantern_rat'};run.battle=battle;run.version=4;
 return run;
}
let interactionId=0;
const interaction=(custom_id,values=[])=>({id:String(++interactionId),type:3,guild_id:'1',member:{user:{id:'2',username:'player'}},message:{flags:64},data:{custom_id,values}});

test('battle panel exposes a real echo button and describes how other synergies activate',()=>{
 const run=fixture(),panel=renderRogue(run);
 const buttons=panel.data.components.flatMap(row=>row.components).filter(component=>component.type===2);
 const use=buttons.find(component=>component.label==='使用回声');
 assert.ok(use);
 assert.equal(parseRogueAction(use.custom_id).ui,'echo');
 const rendered=JSON.stringify(panel.data);
 assert.match(rendered,/回声已蓄能/);
 assert.match(rendered,/可回声/);
 assert.match(JSON.stringify(renderRogueReading('guide',undefined,{run}).data),/不需要另按按钮/);
 assert.match(JSON.stringify(renderRogueReading('guide',undefined,{run}).data),/回声操作/);
});

test('echo button opens a private selector and selecting a card schedules it through the run dispatcher',()=>{
 let run=fixture();
 const service={guild:'1',resume(){return run;},act(p){run=runAction(run,p.action,1);return run;}};
 const main=renderRogue(run);
 const use=main.data.components.flatMap(row=>row.components).find(component=>component.type===2&&component.label==='使用回声');
 const menu=dispatchRogue(service,interaction(use.custom_id));
 assert.equal(menu.type,7);assert.equal(menu.data.embeds[0].title,'回声 · 选择联动牌');
 const picker=menu.data.components.flatMap(row=>row.components).find(component=>component.type===3);
 assert.ok(picker);assert.equal(picker.options.length,1);assert.equal(picker.options[0].value,'1');
 const parsed=parseRogueAction(picker.custom_id,['1']);
 assert.equal(parsed.action.type,'ECHO');assert.equal(parsed.action.uid,1);
 const result=dispatchRogue(service,interaction(picker.custom_id,['1']));
 assert.equal(result.type,7);assert.equal(run.battle.echoCount,1);assert.equal(run.battle.echoCharges,0);
 assert.equal(run.battle.pendingEchoes[0].cardId,'slash');
});

test('echo panel explains charge and automatic self-echo when no charge is ready',()=>{
 const run=fixture();run.battle.echoReady=false;run.battle.echoCharges=0;run.battle.echoEligibleUids=[];
 const panel=renderRogueEchoMenu(run);
 assert.match(JSON.stringify(panel.data),/“本牌回声”.*自动安排/);
 assert.equal(panel.data.components.flatMap(row=>row.components).some(component=>component.type===3),false);
});

test('echo candidates after 25 remain reachable through versioned private pagination',()=>{
 const run=fixture();
 run.battle.deck=Array.from({length:30},(_,uid)=>({uid,cardId:'slash',upgraded:false}));
 run.battle.echoEligibleUids=run.battle.deck.map(e=>e.uid);
 const first=renderRogueEchoMenu(run);
 const next=first.data.components.flatMap(r=>r.components).find(c=>c.label==='下一页');
 assert.ok(next);assert.equal(first.data.components[0].components[0].options.length,25);
 const service={guild:'1',resume(){return run;}};
 const second=dispatchRogue(service,interaction(next.custom_id));
 assert.deepEqual(second.data.components[0].components[0].options.map(o=>o.value),['25','26','27','28','29']);
 assert.match(second.data.embeds[0].description,/第2\/2页/);
});
