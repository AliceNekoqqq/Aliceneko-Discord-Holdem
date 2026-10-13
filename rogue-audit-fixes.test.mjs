import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_V20 as C} from './rogue-content-v20.mjs';
import {hasUsefulUpgrade} from './rogue-upgrade-validity.mjs';
import {createRun,runAction,V20_RULE_VERSION as CURRENT_RULE_VERSION} from './rogue-run.mjs';
import {beginBattle,battleAction,legalCards} from './rogue-battle.mjs';
import {supportTargetAllowed} from './rogue-card-effects-v20.mjs';
import {renderRogue,rogueUidEligible} from './rogue-ui.mjs';
import {previewRogueDeckChange} from './rogue-build-guide.mjs';
import {intentLabel,intentDetail} from './rogue-image.mjs';
test('all catalog upgrade records checked; only gatebreak and status wound have no gameplay change',()=>{
 assert.deepEqual(Object.keys(C.cards).filter(id=>!hasUsefulUpgrade(C.cards[id])).sort(),['gatebreak','v07_wound']);assert.equal(hasUsefulUpgrade({...C.cards.guard,upgrade:{description:'different wording'}}),false);
});
test('camp, shop and event reject meaningless upgrades without consuming currency or room choice',()=>{
 for(const id of ['gatebreak','v07_wound'])for(const source of ['camp','shop','event']){
  const run=createRun({ruleVersion:CURRENT_RULE_VERSION,runId:'audit',owner:'2',guild:'1',professionId:'traveler',seed:'audit',now:0});run.deck.push({cardId:id,uid:99,upgraded:false});run.nextUid=100;run.embers=100;run.phase='ROOM';run.room=source==='camp'?{type:'camp',healAmount:9}:source==='shop'?{type:'shop',services:{upgrade:false,remove:false},stock:[],prices:{upgrade:15}}:{type:'event',choices:['upgrade'],upgradeCost:15};const before=JSON.stringify(run);const action={type:source.toUpperCase(),choice:'upgrade',uid:99};assert.throws(()=>runAction(run,action,0),e=>e.code==='NO_UPGRADE');assert.equal(JSON.stringify(run),before);assert.equal(rogueUidEligible(run,source,'upgrade',99),false);assert.equal(previewRogueDeckChange({...run,uid:99}).available,false);
 }
});
function setup(ids){const deck=ids.map((cardId,uid)=>({cardId,uid,upgraded:false}));const b=beginBattle({ruleVersion:CURRENT_RULE_VERSION,professionId:C.cards[ids[0]].professionOnly??'messenger',enemyId:'lantern_rat',deck,relics:[],hp:30,seed:'audit'});Object.assign(b,{hand:structuredClone(deck),draw:[],discard:[],exhaust:[],energy:5,plays:0,enemyHp:999,enemyMaxHp:999,result:null,intent:{kind:'guard',value:0}});return b;}
test('temporary upgrade target UI and server both exclude no-op cards, even when a discount would be possible',()=>{
 const b=setup(['mail_redirect','v07_wound','gatebreak','slash']);const def=C.cards.mail_redirect;assert.equal(supportTargetAllowed(b,def,b.hand[1],C),false);assert.equal(supportTargetAllowed(b,def,b.hand[2],C),false);assert.equal(supportTargetAllowed(b,def,b.hand[3],C),true);assert.throws(()=>battleAction(b,{type:'PLAY',uid:0,targetUid:1}),/不符合/);
 const run={ruleVersion:CURRENT_RULE_VERSION,catalogVersion:'0.20',professionId:'messenger',runId:'audit',owner:'2',guild:'1',version:0,phase:'BATTLE',act:1,hp:b.hp,battle:b,deck:b.deck,relics:[]};const menu=renderRogue(run).data.components.flatMap(r=>r.components).filter(c=>c.type===3).flatMap(c=>c.options).map(x=>x.value);assert.ok(menu.includes('p:0:t:3'));assert.equal(menu.includes('p:0:t:1'),false);assert.equal(menu.includes('p:0:t:2'),false);
 const only=setup(['mail_redirect','v07_wound']);assert.equal(legalCards(only).some(x=>x.uid===0),false);
});
test('echo calibration cannot spend its card on a queue head with a no-op upgrade',()=>{
 const b=setup(['clock_tune','slash']);b.pendingEchoes=[{cardId:'gatebreak',definition:{...C.cards.gatebreak,uid:99,cardId:'gatebreak',upgraded:false}}];b.echoCount=1;assert.equal(legalCards(b).some(x=>x.uid===0),false);
});
test('raster intent uses actual boosted damage and first-card branch wording',()=>{
 assert.equal(intentLabel({kind:'attack',label:'双翅拍击：4×2',value:6,hits:2}),'双翅拍击 6×2');assert.equal(intentLabel({kind:'attack',label:'重击8',value:10}),'重击 10×1');const text=intentDetail({kind:'conditional',onAttack:{kind:'attack',value:4},onOther:{kind:'guard',value:5}});assert.match(text,/首牌含直伤/);assert.doesNotMatch(text,/首张含直接伤害的牌/);
});
