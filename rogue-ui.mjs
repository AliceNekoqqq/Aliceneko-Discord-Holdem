import { CATALOG } from './rogue-catalog.mjs';
import { legalCards } from './rogue-battle.mjs';

const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cap = (s, n) => [...String(s)].slice(0, n).join('');
const cardOf = (id) => CATALOG.cards[id];
const relicOf = (id) => CATALOG.relics[id];
const cardName = (id) => cardOf(id)?.name ?? '未知牌';
const relicName = (id) => relicOf(id)?.name ?? '未知遗物';
const uid = (x) => Number.isSafeInteger(x) ? String(x) : '';

function cardText(entity) {
  const base = cardOf(entity?.cardId);
  if (!base) return '未知牌';
  const def = entity.upgraded ? { ...base, ...base.upgrade } : base;
  const effects = def.effects.map((e) => ({ damage: `伤害${e.value}${e.ignoreArmor ? '（穿甲）' : ''}`, block: `护盾${e.value}`, burn: `灼烧${e.value}`, heal: `治疗${e.value}` }[e.kind] ?? '')).filter(Boolean).join('、');
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
  return row(button('刷新面板', cid(run, 'refresh'), 2), checkpoint ? button('确认撤退', cid(run, 'ask-retreat'), 4) : button('放弃远征', cid(run, 'ask-abandon'), 4));
}

export function renderRogueHome() {
  return panel('灯下迷城', '在灯火熄灭前穿过三幕迷城。每天前2次正式开局有奖；基础奖励按完成幕数为8／18／30。奖励纳入60子每日限额与150子原总限额。练习也计入每日榜单。', [
    row(button('正式远征', 'rl:start:normal', 1), button('挑战远征', 'rl:start:challenge', 1)),
    row(button('练习', 'rl:practice:normal', 2), button('挑战练习', 'rl:practice:challenge', 2), button('查看榜单', 'rl:board', 2)),
  ]);
}

export function renderRogueBoard(board = {}) {
  const entries = Array.isArray(board) ? board : (board.rows ?? board.entries ?? []);
  const lines = entries.slice(0, 20).map((r) => `${Number.isFinite(r.rank) ? r.rank : '—'}. ${esc(r.name ?? '旅人')} · ${Number.isFinite(r.score) ? r.score : 0}分`);
  const day = board.day ? `日期：${esc(board.day)}\n` : '';
  return panel('远征榜单', `${day}${lines.length ? lines.join('\n') : '今日还没有榜单记录。'}`, [row(button('返回首页', 'rl:home', 2))]);
}

function renderBattle(run, update) {
  const b = run.battle ?? {};
  const enemy = CATALOG.enemies[b.enemyId] ?? {};
  const intent = b.intent ?? {};
  const total = (intent.hits ?? 1) * (intent.value ?? 0);
  const intentLine = intent.kind === 'charge'
    ? `蓄力预告：下轮${intent.label ?? '攻击'}（${intent.value ?? 0}×${intent.hits ?? 1}，合计${total}）`
    : `${intent.label ?? intent.kind ?? '未知意图'}${intent.kind === 'attack' ? `（${intent.value ?? 0}×${intent.hits ?? 1}，合计${total}）` : intent.kind === 'guard' ? `（架盾${intent.value ?? 0}）` : ''}`;
  const description = [`${enemy.name ?? '敌人'}　生命 ${b.enemyHp ?? '?'}　护甲 ${b.enemyArmor ?? 0}　架盾 ${b.enemyShield ?? 0}　灼烧 ${b.enemyBurn ?? 0}`, `你的生命 ${run.hp}　护盾 ${b.shield ?? 0}　能量 ${b.energy ?? 0}　已出牌 ${b.plays ?? 0}/2`, `意图：${intentLine}`, `手牌：${(b.hand ?? []).map((e) => cardText(e)).join('；') || '无'}`];
  const legal = new Set(legalCards(b).map((c) => c.uid));
  const components = [];
  const disabledReasons = [];
  const hand = (b.hand ?? []).slice(0, 4);
  const playButtons = [];
  for (const e of hand) {
    const def = cardDef(e);
    let reason = '';
    if (b.result) reason = '战斗已结束';
    else if ((b.plays ?? 0) >= 2) reason = '本轮出牌次数已满';
    else if (!legal.has(e.uid)) {
      if (def?.cost > (b.energy ?? 0)) reason = '能量不足';
      else if (def?.effects?.every((x) => x.kind === 'heal') && run.hp >= (b.maxHp ?? CATALOG.player.maxHp)) reason = '生命已满，纯治疗牌不可用';
      else reason = '当前不可打出';
    }
    if (reason) disabledReasons.push(`#${e.uid} ${cardName(e.cardId)}：${reason}`);
    playButtons.push(button(cap(`${cardName(e.cardId)} #${e.uid}`, 80), cid(run, 'play', uid(e.uid)), 1, Boolean(reason)));
  }
  if (disabledReasons.length) description.push(`暂不可用：${disabledReasons.join('；')}`);
  if (playButtons.length) components.push(row(...playButtons));
  components.push(row(button('结束本轮', cid(run, 'end'), 2, Boolean(b.result))));
  components.push(controlRow(run));
  const stations = Math.min(9, (run.completed ?? 0) + 1);
  description.unshift(`第${run.act ?? '?'}幕 · 站点 ${stations}/9 · 余烬 ${run.embers ?? 0} · 距失灯 ${Math.max(0, 12 - (b.turn ?? 0))}轮`);
  return panel(`第${b.turn ?? '?'}轮战斗`, description.join('\n'), components, update);
}

function renderRoom(run, update) {
  const r = run.room ?? {};
  if (r.type === 'blessing') {
    const opts = optionsFrom(r.candidates ?? [], relicName, (id) => relicOf(id)?.description ?? '获得此遗物').concat([{ label: '跳过', value: 'skip', description: '不领取遗物' }]);
    return panel('幕间遗物', '选择一件遗物，或跳过。候选不会重复获得。', [row(select(cid(run, 'bless'), '选择遗物', opts)), controlRow(run)], update);
  }
  if (r.type === 'route') {
    const labels = { normal: '普通战斗', shop: '商店', event: '钟楼修补', camp: '营地', elite: '精英战斗' };
    const choices = (r.choices ?? []).map((choice) => button(labels[choice] ?? CATALOG.enemies[choice]?.name ?? choice, cid(run, 'route', choice)));
    const details = [];
    if (r.normalEnemyId) {
      const foe = CATALOG.enemies[r.normalEnemyId];
      if (foe) details.push(`普通战：${foe.name}，生命${foe.hp}，护甲${foe.armor}`);
    } else if (run.slot === 1 && run.act === 1) {
      for (const id of r.choices ?? []) { const foe = CATALOG.enemies[id]; if (foe) details.push(`${foe.name}：生命${foe.hp}，护甲${foe.armor}`); }
    }
    const eliteId = CATALOG.acts.find((a) => a.index === run.act)?.eliteEnemy;
    const elite = CATALOG.enemies[eliteId];
    if ((r.choices ?? []).includes('elite') && elite) details.push(`精英警示：${elite.name}，生命${elite.hp}，护甲${elite.armor}，攻击节奏更强。`);
    return panel('选择路线', `${details.join('\n')}\n选择地点后即进入。`, [row(...choices), controlRow(run)], update);
  }
  if (r.type === 'camp') {
    const upgradable = (run.deck ?? []).filter((e) => !e.upgraded && cardOf(e.cardId)?.upgrade);
    const components = [row(button(`休整治疗（${Math.floor(CATALOG.player.maxHp * .3)}）`, cid(run, 'camp-heal'), 1, run.hp >= CATALOG.player.maxHp), button('离开营地', cid(run, 'camp-leave'), 2))];
    if (upgradable.length) components.push(row(select(cid(run, 'camp-upgrade'), '选择升级的实体牌', upgradable.map((e) => ({ label: `#${e.uid} ${cardName(e.cardId)}`, value: String(e.uid), description: cardText(e) })))));
    components.push(controlRow(run));
    return panel('营地', `生命 ${run.hp}/${CATALOG.player.maxHp}。可治疗或升级一张实体牌。`, components, update);
  }
  if (r.type === 'shop') {
    const stock = r.stock ?? [];
    const canBuy = stock.filter((id) => run.embers >= (CATALOG.shop.cardCostByEnergy[String(cardOf(id)?.cost)] ?? Infinity));
    const upgradeTargets = (run.deck ?? []).filter((e) => !e.upgraded && cardOf(e.cardId)?.upgrade);
    const removeTargets = run.deck ?? [];
    const c = [];
    if (stock.length) c.push(row(select(cid(run, 'shop-buy'), '购买牌（可多次购买）', optionsFrom(stock, cardName, (id) => `价格${CATALOG.shop.cardCostByEnergy[String(cardOf(id)?.cost)]}余烬`), canBuy.length === 0)));
    if (upgradeTargets.length) c.push(row(select(cid(run, 'shop-upgrade'), '付费升级实体牌', upgradeTargets.map((e) => ({ label: `#${e.uid} ${cardName(e.cardId)}`, value: String(e.uid), description: `升级 ${CATALOG.shop.upgradeCost} 余烬` })), r.services?.upgrade || run.embers < CATALOG.shop.upgradeCost)));
    if (removeTargets.length) c.push(row(select(cid(run, 'shop-remove'), '付费移除实体牌', removeTargets.map((e) => ({ label: `#${e.uid} ${cardName(e.cardId)}`, value: String(e.uid), description: `移除 ${CATALOG.shop.removeCost} 余烬` })), r.services?.remove || removeTargets.length <= CATALOG.shop.minimumDeck || run.embers < CATALOG.shop.removeCost)));
    c.push(row(button('免费离开', cid(run, 'shop-leave'), 2)));
    c.push(controlRow(run));
    return panel(`商店 · ${run.embers}余烬`, `牌价：1能量牌10余烬、2能量牌14余烬；升级12余烬；移除8余烬。${r.services?.upgrade ? '升级服务已用。' : ''}${r.services?.remove ? '移除服务已用。' : ''}`, c, update);
  }
  if (r.type === 'event') {
    const candidates = r.candidates ?? [];
    const c = [row(button(`付费治疗 ${CATALOG.event.healAmount}（${CATALOG.event.healCost}余烬）`, cid(run, 'event-heal-ask'), 1, run.hp >= CATALOG.player.maxHp || run.embers < CATALOG.event.healCost))];
    if (candidates.length) c.push(row(select(cid(run, 'event-card-ask'), `选择牌（${CATALOG.event.cardCost}余烬）`, optionsFrom(candidates, cardName), run.embers < CATALOG.event.cardCost)));
    c.push(row(button('免费离开', cid(run, 'event-leave'), 2)));
    c.push(controlRow(run));
    return panel(`钟楼修补 · ${run.embers}余烬`, '先选择治疗或候选牌，再确认付款。也可以免费离开。', c, update);
  }
  if (r.type === 'checkpoint') return panel('抵达幕间', `已完成第${r.completedAct ?? run.completedActs}幕。继续深入，或确认撤退并结算。`, [row(button('继续', cid(run, 'continue'))), controlRow(run, true)], update);
  return panel('远征', '当前没有可显示的地点。', [controlRow(run)], update);
}

function renderReward(run, update) {
  const reward = run.reward ?? {};
  const stage = reward.queue?.[reward.index];
  if (!stage) return panel('战利品', '当前奖励已处理。', [controlRow(run)], update);
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
  if (!run) return renderRogueHome();
  if (run.phase === 'BATTLE' && run.battle) return renderBattle(run, update);
  if (run.phase === 'REWARD') return renderReward(run, update);
  if (run.phase === 'RESULT') return renderResult(run, update);
  return renderRoom(run, update);
}

export function renderRogueConfirmation(run, kind, { update = false } = {}) {
  let title, body, yes;
  if (kind === 'retreat') {
    title = '确认撤退？'; body = '确认后将结束本次远征并结算。'; yes = button('确认撤退', cid(run, 'retreat-confirm'), 4);
  } else if (kind === 'abandon') {
    title = '确认放弃？'; body = '确认后这局立即结束。'; yes = button('确认放弃', cid(run, 'abandon-confirm'), 4);
  } else if (kind === 'event-heal') {
    title = '确认治疗？'; body = `将支付${CATALOG.event.healCost}余烬，恢复${CATALOG.event.healAmount}生命。`; yes = button('确认付款并治疗', cid(run, 'event-heal-confirm'), 1);
  } else if (kind && typeof kind === 'object' && kind.type === 'event-card' && typeof kind.cardId === 'string') {
    const def = cardOf(kind.cardId);
    if (!def) throw new TypeError('unknown event card');
    const fullText = cardText({ cardId: kind.cardId, upgraded: false });
    title = '确认购买？'; body = `将支付${CATALOG.event.cardCost}余烬，获得：${fullText}。`; yes = button('确认付款并获得', cid(run, 'event-card-confirm', kind.cardId), 1);
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
  let m = /^rl:(start|practice):(normal|challenge)$/.exec(customId);
  if (m) return { ui: m[1], mode: m[2] };
  const p = validRunParts(customId.split(':'));
  if (!p) return null;
  const { runId, version, action, arg } = p;
  const tagged = (a) => ({ runId, version, action: a });
  switch (action) {
    case 'refresh': return { ui: 'refresh', runId, version };
    case 'ask-retreat': return { ui: 'ask-retreat', runId, version };
    case 'ask-abandon': return { ui: 'ask-abandon', runId, version };
    case 'continue': return tagged({ type: 'CONTINUE' });
    case 'retreat-confirm': return tagged({ type: 'RETREAT', confirmed: true });
    case 'abandon-confirm': return tagged({ type: 'ABANDON', confirmed: true });
    case 'end': return tagged({ type: 'END_TURN' });
    case 'play': return Number.isSafeInteger(Number(arg)) && Number(arg) >= 0 ? tagged({ type: 'PLAY', uid: Number(arg) }) : null;
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
    case 'shop-leave': return tagged({ type: 'SHOP', choice: 'leave' });
    case 'event-leave': return tagged({ type: 'EVENT', choice: 'leave' });
    case 'event-heal-ask': return { ui: 'event-confirm', runId, version, kind: 'heal' };
    case 'event-heal-confirm': return tagged({ type: 'EVENT', choice: 'heal' });
    case 'event-card-ask': { const value = selection(values); return value ? { ui: 'event-confirm', runId, version, kind: 'card', cardId: value } : null; }
    case 'event-card-confirm': return arg ? tagged({ type: 'EVENT', choice: 'card', cardId: arg }) : null;
    default: return null;
  }
}
