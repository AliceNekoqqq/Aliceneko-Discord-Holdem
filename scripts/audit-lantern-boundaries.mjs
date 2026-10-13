import assert from 'node:assert/strict';
import {beginBattle,battleAction,legalCards,legalEchoes} from '../rogue-battle.mjs';
import {getCatalog} from '../rogue-content.mjs';
const version=Number(process.argv.find(x=>x.startsWith('--version='))?.slice(10)??20);assert.ok([20,21].includes(version));const C=getCatalog('0.'+version);
const {NEW_TARGETS,supportTargetAllowed}=await import(`../rogue-card-effects-v${version}.mjs`);
import {renderRogue} from '../rogue-ui.mjs';
import {describeRogueImage} from '../rogue-image.mjs';
const report={plays:0,echoes:0,panels:0,issues:[]};
const profiles=[{hp:30,energy:3,shield:0,burn:0,enemyBurn:0,forge:0,petHp:0,mark:0,prepare:0},{hp:1,energy:5,shield:30,burn:20,enemyBurn:20,forge:12,petHp:12,mark:4,prepare:6},{hp:20,energy:3,shield:5,burn:3,enemyBurn:4,forge:3,petHp:5,mark:1,prepare:1}];
function invariant(b){const ids=['hand','draw','discard','exhaust'].flatMap(p=>b[p].map(c=>c.uid));assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,b.deck.length);assert.ok(b.hand.length<=5);assert.ok(b.energy>=0&&b.energy<=5);assert.ok(b.hp<=b.maxHp);for(const f of ['shield','enemyShield','petHp','forge','enemyBurn','burn','prepare','mark'])assert.ok(b[f]>=0,`${f} negative`);assert.ok(b.echoCount+b.echoCharges<=3);}
function checkPanel(b){const run={ruleVersion:b.ruleVersion,catalogVersion:C.version,professionId:b.professionId,runId:'audit',owner:'2',guild:'1',version:0,phase:'BATTLE',act:1,hp:b.hp,battle:b,deck:b.deck,relics:b.relics};const r=renderRogue(run);assert.equal(r.data.flags,64);assert.ok((r.data.embeds??[]).every(e=>(e.description?.length??0)<=4096));for(const row of r.data.components??[])for(const c of row.components??[])if(c.type===3)assert.ok(c.options.length<=25);const image=describeRogueImage(run);const legal=new Set(legalCards(b).map(e=>e.uid));assert.deepEqual(image.cards.filter(c=>c.playable).map(c=>c.id).sort(),[...legal].sort());report.panels++;}
for(const [id,card] of Object.entries(C.cards))for(const upgraded of [false,true]){
 if(upgraded&&!card.upgrade)continue;
 for(const profile of profiles){const p=card.professionOnly??'traveler';const cards=[id,'slash','guard','bandage','pierce','shared_bank','shared_breath'].map((cardId,uid)=>({cardId,uid,upgraded:uid===0&&upgraded}));let b=beginBattle({ruleVersion:'lantern-rules-v0.'+version,professionId:p,enemyId:'lantern_rat',deck:cards,relics:[],hp:30,seed:`${id}-${upgraded}`});Object.assign(b,{...profile,hand:structuredClone(cards.slice(0,5)),draw:structuredClone(cards.slice(5)),discard:[],exhaust:[],enemyHp:999,enemyMaxHp:999,enemyArmor:3,enemyShield:5,plays:0,result:null,intent:{kind:'guard',value:0},pendingEchoes:[],echoCount:0,echoCharges:0,echoReady:false,echoEligibleUids:[],battleFlags:[],turnFlags:[]});
 const def=upgraded?{...card,...card.upgrade}:card;
 if(id==='clock_tune'){b.pendingEchoes=[{cardId:'slash',definition:{...C.cards.slash,cardId:'slash',uid:1,upgraded:false}}];b.echoCount=1;}
 const targeted=def.effects.some(e=>['sift','retain','exhaust_other',...NEW_TARGETS].includes(e.kind));
 const targets=targeted?b.hand.filter(e=>e.uid!==0&&(!def.effects.some(e=>NEW_TARGETS.has(e.kind))||supportTargetAllowed(b,def,e,C))).map(e=>e.uid):[undefined];
 try{checkPanel(b);if(!legalCards(b).some(e=>e.uid===0))continue;
 for(const targetUid of targets){const n=battleAction(JSON.parse(JSON.stringify(b)),{type:'PLAY',uid:0,...(targetUid===undefined?{}:{targetUid})});invariant(n);report.plays++;if(!n.result){n.echoCharges=Math.min(1,3-n.echoCount);n.echoReady=n.echoCharges>0;n.echoEligibleUids=[0];for(const e of legalEchoes(n)){const z=battleAction(n,{type:'ECHO',uid:e.uid});invariant(z);const next=battleAction(JSON.parse(JSON.stringify(z)),{type:'END_TURN'});invariant(next);report.echoes++;}}}
 }catch(e){report.issues.push({id,upgraded,hp:profile.hp,error:e.message});}
 }
}
console.log(JSON.stringify(report));if(report.issues.length)process.exitCode=1;
