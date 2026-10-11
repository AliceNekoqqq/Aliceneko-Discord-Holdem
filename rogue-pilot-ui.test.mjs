import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,V09_RULE_VERSION as CURRENT_RULE_VERSION,V08_RULE_VERSION} from './rogue-run.mjs';
import {renderRogue,renderRogueDetails,renderRogueUidPage} from './rogue-ui.mjs';
const fresh=(professionId='messenger',ruleVersion=CURRENT_RULE_VERSION)=>createRun({runId:'pilot',owner:'1',guild:'1',seed:'pilot-901',professionId,ruleVersion,now:0});
const body=r=>r.data.embeds[0].description;

test('pilot deck clues and previews respect version and entity; UI does not mutate saves',()=>{
 const r=fresh();const original=JSON.stringify(r);
 assert.match(body(renderRogueDetails(r,'deck')),/构筑线索/);
 const preview=renderRogueUidPage(r,'camp','upgrade');
 assert.match(body(preview),/升级前/);assert.match(body(preview),/升级后/);
 assert.ok(preview.data.components[0].components[0].options.length<=5);
 assert.equal(JSON.stringify(r),original);
 const old=fresh('messenger',V08_RULE_VERSION);
 assert.doesNotMatch(body(renderRogueDetails(old,'deck')),/构筑线索/);
 assert.doesNotMatch(body(renderRogueUidPage(old,'camp','upgrade')),/升级后/);
});
test('actual reward candidates have factual explanations; result with no record makes no inferred claim',()=>{
 const r=fresh('medic');r.phase='REWARD';r.reward={queue:[{kind:'card',candidates:['field_wrap','trail_cut','quiet_hour']}],selections:{card:'field_wrap'}};
 const b=body(renderRogue(r));assert.match(b,/候选用途/);assert.match(b,/医师徽章/);assert.ok(b.length<4096);
 r.phase='RESULT';r.result={type:'DEFEAT',reason:'LOST_LIGHT'};
 const result=body(renderRogue(r));assert.match(result,/12轮/);assert.doesNotMatch(result,/本局记录/);
});
