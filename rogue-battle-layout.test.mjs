import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,runAction,CURRENT_RULE_VERSION} from './rogue-run.mjs';
import {renderRogue,renderRogueDetails,parseRogueAction} from './rogue-ui.mjs';
import {rogueVisualResponse} from './rogue-presentation.mjs';

function battle(){
 let r=createRun({runId:'layout',guild:'1',owner:'2',seed:'layout',ruleVersion:CURRENT_RULE_VERSION,now:0});
 r=runAction(r,{type:'BLESSING',relicId:null},1);
 return runAction(r,{type:'ROUTE',choice:r.room.nodes.find(n=>n.type==='normal').id},2);
}
test('battle overview has short grouped hand and no repeated tutorial; details preserve full card rules',()=>{
 const r=battle(),before=JSON.stringify(r);const view=renderRogue(r),b=view.data.embeds[0].description;
 assert.match(b,/\*\*意图\*\*/);assert.match(b,/\*\*手牌：\*\*/);
 assert.doesNotMatch(b,/伙伴生命0|先看意图，再选牌|架盾 0|灼烧 0/);
 assert.ok(b.length<900);
 assert.equal(parseRogueAction('rl:layout:0:details:hand%3A0').kind,'hand');
 const detail=renderRogueDetails(r,'hand');assert.match(detail.data.embeds[0].description,/可回声/);
 assert.equal(JSON.stringify(r),before);
});
test('battle image appears before operation text; render failure restores usable single text panel',async()=>{
 const run=battle();let actions=0;
 const service={guild:'1',resume:()=>run,act:()=>{actions++;throw Error('read only');}};
 const interaction={id:'3',type:2,guild_id:'1',member:{user:{id:'2'}}};
 const response=await rogueVisualResponse(service,interaction,{render:async()=>new Blob(['png'],{type:'image/png'})});
 const form=await response.formData(),data=JSON.parse(form.get('payload_json'));
 assert.equal(data.embeds.length,2);assert.ok(data.embeds[0].image);assert.equal(data.embeds[0].description,undefined);
 assert.match(data.embeds[1].description,/\*\*意图\*\*/);assert.ok(data.components.length<=5);
 const fallback=await rogueVisualResponse(service,interaction,{render:()=>{throw Error('image unavailable');}});
 const f=await fallback.json();assert.equal(f.data.embeds.length,1);assert.match(f.data.embeds[0].description,/\*\*意图\*\*/);
 assert.ok(f.data.components.length);assert.equal(actions,0);
});
