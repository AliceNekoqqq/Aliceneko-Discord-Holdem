import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { beginBattle } from './rogue-battle.mjs';
import { renderRogue, renderRogueHome, renderRogueSettings, renderRogueBoard, renderRogueDetails, parseRogueAction } from './rogue-ui.mjs';
import { dispatchRogue } from './rogue-interactions.mjs';

const base = (patch = {}) => ({
  ruleVersion: 'lantern-rules-v0.7', catalogVersion: '0.7', runId: 'v07_run', version: 3,
  phase: 'ROOM', act: 1, slot: 1, hp: 26, embers: 20,
  deck: CATALOG.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false })),
  relics: [], room: { type: 'camp' }, ...patch,
});
const components = (m) => m.data.components.flatMap((r) => r.components);

test('home shows per-profession progress and daily difficulty while profession selection opens settings', () => {
  const home = renderRogueHome({ homeInfo: {
    progress: [{ professionId: 'traveler', unlocked: 2, clears: 4 }],
    challengeProfession: 'warden', challengeDifficulty: 3,
  } });
  const text = home.data.embeds[0].description;
  assert.match(text, /旅人 2\/10（通关4）/);
  assert.match(text, /每日挑战：守门人 · 难度3/);
  const select = components(home).find((c) => c.custom_id === 'rl:settings-profession');
  assert.ok(select.options.length > 1 && select.options.length <= 25);
  assert.deepEqual(parseRogueAction(select.custom_id, ['traveler']), { ui: 'settings', professionId: 'traveler', difficulty: 0 });
});

test('daily board identifies its server-fixed challenge difficulty', () => {
  assert.match(renderRogueBoard({ day: '2026-10-10', difficulty: 3, rows: [] }).data.embeds[0].description, /每日挑战难度：3/);
});

test('profession settings expose only unlocked difficulties and start tokens carry the selection', () => {
  const view = renderRogueSettings({ professionId: 'traveler', difficulty: 2, catalogVersion: '0.7', homeInfo: { progress: [{ professionId: 'traveler', unlocked: 2, clears: 5 }] } });
  assert.match(view.data.embeds[0].description, /2\/10 已解锁 · 通关 5 次/);
  assert.match(view.data.embeds[0].description, /0级 初灯：标准规则/);
  assert.match(view.data.embeds[0].description, /2级 长夜Ⅱ：继承前级/);
  const difficulty = components(view).find((c) => c.custom_id === 'rl:settings-difficulty:traveler');
  assert.deepEqual(difficulty.options.map((x) => x.value), ['0', '1', '2']);
  assert.deepEqual(parseRogueAction(difficulty.custom_id, ['1']), { ui: 'settings', professionId: 'traveler', difficulty: 1 });
  assert.deepEqual(parseRogueAction('rl:start:normal:traveler:2'), { ui: 'start', mode: 'normal', professionId: 'traveler', difficulty: 2 });
  assert.deepEqual(parseRogueAction('rl:practice:normal:traveler:2'), { ui: 'practice', mode: 'normal', professionId: 'traveler', difficulty: 2 });
  assert.deepEqual(parseRogueAction('rl:start:challenge'), { ui: 'start', mode: 'challenge' });
  assert.equal(parseRogueAction('rl:start:challenge:traveler:2'), null);
});

test('v07 battle displays five-card hand, three-play limit, difficulty and 15-station progress', () => {
  const deck = CATALOG.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false }));
  const battle = beginBattle({ ruleVersion: 'lantern-rules-v0.6', enemyId: 'lantern_rat', deck, relics: [], hp: 30, seed: 'ui-v07' });
  battle.hand = deck.slice(0, 5); battle.energy = 3; battle.plays = 2;
  const view = renderRogue(base({ phase: 'BATTLE', difficulty: 4, completed: 7, battle }));
  const description = view.data.embeds[0].description;
  assert.match(description, /已出牌 2\/3/);
  assert.match(description, /站点 8\/15 · 难度4/);
  assert.match(description, /手牌：/);
  assert.ok(components(view).some((c) => c.custom_id.endsWith(':play-target')));
});

test('route nodes preserve saved choices and map pages include chosen path plus future slots', () => {
  const nodes = [
    { id: 'n0', type: 'normal', title: '灰鼠巷', description: '一队敌人守着窄巷。', enemyId: 'lantern_rat', dangerous: true },
    { id: 'n1', type: 'event', title: '夜诊棚', description: '花余烬换取治疗。', eventId: 'night_clinic' },
    { id: 'n2', type: 'shop', title: '旧街商铺', description: '补充装备。' },
  ];
  const slots = Array.from({ length: 4 }, (_, slot) => [
    { id: `a1s${slot + 1}n0`, type: 'normal', title: `未来路线${slot + 1}`, description: '保存的分支。', enemyId: 'lantern_rat' },
    { id: `a1s${slot + 1}n1`, type: 'event', title: `事件${slot + 1}`, description: '保存事件说明。', eventId: 'night_clinic' },
    { id: `a1s${slot + 1}n2`, type: 'camp', title: `营地${slot + 1}`, description: '恢复生命。' },
  ]);
  const mapPlan = Array.from({ length: 3 }, (_, act) => ({ act: act + 1, nodes: slots.map((set) => set.map((n) => ({ ...n, id: n.id.replace('a1', `a${act + 1}`) }))) }));
  const run = base({ phase: 'ROUTE', room: { type: 'route', nodes, choices: nodes.map((n) => n.id) }, mapPlan, bosses: ['dark_lady', 'mirror_magistrate', 'bell_colossus'],
    path: [{ act: 1, slot: 1, nodeId: 'old-node', type: 'normal', enemyId: 'lantern_rat' }] });
  const route = renderRogue(run);
  assert.equal(route.data.embeds[0].fields[0].name, '① 灰鼠巷 · 危险战斗');
  assert.match(route.data.embeds[0].fields[0].value, /基础属性：生命/);
  assert.deepEqual(parseRogueAction(components(route).find((c) => c.label.includes('夜诊棚')).custom_id).action, { type: 'ROUTE', choice: 'n1' });
  const seen = [];
  const pages = Math.ceil((3 * (4 * 4 + 2)) / 12);
  for (let page = 0; page < pages; page++) seen.push(renderRogueDetails(run, 'map', { page }).data.embeds[0].description);
  assert.match(seen.join('\n'), /已选 normal/);
  assert.match(seen.join('\n'), /未来路线4/);
  assert.match(seen.join('\n'), /幕末Boss战/);
  assert.match(seen.join('\n'), /第3幕/);
});

test('route only enables choices allowed by the service and explains disabled node reason', () => {
  const nodes = [
    { id: 'a1s4n0', type: 'camp', title: '超额营地', description: '不能再休息。', available: false, disabledReason: '本幕营地次数已达上限' },
    { id: 'a1s4n1', type: 'elite', title: '精英', description: 'Boss前的战斗。', available: true },
    { id: 'a1s4n2', type: 'shop', title: '商店', description: '不可达。', available: false, disabledReason: 'Boss前至少完成一场战斗' },
  ];
  const view = renderRogue(base({ phase: 'ROUTE', room: { type: 'route', nodes, choices: ['a1s4n1'] } }));
  const buttons = components(view).filter((c) => c.custom_id.includes(':route:'));
  assert.deepEqual(buttons.filter(b => !b.disabled).map((b) => b.custom_id), ['rl:v07_run:3:route:a1s4n1']);
  assert.match(view.data.embeds[0].fields[0].value, /本幕营地次数已达上限/);
  assert.match(view.data.embeds[0].fields[2].value, /首领前至少完成一场战斗/);
});

test('battle shows second phase intent activation on the following round', () => {
  const battle = { enemyId: 'dark_lady', enemyHp: 30, enemyArmor: 2, enemyShield: 5, enemyBurn: 0,
    enemyPhase: 2, phaseStartTurn: 4, turn: 3, hand: [], energy: 3, plays: 0, shield: 0, result: null };
  const view = renderRogue(base({ phase: 'BATTLE', battle }));
  assert.match(view.data.embeds[0].description, /第二阶段已触发：敌人获得阶段护盾；新阶段意图从第4轮开始生效/);
});

test('shop reads authoritative room prices and event UID operations require a separate confirmation', () => {
  const shop = renderRogue(base({ room: {
    type: 'shop', stock: ['slash'], itemStock: ['tonic'], services: { upgrade: false, remove: false },
    prices: { cardByEnergy: { 1: 17, 2: 21 }, upgrade: 19, remove: 15, item: 13 },
  } }));
  assert.match(shop.data.embeds[0].description, /1能量牌17余烬/);
  assert.match(shop.data.embeds[0].description, /升级19余烬；移除15余烬；道具13余烬/);
  assert.ok(components(shop).some((c) => c.custom_id.endsWith(':shop-item') && /13余烬/.test(c.placeholder)));

  const run = base({ room: { type: 'event', title: '抄手', description: '选一张牌升级。', choices: ['upgrade', 'remove', 'gain', 'leave'], upgradeCost: 8, removeCost: 9, emberAmount: 7 } });
  const event = renderRogue(run);
  const open = components(event).find((c) => c.custom_id.includes(':uid-page:'));
  const service = { guild: 'guild', resume: () => run };
  const page = dispatchRogue(service, { type: 3, guild_id: 'guild', member: { user: { id: 'player' } }, message: { flags: 64 }, data: { custom_id: open.custom_id } });
  const target = components(page).find((c) => c.type === 3);
  assert.deepEqual(parseRogueAction(target.custom_id, ['0']), { ui: 'uid-select', runId: 'v07_run', version: 3, source: 'event', kind: 'upgrade', uid: 0 });
  const confirmation = dispatchRogue(service, { type: 3, guild_id: 'guild', member: { user: { id: 'player' } }, message: { flags: 64 }, data: { custom_id: target.custom_id, values: ['0'] } });
  assert.equal(confirmation.type, 7);
  assert.match(confirmation.data.embeds[0].description, /支付8余烬/);
  assert.deepEqual(parseRogueAction(components(confirmation)[0].custom_id).action, { type: 'EVENT', choice: 'upgrade', uid: 0 });
  assert.deepEqual(parseRogueAction('rl:v07_run:3:event-remove-confirm:1').action, { type: 'EVENT', choice: 'remove', uid: 1 });
  assert.deepEqual(parseRogueAction('rl:v07_run:3:event-gain').action, { type: 'EVENT', choice: 'gain' });
});

test('homeInfo and explicit normal difficulty reach the service on settings and start', () => {
  const run = base(); let seenInfo, seenStart;
  const service = { guild: 'guild', resume: () => null, homeInfo: (identity) => { seenInfo = identity; return { progress: [{ professionId: 'traveler', unlocked: 2, clears: 1 }], challengeProfession: 'traveler', challengeDifficulty: 3 }; }, start: (request) => { seenStart = request; return run; } };
  const interaction = { id: 'request', type: 3, guild_id: 'guild', member: { user: { id: 'player', username: 'P' } }, message: { flags: 64 }, data: { custom_id: 'rl:settings:traveler' } };
  const settings = dispatchRogue(service, interaction);
  assert.equal(settings.type, 7);
  assert.deepEqual(seenInfo, { guild: 'guild', id: 'player' });
  const started = dispatchRogue(service, { ...interaction, data: { custom_id: 'rl:practice:normal:traveler:2' } });
  assert.equal(started.type, 7);
  assert.equal(seenStart.professionId, 'traveler');
  assert.equal(seenStart.difficulty, 2);
  assert.equal(seenStart.practice, true);
});
