import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './rogue-catalog.mjs';
import { beginBattle } from './rogue-battle.mjs';
import { renderRogue, renderRogueConfirmation, renderRogueHome, renderRogueBoard, parseRogueAction } from './rogue-ui.mjs';

const base = (patch = {}) => ({ runId: 'run_123', version: 7, phase: 'ROOM', act: 3, hp: 18, embers: 20, deck: CATALOG.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false })), relics: [], room: { type: 'camp' }, ...patch });
function checkLimits(message) {
  assert.equal(message.data.flags, 64);
  assert.deepEqual(message.data.allowed_mentions, { parse: [] });
  assert.ok(message.data.components.length <= 5);
  for (const r of message.data.components) {
    assert.ok(r.components.length <= 5);
    assert.ok(r.components.filter((c) => c.type === 3).length <= 1);
    for (const c of r.components) {
      assert.ok(c.custom_id.length <= 100);
      if (c.type === 2) assert.ok(c.label.length <= 80);
      if (c.type === 3) assert.ok(c.options.length <= 25);
    }
  }
}

test('global tokens parse exactly; malformed and unknown tokens reject', () => {
  assert.deepEqual(parseRogueAction('rl:home'), { ui: 'home' });
  assert.deepEqual(parseRogueAction('rl:start:challenge'), { ui: 'start', mode: 'challenge' });
  assert.deepEqual(parseRogueAction('rl:practice:normal'), { ui: 'practice', mode: 'normal' });
  assert.deepEqual(parseRogueAction('rl:board'), { ui: 'board' });
  assert.equal(parseRogueAction('rl:start:other'), null);
  assert.equal(parseRogueAction('rl:x:1:bogus'), null);
  assert.equal(parseRogueAction('xx:run:7:play:0'), null);
  assert.equal(parseRogueAction('x'.repeat(101)), null);
});

test('renderer uses private legacy panels and respects component limits', () => {
  for (const m of [renderRogueHome(), renderRogueBoard({ rows: [] }), renderRogue(base()), renderRogue(base({ phase: 'ROUTE', room: { type: 'route', choices: ['camp', 'elite'] } }))]) {
    assert.equal(m.type, 4); checkLimits(m);
  }
  assert.equal(renderRogue(base(), { update: true }).type, 7);
});

test('duplicate card names use distinct entity UIDs and cards describe costs/effects', () => {
  const b = beginBattle({ enemyId: 'lantern_rat', deck: [0, 1, 2, 3, 4, 5, 6, 7].map((uid) => ({ uid, cardId: uid < 3 ? 'slash' : 'guard', upgraded: false })), relics: [], hp: 30, seed: 'ui' });
  b.hand = [{ uid: 10, cardId: 'slash', upgraded: false }, { uid: 11, cardId: 'slash', upgraded: false }];
  b.draw = []; b.turn = 1;
  const m = renderRogue(base({ phase: 'BATTLE', battle: b }));
  const ids = m.data.components.flatMap((r) => r.components).filter((c) => c.custom_id.includes(':play:')).map((c) => c.custom_id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(ids.map((id) => parseRogueAction(id).action.uid), [10, 11]);
  assert.match(m.data.embeds[0].description, /伤害6/);
  checkLimits(m);
});

test('four-card hand retains every play button and shared controls within five rows', () => {
  const deck = CATALOG.starterDeck.map((cardId, uid) => ({ uid, cardId, upgraded: false }));
  const b = beginBattle({ enemyId: 'lantern_rat', deck, relics: [], hp: 30, seed: 'four' });
  b.hand = deck.slice(0, 4); b.energy = 2; b.turn = 2;
  const m = renderRogue(base({ phase: 'BATTLE', completed: 2, act: 1, battle: b }));
  const all = m.data.components.flatMap((r) => r.components);
  const plays = all.filter((c) => c.custom_id.includes(':play:'));
  assert.equal(plays.length, 4);
  assert.ok(all.some((c) => c.custom_id.endsWith(':end')));
  assert.ok(all.some((c) => c.custom_id.endsWith(':refresh')));
  assert.ok(all.some((c) => c.custom_id.endsWith(':ask-abandon')));
  assert.match(m.data.embeds[0].description, /站点 3\/9/);
  assert.match(m.data.embeds[0].description, /距失灯 10轮/);
  checkLimits(m);
});

test('battle panel distinguishes pure full-health healing from mixed effects', () => {
  const deck = [
    { uid: 0, cardId: 'bandage', upgraded: false },
    { uid: 1, cardId: 'a3_counterweight', upgraded: false },
    ...CATALOG.starterDeck.map((cardId, i) => ({ uid: i + 2, cardId, upgraded: false })),
  ];
  const b = beginBattle({ enemyId: 'lantern_rat', deck, relics: [], hp: 30, seed: 'full' });
  b.hand = [{ uid: 0, cardId: 'bandage', upgraded: false }, { uid: 1, cardId: 'a3_counterweight', upgraded: false }];
  b.energy = 2;
  const m = renderRogue(base({ phase: 'BATTLE', hp: 30, battle: b }));
  const buttons = m.data.components.flatMap((r) => r.components).filter((c) => c.custom_id.includes(':play:'));
  assert.equal(buttons[0].disabled, true);
  assert.notEqual(buttons[1].disabled, true);
  assert.match(m.data.embeds[0].description, /生命已满，纯治疗牌不可用/);
});

test('retreat and abandon require a confirmation screen and explicit confirmed action', () => {
  const run = base({ phase: 'CHECKPOINT', room: { type: 'checkpoint', completedAct: 1 } });
  const ask = parseRogueAction('rl:run_123:7:ask-retreat');
  assert.deepEqual(ask, { ui: 'ask-retreat', runId: 'run_123', version: 7 });
  const confirm = renderRogueConfirmation(run, 'retreat'); checkLimits(confirm);
  assert.deepEqual(parseRogueAction(confirm.data.components[0].components[0].custom_id).action, { type: 'RETREAT', confirmed: true });
  const abandon = renderRogueConfirmation(run, 'abandon');
  assert.deepEqual(parseRogueAction(abandon.data.components[0].components[0].custom_id).action, { type: 'ABANDON', confirmed: true });
});

test('shop and event have free leave; event payment waits for a confirmation panel', () => {
  const shop = renderRogue(base({ room: { type: 'shop', stock: ['slash'], services: { upgrade: false, remove: false } } }));
  const leaveShop = shop.data.components.flatMap((r) => r.components).find((c) => c.custom_id.endsWith(':shop-leave')).custom_id;
  assert.deepEqual(parseRogueAction(leaveShop).action, { type: 'SHOP', choice: 'leave' });
  const event = renderRogue(base({ room: { type: 'event', candidates: ['a3_knell_arc'] } }));
  const leaveEvent = event.data.components.flatMap((r) => r.components).find((c) => c.custom_id.endsWith(':event-leave')).custom_id;
  assert.deepEqual(parseRogueAction(leaveEvent).action, { type: 'EVENT', choice: 'leave' });
  const askHeal = parseRogueAction(event.data.components[0].components[0].custom_id);
  assert.equal(askHeal.ui, 'event-confirm');
  const askCard = parseRogueAction(event.data.components[1].components[0].custom_id, ['a3_knell_arc']);
  assert.deepEqual(askCard, { ui: 'event-confirm', runId: 'run_123', version: 7, kind: 'card', cardId: 'a3_knell_arc' });
  const payment = renderRogueConfirmation(base(), { type: 'event-card', cardId: 'a3_knell_arc' });
  assert.match(payment.data.embeds[0].description, /1能量/);
  assert.match(payment.data.embeds[0].description, /伤害3、护盾4/);
  assert.deepEqual(parseRogueAction(payment.data.components[0].components[0].custom_id).action, { type: 'EVENT', choice: 'card', cardId: 'a3_knell_arc' });
  assert.match(event.data.embeds[0].title, /钟楼/);
});

test('board shows supplied tied ranks without substituting row position', () => {
  const m = renderRogueBoard({ rows: [
    { rank: 1, name: '甲', score: 20 },
    { rank: 1, name: '乙', score: 20 },
    { rank: 3, score: 10 },
  ] });
  assert.match(m.data.embeds[0].description, /1\. 甲/);
  assert.match(m.data.embeds[0].description, /1\. 乙/);
  assert.match(m.data.embeds[0].description, /3\. 旅人/);
  checkLimits(m);
});

test('every live room and reward exposes refresh plus abandon control', () => {
  const runs = [
    base({ room: { type: 'blessing', candidates: ['tinder'] } }),
    base({ phase: 'ROUTE', room: { type: 'route', choices: ['camp', 'elite'] } }),
    base({ room: { type: 'camp' } }),
    base({ room: { type: 'shop', stock: ['slash'], services: { upgrade: false, remove: false } } }),
    base({ room: { type: 'event', candidates: ['a3_knell_arc'] } }),
    base({ phase: 'REWARD', reward: { queue: [{ kind: 'card', candidates: ['kindle'], done: false }], index: 0 } }),
  ];
  for (const run of runs) {
    const all = renderRogue(run).data.components.flatMap((r) => r.components);
    assert.ok(all.some((c) => c.custom_id.endsWith(':refresh')), run.room?.type);
    assert.ok(all.some((c) => c.custom_id.endsWith(':ask-abandon')), run.room?.type);
  }
});

test('room, route, reward, shop selections produce run actions with UID/version', () => {
  assert.deepEqual(parseRogueAction('rl:run_123:7:route:elite').action, { type: 'ROUTE', choice: 'elite' });
  assert.deepEqual(parseRogueAction('rl:run_123:7:bless', ['skip']).action, { type: 'BLESSING', relicId: null });
  assert.deepEqual(parseRogueAction('rl:run_123:7:reward', ['skip']).action, { type: 'REWARD', choice: null });
  assert.deepEqual(parseRogueAction('rl:run_123:7:shop-upgrade', ['9']).action, { type: 'SHOP', choice: 'upgrade', uid: 9 });
  assert.deepEqual(parseRogueAction('rl:run_123:7:refresh'), { ui: 'refresh', runId: 'run_123', version: 7 });
});

