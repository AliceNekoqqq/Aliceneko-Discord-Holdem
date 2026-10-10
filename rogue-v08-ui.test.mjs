import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_V08, EVENTS, PROFESSIONS } from './rogue-content-v08.mjs';
import { CATALOG_V07 } from './rogue-content-v07.mjs';
import { renderRogue, renderRogueDetails, renderRogueSettings, parseRogueAction } from './rogue-ui.mjs';
import { dispatchRogue } from './rogue-interactions.mjs';

const components = (view) => view.data.components.flatMap((row) => row.components);
const base = (patch = {}) => ({
  catalogVersion: '0.8', ruleVersion: 'lantern-rules-v0.8', runId: 'v08_ui', version: 7,
  phase: 'ROOM', act: 1, slot: 2, hp: 24, maxHp: 30, embers: 30,
  professionId: 'traveler', deck: Array.from({ length: 50 }, (_, uid) => ({ uid, cardId: 'slash', upgraded: false })),
  relics: [], inventory: [], room: { type: 'camp', healAmount: 8 }, story: { debtBattles: 2, campPenalty: 2, weakenedBossActs: [1], history: [] },
  ...patch,
});
const interaction = (custom_id, values = []) => ({ type: 3, id: 'request', guild_id: 'guild', member: { user: { id: 'player', username: 'P' } },
  message: { flags: 64 }, data: { custom_id, values } });
const makeService = (run, seen = []) => ({ guild: 'guild', resume: () => run, act: (request) => { seen.push(request.action); return run; } });

test('50 entity UIDs are reachable through versioned camp pages and pages reject cross-room or stale requests', () => {
  const run = base(); const seen = []; const service = makeService(run, seen);
  const page0 = dispatchRogue(service, interaction('rl:v08_ui:7:uid-page:camp:upgrade:0'));
  const page1 = dispatchRogue(service, interaction('rl:v08_ui:7:uid-page:camp:upgrade:1'));
  const select0 = components(page0).find((c) => c.type === 3);
  const select1 = components(page1).find((c) => c.type === 3);
  assert.equal(select0.options.length, 25);
  assert.equal(select1.options.length, 25);
  const ids = [...select0.options, ...select1.options].map((option) => option.value);
  assert.equal(new Set(ids).size, 50);
  for (const uid of ids) {
    const selected = dispatchRogue(service, interaction(select0.custom_id, [uid]));
    assert.equal(selected.type, 7); // camp action is submitted to the authoritative service
  }
  assert.deepEqual(seen.map((action) => action.uid), Array.from({ length: 50 }, (_, i) => i));
  assert.match(dispatchRogue(service, interaction('rl:v08_ui:6:uid-page:camp:upgrade:0')).data.content, /过期/);
  const battle = base({ phase: 'BATTLE', room: { type: 'battle' } });
  assert.match(dispatchRogue(makeService(battle), interaction('rl:v08_ui:7:uid-page:camp:upgrade:0')).data.content, /当前房间/);
});

test('v08 reward panel combines kinds, exposes one confirmation, and parses candidate changes separately', () => {
  const run = base({ phase: 'REWARD', reward: { source: 'normal', index: 0, completed: false, queue: [
    { kind: 'card', candidates: ['trail_cut', 'trail_mark'] },
    { kind: 'relic', candidates: ['cinder_scoop'] },
    { kind: 'item', candidates: ['ember_flare_item'] },
  ], selections: { card: 'trail_cut', relic: 'cinder_scoop', item: { id: 'ember_flare_item', replaceIndex: null } } } });
  const view = renderRogue(run); const all = components(view);
  assert.match(view.data.embeds[0].description, /新卡：沿街斩（推荐默认）/);
  assert.match(view.data.embeds[0].description, /遗物：余烬小铲（推荐默认）/);
  assert.match(view.data.embeds[0].description, /余烬信号弹/);
  assert.equal(all.filter((component) => component.type === 3).length, 3);
  assert.deepEqual(all.filter((component) => component.type === 2 && component.label.includes('确认领取')).map((component) => component.label), ['确认领取推荐组合']);
  const cardMenu = all.find((component) => component.custom_id.endsWith(':reward-select:card'));
  assert.deepEqual(parseRogueAction(cardMenu.custom_id, ['trail_mark']).action, { type: 'REWARD_SELECT', kind: 'card', choice: 'trail_mark' });
  const itemMenu = all.find((component) => component.custom_id.endsWith(':reward-select:item'));
  assert.deepEqual(parseRogueAction(itemMenu.custom_id, ['ember_flare_item:-1']).action, { type: 'REWARD_SELECT', kind: 'item', choice: 'ember_flare_item', replaceIndex: null });
  assert.deepEqual(parseRogueAction(all.find((component) => component.label === '确认领取推荐组合').custom_id).action, { type: 'REWARD_CLAIM' });
  assert.deepEqual(parseRogueAction(all.find((component) => component.label === '跳过全部奖励').custom_id).action, { type: 'REWARD_SKIP' });
  const seen = [];
  dispatchRogue(makeService(run, seen), interaction(cardMenu.custom_id, ['trail_mark']));
  dispatchRogue(makeService(run, seen), interaction(all.find((component) => component.label === '确认领取推荐组合').custom_id));
  assert.deepEqual(seen.map((action) => action.type), ['REWARD_SELECT', 'REWARD_CLAIM']);
});

test('pact metadata requires a confirmation and clearly describes the deferred cost and relic candidate', () => {
  const pact = EVENTS.find((entry) => entry.eventId === 'sealed_relic');
  const run = base({ room: { type: 'event', ...structuredClone(pact), relicCandidate: 'cinder_scoop' } });
  const event = renderRogue(run);
  const text = event.data.embeds[0].description;
  assert.match(text, /以4点生命换取一件尚未拥有的遗物/);
  assert.match(text, /之后营地基础治疗-2/);
  assert.match(text, /余烬小铲/);
  const ask = components(event).find((component) => component.custom_id.endsWith(':event-pact-ask'));
  const confirm = dispatchRogue(makeService(run), interaction(ask.custom_id));
  assert.equal(confirm.type, 7);
  assert.match(confirm.data.embeds[0].description, /确认后会接受契约并提升后续战斗强度/);
  assert.deepEqual(parseRogueAction(components(confirm)[0].custom_id).action, { type: 'EVENT', choice: 'pact' });
});

test('v08 impact status and enemy phase name are visible, while v07 still uses its staged reward panel and catalog', () => {
  const battle = base({ phase: 'BATTLE', room: { type: 'battle', storyEffect: '借火债：本战每段攻击+1；本幕Boss生命减少15%' },
    battle: { enemyId: 'dark_lady', enemyHp: 100, enemyArmor: 0, enemyShield: 0, enemyBurn: 0, enemyPhase: 2, turn: 3, phaseStartTurn: 3, phaseName: '黑烛盛典', intent: { kind: 'attack', value: 13, hits: 1, label: '黑烛焚击' }, hand: [], energy: 3, plays: 0, shield: 0 } });
  const battleText = renderRogue(battle).data.embeds[0].description;
  assert.match(battleText, /敌人阶段：黑烛盛典/);
  assert.match(battleText, /本战影响：借火债/);
  assert.match(battleText, /后续2场战斗敌人攻击\+1/);
  const old = { catalogVersion: '0.7', ruleVersion: 'lantern-rules-v0.7', runId: 'old_ui', version: 3, phase: 'REWARD', act: 1, slot: 1,
    hp: 20, embers: 0, deck: CATALOG_V07.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false })), relics: [], inventory: [],
    reward: { index: 0, queue: [{ kind: 'card', candidates: ['slash', 'pierce'] }] } };
  const oldView = renderRogue(old); const oldComponents = components(oldView);
  assert.match(oldView.data.embeds[0].description, /选择一项或跳过/);
  assert.ok(oldComponents.some((component) => component.custom_id.endsWith(':reward')));
  assert.ok(!oldComponents.some((component) => component.custom_id.includes(':reward-select:')));
  const oldRelic = renderRogueDetails({ ...old, relics: ['cinder_scoop'] }, 'relics').data.embeds[0].description;
  const newRelic = renderRogueDetails({ ...old, catalogVersion: '0.8', relics: ['cinder_scoop'] }, 'relics').data.embeds[0].description;
  assert.match(oldRelic, /以护盾挡住攻击/);
  assert.match(newRelic, /用护盾挡住敌方攻击/);
  const progress = { progress: [{ professionId: 'traveler', unlocked: 10 }] };
  assert.match(renderRogueSettings({ professionId: 'traveler', difficulty: 10, homeInfo: progress, catalogVersion: '0.8' }).data.embeds[0].description, /Boss生命65%时提前转阶段/);
  assert.match(renderRogueSettings({ professionId: 'traveler', difficulty: 10, homeInfo: progress, catalogVersion: '0.8' }).data.embeds[0].description, /全敌人生命系数累计40%/);
  assert.doesNotMatch(renderRogueSettings({ professionId: 'traveler', difficulty: 10, homeInfo: progress, catalogVersion: '0.7' }).data.embeds[0].description, /全敌人生命系数累计40%/);
  assert.equal(CATALOG_V08.version, '0.8');
  assert.ok(PROFESSIONS.traveler);
});

