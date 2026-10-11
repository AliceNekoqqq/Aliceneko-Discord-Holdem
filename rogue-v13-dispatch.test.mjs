import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, V13_RULE_VERSION, SUPPORTED_RULE_VERSIONS } from './rogue-run.mjs';
import { beginBattle } from './rogue-battle.mjs';
import { CATALOG_V12 } from './rogue-content-v12.mjs';
import { CATALOG_V13, getCatalog } from './rogue-content-v13.mjs';
import { dailySeedGroup } from './rogue-economy.mjs';

const versions = ['lantern-rules-v0.4','lantern-rules-v0.6','lantern-rules-v0.7','lantern-rules-v0.8','lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13'];

test('v13 dispatch keeps the full historical ruleset range and selects the v13 catalog', () => {
  assert.equal(V13_RULE_VERSION, 'lantern-rules-v0.13');
  for (const version of versions) assert(SUPPORTED_RULE_VERSIONS.includes(version), `${version} remains supported`);
  assert.equal(getCatalog('lantern-rules-v0.12'), CATALOG_V12);
  assert.equal(getCatalog('lantern-rules-v0.13'), CATALOG_V13);
  assert.equal(CATALOG_V12.version, '0.12');
  assert.equal(CATALOG_V13.version, '0.13');
  assert.notEqual(CATALOG_V13, CATALOG_V12);
});

test('run and battle routers dispatch v12 saves to frozen v12 implementations and v13 to v13', () => {
  const start = ruleVersion => createRun({runId:`dispatch-${ruleVersion}`,owner:'1',guild:'2',mode:'normal',seed:'dispatch',startDay:'2026-10-11',rewardEligible:false,now:0,ruleVersion,professionId:'traveler',difficulty:0,inventory:[]});
  const oldRun = start('lantern-rules-v0.12');
  const newRun = start('lantern-rules-v0.13');
  assert.equal(oldRun.ruleVersion, 'lantern-rules-v0.12');
  assert.equal(newRun.ruleVersion, 'lantern-rules-v0.13');
  assert.equal(oldRun.catalogVersion, '0.12');
  assert.equal(newRun.catalogVersion, '0.13');

  const deck = [{uid:1,cardId:'cinder_cut',upgraded:false}];
  for (const run of [oldRun,newRun]) {
    const battle = beginBattle({ruleVersion:run.ruleVersion,enemyId:'lantern_rat',deck,relics:[],hp:run.hp,seed:'dispatch',professionId:'traveler',difficulty:0,items:[]});
    assert.equal(battle.ruleVersion, run.ruleVersion);
  }
});

test('daily v13 enemy pool gets its own challenge seed namespace while v12 stays frozen', () => {
  const seed12 = dailySeedGroup('guild','2026-10-11','lantern-rules-v0.12',2);
  const seed13 = dailySeedGroup('guild','2026-10-11','lantern-rules-v0.13',2);
  assert.match(seed12,/v12-resources$/);
  assert.match(seed13,/v13-enemies$/);
  assert.notEqual(seed12,seed13);
  assert.equal(seed12,dailySeedGroup('guild','2026-10-11','lantern-rules-v0.12',2));
});
