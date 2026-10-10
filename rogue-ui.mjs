import { CATALOG } from './rogue-catalog.mjs';
import { legalCards, legalItems } from './rogue-battle.mjs';
import { PROFESSIONS, ITEMS, getCatalog } from './rogue-content-v06.mjs';
let ACTIVE_CATALOG = CATALOG;
const useRunCatalog = (run) => { ACTIVE_CATALOG = getCatalog(run?.catalogVersion ?? run?.ruleVersion); return ACTIVE_CATALOG; };

const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cap = (s, n) => [...String(s)].slice(0, n).join('');
const cardOf = (id) => ACTIVE_CATALOG.cards[id];
const relicOf = (id) => ACTIVE_CATALOG.relics[id];
const cardName = (id) => cardOf(id)?.name ?? '未知牌';
const relicName = (id) => relicOf(id)?.name ?? '未知遗物';
const uid = (x) => Number.isSafeInteger(x) ? String(x) : '';

function cardText(entity) {
  const base = cardOf(entity?.cardId);
  if (!base) return '未知牌';
  const def = entity.upgraded ? { ...base, ...base.upgrade } : base;
  const effects = def.effects.map((e) => ({
    damage: `伤害${e.value}${e.ignoreArmor ? '（穿甲）' : ''}`, block: `护盾${e.value}`, burn: `灼烧${e.value}`, heal: `治疗${e.value}`,
    prepare: `备势${e.value}`, mark: `标记${e.value}`, sift: '择弃并补抽', exhaust_other: '消耗目标牌', retain: '保留目标牌', counter: `反击${e.value}`,
    echo_next: '下轮回声', self_echo: '自损回声', delay_burn: `延迟灼烧${e.value}`, damage_from_shield: `耗盾伤害${e.value}`,
    summon: `召唤伙伴${e.value}`, pet_attack: `伙伴攻击${e.value}`, sacrifice: `牺牲伙伴伤害${e.value}`, forge: `锻造${e.value}`, weapon_attack: `武器伤害${e.value}`,
  }[e.kind] ?? e.kind)).filter(Boolean).join('、');
  return `${base.name} · ${def.cost}能量${def.selfCost ? ` · 自损${def.selfCost}` : ''} · ${effects}${def.exhaust ? ' · 消耗' : ''}`;
}
function cardDef(entity) {
  const b = cardOf(entity?.cardId);
  return b ? (entity.upgraded ? { ...b, ...b.upgrade } : b) : null;
}
function cid(run, action, arg) {
  const id = String(run?.runId ?? '');
  const version = run?.version;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !Number.isSafeInteger(version) || version < 0) throw new TypeError('run needs a safe runId and nonnegative integer version');
  const token = `rl:${id}:${version}:${action}${arg === undefined ? '' : `:${encodeURIComponent(String(arg))}`}`;
  if (token.length > 100) throw new RangeError('custom_id exceeds Discord limit');
  return token;
}
const button = (label, custom_id, style = 1, disabled = false) => ({ type: 2, style, label: cap(label, 80), custom_id, ...(disabled ? { disabled: true } : {}) });
const row = (...components) => ({ type: 1, components });
function select(custom_id, placeholder, options, disabled = false) {
  const items = options.slice(0, 25).map((o) => ({ label: cap(o.label, 80), value: cap(String(o.value), 100), ...(o.description ? { description: cap(o.description, 100) } : {}) }));
  return { type: 3, custom_id, placeholder: cap(placeholder, 150), min_values: 1, max_values: 1, options: items, ...(disabled ? { disabled: true } : {}) };
}
function panel(title, description, components = [], update = false) {
  if (components.length > 5) throw new RangeError('legacy Discord panels support at most five rows');
  for (const r of components) {
    if (r.type !== 1 || r.components.length > 5 || r.components.filter((c) => c.type === 3).length > 1) throw new RangeError('invalid legacy Discord action row');
    for (const c of r.components) if (c.custom_id?.length > 100 || (c.type === 2 && c.label.length > 80) || (c.type === 3 && c.options.length > 25)) throw new RangeError('legacy Discord component limit exceeded');
  }
  const data = { flags: 64, content: '', embeds: [{ title: cap(title, 256), description: cap(description, 4096), color: 0x8b5a2b }], components, allowed_mentions: { parse: [] } };
  return { type: update ? 7 : 4, data };
}
function optionsFrom(ids, nameFn, extra = () => '') { return ids.map((id) => ({ label: cap(nameFn(id), 80), value: String(id), description: cap(extra(id), 100) })); }
function controlRow(run, checkpoint = false) {
  return row(button('刷新面板', cid(run, 'refresh'), 2), button('牌组详情', cid(run, 'details', 'deck'), 2), checkpoint ? button('确认撤退', cid(run, 'ask-retreat'), 4) : button('放弃远征', cid(run, 'ask-abandon'), 4));
}

export const rogueCommand = { name: '灯下迷城', description: '打开灯下迷城远征面板', type: 1, integration_types: [0], contexts: [0] };
export function rogueInteraction(i) {
  return i?.type === 2 && i.data?.name === '灯下迷城' || [3, 5].includes(i?.type) && typeof i.data?.custom_id === 'string' && i.data.custom_id.startsWith('rl:');
}

export function renderRogueHome({ challengeProfession = null, update = false } = {}) {
  const professions = Object.entries(PROFESSIONS);
  const defaultProfession = professions.some(([id]) => id === 'traveler') ? 'traveler' : professions[0]?.[0];
  const choices = professions.map(([id, p]) => ({ label: `${p.name} · ${p.description ?? '选择此职业开局'}`, value: id }));
  const components = [
    row(button('正式远征', `rl:start:normal:${defaultProfession ?? 'traveler'}`, 1), button(`每日挑战${challengeProfession ? ` · ${PROFESSIONS[challengeProfession]?.name ?? ''}` : ''}`, 'rl:start:challenge', 1)),
  ];
  if (choices.length > 1) components.push(row(select('rl:start:normal', '选择职业并开始普通远征', choices)));
  components.push(row(button('练习', `rl:practice:normal:${defaultProfession ?? 'traveler'}`, 2), button('挑战练习', 'rl:practice:challenge', 2), button('查看榜单', 'rl:board', 2)));
  return panel('灯下迷城', '在灯火熄灭前穿过三幕迷城。普通局可选择职业；每日挑战职业由服务器固定。每天前2次正式开局有奖；基础奖励按完成幕数为8／18／30，且纳入每日限额。\n\n战斗提示：每轮抽4张、2能量、最多打2张；备势最多6、标记最多4，都会留到下一轮结束。来袭伤害先扣护盾，再由灯灵伙伴挡，最后扣生命。锻值在战斗结束时清空；每战最多安排2次回声，治疗牌不回声。职业只决定起手，所有卡牌共用奖励池，可以混搭。', components, update);
}

export function renderRogueBoard(board = {}, { update = false } = {}) {
  const entries = Array.isArray(board) ? board : (board.rows ?? board.entries ?? []);
  const lines = entries.slice(0, 20).map((r) => `${Number.isFinite(r.rank) ? r.rank : '—'}. ${esc(r.name ?? '旅人')} · ${Number.isFinite(r.score) ? r.score : 0}分`);
  const day = board.day ? `日期：${esc(board.day)}\n` : '';
  return panel('远征榜单', `${day}${lines.length ? lines.join('\n') : '今日还没有榜单记录。'}`, [row(button('返回首页', 'rl:home', 2))], update);
}

export function renderRogueDetails(run, kind = 'deck', { update = false, page = 0 } = {}) {
  useRunCatalog(run);
  let entries = [];
  let title = '远征详情';
  if (kind === 'relics') {
    title = '遗物详情';
    entries = (run.relics ?? []).map((id) => `${relicName(id)}：${relicOf(id)?.description ?? ''}`);
    if (!entries.length) entries = ['尚未获得遗物。'];
  } else if (kind === 'inventory') {
    title = '道具详情';
    entries = (run.inventory ?? []).map((id, i) => `槽${i + 1} · ${ITEMS[id]?.name ?? id}：${ITEMS[id]?.description ?? ''}`);
    if (!entries.length) entries = ['两个道具槽目前都是空的。'];
  } else {
    title = '牌组详情';
    entries = (run.deck ?? []).map((entity) => `#${entity.uid} ${cardText(entity)}`);
    if (!entries.length) entries = ['牌组为空。'];
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / 12));
  const activePage = Math.max(0, Math.min(totalPages - 1, Number.isSafeInteger(page) ? page : 0));
  const visible = entries.slice(activePage * 12, (activePage + 1) * 12);
  const intro = kind === 'deck' ? `职业：${PROFESSIONS[run.professionId]?.name ?? '提灯旅人'}。${PROFESSIONS[run.professionId]?.description ?? ''}\n` : '';
  const description = `${intro}${visible.join('\n')}\n\n第${activePage + 1}/${totalPages}页 · 共${entries.length}项`;
  const paging = row(button('上一页', cid(run, 'details', `${kind}:${Math.max(0, activePage - 1)}`), 2, activePage === 0), button('下一页', cid(run, 'details', `${kind}:${Math.min(totalPages - 1, activePage + 1)}`), 2, activePage >= totalPages - 1));
  return panel(title, description, [row(button('牌组', cid(run, 'details', 'deck:0'), kind === 'deck' ? 1 : 2), button('遗物', cid(run, 'details', 'relics:0'), kind === 'relics' ? 1 : 2), button('道具', cid(run, 'details', 'inventory:0'), kind === 'inventory' ? 1 : 2)), paging, row(button('返回远征', cid(run, 'refresh'), 2))], update);
}

function renderBattle(run, update) {
  useRunCatalog(run);
  const b = run.battle ?? {};
  const enemy = ACTIVE_CATALOG.enemies[b.enemyId] ?? {};
  const intent = b.intent ?? {};
  const actionText = (action = {}) => {
    const total = (action.hits ?? 1) * (action.value ?? 0);
    const base = action.label ?? ({ attack: '攻击', guard: '架盾', charge: '蓄力', burn: '施加灼烧', cleanse: '清除灼烧', heal: '治疗', armor: '获得护甲', thorns: '反伤姿态', conditional: '条件意图' }[action.kind] ?? action.kind ?? '未知意图');
    const amount = action.kind === 'attack' || action.kind === 'charge' ? `（${action.value ?? 0}×${action.hits ?? 1}，合计${total}）`
      : ['guard','burn','cleanse','heal','armor','thorns'].includes(action.kind) ? `（${action.value ?? 0}）` : '';
    const extras = [];
    if (action.armor != null) extras.push(`护甲${action.armor}`);
    if (action.thorns != null) extras.push(`本轮首次主动直伤反伤${action.thorns}`);
    if (action.shieldAfter != null) extras.push(`攻击后架盾${action.shieldAfter}`);
    return `${base}${amount}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
  };
  let intentLine;
  if (intent.kind === 'conditional') intentLine = `公开分支：打出攻击牌→${actionText(intent.onAttack)}；否则→${actionText(intent.onOther)}`;
  else if (intent.kind === 'charge') intentLine = `蓄力预告：下轮${actionText(intent.next ?? { ...intent, kind: 'attack' })}`;
  else intentLine = actionText(intent);
  const description = [`${enemy.name ?? '敌人'}　生命 ${b.enemyHp ?? '?'}　护甲 ${b.enemyArmor ?? 0}　架盾 ${b.enemyShield ?? 0}　灼烧 ${b.enemyBurn ?? 0}`, `你的生命 ${run.hp}　护盾 ${b.shield ?? 0}　能量 ${b.energy ?? 0}　已出牌 ${b.plays ?? 0}/2`, `意图：${intentLine}`, `手牌：${(b.hand ?? []).map((e) => cardText(e)).join('；') || '无'}`];
  const resources = [];
  if (b.prepare) resources.push(`备势${b.prepare}`); if (b.mark) resources.push(`标记${b.mark}`); if (b.forge) resources.push(`锻造${b.forge}`);
  if (Number.isFinite(b.petHp)) resources.push(`伙伴生命${b.petHp}`);
  if (resources.length) description.push(resources.join(' · '));
  const legal = new Set(legalCards(b).map((c) => c.uid));
  const components = [];
  const disabledReasons = [];
  const hand = (b.hand ?? []).slice(0, 4);
  const playOptions = [];
  const targetEffects = new Set(['sift', 'exhaust_other', 'retain']);
  const handTargets = hand.filter((e) => e != null);
  for (const e of hand) {
    const def = cardDef(e);
    let reason = '';
    if (b.result) reason = '战斗已结束';
    else if ((b.plays ?? 0) >= 2) reason = '本轮出牌次数已满';
    else if (!legal.has(e.uid)) {
      if (def?.cost > (b.energy ?? 0)) reason = '能量不足';
      else if (def?.effects?.every((x) => x.kind === 'heal') && run.hp >= (b.maxHp ?? ACTIVE_CATALOG.player.maxHp)) reason = '生命已满，纯治疗牌不可用';
      else reason = '当前不可打出';
    }
    if (reason) disabledReasons.push(`#${e.uid} ${cardName(e.cardId)}：${reason}`);
    const requiredTarget = (def?.effects ?? []).some((x) => targetEffects.has(x.kind)) && !((def?.effects ?? []).some((x) => !targetEffects.has(x.kind)));
    const targets = handTargets.filter((t) => t.uid !== e.uid);
    if (requiredTarget && !targets.length) { disabledReasons.push(`#${e.uid} ${cardName(e.cardId)}：没有合法目标`); continue; }
    if (reason) continue;
    const prefix = `${cardName(e.cardId)} #${e.uid}`;
    if ((def?.effects ?? []).some((x) => targetEffects.has(x.kind))) {
      if (!requiredTarget) playOptions.push({ label: `${prefix} · 不选目标`, value: `p:${e.uid}:n`, description: '只执行基础效果' });
      for (const t of targets) playOptions.push({ label: `${prefix} → #${t.uid} ${cardName(t.cardId)}`, value: `p:${e.uid}:t:${t.uid}`, description: cardText(t) });
    } else playOptions.push({ label: prefix, value: `p:${e.uid}:n`, description: cardText(e) });
  }
  if (disabledReasons.length) description.push(`暂不可用：${disabledReasons.join('；')}`);
  if (playOptions.length) components.push(row(select(cid(run, 'play-target'), '选择要打出的牌与目标', playOptions)));
  else if (hand.length) components.push(row(select(cid(run, 'play-target'), '本轮没有可打出的牌', [{ label: '无可用牌', value: 'none' }], true)));
  const inventory = Array.isArray(run.inventory) ? run.inventory : [];
  const usedItem = Boolean(b.itemUsed || b.itemsUsed || run.itemsUsedThisBattle);
  const legalItemIndexes = new Set(legalItems(b).map((item) => item.itemIndex));
  if (inventory.length) {
    const labels = inventory.slice(0, 2).map((id, index) => {
      const available = legalItemIndexes.has(index);
      let why = '';
      if (!available && !usedItem) {
        const effects = ITEMS[id]?.effects ?? [];
        if (effects.every((e) => e.kind === 'heal') && (b.hp ?? run.hp) >= (b.maxHp ?? ACTIVE_CATALOG.player.maxHp)) why = ' · 生命已满';
        else if (effects.every((e) => e.kind === 'cleanse_player') && !(b.burn > 0)) why = ' · 当前无灼烧';
        else why = ' · 当前不可用';
      }
      return { id, index, label: `${ITEMS[id]?.name ?? id}${why}`, available };
    });
    description.push(`道具：${labels.map((x) => `${x.index + 1}. ${ITEMS[x.id]?.name ?? x.id}`).join('；')} · 本战${usedItem ? '已使用' : '最多使用1件，不占出牌次数'}`);
    components.push(row(...labels.map((x) => button(x.label, cid(run, 'item', x.index), 2, !x.available))));
  }
  components.push(row(button('结束本轮', cid(run, 'end'), 2, Boolean(b.result))));
  components.push(controlRow(run));
  const stations = Math.min(9, (run.completed ?? 0) + 1);
  description.unshift(`第${run.act ?? '?'}幕 · 站点 ${stations}/9 · 余烬 ${run.embers ?? 0} · 距失灯 ${Math.max(0, 12 - (b.turn ?? 0))}轮`);
  return panel(`第${b.turn ?? '?'}轮战斗`, description.join('\n'), components, update);
}

function renderRoom(run, update) {
  useRunCatalog(run);
  const r = run.room ?? {};
  if (r.type === 'blessing') {
    const opts = optionsFrom(r.candidates ?? [], relicName, (id) => relicOf(id)?.description ?? '获得此遗物').concat([{ label: '跳过', value: 'skip', description: '不领取遗物' }]);
    return panel('幕间遗物', '选择一件遗物，或跳过。候选不会重复获得。', [row(select(cid(run, 'bless'), '选择遗物', opts)), controlRow(run)], update);
  }
  if (r.type === 'route') {
    const labels = { normal: '普通战斗', shop: '商店', event: '钟楼修补', camp: '营地', elite: '精英战斗' };
    useRunCatalog(run);
    const choices = (r.choices ?? []).map((choice) => button(labels[choice] ?? ACTIVE_CATALOG.enemies[choice]?.name ?? choice, cid(run, 'route', choice)));
    const details = [];
    if (r.normalEnemyId) {
      const foe = ACTIVE_CATALOG.enemies[r.normalEnemyId];
      if (foe) details.push(`普通战：${foe.name}，生命${foe.hp}，护甲${foe.armor}`);
    } else if (run.slot === 1 && run.act === 1) {
      for (const id of r.choices ?? []) { const foe = ACTIVE_CATALOG.enemies[id]; if (foe) details.push(`${foe.name}：生命${foe.hp}，护甲${foe.armor}`); }
    }
    const eliteId = ACTIVE_CATALOG.acts.find((a) => a.index === run.act)?.eliteEnemy;
    const elite = ACTIVE_CATALOG.enemies[eliteId];
    if ((r.choices ?? []).includes('elite') && elite) details.push(`精英警示：${elite.name}，生命${elite.hp}，护甲${elite.armor}，攻击节奏更强。`);
    if (run.bosses?.[run.act - 1]) {
      const boss = ACTIVE_CATALOG.enemies[run.bosses[run.act - 1]];
      if (boss) details.push(`本幕Boss已固定：${boss.name}，生命${boss.hp}，护甲${boss.armor}。`);
    }
    return panel('选择路线', `${details.join('\n')}\n选择地点后即进入。`, [row(...choices), controlRow(run)], update);
  }
  if (r.type === 'camp') {
    const upgradable = (run.deck ?? []).filter((e) => !e.upgraded && cardOf(e.cardId)?.upgrade);
    const components = [row(button(`休整治疗（${Math.floor(ACTIVE_CATALOG.player.maxHp * .3)}）`, cid(run, 'camp-heal'), 1, run.hp >= ACTIVE_CATALOG.player.maxHp), button('离开营地', cid(run, 'camp-leave'), 2))];
    if (upgradable.length) components.push(row(select(cid(run, 'camp-upgrade'), '选择升级的实体牌', upgradable.map((e) => ({ label: `#${e.uid} ${cardName(e.cardId)}`, value: String(e.uid), description: cardText(e) })))));
    components.push(controlRow(run));
    return panel('营地', `生命 ${run.hp}/${ACTIVE_CATALOG.player.maxHp}。可治疗或升级一张实体牌。`, components, update);
  }
  if (r.type === 'shop') {
    const stock = r.stock ?? [];
    const canBuy = stock.filter((id) => run.embers >= (ACTIVE_CATALOG.shop.cardCostByEnergy[String(cardOf(id)?.cost)] ?? Infinity));
    const upgradeTargets = (run.deck ?? []).filter((e) => !e.upgraded && cardOf(e.cardId)?.upgrade);
    const removeTargets = run.deck ?? [];
    const c = [];
    if (stock.length) c.push(row(select(cid(run, 'shop-buy'), '购买牌（可多次购买）', optionsFrom(stock, cardName, (id) => `价格${ACTIVE_CATALOG.shop.cardCostByEnergy[String(cardOf(id)?.cost)]}余烬`), canBuy.length === 0)));
    const services = [
      ...upgradeTargets.map((e) => ({ label: `升级 #${e.uid} ${cardName(e.cardId)}`, value: `upgrade:${e.uid}`, description: `${ACTIVE_CATALOG.shop.upgradeCost}余烬` })),
      ...removeTargets.map((e) => ({ label: `移除 #${e.uid} ${cardName(e.cardId)}`, value: `remove:${e.uid}`, description: `${ACTIVE_CATALOG.shop.removeCost}余烬` })),
    ];
    if (services.length) c.push(row(select(cid(run, 'shop-service'), '升级或移除实体牌', services, !services.some((x) => run.embers >= Number(x.description.match(/\d+/)?.[0])))));
    const itemStock = r.itemStock ?? r.items ?? [];
    const inventory = Array.isArray(run.inventory) ? run.inventory : [];
    if (itemStock.length) {
      const itemOptions = itemStock.flatMap((entry) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        return inventory.length < 2
          ? [{ label: `${ITEMS[id]?.name ?? id} · 8余烬`, value: `${id}:-1`, description: '放入空道具槽' }]
          : inventory.map((oldId, index) => ({ label: `${ITEMS[id]?.name ?? id} · 替换槽${index + 1}`, value: `${id}:${index}`, description: `替换${ITEMS[oldId]?.name ?? oldId}，8余烬` }));
      });
      c.push(row(select(cid(run, 'shop-item'), '购买道具（8余烬）', itemOptions, run.embers < 8)));
    }
    c.push(row(button('免费离开', cid(run, 'shop-leave'), 2)));
    c.push(controlRow(run));
    return panel(`商店 · ${run.embers}余烬`, `牌价：1能量牌10余烬、2能量牌14余烬；升级12余烬；移除8余烬。${r.services?.upgrade ? '升级服务已用。' : ''}${r.services?.remove ? '移除服务已用。' : ''}`, c, update);
  }
  if (r.type === 'event') {
    const allowed = new Set(Array.isArray(r.choices) ? r.choices : ['heal', 'card', 'leave']);
    const title = r.title || ({ repair: '钟楼修补', borrow_fire: '借来的火种', lost_property: '失物招领', apothecary: '夜行药铺' }[r.eventId] || '钟楼修补');
    const description = r.description || '选择一项处理方式。';
    const c = [];
    if (allowed.has('heal')) c.push(row(button(`治疗 ${r.healAmount ?? 0}（${r.healCost ?? 0}余烬）`, cid(run, 'event-heal-ask'), 1, run.hp >= ACTIVE_CATALOG.player.maxHp || run.embers < (r.healCost ?? 0))));
    if (allowed.has('card') && (r.candidates ?? []).length) c.push(row(select(cid(run, 'event-card-ask'), `选择牌（${r.cardCost ?? 0}余烬）`, optionsFrom(r.candidates, cardName), run.embers < (r.cardCost ?? 0))));
    if (allowed.has('item') && (r.itemCandidates ?? []).length) {
      const inventory = Array.isArray(run.inventory) ? run.inventory : [];
      const opts = (r.itemCandidates ?? []).flatMap((entry) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        return inventory.length < 2
          ? [{ label: ITEMS[id]?.name ?? id, value: `${id}:-1`, description: '放入空道具槽' }]
          : inventory.map((oldId, index) => ({ label: `${ITEMS[id]?.name ?? id} · 替换槽${index + 1}`, value: `${id}:${index}`, description: `替换${ITEMS[oldId]?.name ?? oldId}` }));
      });
      c.push(row(select(cid(run, 'event-item-ask'), `选择道具（${r.itemCost ?? 0}余烬）`, opts, run.embers < (r.itemCost ?? 0))));
    }
    if (allowed.has('trade') && (r.candidates ?? []).length) c.push(row(select(cid(run, 'event-trade-ask'), `以${r.lifeCost ?? 0}生命换牌`, optionsFrom(r.candidates, cardName), run.hp <= (r.lifeCost ?? 0))));
    if (allowed.has('leave')) c.push(row(button('离开', cid(run, 'event-leave'), 2)));
    c.push(controlRow(run));
    return panel(`${title} · ${run.embers}余烬 · 生命${run.hp}`, description, c, update);
  }
  if (r.type === 'checkpoint') {
    const completedAct = r.completedAct ?? run.completedActs;
    const boss = ACTIVE_CATALOG.enemies[run.bosses?.[completedAct - 1]];
    const bossInfo = boss ? `\n本幕已击败Boss：${boss.name}（生命${boss.hp}，护甲${boss.armor}）。` : '';
    return panel('抵达幕间', `已完成第${completedAct}幕。${bossInfo}\n继续深入，或确认撤退并结算。`, [row(button('继续', cid(run, 'continue'))), controlRow(run, true)], update);
  }
  return panel('远征', '当前没有可显示的地点。', [controlRow(run)], update);
}

function renderReward(run, update) {
  const reward = run.reward ?? {};
  const stage = reward.queue?.[reward.index];
  if (!stage) return panel('战利品', '当前奖励已处理。', [controlRow(run)], update);
  if (stage.kind === 'item') {
    const inventory = Array.isArray(run.inventory) ? run.inventory : [];
    const options = (stage.candidates ?? []).flatMap((id) => inventory.length < 2
      ? [{ label: `${ITEMS[id]?.name ?? id} · 放入空槽`, value: `${id}:-1` }]
      : inventory.map((oldId, index) => ({ label: `${ITEMS[id]?.name ?? id} · 替换槽${index + 1}`, value: `${id}:${index}`, description: `替换${ITEMS[oldId]?.name ?? oldId}` })));
    options.push({ label: '跳过', value: 'skip' });
    return panel('战利品', `道具奖励：选择一项或跳过。${reward.queue?.length > 1 ? `（${reward.index + 1}/${reward.queue.length}）` : ''}`, [row(select(cid(run, 'reward-item'), '领取或替换道具', options)), controlRow(run)], update);
  }
  const isCard = stage.kind === 'card';
  const options = optionsFrom(stage.candidates ?? [], isCard ? cardName : relicName, (id) => isCard ? cardText({ cardId: id, upgraded: false }) : (relicOf(id)?.description ?? ''));
  options.push({ label: '跳过', value: 'skip', description: '放弃本项奖励' });
  return panel('战利品', `${stage.kind === 'relic' ? '精英遗物' : '新卡'}：选择一项或跳过。${reward.queue?.length > 1 ? `（${reward.index + 1}/${reward.queue.length}）` : ''}`, [row(select(cid(run, 'reward'), '选择奖励', options)), controlRow(run)], update);
}

function renderResult(run, update) {
  const result = run.result ?? {};
  const receipt = run.receipt ?? result.receipt ?? {};
  const amount = receipt.amount ?? receipt.coins ?? run.rewardAmount;
  const base = receipt.baseAmount ?? receipt.base_amount ?? run.baseReward;
  const score = run.score ?? receipt.score;
  const rank = run.rankPending || receipt.rankPending ? '排名更新待处理' : (run.rank ? `当前排名：${run.rank}` : '');
  const lines = [`结果：${({ CLEAR: '通关', DEFEAT: '远征失败', RETREAT: '撤退', ABANDON: '放弃', EXPIRED: '远征结束' })[result.type] ?? '远征结束'}`, `完成幕数：${run.completedActs ?? 0}　余烬：${run.embers ?? 0}`];
  if (Number.isFinite(base)) lines.push(`基础奖励：${base}`);
  if (Number.isFinite(amount)) lines.push(`实际到账：${amount}`);
  if (Number.isFinite(score)) lines.push(`积分：${score}`);
  if (run.settlementPending) lines.push('结果已保存，收益待入账。重新打开冒险会重试，不会重复领取。');
  if (rank) lines.push(rank);
  return panel('远征结算', lines.join('\n'), [row(button('再来一局', 'rl:start:normal'), button('挑战远征', 'rl:start:challenge')), row(button('返回首页', 'rl:home', 2), button('查看榜单', 'rl:board', 2))], update);
}

export function renderRogue(run, { update = false } = {}) {
  useRunCatalog(run);
  if (!run) return renderRogueHome();
  if (run.phase === 'BATTLE' && run.battle) return renderBattle(run, update);
  if (run.phase === 'REWARD') return renderReward(run, update);
  if (run.phase === 'RESULT') return renderResult(run, update);
  return renderRoom(run, update);
}

export function renderRogueConfirmation(run, kind, { update = false } = {}) {
  useRunCatalog(run);
  let title, body, yes;
  if (kind === 'retreat') {
    title = '确认撤退？'; body = '确认后将结束本次远征并结算。'; yes = button('确认撤退', cid(run, 'retreat-confirm'), 4);
  } else if (kind === 'abandon') {
    title = '确认放弃？'; body = '确认后这局立即结束。'; yes = button('确认放弃', cid(run, 'abandon-confirm'), 4);
  } else if (kind === 'event-heal') {
    title = '确认治疗？'; body = `将支付${ACTIVE_CATALOG.event.healCost}余烬，恢复${ACTIVE_CATALOG.event.healAmount}生命。`; yes = button('确认付款并治疗', cid(run, 'event-heal-confirm'), 1);
  } else if (kind && typeof kind === 'object' && kind.type === 'event-heal') {
    title = '确认治疗？'; body = `将支付${kind.cost}余烬，恢复${kind.amount}生命。`; yes = button('确认付款并治疗', cid(run, 'event-heal-confirm'), 1);
  } else if (kind && typeof kind === 'object' && kind.type === 'event-card' && typeof kind.cardId === 'string') {
    const def = cardOf(kind.cardId);
    if (!def) throw new TypeError('unknown event card');
    const fullText = cardText({ cardId: kind.cardId, upgraded: false });
    title = '确认购买？'; body = `将支付${kind.cost ?? ACTIVE_CATALOG.event.cardCost}余烬，获得：${fullText}。`; yes = button('确认付款并获得', cid(run, 'event-card-confirm', kind.cardId), 1);
  } else if (kind && typeof kind === 'object' && kind.type === 'event-item' && typeof kind.itemId === 'string') {
    title = '确认领取道具？'; body = `将支付${kind.cost}余烬，${kind.replaceIndex == null ? '放入空道具槽' : `替换第${kind.replaceIndex + 1}格现有道具`}并获得${ITEMS[kind.itemId]?.name ?? kind.itemId}。`; yes = button('确认付款并领取', cid(run, 'event-item-confirm', `${kind.itemId}:${kind.replaceIndex ?? -1}`), 1);
  } else if (kind && typeof kind === 'object' && kind.type === 'event-trade' && typeof kind.cardId === 'string') {
    const fullText = cardText({ cardId: kind.cardId, upgraded: false });
    title = '确认以生命换牌？'; body = `将失去${kind.cost}生命并获得：${fullText}。`; yes = button('确认交易', cid(run, 'event-trade-confirm', kind.cardId), 1);
  } else throw new TypeError('unknown confirmation kind');
  return panel(title, body, [row(yes, button('返回面板', cid(run, 'refresh'), 2))], update);
}

function validRunParts(parts) {
  if (parts[0] !== 'rl') return null;
  const [, runId, versionText, action, ...args] = parts;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId ?? '') || !/^\d{1,16}$/.test(versionText ?? '')) return null;
  const version = Number(versionText);
  if (!Number.isSafeInteger(version)) return null;
  let arg;
  try { arg = args.length ? decodeURIComponent(args.join(':')) : undefined; } catch { return null; }
  if (arg !== undefined && (!arg || arg.length > 80 || /[\u0000-\u001f]/.test(arg))) return null;
  return { runId, version, action, arg };
}
function selection(values) {
  if (!Array.isArray(values) || typeof values[0] !== 'string' || values[0].length > 100) return null;
  return values[0];
}

export function parseRogueAction(customId, values = []) {
  if (typeof customId !== 'string' || customId.length < 1 || customId.length > 100) return null;
  if (customId === 'rl:home') return { ui: 'home' };
  if (customId === 'rl:board') return { ui: 'board' };
  let m = /^rl:(start|practice):(normal|challenge)(?::([a-z0-9_-]{1,40}))?$/.exec(customId);
  if (m) {
    const value = m[3] ?? (((m[1] === 'start' && m[2] === 'normal') || (m[1] === 'practice' && m[2] === 'normal')) ? selection(values) ?? undefined : undefined);
    if (m[2] === 'challenge' && value) return null;
    const professionId = m[2] === 'challenge' ? undefined : value;
    if (professionId && Object.keys(PROFESSIONS).length && !Object.hasOwn(PROFESSIONS, professionId)) return null;
    return professionId === undefined ? { ui: m[1], mode: m[2] } : { ui: m[1], mode: m[2], professionId };
  }
  const p = validRunParts(customId.split(':'));
  if (!p) return null;
  const { runId, version, action, arg } = p;
  const tagged = (a) => ({ runId, version, action: a });
  switch (action) {
    case 'refresh': return { ui: 'refresh', runId, version };
    case 'details': {
      const match = /^(deck|relics|inventory)(?::(\d{1,4}))?$/.exec(arg ?? '');
      return match && Number(match[2] ?? 0) <= 9999 ? { ui: 'details', runId, version, kind: match[1], page: Number(match[2] ?? 0) } : null;
    }
    case 'ask-retreat': return { ui: 'ask-retreat', runId, version };
    case 'ask-abandon': return { ui: 'ask-abandon', runId, version };
    case 'continue': return tagged({ type: 'CONTINUE' });
    case 'retreat-confirm': return tagged({ type: 'RETREAT', confirmed: true });
    case 'abandon-confirm': return tagged({ type: 'ABANDON', confirmed: true });
    case 'end': return tagged({ type: 'END_TURN' });
    case 'play': return Number.isSafeInteger(Number(arg)) && Number(arg) >= 0 ? tagged({ type: 'PLAY', uid: Number(arg) }) : null;
    case 'play-target': {
      const value = selection(values);
      const match = /^p:(\d+):(n|t:(\d+))$/.exec(value ?? '');
      if (!match || Number(match[1]) > Number.MAX_SAFE_INTEGER || (match[3] && Number(match[3]) > Number.MAX_SAFE_INTEGER)) return null;
      return tagged({ type: 'PLAY', uid: Number(match[1]), targetUid: match[3] ? Number(match[3]) : null });
    }
    case 'item': return /^\d+$/.test(arg ?? '') && Number.isSafeInteger(Number(arg)) ? tagged({ type: 'ITEM', itemIndex: Number(arg) }) : null;
    case 'route': return arg ? tagged({ type: 'ROUTE', choice: arg }) : null;
    case 'bless': {
      const value = arg ?? selection(values);
      return value === 'skip' ? tagged({ type: 'BLESSING', relicId: null }) : value ? tagged({ type: 'BLESSING', relicId: value }) : null;
    }
    case 'reward': {
      const value = selection(values);
      return value ? tagged({ type: 'REWARD', choice: value === 'skip' ? null : value }) : null;
    }
    case 'camp-heal': return tagged({ type: 'CAMP', choice: 'heal' });
    case 'camp-leave': return tagged({ type: 'CAMP', choice: 'leave' });
    case 'camp-upgrade': { const value = selection(values); return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? tagged({ type: 'CAMP', choice: 'upgrade', uid: Number(value) }) : null; }
    case 'shop-buy': { const value = selection(values); return value ? tagged({ type: 'SHOP', choice: 'buy', cardId: value }) : null; }
    case 'shop-upgrade': case 'shop-remove': {
      const value = selection(values);
      return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? tagged({ type: 'SHOP', choice: action === 'shop-upgrade' ? 'upgrade' : 'remove', uid: Number(value) }) : null;
    }
    case 'shop-service': {
      const value = selection(values); const match = /^(upgrade|remove):(\d+)$/.exec(value ?? '');
      return match && Number.isSafeInteger(Number(match[2])) ? tagged({ type: 'SHOP', choice: match[1], uid: Number(match[2]) }) : null;
    }
    case 'shop-item': {
      const value = selection(values); const match = /^([^:]{1,80}):(-1|0|1)$/.exec(value ?? '');
      return match ? tagged({ type: 'SHOP', choice: 'item', itemId: match[1], replaceIndex: Number(match[2]) < 0 ? null : Number(match[2]) }) : null;
    }
    case 'shop-leave': return tagged({ type: 'SHOP', choice: 'leave' });
    case 'reward-item': {
      const value = selection(values); if (value === 'skip') return tagged({ type: 'REWARD', choice: null, replaceIndex: null });
      const match = /^([^:]{1,80}):(-1|0|1)$/.exec(value ?? '');
      return match ? tagged({ type: 'REWARD', choice: match[1], replaceIndex: Number(match[2]) < 0 ? null : Number(match[2]) }) : null;
    }
    case 'event-leave': return tagged({ type: 'EVENT', choice: 'leave' });
    case 'event-heal-ask': return { ui: 'event-confirm', runId, version, kind: 'heal' };
    case 'event-heal-confirm': return tagged({ type: 'EVENT', choice: 'heal' });
    case 'event-card-ask': { const value = selection(values); return value ? { ui: 'event-confirm', runId, version, kind: 'card', cardId: value } : null; }
    case 'event-card-confirm': return arg ? tagged({ type: 'EVENT', choice: 'card', cardId: arg }) : null;
    case 'event-item-ask': { const value = selection(values); const match = /^([^:]{1,80}):(-1|0|1)$/.exec(value ?? ''); return match ? { ui: 'event-confirm', runId, version, kind: 'item', itemId: match[1], replaceIndex: Number(match[2]) < 0 ? null : Number(match[2]) } : null; }
    case 'event-item-confirm': { const match = /^([^:]{1,80}):(-1|0|1)$/.exec(arg ?? ''); return match ? tagged({ type: 'EVENT', choice: 'item', itemId: match[1], replaceIndex: Number(match[2]) < 0 ? null : Number(match[2]) }) : null; }
    case 'event-trade-ask': { const value = selection(values); return value ? { ui: 'event-confirm', runId, version, kind: 'trade', cardId: value } : null; }
    case 'event-trade-confirm': return arg ? tagged({ type: 'EVENT', choice: 'trade', cardId: arg }) : null;
    default: return null;
  }
}
