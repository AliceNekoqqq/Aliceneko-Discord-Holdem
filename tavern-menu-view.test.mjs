import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDishDetails, renderMenu, MENU_CATEGORIES } from './tavern-menu-view.mjs';

const dishes = Array.from({ length: 20 }, (_, index) => ({
  id: `dish-${index}`, name: `商品${index}`, emoji: '🍵', price: index,
  description: '细腻清香', flavor: '入口柔和，尾韵带着淡淡花香',
  category: ['drinks', 'desserts', 'savory', 'seasonal'][index % 4],
}));

test('menu categories fit Discord component limits and menu content stays below 2000 characters', () => {
  assert.deepEqual(MENU_CATEGORIES.map(category => category.id), ['all', 'drinks', 'desserts', 'savory', 'seasonal']);
  for (const category of MENU_CATEGORIES) {
    const view = renderMenu({ menu: dishes, member: { balance: 75 } }, '123', '456', false, category.id);
    assert.ok(view.content.length <= 1900, `${category.id} content is ${view.content.length} chars`);
    assert.ok(view.components.length <= 5);
    assert.ok(view.components[0].components.length <= 5);
    const select = view.components.find(component => component.components[0]?.type === 3);
    if (select) {
      assert.ok(select.components[0].options.length <= 25);
      assert.ok(select.components[0].options.every(option => option.description.length <= 100));
    }
    assert.deepEqual(view.allowed_mentions, { parse: [] });
  }
});

test('public menu can browse categories without displaying or creating a wallet', () => {
  const input = { menu: dishes, member: { balance: 999 } };
  const before = structuredClone(input);
  const view = renderMenu(input, 'user-id', 'guild-id', true, 'desserts');
  assert.equal(view.content.includes('999'), false);
  assert.equal(view.content.includes('余额'), false);
  assert.match(view.content, /选好后打开自己的点单面板，确认后才上桌/);
  assert.equal(view.components.length, 2);
  assert.ok(view.components[0].components.every(button => button.custom_id.startsWith('t:guild-id:any:menuCat~')));
  assert.ok(view.components.some(row => row.components[0].custom_id === 't:guild-id:any:menu'));
  assert.deepEqual(input, before);
});

test('menu rendering suppresses mention parsing and never mutates supplied menu data', () => {
  const malicious = [{ id: 'x', name: '@everyone', emoji: '🍵', price: 1, description: '<@123> `wow`', category: 'drinks' }];
  const before = structuredClone(malicious);
  const view = renderMenu({ menu: malicious, member: { balance: 8 } }, 'u', 'g', false, 'drinks');
  assert.deepEqual(view.allowed_mentions, { parse: [] });
  assert.deepEqual(malicious, before);
  assert.equal(view.content.includes('@everyone'), true);
});

test('equipment-locked dishes are visible but never offered as order options', () => {
  const data = {
    menu: dishes.slice(0, 2),
    lockedMenu: [{ id: 'latte', name: '红豆拿铁', category: 'drinks', emoji: '☕', requiresEquipment: 'coffee_machine' }],
  };
  const all = renderMenu(data, 'u', 'g');
  assert.match(all.content, /红豆拿铁.*需要咖啡机/);
  const options = all.components.find(r => r.components[0]?.type === 3)?.components[0].options || [];
  assert.deepEqual(options.map(x => x.value), ['dish-0', 'dish-1']);
  const drinks = renderMenu(data, 'u', 'g', false, 'drinks');
  assert.match(drinks.content, /购置设备后永久解锁/);
  assert.equal(drinks.components.find(r => r.components[0]?.type === 3).components[0].options.some(x => x.value === 'latte'), false);
});

test('all-menu selector paginates at 20 while keeping every item reachable', () => {
  const twentyFive = Array.from({ length: 25 }, (_, i) => ({ ...dishes[i % dishes.length], id: `dish-${i}` }));
  const withinLimit = renderMenu({ menu: twentyFive }, 'u', 'g');
  assert.equal(withinLimit.components.find(r => r.components[0]?.type === 3).components[0].options.length, 20);
  const overLimit = renderMenu({ menu: [...twentyFive, { ...dishes[0], id: 'dish-25' }] }, 'u', 'g');
  assert.equal(overLimit.components.find(r => r.components[0]?.type === 3).components[0].options.length, 20);
  assert.match(overLimit.content, /第 1\/2 页/);
  assert.ok(overLimit.components.some(r => r.components.some(c => c.custom_id?.endsWith(':menuCat~drinks~0'))));
  assert.ok(overLimit.components.some(r => r.components.some(c => c.custom_id?.includes(':menuCat~all~1~next'))));
});

test('dish details support recipe arrays and map fixed temperature labels', () => {
  const text = renderDishDetails({ name: '茶点', ingredients: ['绿茶', '牛乳'], flavor: '清香', pairing: '红豆酥', allergens: ['牛乳'], servingTemperature: 'warm' });
  assert.match(text, /食材：绿茶、牛乳/);
  assert.match(text, /风味：清香/);
  assert.match(text, /搭配：红豆酥/);
  assert.match(text, /已知配方含有：牛乳/);
  assert.match(text, /上桌温度：温热/);
  assert.doesNotMatch(text, /少糖|医学建议/);
});

test('player creations appear inside their normal category with a visible name suffix and author credit', () => {
  const menu = [
    { id: 'coffee', name: '拿铁', category: 'drinks', price: 20 },
    { id: 'ugc-cake', name: '桂花糕', category: 'desserts', price: 18, source: 'ugc', author: '小灯', flavor: '桂花清香' },
    { id: 'ugc-tea', name: '莓果苏打', type: 'drink', price: 25, source: 'ugc', author_name: '阿星' },
  ];
  const desserts = renderMenu({ menu }, 'u', 'g', false, 'desserts');
  assert.match(desserts.content, /桂花糕（玩家创作）/);
  assert.match(desserts.content, /作者：小灯/);
  assert.doesNotMatch(desserts.content, /拿铁|莓果苏打/);
  const drinks = renderMenu({ menu }, 'u', 'g', false, 'drinks');
  assert.match(drinks.content, /莓果苏打（玩家创作）/);
  const option = drinks.components.find(component => component.components[0]?.type === 3).components[0].options.find(item => item.value === 'ugc-tea');
  assert.match(option.label, /莓果苏打（玩家创作）/);
  const all = renderMenu({ menu }, 'u', 'g');
  assert.match(all.content, /饮品 2 款/);
  assert.match(all.content, /甜点 1 款/);
  assert.match(all.content, /玩家创作 2 款/);
});
