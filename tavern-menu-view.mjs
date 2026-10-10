import { MENU, TEMPERATURE } from './tavern-catalog.mjs';

export const MENU_CATEGORIES = Object.freeze([
  { id: 'all', name: '全部', emoji: '🍵' },
  { id: 'drinks', name: '饮品', emoji: '🥤' },
  { id: 'desserts', name: '甜点', emoji: '🍰' },
  { id: 'savory', name: '小食', emoji: '🥨' },
  { id: 'seasonal', name: '季节', emoji: '🌸' },
  { id: 'ugc', name: '创作', emoji: '🎨' },
]);

const CATEGORY_BY_ID = Object.freeze({
  water: 'drinks', tea: 'drinks', milk: 'drinks', soda: 'drinks', special: 'drinks',
  cake: 'desserts', snack: 'savory',
});
const clean = (value, max = 500) => String(value ?? '').replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, max);
const priceText = item => item.price ? `${item.price}币` : '免费';
const row = (...components) => ({ type: 1, components });
const key = (guild, id, action) => `t:${guild}:${id}:${action}`;
const button = (guild, id, action, label, emoji, style = 2) => ({ type: 2, custom_id: key(guild, id, action), label, ...(emoji ? { emoji: { name: emoji } } : {}), style });
const categoryOf = item => item.ugc || item.source === 'ugc' ? 'ugc'
  : MENU_CATEGORIES.some(category => category.id === item.category) ? item.category
  : CATEGORY_BY_ID[item.id] || 'seasonal';
const categoryItems = (menu, category) => category === 'all' ? menu : menu.filter(item => category === 'ugc' ? item.ugc || item.source === 'ugc' : categoryOf(item) === category);
const equipmentNames = Object.freeze({ coffee_machine: '咖啡机', baking_oven: '烘焙烤箱', blender: '搅拌机', ice_cream_maker: '冰淇淋机' });

function itemSummary(item) {
  const name = clean(item.name, 80);
  const flavor = clean(item.flavor || item.description, 110);
  const credit = item.source === 'ugc' ? `\n作者：${clean(item.author || item.author_name, 32)} · ${item.imageStatus === 'ready' ? '已配图' : '待补图'}` : '';
  return `${item.emoji || '🍵'} **${name}** · ${priceText(item)}\n${flavor}${credit}`;
}

export function renderMenu(data, id, guild, publicView = false, category = 'all', page = 0) {
  const menu = Array.isArray(data?.menu) ? data.menu : MENU.filter(item => !item.requiresEquipment);
  const lockedMenu = Array.isArray(data?.lockedMenu) ? data.lockedMenu : MENU.filter(item => item.requiresEquipment);
  const selectedCategory = MENU_CATEGORIES.some(item => item.id === category) ? category : 'all';
  const allItems = categoryItems(menu, selectedCategory);
  const pageCount = Math.max(1, Math.ceil(allItems.length / 20));
  const selectedPage = Math.min(pageCount - 1, Math.max(0, Number.isSafeInteger(Number(page)) ? Number(page) : 0));
  const items = allItems.slice(selectedPage * 20, selectedPage * 20 + 20);
  const categoryButtons = MENU_CATEGORIES.map(item => button(guild, publicView ? 'any' : id, `menuCat~${item.id}~0`, item.name, item.emoji, item.id === selectedCategory ? 1 : 2));
  const ugcButtons = !publicView && selectedCategory === 'ugc' ? [button(guild,id,'ugcStart','研发菜品','🎨'),button(guild,id,'ugcList','我的作品','🖼️')] : [];
  categoryButtons.push(...ugcButtons);
  const categoryRows = [row(...categoryButtons.slice(0, 5)), ...(categoryButtons.length > 5 ? [row(...categoryButtons.slice(5))] : [])];
  let content;
  if (selectedCategory === 'all') {
    const counts = Object.fromEntries(MENU_CATEGORIES.slice(1).map(item => [item.id, menu.filter(dish => categoryOf(dish) === item.id).length]));
    const seasonal = counts.seasonal ? `当季上新 ${counts.seasonal} 款，随季节更新。` : '当季暂无限定上新。';
    const lockedText = lockedMenu.length ? `\n🔒 **设备新品（购置设备后永久解锁）**\n${lockedMenu.map(item => `${item.emoji || '🍵'} ${clean(item.name, 80)} · 需要${equipmentNames[item.requiresEquipment] || clean(item.requiresEquipment, 40)}`).join('\n')}` : '';
    content = `🍵 **红豆粉的小酒馆 · 今日菜单**\n先逛类别，再选一份喜欢的；所有饮品均无酒精。${pageCount > 1 ? `\n本页 ${items.length} 款 · 第 ${selectedPage + 1}/${pageCount} 页` : ''}\n🥤 饮品 ${counts.drinks} 款：茶饮与清爽特调。\n🍰 甜点 ${counts.desserts} 款：酥香软甜，适合配茶。\n🥨 小食 ${counts.savory} 款：咸甜小份，聊天时慢慢吃。\n🌸 季节 ${seasonal}\n🎨 玩家创作 ${counts.ugc} 款，可查看署名与作品图状态。${lockedText}\n${publicView ? '选好后打开自己的点单面板，确认后才上桌。' : `你的余额：**${clean(data?.member?.balance, 20) || '0'}币** · 选好后还会再请你确认。`}`;
  } else {
    const heading = MENU_CATEGORIES.find(item => item.id === selectedCategory);
    const intro = selectedCategory === 'seasonal' && allItems.length === 0 ? '当季暂无限定上新。' : `${heading.emoji} ${heading.name} · ${allItems.length} 款`;
    content = `🍵 **红豆粉的小酒馆 · 今日菜单**\n**${intro}**${allItems.length > 20 ? ` · 第 ${selectedPage + 1}/${pageCount} 页` : ''}\n${items.map(itemSummary).join('\n\n') || '这个类别暂时没有商品。'}\n${publicView ? '选好后打开自己的点单面板，确认后才上桌。' : `你的余额：**${clean(data?.member?.balance, 20) || '0'}币** · 选好后还会再请你确认。`}`;
    const categoryLocked = lockedMenu.filter(item => categoryOf(item) === selectedCategory);
    if (categoryLocked.length) content += `\n\n🔒 **购置设备后永久解锁**\n${categoryLocked.map(item => `${item.emoji || '🍵'} ${clean(item.name, 80)} · 需要${equipmentNames[item.requiresEquipment] || clean(item.requiresEquipment, 40)}`).join('\n')}`;
  }
  // Discord content limit is 2000 characters; retain the category and privacy notice.
  if (content.length > 1900) content = `${content.slice(0, 1888).trimEnd()}…`;
  const components = [...categoryRows];
  if (pageCount > 1) components.push(row(
    button(guild, publicView ? 'any' : id, `menuCat~${selectedCategory}~${Math.max(0, selectedPage - 1)}~prev`, '上一页', '◀️', 2),
    button(guild, publicView ? 'any' : id, `menuCat~${selectedCategory}~${Math.min(pageCount - 1, selectedPage + 1)}~next`, '下一页', '▶️', 2),
  ));
  if (publicView) {
    components.push(row(button(guild, 'any', 'menu', '打开我的点单面板', '🛍️', 1)));
  } else {
    // "全部" is a category landing page. Keeping every dish in its select
    // would make entries beyond Discord's 25-option limit unreachable.
    const options = items.slice(0, 25).map(item => ({
      label: clean(item.name, 100) || '菜单商品', value: clean(item.id, 100),
      description: clean(`${priceText(item)} · ${item.flavor || item.description || '小酒馆手作'}`, 100),
      ...(item.emoji ? { emoji: { name: clean(item.emoji, 32) } } : {}),
    }));
    if (options.length) components.push(row({ type: 3, custom_id: key(guild, id, 'pick'), placeholder: '今天想点哪一份？', options }));
    components.push(row(button(guild, id, 'lobby', '大厅', '🏡'), button(guild, id, 'menu', '菜单', '🍵'), button(guild, id, 'wallet', '钱包', '🪙'), button(guild, id, 'card', '常客卡', '🦋'), button(guild, id, 'reno', '装修', '🔧')));
  }
  return { content, components, allowed_mentions: { parse: [] } };
}

export function renderDishDetails(item) {
  const title = clean(item?.name, 100) || '菜单商品';
  const lines = [`${item?.emoji || '🍵'} **${title}**`];
  if (item?.ingredients) lines.push(`食材：${clean(Array.isArray(item.ingredients) ? item.ingredients.join('、') : item.ingredients, 300)}`);
  if (item?.flavor) lines.push(`风味：${clean(item.flavor, 300)}`);
  if (item?.pairing) lines.push(`搭配：${clean(item.pairing, 300)}`);
  if (Array.isArray(item?.allergens) && item.allergens.length) lines.push(`已知配方含有：${item.allergens.map(value => clean(value, 40)).filter(Boolean).join('、')}`);
  if (item?.servingTemperature) lines.push(`上桌温度：${TEMPERATURE[item.servingTemperature] || clean(item.servingTemperature, 40)}`);
  return lines.join('\n');
}
