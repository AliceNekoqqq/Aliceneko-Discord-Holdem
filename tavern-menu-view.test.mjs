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
  assert.equal(view.components[1].components[0].custom_id, 't:guild-id:any:menu');
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

test('all-menu selector remains usable up to 25 dishes and yields to categories above that limit', () => {
  const twentyFive = Array.from({ length: 25 }, (_, i) => ({ ...dishes[i % dishes.length], id: `dish-${i}` }));
  const withinLimit = renderMenu({ menu: twentyFive }, 'u', 'g');
  assert.equal(withinLimit.components.find(r => r.components[0]?.type === 3).components[0].options.length, 25);
  const overLimit = renderMenu({ menu: [...twentyFive, { ...dishes[0], id: 'dish-25' }] }, 'u', 'g');
  assert.match(overLimit.content, /超过25款，请先选择/);
  assert.equal(overLimit.components.some(r => r.components[0]?.type === 3), false);
  assert.ok(overLimit.components[0].components.some(c => c.custom_id.endsWith(':menuCat~drinks')));
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
