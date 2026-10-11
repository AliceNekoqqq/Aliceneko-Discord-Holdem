import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_V08,PROFESSIONS} from './rogue-content-v08.mjs';
import {PROFESSION_STORIES,WORLD_STORY} from './rogue-lore.mjs';
import {cardGroups,cardEffectLines,unavailableReason,battleHints} from './rogue-card-guide.mjs';
import {renderRogue,renderRogueReading,parseRogueAction} from './rogue-ui.mjs';
import {dispatchRogue} from './rogue-interactions.mjs';
import {beginBattle} from './rogue-battle-v08.mjs';

function fixture(){
 const deck=['slash','guard','a1_tamer_bite','a1_tamer_call','a1_forger_strike'].filter(id=>CATALOG_V08.cards[id]).map((cardId,uid)=>({cardId,uid,upgraded:false}));
 // Catalog-based selection keeps this fixture tied to real, supported mechanics.
 const fallback=Object.keys(CATALOG_V08.cards).slice(0,5).map((cardId,uid)=>({cardId,uid,upgraded:false}));
 const actual=deck.length?deck:fallback;
 const b=beginBattle({enemyId:CATALOG_V08.acts[0].normalPool[0],deck:actual,hp:30,relics:[],seed:'guidance',professionId:'traveler'});
 return {runId:'guide-run',version:1,phase:'BATTLE',professionId:'traveler',catalogVersion:'0.8',ruleVersion:'lantern-rules-v0.8',act:1,hp:30,embers:0,deck:actual,battle:b};
}
test('all real card and upgrade effects have readable categories and effect lines',()=>{
 for(const base of Object.values(CATALOG_V08.cards))for(const def of [base,{...base,...base.upgrade}]){
  assert.ok(cardGroups(def).length,base.name);
  const lines=cardEffectLines(def);assert.equal(lines.length,def.effects.length);
  for(let i=0;i<lines.length;i++)assert.ok(!lines[i].startsWith(def.effects[i].kind),base.name+':'+def.effects[i].kind);
 }
});
test('battle panel aligns duplicate UIDs, upgrade effects, targets and deadly self cost',()=>{
 const run=fixture(),b=run.battle;
 const attackId=Object.keys(CATALOG_V08.cards).find(id=>CATALOG_V08.cards[id].effects.some(e=>e.kind==='damage')&&CATALOG_V08.cards[id].upgrade);
 const riskId=Object.keys(CATALOG_V08.cards).find(id=>CATALOG_V08.cards[id].selfCost>0);
 b.hand=[{uid:11,cardId:attackId,upgraded:false},{uid:12,cardId:attackId,upgraded:true},{uid:13,cardId:riskId,upgraded:false}];
 b.energy=3;b.plays=0;b.hp=1;run.hp=1;
 const before=JSON.stringify(run),r=renderRogue(run),body=r.data.embeds[0].description;
 assert.match(body,/#11/);assert.match(body,/#12/);assert.match(body,/＋/);assert.match(body,/自损会倒下/);assert.doesNotMatch(body,/先看意图，再选牌/);assert.ok(r.data.components.flatMap(row=>row.components).some(c=>c.label==='手牌详情'));
 const opts=r.data.components.flatMap(row=>row.components).find(c=>c.type===3).options;
 assert.ok(opts.some(o=>o.value==='p:12:n'&&o.label.includes('＋')));
 assert.equal(JSON.stringify(run),before);
});
test('disabled pet/target cards and conditional-first-card guidance explain the real rule',()=>{
 const pet=Object.values(CATALOG_V08.cards).find(d=>d.effects.every(e=>e.kind==='pet_attack'||e.kind==='sacrifice'));
 assert.equal(unavailableReason({petHp:0,energy:3,plays:0,hand:[{}]},pet,3,new Set(),4),'需要存活的伙伴');
 const target={cost:1,effects:[{kind:'retain'}]};
 assert.equal(unavailableReason({energy:3,plays:0,hand:[{}]},target,3,new Set(),4),'没有合法目标');
 const hints=battleHints({plays:1,firstCardKind:'other',intent:{kind:'conditional'}},[],3).join('');
 assert.match(hints,/已选其他分支/);assert.match(hints,/还可打2张/);
});
test('world and eight individual stories are reachable through private read-only interactions',()=>{
 assert.deepEqual(Object.keys(PROFESSION_STORIES).sort(),Object.keys(PROFESSIONS).sort());
 assert.match(WORLD_STORY,/红豆粉小酒馆/);
 const run=fixture();let actions=0;
 const service={guild:'g',resume:()=>run,act(){actions++;throw Error('must not mutate');}};
 const i={id:'i',type:3,guild_id:'g',member:{user:{id:'u'}},message:{flags:64}};
 const before=JSON.stringify(run);
 for(const [id,story]of Object.entries(PROFESSION_STORIES)){
  const reply=dispatchRogue(service,{...i,data:{custom_id:`rl:lore:${id}`}});
  assert.equal(reply.type,7);assert.equal(reply.data.flags,64);assert.match(reply.data.embeds[0].description,new RegExp(story.motive));
  assert.deepEqual(parseRogueAction('rl:lore-profession',[id]),{ui:'reading',kind:'lore',professionId:id});
 }
 for(const kind of ['guide','lore']){
  const reply=dispatchRogue(service,{...i,data:{custom_id:`rl:guide-run:1:details:${kind}%3A0`}});
  assert.equal(reply.data.flags,64);assert.equal(reply.type,7);
 }
 assert.equal(actions,0);assert.equal(JSON.stringify(run),before);
 const guide=renderRogueReading('guide');assert.ok(guide.data.embeds[0].description.length<4096);
 assert.equal(parseRogueAction('rl:lore:no-such-role'),null);
});

test('chat knowledge uses the same lore and distinguishes tabletop characters from real tavern companions',async()=>{
 const {getBotKnowledge,BOT_KNOWLEDGE_MARKDOWN}=await import('./bot-knowledge.mjs');
 const selected=getBotKnowledge('灯下迷城 驯兽师 背景故事');
 assert.ok(selected.includes(PROFESSION_STORIES.tamer.background));
 assert.match(selected,/架空角色/);
 const {readFileSync}=await import('node:fs');
 assert.equal(readFileSync(new URL('./BOT_KNOWLEDGE.md',import.meta.url),'utf8'),BOT_KNOWLEDGE_MARKDOWN);
});
