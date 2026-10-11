import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,V10_RULE_VERSION as CURRENT_RULE_VERSION} from './rogue-run.mjs';
import {PROFESSIONS} from './rogue-content-v10.mjs';
import {renderRogue,renderRogueDetails} from './rogue-ui.mjs';
const body=r=>r.data.embeds[0].description;
test('all eight v10 professions show bounded factual directions and counters without mutating saves',()=>{
 for(const professionId of Object.keys(PROFESSIONS)){
  const r=createRun({runId:'p1',owner:'1',guild:'1',seed:'p1-ui',professionId,ruleVersion:CURRENT_RULE_VERSION,now:0});
  r.effectMetrics={healing:2,overheal:3,shieldAbsorbed:4,prepareConsumed:5};
  const original=JSON.stringify(r),b=body(renderRogueDetails(r,'deck'));
  assert.match(b,/构筑方向/);assert.match(b,/治疗/);assert.match(b,/盾/);assert.ok(b.length<4096);assert.equal(JSON.stringify(r),original);
 }
});
test('v10 rewards allow no recommendation and display actual candidates rather than inventing pieces',()=>{
 const r=createRun({runId:'p1',owner:'1',guild:'1',seed:'p1-ui',professionId:'medic',ruleVersion:CURRENT_RULE_VERSION,now:0});
 r.phase='REWARD';r.reward={queue:[{kind:'card',candidates:['field_wrap','trail_cut','quiet_hour']}],selections:{card:null},recommendedCard:null};
 const b=body(renderRogue(r));assert.match(b,/暂无明确补强参考/);assert.match(b,/默认跳过/);assert.match(b,/候选用途/);assert.ok(b.length<4096);
});
