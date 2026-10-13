import { supportTargetAllowed as supportTargetAllowed21 } from './rogue-card-effects-v21.mjs';
import { hasUsefulUpgrade } from './rogue-upgrade-validity.mjs';
import { supportTargetAllowed as supportTargetAllowed20 } from './rogue-card-effects-v20.mjs';
const supportTargetAllowed=(s,...args)=>['lantern-rules-v0.21','lantern-rules-v0.22'].includes(s?.ruleVersion)?supportTargetAllowed21(s,...args):s?.ruleVersion==='lantern-rules-v0.20'?supportTargetAllowed20(s,...args):supportTargetAllowedLegacy(s,...args);
import { supportPreview } from './rogue-card-effects-v21.mjs';
import { WORLD_INTRO, WORLD_STORY, PROFESSION_STORIES } from './rogue-lore.mjs';
import { cardGroups, cardEffectLines, cardWarnings, unavailableReason, playGuide } from './rogue-card-guide.mjs';
import { CATALOG } from './rogue-catalog.mjs';
import { legalCards, legalItems, legalEchoes } from './rogue-battle.mjs';
import { ITEMS, DIFFICULTIES, EVENTS } from './rogue-content-v07.mjs';
import { PROFESSIONS, CATALOG_V08, ITEMS as ITEMS_V08, EVENTS as EVENTS_V08, DIFFICULTIES as DIFFICULTIES_V08 } from './rogue-content-v08.mjs';
import { discountedDefinition, playLimitFor, supportTargetAllowed as supportTargetAllowedLegacy, NEW_TARGETS, hasHealing } from './rogue-card-effects-v18.mjs';
import { getCatalog } from './rogue-content.mjs';
import { DIFFICULTIES as DIFFICULTIES_V17 } from './rogue-difficulty-v17.mjs';
import { analyzeRogueBuild, explainRogueCandidate, previewRogueDeckChange } from './rogue-build-guide.mjs';
import { summarizeObservationLines } from './rogue-observation.mjs';
import {connectedPlanFor,routeNodeReference,nextRouteLabels,routeSupplyLines} from './rogue-route-view.mjs';
import { analyzeBuild, candidateFit as legacyCandidateFit } from './rogue-build-system.mjs';
import { candidateFit as candidateFit19 } from './rogue-build-system-v19.mjs';
const candidateFit=(run,id,catalog)=>['lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run?.ruleVersion)?candidateFit19(run,id,catalog):legacyCandidateFit(run,id,catalog);
import { normalizeEffectMetrics } from './rogue-effect-metrics.mjs';
import { enemyApproach, enemyDecisionCue } from './rogue-enemy-guide.mjs';
import { resourceEffectLines, lastResourceReceipt } from './rogue-resource-state.mjs';
let ACTIVE_CATALOG = getCatalog('0.22');
let ACTIVE_ITEMS = ITEMS;
let ACTIVE_EVENTS = EVENTS;
const v08 = (run) => /(?:^|[^0-9])0\.(?:[89]|1[0-9]|2[0-2])(?:$|[^0-9])/.test(String(run?.catalogVersion ?? run?.ruleVersion ?? ''));
const expanded = (run) => run?.catalogVersion == null && run?.ruleVersion == null || /(?:^|[^0-9])0\.(?:[789]|1[0-9]|2[0-2])(?:$|[^0-9])/.test(String(run?.catalogVersion ?? run?.ruleVersion ?? ''));
const useRunCatalog = (run) => { ACTIVE_CATALOG = getCatalog(run?.catalogVersion ?? run?.ruleVersion ?? '0.22'); ACTIVE_ITEMS = ACTIVE_CATALOG.items ?? ITEMS; ACTIVE_EVENTS = ACTIVE_CATALOG.events ?? (v08(run) ? EVENTS_V08 : EVENTS); return ACTIVE_CATALOG; };
function storyLines(run) {
  const story = run?.story;
  if (!story) return [];
  const lines = [];
  lines.push(...resourceEffectLines(run));
  return lines;
}

const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cap = (s, n) => [...String(s)].slice(0, n).join('');
const paymentLine = (embers, cost) => embers < cost ? `余额${embers}余烬，不足${cost - embers}余烬` : `付款后${embers - cost}余烬`;
const cardOf = (id) => ACTIVE_CATALOG.cards[id];
const relicOf = (id) => ACTIVE_CATALOG.relics[id];
const eventOf = (id) => Array.isArray(ACTIVE_EVENTS) ? ACTIVE_EVENTS.find((e) => e.eventId === id) : ACTIVE_EVENTS?.[id];
const cardName = (id) => cardOf(id)?.name ?? '未知牌';
const relicName = (id) => relicOf(id)?.name ?? '未知遗物';
const uid = (x) => Number.isSafeInteger(x) ? String(x) : '';

function cardText(entity, echoManual = false, battle = null) {
  const base = cardOf(entity?.cardId);
  if (!base) return '未知牌';
  const def = discountedDefinition(entity.upgraded ? { ...base, ...base.upgrade } : base,entity,battle);
  const effects = cardEffectLines(def, { echoManual }).join('、');
  const tags = [base.professionOnly ? `${ACTIVE_CATALOG.professions?.[base.professionOnly]?.name??'职业'}专属` : '', ...cardGroups(def).map(g => g.label)].filter(Boolean).join('/');
  const warnings = cardWarnings(entity, def).join(' · ');
  return `${base.name}${entity.upgraded ? '＋' : ''} · ${tags} · ${def.cost}能量 · ${effects}${def.replayable && !hasHealing(def) ? ' · 可回声' : ''}${warnings ? ` · ${warnings}` : ''}`;
}
function cardDef(entity,battle=null) {
  const b = cardOf(entity?.cardId);
  return b ? discountedDefinition(entity.upgraded ? { ...b, ...b.upgrade } : b,entity,battle) : null;
}
function buildLines(run) {
  if(['lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)){
    const report=analyzeBuild(run,ACTIVE_CATALOG);
    return ['构筑方向（组件参考）：', ...report.directions.map(d=>`${d.name}：${d.components.slice(0,3).join('、') || '尚无对应组件'}；${d.gaps.slice(0,2).join('；') || '组件存在，仍需安排兑现时机'}`), '牌组越厚，关键牌越难集中抽到；可以跳牌或改换方向。'];
  }
  const report = analyzeRogueBuild(run);
  if (!report.analyzed) return [];
  return ['构筑线索（仅核对已有组件）：', ...report.directions.map(d => `${d.name}：已有${d.components.join('、') || '暂无对应组件'}${d.gaps.length ? `；${d.gaps.join('；')}` : '；配合是否稳定仍取决于抽牌和出牌时机'}`), report.note];
}
function changePreview(run, entity, action) {
  const p = previewRogueDeckChange({ ...run, uid: entity.uid, action });
  if (!p.available) return p.supported ? p.reason : '';
  if (action === 'remove') return p.cycleEffect;
  const base = cardOf(entity.cardId);
  return `升级前：${base.cost}能量，${cardEffectLines(base).join('、')}\n升级后：${p.upgrade.after.cost}能量，${cardEffectLines({ ...base, ...base.upgrade }).join('、')}`;
}
function effectMetricLines(run){
  const m=normalizeEffectMetrics(run.effectMetrics);
  return [`实际治疗${m.healing} · 溢出${m.overheal} · 盾吸收${m.shieldAbsorbed}`, `备势投入${m.prepareConsumed} · 标记投入${m.markConsumed}（直伤仍受护甲与盾减免）`, `主动补抽${m.drawSucceeded} · 成功保留${m.retainSucceeded} · 强化牌使用${m.upgradedCardsPlayed} · 回声${m.echoReplays}次`];
}
const uidEligible = (run, source, kind) => {
  const deck = run.deck ?? [];
  if (kind === 'upgrade') {
    const eligible = source === 'event' && Array.isArray(run.room?.upgradeCandidates) ? new Set(run.room.upgradeCandidates) : null;
    return deck.filter((e) => !e.upgraded && cardOf(e.cardId)?.upgrade && (!['lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)||hasUsefulUpgrade(cardOf(e.cardId))) && (!eligible || eligible.has(e.uid)));
  }
  if (source === 'event' && Array.isArray(run.room?.removeCandidates)) {
    const eligible = new Set(run.room.removeCandidates);
    return deck.filter((e) => eligible.has(e.uid));
  }
  if (source === 'shop' || source === 'camp' || kind === 'remove') return deck;
  return [];
};
export function rogueUidEligible(run, source, kind, uid) {
  useRunCatalog(run);
  return uidEligible(run, source, kind).some((entry) => entry.uid === uid);
}
export function renderRogueUidPage(run, source, kind, page = 0, { update = false } = {}) {
  useRunCatalog(run);
  const entries = uidEligible(run, source, kind);
  const pageSize = ['lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) ? 5 : 25;
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const active = Math.min(totalPages - 1, Math.max(0, Number.isSafeInteger(page) ? page : 0));
  const visible = entries.slice(active * pageSize, (active + 1) * pageSize);
  const label = kind === 'upgrade' ? '升级' : '移除';
  const serviceCost = source === 'shop' ? (kind === 'upgrade' ? run.room?.prices?.upgrade ?? ACTIVE_CATALOG.shop.upgradeCost : run.room?.prices?.remove ?? ACTIVE_CATALOG.shop.removeCost) : 0;
  const serviceBalance = paymentLine(run.embers,serviceCost);
  const options = visible.map((e) => ({ label: `#${e.uid} ${cardName(e.cardId)}${e.upgraded ? '＋' : ''}`, value: String(e.uid), description: source === 'shop' ? cap(`${cardText(e)} · 同名持有${(run.deck ?? []).filter(x => x.cardId === e.cardId).length}张 · ${kind === 'upgrade' ? '升级' : '移除'}${serviceCost}余烬 · ${serviceBalance}`, 100) : cardText(e) }));
  const c = [];
  if (options.length) c.push(row(select(cid(run, 'uid-select', `${source}:${kind}`), `选择要${label}的实体牌`, options)));
  else c.push(row(button('没有可选牌', cid(run, 'refresh', 'empty'), 2, true)));
  c.push(row(button('上一页', cid(run, 'uid-prev', `${source}:${kind}:${Math.max(0, active - 1)}`), 2, active === 0), button('下一页', cid(run, 'uid-next', `${source}:${kind}:${Math.min(totalPages - 1, active + 1)}`), 2, active >= totalPages - 1)));
  c.push(row(button(source === 'shop' ? '返回商店' : '返回房间', cid(run, 'refresh'), 2)));
  const previews = ['lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) ? visible.map(e => `#${e.uid} ${cardName(e.cardId)}${source === 'shop' ? ` · ${kind === 'upgrade' ? '升级' : '移除'}${serviceCost}余烬，${serviceBalance}` : ''}\n${changePreview(run, e, kind)}`).join('\n\n') : '';
  const minimumDeck = ACTIVE_CATALOG.shop.minimumDeck ?? 0;
  const minNote = source === 'shop' && kind === 'remove' && (run.deck ?? []).length <= minimumDeck ? `\n已达最小牌组${minimumDeck}张，移除服务不可用。` : '';
  return panel(`${source === 'shop' ? '商店' : source === 'camp' ? '营地' : '事件'} · ${label}牌`, `${kind === 'upgrade' ? '未升级且支持升级' : '所有牌'} · 第${active + 1}/${totalPages}页 · 共${entries.length}张。选择要处理的牌。${minNote}${previews ? `\n\n${previews}` : ''}${source === 'shop' && lastResourceReceipt(run) ? `\n最近交易：${lastResourceReceipt(run)}` : ''}`, c, update);
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
  const items = options.slice(0, 25).map((o) => ({ label: cap(o.label, 80), value: cap(String(o.value), 100), ...(o.description ? { description: cap(o.description, 100) } : {}), ...(o.default === true ? { default: true } : {}) }));
  return { type: 3, custom_id, placeholder: cap(placeholder, 150), min_values: 1, max_values: 1, options: items, ...(disabled ? { disabled: true } : {}) };
}
function panel(title, description, components = [], update = false) {
  if (components.length > 5) throw new RangeError('legacy Discord panels support at most five rows');
  const customIds = new Set();
  for (const r of components) {
    if (r.type !== 1 || r.components.length > 5 || r.components.filter((c) => c.type === 3).length > 1) throw new RangeError('invalid legacy Discord action row');
    for (const c of r.components) {
      if (c.custom_id && customIds.has(c.custom_id)) throw new RangeError('duplicate Discord component custom_id');
      if (c.custom_id) customIds.add(c.custom_id);
    }
    for (const c of r.components) if (c.custom_id?.length > 100 || (c.type === 2 && c.label.length > 80) || (c.type === 3 && c.options.length > 25)) throw new RangeError('legacy Discord component limit exceeded');
  }
  const data = { flags: 64, content: '', embeds: [{ title: cap(title, 256), description: cap(description, 4096), color: 0x8b5a2b }], components, allowed_mentions: { parse: [] } };
  return { type: update ? 7 : 4, data };
}
function optionsFrom(ids, nameFn, extra = () => '') { return ids.map((id) => ({ label: cap(nameFn(id), 80), value: String(id), description: cap(extra(id), 100) })); }
function controlRow(run, checkpoint = false) {
  return row(button('刷新面板', cid(run, 'refresh'), 2), button('牌组详情', cid(run, 'details', 'deck'), 2), button('迷城地图', cid(run, 'details', 'map:0'), 2), checkpoint ? button('确认撤退', cid(run, 'ask-retreat'), 4) : button('放弃远征', cid(run, 'ask-abandon'), 4), button('玩法与故事', cid(run, 'details', 'guide:0'), 2));
}

export const rogueCommand = { name: '灯下迷城', description: '打开灯下迷城远征面板', type: 1, integration_types: [0], contexts: [0] };
export function rogueInteraction(i) {
  return i?.type === 2 && i.data?.name === '灯下迷城' || [3, 5].includes(i?.type) && typeof i.data?.custom_id === 'string' && i.data.custom_id.startsWith('rl:');
}

export function renderRogueHome({ challengeProfession = null, homeInfo = {}, update = false } = {}) {
  const professions = Object.entries(PROFESSIONS);
  const defaultProfession = professions.some(([id]) => id === 'traveler') ? 'traveler' : professions[0]?.[0];
  const choices = professions.map(([id, p]) => ({ label: `${p.name} · ${p.description ?? '选择此职业开局'}`, value: id }));
  const components = [
    row(button('开始普通远征', `rl:settings:${defaultProfession ?? 'traveler'}`, 1), button(`每日挑战${challengeProfession ? ` · ${PROFESSIONS[challengeProfession]?.name ?? ''}` : ''}`, 'rl:start:challenge', 1)),
  ];
  if (choices.length > 1) components.push(row(select('rl:settings-profession', '选择职业并查看已解锁难度', choices)));
  components.push(row(button('每日挑战练习', 'rl:practice:challenge', 2), button('查看榜单', 'rl:board', 2), button('玩法指南', 'rl:guide', 2), button('世界与角色', 'rl:lore', 2)));
  const hint = '每轮抽5张、3能量、最多打3张；全程15个站点。\n普通远征的难度按职业分别解锁；每日挑战的职业与难度由服务器固定。';
  const progress = (homeInfo.progress ?? []).map((p) => `${PROFESSIONS[p.professionId]?.name ?? p.professionId} ${p.unlocked}/10（通关${p.clears ?? 0}）`);
  const challenge = homeInfo.challengeProfession ? `${PROFESSIONS[homeInfo.challengeProfession]?.name ?? homeInfo.challengeProfession} · 难度${homeInfo.challengeDifficulty ?? 0}` : challengeProfession ? `${PROFESSIONS[challengeProfession]?.name ?? challengeProfession} · 难度${homeInfo.challengeDifficulty ?? 0}` : '服务器每日固定';
  return panel('灯下迷城', `${WORLD_INTRO}\n\n先选择职业，再查看已解锁的难度。\n正式局：每天前2次开局可获得金币奖励，实际到账受每日上限限制。\n练习局：不发金币、不占奖励开局次数；通关也能推进职业难度。\n每日挑战：${challenge}\n职业进度：${progress.join('；') || '各职业从难度0开始'}\n\n${hint}`, components, update);
}

export function renderRogueSettings({ professionId, difficulty = 0, mode = 'normal', homeInfo = {}, update = false, catalogVersion = '0.22' } = {}) {
  const prof = getCatalog(catalogVersion).professions?.[professionId] ?? PROFESSIONS[professionId];
  if (!prof) return renderRogueHome({ update });
  const progress = (homeInfo.progress ?? []).find((p) => p.professionId === professionId);
  const unlocked = Math.max(0, Math.min(10, Number.isInteger(progress?.unlocked) ? progress.unlocked : 0));
  const selected = Math.max(0, Math.min(unlocked, Number.isInteger(difficulty) ? difficulty : 0));
  const allDifficulties = /0\.(?:1[789]|2[0-2])/.test(String(catalogVersion)) ? DIFFICULTIES_V17 : /0\.(?:[89]|1[0-9]|2[0-2])/.test(String(catalogVersion)) ? DIFFICULTIES_V08 : (Array.isArray(DIFFICULTIES) ? DIFFICULTIES : Object.values(DIFFICULTIES ?? {}));
  const diffs = allDifficulties.filter((d) => Number.isInteger(d.level) && d.level <= unlocked).sort((a,b) => a.level-b.level);
  const difficultyDef = allDifficulties.find((x) => x.level === selected);
  const options = diffs.map((d) => ({ label: `${d.level} · ${d.name}`, value: String(d.level), description: d.description ?? '' }));
  const cumulativeRules = diffs.filter((d) => d.level <= selected).map((d) => `${d.level}级 ${d.name}：${d.description ?? ''}`);
  const components = [];
  if (options.length) components.push(row(select(`rl:settings-difficulty:${professionId}`, `已解锁难度（当前 ${selected}）`, options)));
  components.push(row(button(`正式开局 · 难度${selected}`, `rl:start:normal:${professionId}:${selected}`, 1), button(`练习开局 · 难度${selected}`, `rl:practice:normal:${professionId}:${selected}`, 2)));
  components.push(row(button('角色故事', `rl:lore:${professionId}`, 2), button('返回首页', 'rl:home', 2)));
  const exclusiveNote = /0\.(?:1[89]|2[0-2])/.test(String(catalogVersion)) ? `\n职业专属池：${Object.values(getCatalog(catalogVersion).cards).filter(c=>c.professionOnly===professionId).length}张；其余公共牌可跨职业混搭。` : '';
  return panel(`${prof.name} · 开局设置`, `${prof.description ?? ''}${exclusiveNote}\n${PROFESSION_STORIES[professionId]?.motive ?? ''}\n\n职业难度：${unlocked}/10 已解锁 · 通关 ${progress?.clears ?? 0} 次。当前选择：难度${selected}「${difficultyDef?.name ?? '基准'}」。\n累计规则：${cumulativeRules.join('；')}\n选择更高难度需要先在本职业通关。\n\n正式开局：每日前2次可获得金币奖励；超过仍可游玩。\n练习开局：不发金币、不占奖励次数；通关也按职业记录进度。`, components, update);
}

export function renderRogueReading(kind = 'guide', professionId, { update = false, run = null } = {}) {
  const lore = PROFESSION_STORIES[professionId];
  const guide = kind === 'guide';
  const rules = run ? useRunCatalog(run).player : getCatalog('0.22').player;
  const body = guide ? playGuide({ ...rules, modern: !run || expanded(run), echoManual: !run || ['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run?.ruleVersion), turnLimit: rules.turnLimit, newCards: !run || ['lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) })
    : lore ? `${lore.background}\n\n出发动机：${lore.motive}\n招牌打法：${lore.signature}\n\n这是《灯下迷城》盒内角色的故事。`
    : WORLD_STORY;
  const buttons = run
    ? [button('玩法指南', cid(run, 'details', 'guide:0'), guide ? 1 : 2), button('角色故事', cid(run, 'details', 'lore:0'), guide ? 2 : 1)]
    : [button('玩法指南', 'rl:guide', guide ? 1 : 2), button('迷城世界观', 'rl:lore', !guide && !lore ? 1 : 2)];
  const components = [row(...buttons)];
  if (!run && !guide) components.push(row(select('rl:lore-profession', '阅读一位角色的背景', Object.entries(PROFESSION_STORIES).map(([id,p])=>({label:p.name,value:id,description:p.motive})))));
  components.push(row(run ? button('返回远征', cid(run, 'refresh'), 2) : button('返回首页', 'rl:home', 2), ...(!run && lore ? [button('选择该角色', `rl:settings:${professionId}`, 1)] : [])));
  return panel(guide ? '灯下迷城 · 玩法指南' : lore ? `${lore.name} · 背景故事` : '灯下迷城 · 酒馆里的长夜', body, components, update);
}

export function renderRogueBoard(board = {}, { update = false } = {}) {
  const entries = Array.isArray(board) ? board : (board.rows ?? board.entries ?? []);
  const lines = entries.slice(0, 20).map((r) => `${Number.isFinite(r.rank) ? r.rank : '—'}. ${esc(r.name ?? '旅人')} · ${Number.isFinite(r.score) ? r.score : 0}分`);
  const day = board.day ? `日期：${esc(board.day)}\n` : '';
  const difficulty = Number.isInteger(board.difficulty) ? board.difficulty : Number.isInteger(board.challengeDifficulty) ? board.challengeDifficulty : null;
  const challenge = difficulty === null ? '' : `每日挑战难度：${difficulty}\n`;
  return panel('远征榜单', `${day}${challenge}${lines.length ? lines.join('\n') : '今日还没有榜单记录。'}`, [row(button('返回首页', 'rl:home', 2))], update);
}

export function renderRogueDetails(run, kind = 'deck', { update = false, page = 0 } = {}) {
  useRunCatalog(run);
  let entries = [];
  let title = '远征详情';
  if (kind === 'guide' || kind === 'lore') return renderRogueReading(kind, run.professionId, { update, run });
  if (kind === 'hand') {
    title = '手牌详情';
    const b = run.battle;
    const legal = b ? new Set(legalCards(b).map(e => e.uid)) : new Set();
    entries = b ? (b.hand ?? []).map(e => {
      const reason = unavailableReason(b, cardDef(e), expanded(run) ? 3 : 2, legal, e.uid);
      return `#${e.uid} ${cardText(e)}${reason ? `\n不可用：${reason}` : ''}`;
    }) : ['当前不在战斗中。'];
  } else if (kind === 'map') {
    title = '迷城地图';
    const nodes = [];
    const plan = run.mapPlan;
    if (Array.isArray(plan)) {
      for (let ai = 0; ai < plan.length; ai++) {
        const actPlan = plan[ai];
        const slots = Array.isArray(actPlan) ? actPlan : (actPlan?.slots ?? actPlan?.nodes ?? []);
        for (let si = 0; si < slots.length; si++) {
          const choices = Array.isArray(slots[si]) ? slots[si] : (slots[si]?.nodes ?? []);
          nodes.push({ act: ai + 1, slot: si + 1, choices });
        }
        const bossId = run.bosses?.[ai] ?? actPlan?.bossId;
        if (bossId) nodes.push({ act: ai + 1, slot: 5, choices: [{ id: `a${ai + 1}s5boss`, type: 'boss', title: ACTIVE_CATALOG.enemies[bossId]?.name ?? '幕末Boss', description: '固定的幕末Boss战。', enemyId: bossId }] });
      }
    }
    const path = new Map((run.path ?? []).map((p) => [`${p.act}:${p.slot}`, p]));
    entries = nodes.flatMap(({ act, slot, choices }) => {
      const chosen = path.get(`${act}:${slot}`);
      const connectedPlan=connectedPlanFor(run,act);
      const chosenRef=connectedPlan&&chosen?routeNodeReference(connectedPlan,chosen.nodeId):null;
      const head = `第${act}幕 · 站点${slot}${chosen ? ` · 已选 ${chosenRef?.node.title ?? chosen.title ?? chosen.type ?? chosen.nodeId}` : ''}`;
      const lines = (choices ?? []).map((node) => {
        const enemy = node.enemyId ? ACTIVE_CATALOG.enemies[node.enemyId] : null;
        const stats = enemy ? ` · ${enemy.name}生命${enemy.hp}护甲${enemy.armor}` : '';
        const danger = node.dangerous ? ' · 危险路线' : '';
        const event = node.eventId ? (eventOf(node.eventId)?.title ?? node.eventId) : '';
        const reference=connectedPlan?routeNodeReference(connectedPlan,node.id)?.label:null;
        const next=connectedPlan&&slot<5?`\n  通往：${nextRouteLabels(connectedPlan,node.id).join('、')}`:'';
        const current=connectedPlan&&act===run.act&&slot===run.slot&&run.phase==='ROUTE'&&!run.room?.choices?.includes(node.id)?' · 支路外':'';
        return `  ${reference ?? node.id ?? node.type}：${node.title ?? (node.type === 'normal' ? '普通战斗' : node.type === 'elite' ? '精英战斗' : node.type === 'camp' ? '营地' : node.type === 'shop' ? '商店' : event || '事件')}${danger}${stats}${current}\n  ${node.description ?? ''}${next}`;
      });
      return [head, ...lines];
    });
    if (!entries.length) entries = ['这局没有保存地图计划。'];
  } else if (kind === 'relics') {
    title = '遗物详情';
    entries = (run.relics ?? []).map((id) => `${relicName(id)}：${relicOf(id)?.description ?? ''}`);
    if (!entries.length) entries = ['尚未获得遗物。'];
  } else if (kind === 'inventory') {
    title = '道具详情';
    entries = (run.inventory ?? []).map((id, i) => `槽${i + 1} · ${ACTIVE_ITEMS[id]?.name ?? id}：${ACTIVE_ITEMS[id]?.description ?? ''}`);
    if (!entries.length) entries = ['两个道具槽目前都是空的。'];
  } else {
    title = '牌组详情';
    entries = (run.deck ?? []).map((entity) => `#${entity.uid} ${cardText(entity)}`);
    if (!entries.length) entries = ['牌组为空。'];
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / 12));
  const activePage = Math.max(0, Math.min(totalPages - 1, Number.isSafeInteger(page) ? page : 0));
  const visible = entries.slice(activePage * 12, (activePage + 1) * 12);
  const intro = kind === 'deck' ? `职业：${(ACTIVE_CATALOG.professions?.[run.professionId] ?? PROFESSIONS[run.professionId])?.name ?? '提灯旅人'}。${(ACTIVE_CATALOG.professions?.[run.professionId] ?? PROFESSIONS[run.professionId])?.description ?? ''}\n` : '';
  const hints = kind === 'deck' ? buildLines(run).join('\n') : '';
  const metrics=kind==='deck'&&run.effectMetrics ? effectMetricLines(run).join('\n') : '';
  const description = `${intro}${hints ? `${hints}\n\n` : ''}${visible.join('\n')}${metrics ? `\n\n本局兑现记录：\n${metrics}` : ''}\n\n第${activePage + 1}/${totalPages}页 · 共${entries.length}项`;
  const paging = row(button('上一页', cid(run, 'details-prev', `${kind}:${Math.max(0, activePage - 1)}`), 2, activePage === 0), button('下一页', cid(run, 'details-next', `${kind}:${Math.min(totalPages - 1, activePage + 1)}`), 2, activePage >= totalPages - 1));
  return panel(title, description, [row(button('牌组', cid(run, 'details', 'deck:0'), kind === 'deck' ? 1 : 2), button('地图', cid(run, 'details', 'map:0'), kind === 'map' ? 1 : 2), button('遗物', cid(run, 'details', 'relics:0'), kind === 'relics' ? 1 : 2), button('道具', cid(run, 'details', 'inventory:0'), kind === 'inventory' ? 1 : 2), button('玩法与故事', cid(run, 'details', 'guide:0'), 2)), paging, row(button('返回远征', cid(run, 'refresh'), 2))], update);
}

function renderBattle(run, update) {
  useRunCatalog(run);
  const b = run.battle ?? {};
  const enemy = ACTIVE_CATALOG.enemies[b.enemyId] ?? {};
  const intent = b.intent ?? {};
  const actionText = (action = {}) => {
    if(action.kind==='tempo')return `节奏检验：本轮至多${action.playThreshold}张→${actionText(action.onCalm)}；超过${action.playThreshold}张→${actionText(action.onRush)}`;
    const total = (action.hits ?? 1) * (action.value ?? 0);
    const actionLabel = ['attack','charge'].includes(action.kind) && action.label ? action.label.split(/[：:]/,1)[0].replace(/[0-9]+(?:×[0-9]+)?$/u,'') : action.label;
    const base = actionLabel ?? ({ attack: '攻击', guard: '架盾', charge: '蓄力', burn: '施加灼烧', cleanse: '清除灼烧', heal: '治疗', armor: '获得护甲', thorns: '反伤姿态', conditional: '条件意图' }[action.kind] ?? action.kind ?? '未知意图');
    const amount = action.kind === 'attack' || action.kind === 'charge' ? `（${action.value ?? 0}×${action.hits ?? 1}，合计${total}）`
      : ['guard','burn','cleanse','heal','armor','thorns'].includes(action.kind) ? `（${action.value ?? 0}）` : '';
    const extras = [];
    if(action.startShield)extras.push(`本轮开场护盾${action.startShield}`);
    if (action.armor != null) extras.push(`护甲${action.armor}`);
    if (action.thorns != null) extras.push(`本轮首次主动直伤反伤${action.thorns}`);
    if (action.shieldAfter != null) extras.push(`攻击后架盾${action.shieldAfter}`);
    return `${base}${amount}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
  };
  let intentLine;
  if (intent.kind === 'conditional') intentLine = `公开分支：首张含直伤→${actionText(intent.onAttack)}；首张不含直伤／未出牌→${actionText(intent.onOther)}`;
  else if(intent.kind==='tempo')intentLine=actionText(intent);
  else if (intent.kind === 'charge') intentLine = `蓄力预告：下轮${actionText(intent.next ?? { ...intent, kind: 'attack' })}`;
  else intentLine = actionText(intent);
  const decisionCue = ['lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) ? enemyDecisionCue(b) : '';
  if (decisionCue) intentLine += `\n${decisionCue}`;
  const drawCount = expanded(run) ? 5 : 4, playLimit = ['lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) ? playLimitFor(b) : expanded(run) ? 3 : 2;
  const playerMaxHp = run.maxHp ?? (expanded(run) && (run.difficulty ?? 0) >= 6 ? 28 : ACTIVE_CATALOG.player.maxHp);
  const newState = [b.bankedShield ? `下轮护盾${b.bankedShield}` : '', b.hitReduction ? `首段减伤${b.hitReduction}` : '', b.extraPlays ? '额外行动已生效' : ''].filter(Boolean);
  const enemyStates = [[b.enemyArmor,'护甲'],[b.enemyShield,'护盾'],[b.enemyBurn,'灼烧']].filter(([n]) => n > 0).map(([n,label]) => `${label}${n}`);
  const description = [`**敌人**　${enemy.name ?? '敌人'} · 生命${b.enemyHp ?? '?'}${enemyStates.length ? ` · ${enemyStates.join(' · ')}` : ''}`, `**意图**　${intentLine}`, '', `**你**　生命${b.hp ?? run.hp}/${b.maxHp ?? playerMaxHp} · 护盾${b.shield ?? 0}`, `能量 ${b.energy ?? 0} · 已出牌 ${b.plays ?? 0}/${playLimit}${b.burn > 0 ? `\n⚠ 灼烧${b.burn}：轮末扣血，护盾挡不住` : ''}`];
  if(['lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)){const limited=(b.relics??[]).filter(id=>ACTIVE_CATALOG.relics[id]?.maxTriggersPerBattle!=null);if(limited.length)description.push('灼烧遗物剩余触发：'+limited.map(id=>`${ACTIVE_CATALOG.relics[id].name}${Math.max(0,ACTIVE_CATALOG.relics[id].maxTriggersPerBattle-(b.relicTriggerCounts?.[id]??0))}次`).join(' · '));}
  if(newState.length)description.push(newState.join(' · '));
  if (run.room?.storyEffect) description.push(`本战影响：${String(run.room.storyEffect).replace('每段攻击+1','每段敌方攻击伤害+1')}`);
  description.push(...storyLines(run));
  if ((b.turn ?? 0) <= 1 && run.resourceLog?.at(-1)?.act === run.act && run.resourceLog.at(-1).slot === run.slot - 1) description.push(lastResourceReceipt(run));
  if (b.enemyPhase === 2) {
    description.push((b.phaseStartTurn ?? 0) > (b.turn ?? 0)
      ? `第二阶段已触发：敌人获得阶段护盾；新阶段意图从第${b.phaseStartTurn}轮开始生效。`
      : '敌人已进入第二阶段，新阶段意图正在生效。');
  }
  const phaseName = b.phaseName ?? enemy.phaseName ?? enemy.phases?.[b.enemyPhase - 1]?.name ?? enemy.phases?.[b.enemyPhase]?.name;
  if(['lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) && b.phaseNextIntent && b.phaseStartTurn>b.turn)description.push(`下轮阶段开场：${actionText(b.phaseNextIntent)}`);
  if ((b.enemyPhase ?? 1) >= 2 && phaseName) description.push(`敌人阶段：${phaseName}`);
  const resources = [];
  if (b.prepare) resources.push(`备势${b.prepare}`); if (b.mark) resources.push(`标记${b.mark}`); if (b.forge) resources.push(`锻造${b.forge}`);
  if (b.petHp > 0) resources.push(`伙伴生命${b.petHp}`);
  if (resources.length) description.push(resources.join(' · '));
  if(b.pressurePlan)description.push(`持久战压力：当前每段攻击+${b.enemyPressure??0}；第${b.pressurePlan.startTurn}轮起+1${b.pressurePlan.max>1?'，第'+(b.pressurePlan.startTurn+b.pressurePlan.step)+'轮起+2':''}，最多+${b.pressurePlan.max}。蓄力预告已计入对应轮次压力；无回合数失败限制。`);
  if(b.ruleVersion==='lantern-rules-v0.22'){
   description.push(`第${b.actIndex}幕攻击强化已计入上方实际意图。`);
   if(b.intent.recordMode)description.push(`记录${b.intent.recordMode==='first'?'本轮首张主动牌':'本轮最终出牌数'}，回合结束锁定下一轮：${Object.entries(b.responseOptions??{}).map(([key,value])=>({attack:'首牌直伤',other:'首牌非直伤或未出牌',few:'至多2张',many:'至少3张'}[key])+':'+actionText(value)).join('；')}。当前预判：${actionText(b.responsePreview)}。`);
   if(b.furnaceArmed)description.push(`炉盾剩余${b.enemyShield}/${b.furnaceShieldMax}；${b.furnaceBroken?'已破，下一击削弱':'蓄力轮结束前击破可削弱重击；灼烧不拆盾'}。`);
   if(b.intent.furnaceStrike)description.push(b.intent.furnaceWeakened?'炉盾已破：本次为削弱重击。':'炉盾未破：本次为完整重击。');
   if(b.enemyPhasePending===2)description.push('半血阶段已触发：当前循环与已预告攻击保持，整理/散热结束后进入第二阶段。');
  }
  const legal = new Set(legalCards(b).map((c) => c.uid));
  const components = [];
  const disabledReasons = [];
  const hand = (b.hand ?? []).slice(0, drawCount);
  description.push('', '**手牌：**', ...hand.map(e => {
    const def = cardDef(e,b);
    const context=['lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)?supportPreview(b,{...def,uid:e.uid},ACTIVE_CATALOG):'';
    const brief = cardEffectLines(def, { echoManual: ['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) }).join('、');
    return `#${e.uid} **${cardName(e.cardId)}${e.upgraded ? '＋' : ''}**${def?.professionOnly?' · 职业专属':''} · ${def?.cost ?? '?'}费 · ${brief}${context?' · '+context:''}${['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)&&def?.replayable&&!def.effects.some(x=>x.kind==='heal')?' · 可回声':''}${def?.exhaust ? ' · 消耗' : ''}${def?.selfCost ? ` · 自损${def.selfCost}${def.selfCost >= (b.hp ?? run.hp) ? ' ⚠ 自损会倒下' : ''}` : ''}`;
  }));
  const playOptions = [];
  const targetEffects = new Set(['sift', 'exhaust_other', 'retain', ...NEW_TARGETS]);
  const handTargets = hand.filter((e) => e != null);
  for (const e of hand) {
    const def = cardDef(e,b);
    const reason = unavailableReason({ ...b, hp: b.hp ?? run.hp, maxHp: b.maxHp ?? playerMaxHp }, def, playLimit, legal, e.uid);
    if (reason) disabledReasons.push(`#${e.uid} ${cardName(e.cardId)}：${reason}`);
    const requiredTarget = (def?.effects ?? []).some((x) => targetEffects.has(x.kind)) && !((def?.effects ?? []).some((x) => !targetEffects.has(x.kind)));
    const targets = handTargets.filter((t) => t.uid !== e.uid && supportTargetAllowed(b,def,t,ACTIVE_CATALOG));
    if (requiredTarget && !targets.length) { disabledReasons.push(`#${e.uid} ${cardName(e.cardId)}：没有合法目标`); continue; }
    if (reason) continue;
    const prefix = `#${e.uid} ${cardName(e.cardId)}${e.upgraded ? '＋' : ''} · ${def.cost}费${def.selfCost ? ` · 自损${def.selfCost}` : ''}${def.exhaust ? ' · 消耗' : ''}`;
    if ((def?.effects ?? []).some((x) => targetEffects.has(x.kind))) {
      if (!requiredTarget) playOptions.push({ label: `${prefix} · 不选目标`, value: `p:${e.uid}:n`, description: `${cardText(e, ['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion),b)} · 只执行基础效果` });
      for (const t of targets) playOptions.push({ label: `${prefix} → #${t.uid} ${cardName(t.cardId)}`, value: `p:${e.uid}:t:${t.uid}`, description: `${cardText(e, ['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion),b)}；目标：${cardName(t.cardId)}` });
    } else playOptions.push({ label: prefix, value: `p:${e.uid}:n`, description: cardText(e, ['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion),b) });
  }
  const criticalHint = intent.kind === 'conditional' ? `本轮首张：${b.firstCardKind === 'attack' ? '已选攻击分支' : b.firstCardKind === 'other' ? '已选其他分支' : '尚未出牌，留意上方分支'}` : '';
  if (criticalHint) description.push(`本轮提示：${criticalHint}`);
  if (['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)) {
    const directKinds = new Set(['damage','pet_attack','weapon_attack','sacrifice','damage_from_shield']);
    const directCards = hand.filter(e => cardDef(e,b)?.effects?.some(x => directKinds.has(x.kind))).map(e => `#${e.uid} ${cardName(e.cardId)}`);
    const weaponCards = hand.filter(e => cardDef(e,b)?.effects?.some(x => x.kind === 'weapon_attack')).map(e => `#${e.uid} ${cardName(e.cardId)}`);
    const petCards = hand.filter(e => cardDef(e,b)?.effects?.some(x => ['pet_attack','sacrifice'].includes(x.kind))).map(e => `#${e.uid} ${cardName(e.cardId)}`);
    if ((b.prepare || b.mark) && directCards.length) description.push(`可联动：备势${b.prepare ?? 0}／标记${b.mark ?? 0}会强化下一张直伤牌：${directCards.slice(0,3).join('、')}`);
    if (b.forge && weaponCards.length) description.push(`可联动：锻值${b.forge}会加到武器攻击：${weaponCards.slice(0,3).join('、')}`);
    if (b.petHp && petCards.length) description.push(`可联动：灯灵可支援伙伴攻击牌：${petCards.slice(0,3).join('、')}`);
    if (b.counter && ['attack','charge'].includes(intent.kind)) description.push(`可联动：本轮反击${b.counter}，护盾实际挡住攻击后会自动反击一次`);
    const echoes = legalEchoes(b);
    if (b.echoReady) description.push(echoes.length
      ? `回声已蓄能${b.echoCharges}次：${echoes.length}张已打出的牌可选；点“使用回声”安排到下轮。`
      : (b.echoCount >= 3 ? '本战回声次数已用完（最多3次）。' : '回声已蓄能：先打出一张牌面标有“可回声”的牌，再点“使用回声”。'));
    if (b.pendingEchoes?.length) description.push(`下轮自动重放：${b.pendingEchoes.map(e => `${cardName(e.cardId)}${e.upgraded?'＋':''}`).join('、')}`);
  }
  if (disabledReasons.length) description.push(`不可用：${disabledReasons.map(s => s.replace('生命已满，纯治疗牌不可用','生命已满')).join('；')}`);
  if (playOptions.length) components.push(row(select(cid(run, 'play-target'), `选择牌与目标 · 剩余${Math.max(0, playLimit - (b.plays ?? 0))}次出牌 · ${b.energy ?? 0}能量`, playOptions)));
  else if (hand.length) components.push(row(select(cid(run, 'play-target'), '本轮没有可打出的牌', [{ label: '无可用牌', value: 'none' }], true)));
  const inventory = Array.isArray(run.inventory) ? run.inventory : [];
  const usedItem = Boolean(b.itemUsed || b.itemsUsed || run.itemsUsedThisBattle);
  const legalItemIndexes = new Set(legalItems(b).map((item) => item.itemIndex));
  if (inventory.length) {
    const labels = inventory.slice(0, 2).map((id, index) => {
      const available = legalItemIndexes.has(index);
      let why = '';
      if (!available && !usedItem) {
        const effects = ACTIVE_ITEMS[id]?.effects ?? [];
        if (effects.every((e) => e.kind === 'heal') && (b.hp ?? run.hp) >= (b.maxHp ?? playerMaxHp)) why = ' · 生命已满';
        else if (effects.every((e) => e.kind === 'cleanse_player') && !(b.burn > 0)) why = ' · 当前无灼烧';
        else why = ' · 当前不可用';
      }
      return { id, index, label: `${ACTIVE_ITEMS[id]?.name ?? id}${why}`, available };
    });
    description.push(`道具：${labels.map((x) => `${x.index + 1}. ${ACTIVE_ITEMS[x.id]?.name ?? x.id}`).join('；')} · 本战${usedItem ? '已使用' : '最多使用1件，不占出牌次数'}`);
    components.push(row(...labels.map((x) => button(x.label, cid(run, 'item', x.index), 2, !x.available))));
  }
  components.push(row(button('结束本轮', cid(run, 'end'), 2, Boolean(b.result)), button('手牌详情', cid(run, 'details', 'hand:0'), 2)));
  if (['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)) components.push(row(button(b.echoReady ? '使用回声' : '回声说明', cid(run, 'echo'), 1)));
  components.push(controlRow(run));
  const totalStations = expanded(run) ? 15 : 9;
  const stations = Math.min(totalStations, (run.completed ?? 0) + 1);
  description.unshift(`第${run.act ?? '?'}幕 · 站点 ${stations}/${totalStations}${expanded(run) ? ` · 难度${run.difficulty ?? 0}` : ''} · 余烬${run.embers ?? 0} · 剩余${Math.max(0, 12 - (b.turn ?? 0))}轮`, '');
  return panel(`第${b.turn ?? '?'}轮战斗`, description.join('\n'), components, update);
}

export function renderRogueEchoMenu(run, { update = false, page = 0 } = {}) {
  useRunCatalog(run);
  if (!['lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run?.ruleVersion) || run.phase !== 'BATTLE' || !run.battle) return panel('回声控制', '当前规则或阶段不能使用回声。', [row(button('返回远征', cid(run, 'refresh'), 2))], update);
  const b = run.battle;
  const choices = legalEchoes(b);
  const pages = Math.max(1, Math.ceil(choices.length / 25));
  const activePage = Math.max(0, Math.min(pages - 1, Number.isSafeInteger(page) ? page : 0));
  const body = b.echoReady
    ? b.echoCount >= 3
      ? '本战的3次回声已经用完。'
      : choices.length
        ? `回声已蓄能${b.echoCharges}次。选一张你在蓄能后打出的“可回声”牌，安排它在下轮开始时免费重放。\n\n不消耗能量或出牌次数；带自损的牌会再次支付生命。治疗牌不能回声。\n\n本战已安排${b.echoCount}/3次。`
        : '回声已蓄能，但还没有可选的牌。先打出一张牌面标有“可回声”的牌，再回到这里选择它。'
    : '回声分两种：带“本牌回声”的牌会自动安排；“蓄能”牌会给你一次选择机会。蓄能后打出一张“可回声”的牌，再点“使用回声”选择它。最多安排3次；治疗牌不能回声。';
  const components = [];
  if (choices.length) {
    const options = choices.slice(activePage * 25, (activePage + 1) * 25).map(e => ({
      label: `#${e.uid} ${cardName(e.cardId)}${e.upgraded ? '＋' : ''}`,
      value: String(e.uid),
      description: cardText({ cardId: e.cardId, upgraded: e.upgraded }, true),
    }));
    components.push(row(select(cid(run, 'echo-pick'), '选择一张已打出的牌', options)));
  }
  if (pages > 1) components.push(row(button('上一页', cid(run, 'echo-page', Math.max(0, activePage - 1)), 2, activePage === 0), button('下一页', cid(run, 'echo-page', Math.min(pages - 1, activePage + 1)), 2, activePage === pages - 1)));
  components.push(row(button('返回战斗', cid(run, 'refresh'), 2)));
  return panel('回声 · 选择联动牌', `${body}${pages > 1 ? `\n\n第${activePage + 1}/${pages}页 · 共${choices.length}张可选牌` : ''}`, components, update);
}

function renderRoom(run, update) {
  useRunCatalog(run);
  const r = run.room ?? {};
  if (r.type === 'blessing') {
    const opts = optionsFrom(r.candidates ?? [], relicName, (id) => relicOf(id)?.description ?? '获得此遗物').concat([{ label: '跳过', value: 'skip', description: '不领取遗物' }]);
    return panel('幕间遗物', '选择一件遗物，或跳过。候选不会重复获得。', [row(select(cid(run, 'bless'), '选择遗物', opts)), controlRow(run)], update);
  }
  if (r.type === 'route') {
    const labels = { normal: '普通战斗', shop: '商店', event: '事件', camp: '营地', elite: '精英战斗', boss: '幕末Boss' };
    const nodes = Array.isArray(r.nodes) ? r.nodes : [];
    const availableChoices = new Set(r.choices ?? nodes.filter((n) => n.available !== false).map((n) => n.id));
    const numbers = ['①', '②', '③', '④', '⑤'];
    const connectedPlan = connectedPlanFor(run);
    const fields = nodes.map((node, index) => {
      const enemy = node.enemyId ? ACTIVE_CATALOG.enemies[node.enemyId] : null;
      const event = node.eventId ? eventOf(node.eventId)?.title : '';
      const name = (node.title || enemy?.name || event || labels[node.type] || '未知地点').replaceAll('Boss交易', '削弱首领').replaceAll('Boss', '首领');
      const kind = node.dangerous ? '危险战斗' : (labels[node.type] || '事件').replaceAll('Boss', '首领');
      const available = availableChoices.has(node.id) && node.available !== false;
      const lines = [];
      if (enemy) lines.push(`基础属性：生命 ${enemy.hp} ｜ 护甲 ${enemy.armor}`);
      if (enemy && ['lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)) lines.push(`战术特征：${enemyApproach(enemy)}`);
      if (enemy && enemy.name !== node.title) lines.push(`敌人：${enemy.name}`);
      const description = (node.description || '').replaceAll('Boss', '首领').replace(/支付(\d+)点余烬/g, '支付 $1 余烬').replace(/降低(\d+)%/g, '降低 $1%');
      if (node.dangerous) lines.push('敌人更强；获胜后额外获得余烬与遗物。');
      if (description && !['普通战斗', '精英战斗'].includes(description) && !description.startsWith('危险遭遇：')) lines.push(description);
      if (connectedPlan && available) lines.push(`通往：${nextRouteLabels(connectedPlan,node.id).join('、')}`);
      if (!available) lines.push(`暂不可选：${(node.disabledReason || '当前路线条件未满足').replaceAll('Boss', '首领')}`);
      return { name: cap(`${numbers[index] || index + 1} ${name} · ${kind}`, 256), value: cap(lines.join('\n') || '选择后进入此地点。', 1024), inline: false };
    });
    const choices = nodes.length
      ? nodes.map((node, index) => button(`${numbers[index] || index + 1} 前往${(node.title || labels[node.type] || '地点').replaceAll('Boss交易', '削弱首领').replaceAll('Boss', '首领')}`, cid(run, 'route', node.id), node.dangerous ? 4 : 1, !availableChoices.has(node.id) || node.available === false))
      : (r.choices ?? []).map((choice) => button(labels[choice] ?? ACTIVE_CATALOG.enemies[choice]?.name ?? choice, cid(run, 'route', choice)));
    const details = connectedPlan ? ['沿连线选择支路，第四站后进入首领。',...routeSupplyLines(run,connectedPlan)] : [];
    if (!nodes.length && r.normalEnemyId) {
      const foe = ACTIVE_CATALOG.enemies[r.normalEnemyId];
      if (foe) details.push(`普通战：${foe.name}，生命${foe.hp}，护甲${foe.armor}`);
    } else if (!nodes.length && run.slot === 1 && run.act === 1) {
      for (const id of r.choices ?? []) { const foe = ACTIVE_CATALOG.enemies[id]; if (foe) details.push(`${foe.name}：生命${foe.hp}，护甲${foe.armor}`); }
    }
    const eliteId = ACTIVE_CATALOG.acts.find((a) => a.index === run.act)?.eliteEnemy;
    const elite = ACTIVE_CATALOG.enemies[eliteId];
    if ((r.choices ?? []).includes('elite') && elite) details.push(`精英警示：${elite.name}，生命${elite.hp}，护甲${elite.armor}，攻击节奏更强。`);
    if (run.bosses?.[run.act - 1]) {
      const boss = ACTIVE_CATALOG.enemies[run.bosses[run.act - 1]];
      if (boss) fields.push({ name: `本幕首领 · ${boss.name}`, value: `基础属性：生命 ${boss.hp} ｜ 护甲 ${boss.armor}${run.story?.weakenedBossActs?.includes(run.act) ? '\n已生效：首领生命降低 15%。' : ''}`, inline: false });
    }
    const nodeRows = [];
    for (let i = 0; i < choices.length; i += 3) nodeRows.push(row(...choices.slice(i, i + 3)));
    const story = storyLines(run).filter(line => !line.startsWith('本幕首领生命'));
    const receipt = lastResourceReceipt(run);
    const header = `第 ${run.act ?? 1} 幕 · 第 ${run.slot ?? 1} 站\n生命 ${run.hp ?? '—'}${run.maxHp ? `/${run.maxHp}` : ''} ｜ 余烬 ${run.embers ?? 0}`;
    const reply = panel('选择路线', [header, ...details, ...(story.length ? [`远征影响：${story.join('；')}`] : []), ...(receipt ? [receipt] : [])].join('\n\n'), [...nodeRows, controlRow(run)], update);
    if (fields.length) reply.data.embeds[0].fields = fields;
    reply.data.embeds[0].footer = { text: (nodes.length ? '点击对应编号前往' : '点击地点按钮前往') + '，选择后立即进入。基础属性未计入难度与远征影响。' + (expanded(run) ? '「迷城地图」可查看完整路线。' : '') };
    return reply;
  }
  if (r.type === 'camp') {
    const maxHp = run.maxHp ?? (expanded(run) && (run.difficulty ?? 0) >= 6 ? 28 : ACTIVE_CATALOG.player.maxHp);
    const healAmount = r.healAmount ?? run.campHealAmount ?? Math.floor(maxHp * .3);
    const components = [row(button(`休整治疗（${healAmount}）`, cid(run, 'camp-heal'), 1, run.hp >= maxHp), button('离开营地', cid(run, 'camp-leave'), 2))];
    if (uidEligible(run, 'camp', 'upgrade').length) components.push(row(button('选择升级牌', cid(run, 'uid-page', 'camp:upgrade:0'), 2)));
    components.push(controlRow(run));
    const ongoing = resourceEffectLines(run);
    return panel('营地', `生命 ${run.hp}/${maxHp}。${run.story?.campPenalty > 0 ? `封印代价使营地基础治疗减少${run.story.campPenalty}点；` : ''}可恢复${healAmount}点生命或升级一张实体牌。${ongoing.length ? `\n远征影响：${ongoing.join('；')}` : ''}${lastResourceReceipt(run) ? `\n最近资源变化：${lastResourceReceipt(run)}` : ''}`, components, update);
  }
  if (r.type === 'shop') {
    const stock = r.stock ?? [];
    const prices = r.prices ?? {};
    const cardPrices = prices.cardByEnergy ?? prices.cardCostByEnergy ?? ACTIVE_CATALOG.shop.cardCostByEnergy;
    const upgradePrice = prices.upgrade ?? ACTIVE_CATALOG.shop.upgradeCost;
    const removePrice = prices.remove ?? ACTIVE_CATALOG.shop.removeCost;
    const itemPrice = prices.item ?? prices.itemCost ?? 8;
    const canBuy = stock.filter((id) => run.embers >= (cardPrices[String(cardOf(id)?.cost)] ?? Infinity));
    const upgradeTargets = (run.deck ?? []).filter((e) => !e.upgraded && cardOf(e.cardId)?.upgrade);
    const removeTargets = run.deck ?? [];
    const c = [];
    if (stock.length) c.push(row(select(cid(run, 'shop-buy'), '购买牌（可多次购买）', optionsFrom(stock, cardName, (id) => `价格${cardPrices[String(cardOf(id)?.cost)]}余烬`), canBuy.length === 0)));
    const minimumDeck = ACTIVE_CATALOG.shop.minimumDeck ?? 0;
    if (upgradeTargets.length || removeTargets.length) c.push(row(button(`升级牌 · ${upgradePrice}`, cid(run, 'uid-page', 'shop:upgrade:0'), 2, Boolean(r.services?.upgrade) || run.embers < upgradePrice), button(`移除牌 · ${removePrice}`, cid(run, 'uid-page', 'shop:remove:0'), 2, Boolean(r.services?.remove) || run.embers < removePrice || (run.deck ?? []).length <= minimumDeck)));
    const itemStock = r.itemStock ?? r.items ?? [];
    const inventory = Array.isArray(run.inventory) ? run.inventory : [];
    if (itemStock.length) {
      const itemOptions = itemStock.flatMap((entry) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        return inventory.length < 2
          ? [{ label: `${ACTIVE_ITEMS[id]?.name ?? id} · ${itemPrice}余烬`, value: `${id}:-1`, description: cap(`${ACTIVE_ITEMS[id]?.description ?? '道具'}；放入空道具槽；${paymentLine(run.embers,itemPrice)}`,100) }]
          : inventory.map((oldId, index) => ({ label: `${ACTIVE_ITEMS[id]?.name ?? id} · 替换槽${index + 1}`, value: `${id}:${index}`, description: cap(`${ACTIVE_ITEMS[id]?.description ?? '道具'}；替换${ACTIVE_ITEMS[oldId]?.name ?? oldId}；${paymentLine(run.embers,itemPrice)}`,100) }));
      });
      c.push(row(select(cid(run, 'shop-item'), `购买道具（${itemPrice}余烬）`, itemOptions, run.embers < itemPrice)));
    }
    c.push(row(button('免费离开', cid(run, 'shop-leave'), 2)));
    c.push(controlRow(run));
    const priceText = Object.entries(cardPrices).map(([energy, price]) => `${energy}能量牌${price}余烬`).join('、');
    const reply = panel(`商店 · ${run.embers}余烬`, `当前价格：${priceText || '以房间标价为准'}；升级${upgradePrice}余烬；移除${removePrice}余烬；道具${itemPrice}余烬。${r.services?.upgrade ? '升级服务已用。' : ''}${r.services?.remove ? '移除服务已用。' : ''}`, c, update);
    const fields = stock.slice(0,25).map(id => { const card=cardOf(id),fit=candidateFit(run,id,ACTIVE_CATALOG),price=cardPrices[String(card?.cost)] ?? '?',role=r.stockRoles?.[id],balance=Number.isFinite(Number(price))?paymentLine(run.embers,Number(price)):'价格缺失'; return {name:cap(`${card?.name ?? id} · ${price}余烬`,256),value:cap(`${role ? `商店标记：${role}\n` : ''}${cardText({cardId:id,upgraded:false})}\n构筑适配：${fit.category} · ${fit.reason}\n同名持有：${(run.deck ?? []).filter(e=>e.cardId===id).length}张；${balance}`,1024),inline:false}; });
    if(fields.length) reply.data.embeds[0].fields=fields;
    const receipt=lastResourceReceipt(run); if(receipt) reply.data.embeds[0].description=cap(`${reply.data.embeds[0].description}\n最近交易：${receipt}`,4096);
    return reply;
  }
  if (r.type === 'event') {
    const allowed = new Set(Array.isArray(r.choices) ? r.choices : ['heal', 'card', 'leave']);
    const maxHp = run.maxHp ?? (expanded(run) && (run.difficulty ?? 0) >= 6 ? 28 : ACTIVE_CATALOG.player.maxHp);
    const title = r.title || ({ repair: '钟楼修补', borrow_fire: '借来的火种', lost_property: '失物招领', apothecary: '夜行药铺' }[r.eventId] || '钟楼修补');
    const unavailable = r.unavailableReason ?? (r.eventId === 'sealed_relic' && !r.relicCandidate ? '当前没有可用的未拥有遗物，只能离开。' : '');
    const description = `${r.description || '选择一项处理方式。'}${unavailable ? `\n${unavailable}` : ''}`;
    const c = [];
    const actionButtons = [];
    if (allowed.has('heal')) actionButtons.push(button(`治疗 ${r.healAmount ?? 0}（${r.healCost ?? 0}余烬）`, cid(run, 'event-heal-ask'), 1, run.hp >= maxHp || run.embers < (r.healCost ?? 0)));
    if (allowed.has('card') && (r.candidates ?? []).length) c.push(row(select(cid(run, 'event-card-ask'), `选择牌（${r.cardCost ?? 0}余烬）`, optionsFrom(r.candidates, cardName), run.embers < (r.cardCost ?? 0))));
    if (allowed.has('item') && (r.itemCandidates ?? []).length) {
      const inventory = Array.isArray(run.inventory) ? run.inventory : [];
      const opts = (r.itemCandidates ?? []).flatMap((entry) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        return inventory.length < 2
          ? [{ label: ACTIVE_ITEMS[id]?.name ?? id, value: `${id}:-1`, description: cap(`${ACTIVE_ITEMS[id]?.description ?? '道具'}；放入空道具槽`,100) }]
          : inventory.map((oldId, index) => ({ label: `${ACTIVE_ITEMS[id]?.name ?? id} · 替换槽${index + 1}`, value: `${id}:${index}`, description: cap(`${ACTIVE_ITEMS[id]?.description ?? '道具'}；替换${ACTIVE_ITEMS[oldId]?.name ?? oldId}`,100) }));
      });
      c.push(row(select(cid(run, 'event-item-ask'), `选择道具（${r.itemCost ?? 0}余烬）`, opts, run.embers < (r.itemCost ?? 0))));
    }
    if (allowed.has('trade') && (r.candidates ?? []).length) c.push(row(select(cid(run, 'event-trade-ask'), `以${r.lifeCost ?? 0}生命换牌`, optionsFrom(r.candidates, cardName), run.hp <= (r.lifeCost ?? 0))));
    if (allowed.has('upgrade')) {
      const eligible = new Set(r.upgradeCandidates ?? (run.deck ?? []).filter((e) => !e.upgraded && cardOf(e.cardId)?.upgrade).map((e) => e.uid));
      if ((run.deck ?? []).some((e) => eligible.has(e.uid) && !e.upgraded && cardOf(e.cardId)?.upgrade)) actionButtons.push(button(`升级牌（${r.upgradeCost ?? 0}余烬）`, cid(run, 'uid-page', 'event:upgrade:0'), 2, run.embers < (r.upgradeCost ?? 0)));
    }
    if (allowed.has('remove')) {
      const eligible = new Set(r.removeCandidates ?? (run.deck ?? []).map((e) => e.uid));
      if ((run.deck ?? []).some((e) => eligible.has(e.uid))) actionButtons.push(button(`移除牌（${r.removeCost ?? 0}余烬）`, cid(run, 'uid-page', 'event:remove:0'), 2, run.embers < (r.removeCost ?? 0)));
    }
    if (allowed.has('gain')) actionButtons.push(button(`免费获得${r.emberAmount ?? 0}余烬`, cid(run, 'event-gain'), 1));
    if (allowed.has('pact')) {
      const relic = r.relicCandidate ? `${relicName(r.relicCandidate)}：${relicOf(r.relicCandidate)?.description ?? ''}` : '本次契约不提供遗物。';
      actionButtons.push(button(r.pactLabel ?? '确认契约', cid(run, 'event-pact-ask'), 4));
      if (allowed.has('leave')) actionButtons.push(button('离开', cid(run, 'event-leave'), 2));
      if (actionButtons.length) c.push(row(...actionButtons));
      const consequence = r.consequence ?? {};
      const payment = consequence.kind === 'debt' ? `\n支付后余烬：${(run.embers ?? 0) + (consequence.emberAmount ?? 0)}（借取${consequence.emberAmount ?? 0}）` : consequence.kind === 'sacrifice' ? `\n支付后生命：${Math.max(0,(run.hp ?? 0)-(consequence.hpCost ?? 0))}` : '';
      return panel(`${title} · 契约`, `${description}\n\n契约代价：${r.consequenceText ?? consequence.text ?? '详情由本房间规则说明。'}${payment}\n遗物候选：${relic}${storyLines(run).length ? `\n远征影响：${storyLines(run).join('；')}` : ''}${lastResourceReceipt(run) ? `\n最近资源变化：${lastResourceReceipt(run)}` : ''}\n继续前需要确认。`, [...c, controlRow(run)], update);
    }
    if (allowed.has('leave')) actionButtons.push(button('离开', cid(run, 'event-leave'), 2));
    if (actionButtons.length) c.push(row(...actionButtons));
    c.push(controlRow(run));
    return panel(`${title} · ${run.embers}余烬 · 生命${run.hp}`, `${description}${storyLines(run).length ? `\n远征影响：${storyLines(run).join('；')}` : ''}`, c, update);
  }
  if (r.type === 'checkpoint') {
    const completedAct = r.completedAct ?? run.completedActs;
    const boss = ACTIVE_CATALOG.enemies[run.bosses?.[completedAct - 1]];
    const bossInfo = boss ? `\n本幕已击败Boss：${boss.name}（生命${boss.hp}，护甲${boss.armor}）。` : '';
    return panel('抵达幕间', `已完成第${completedAct}幕。${bossInfo}${storyLines(run).length ? `\n远征影响：${storyLines(run).join('；')}` : ''}\n继续深入，或确认撤退并结算。`, [row(button('继续', cid(run, 'continue'))), controlRow(run, true)], update);
  }
  return panel('远征', '当前没有可显示的地点。', [controlRow(run)], update);
}

function renderReward(run, update) {
  const reward = run.reward ?? {};
  if (v08(run)) {
    const queue = Array.isArray(reward.queue) ? reward.queue : [];
    const kinds = ['card', 'relic', 'item'].filter((kind) => queue.some((stage) => stage.kind === kind));
    if (!kinds.length) return panel('战利品', '当前奖励已处理。', [controlRow(run)], update);
    const current = reward.selections ?? {};
    const selections = {};
    const rows = [];
    const summaries = [];
    for (const kind of kinds) {
      const stage = queue.find((entry) => entry.kind === kind);
      const candidates = stage.candidates ?? [];
      const configured = current[kind];
      let choice = kind === 'item' ? (configured === undefined ? null : configured?.id ?? null) : (configured === undefined ? candidates[0] ?? null : configured);
      let replaceIndex = kind === 'item' ? configured?.replaceIndex ?? null : null;
      if (kind === 'item' && configured === undefined && (run.inventory ?? []).length < 2 && candidates.length) choice = candidates[0];
      selections[kind] = kind === 'item' ? { id: choice, replaceIndex } : choice;
      let chosenName = '跳过';
      if (choice != null) chosenName = kind === 'card' ? cardName(choice) : kind === 'relic' ? relicName(choice) : `${ACTIVE_ITEMS[choice]?.name ?? choice}${replaceIndex == null ? ' · 放入空槽' : ` · 替换槽${replaceIndex + 1}`}`;
      const defaultChoice = kind === 'item' ? ((run.inventory ?? []).length < 2 ? candidates[0] ?? null : null) : candidates[0] ?? null;
      const sameAsDefault = kind === 'item'
        ? choice === defaultChoice && replaceIndex == null
        : choice === defaultChoice;
      const status = choice == null ? '（不领取）' : sameAsDefault ? '（默认选项）' : '（当前选择）';
      const effect = choice == null ? '' : kind === 'card' ? cardText({ cardId: choice }) : kind === 'relic' ? relicOf(choice)?.description : ACTIVE_ITEMS[choice]?.description;
      summaries.push(`${kind === 'card' ? '新卡' : kind === 'relic' ? '遗物' : '道具'}：${chosenName}${status}${effect ? `\n${effect}` : ''}`);
      const opts = candidates.flatMap((entry) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        if (kind !== 'item') return [{ label: `${(kind === 'card' ? cardName(id) : relicName(id))}${id === choice ? ' · 当前' : ''}`, value: id,
          description: kind === 'card' ? cardText({ cardId: id }) : relicOf(id)?.description ?? '' }];
        if ((run.inventory ?? []).length < 2) return [{ label: `${ACTIVE_ITEMS[id]?.name ?? id} · 放入空槽${id === choice && replaceIndex == null ? ' · 当前' : ''}`, value: `${id}:-1` }];
        return (run.inventory ?? []).map((oldId, index) => ({ label: `${ACTIVE_ITEMS[id]?.name ?? id} · 替换槽${index + 1}${id === choice && replaceIndex === index ? ' · 当前' : ''}`, value: `${id}:${index}`, description: `替换${ACTIVE_ITEMS[oldId]?.name ?? oldId}` }));
      });
      for (const option of opts) option.default = option.value === (kind === 'item' && choice != null ? `${choice}:${replaceIndex ?? -1}` : choice);
      opts.push({ label: '跳过此项', value: 'skip', description: '不领取这一类奖励', default: choice == null });
      rows.push(row(select(cid(run, 'reward-select', kind), `选择${kind === 'card' ? '新卡' : kind === 'relic' ? '遗物' : '道具'} · 选后还需确认领取`, opts)));
    }
    rows.push(row(button('确认领取所选奖励', cid(run, 'reward-claim'), 1), button('跳过全部奖励', cid(run, 'reward-skip'), 2)));
    rows.push(controlRow(run));
    const itemHint = kinds.includes('item') && (run.inventory ?? []).length >= 2 && selections.item?.id == null ? '\n道具栏已满：选择替换位置才会领取新道具，也可以跳过。' : '';
    const cardCandidates = queue.find(stage => stage.kind === 'card')?.candidates ?? [];
    const hints = ['lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)
      ? cardCandidates.map(id=>{const fit=candidateFit(run,id,ACTIVE_CATALOG);return `${cardName(id)} · ${fit.category}：${fit.reason}`;}).join('\n')
      : ['messenger','medic'].includes(run.professionId) && run.ruleVersion === 'lantern-rules-v0.9'
      ? cardCandidates.map(id => `${cardName(id)}：${explainRogueCandidate(run,id).reason ?? ''}`).join('\n') : '';
    const recommendation=['lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion) ? (reward.recommendedCard ? `\n补强参考：${cardName(reward.recommendedCard)}。${reward.recommendationReason ?? ''}` : '\n暂无明确补强参考；新卡默认跳过，可自行选择。') : '';
    return panel('战利品 · 等待领取', `奖励尚未领取。可更换各项选择，最后点击「确认领取所选奖励」。${recommendation}\n\n${summaries.join('\n\n')}${itemHint}${hints ? `\n\n候选用途（可自由跳牌）：\n${hints}` : ''}`, rows, update);
  }
  const stage = reward.queue?.[reward.index];
  if (!stage) return panel('战利品', '当前奖励已处理。', [controlRow(run)], update);
  if (stage.kind === 'item') {
    const inventory = Array.isArray(run.inventory) ? run.inventory : [];
    const options = (stage.candidates ?? []).flatMap((id) => inventory.length < 2
      ? [{ label: `${ACTIVE_ITEMS[id]?.name ?? id} · 放入空槽`, value: `${id}:-1` }]
      : inventory.map((oldId, index) => ({ label: `${ACTIVE_ITEMS[id]?.name ?? id} · 替换槽${index + 1}`, value: `${id}:${index}`, description: `替换${ACTIVE_ITEMS[oldId]?.name ?? oldId}` })));
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
  if (Number.isFinite(base)) lines.push(`基础奖励：${base} 金币`);
  if (Number.isFinite(amount)) lines.push(`实际到账：${amount} 金币`);
  if (run.rewardEligible === false) lines.push('本局不发金币：练习局或每日奖励开局次数已用完。通关仍会记录职业进度。');
  else if (run.rewardEligible === true && Number.isFinite(base) && Number.isFinite(amount) && amount < base) lines.push('实际奖励受到每日金币上限限制。');
  if (result.type === 'DEFEAT' && result.reason === 'HP_ZERO') lines.push('失败原因：生命耗尽。');
  if (result.type === 'DEFEAT' && result.reason === 'LOST_LIGHT') lines.push('失败原因：未能在12轮内击败敌人，灯火熄灭。');
  if (Number.isFinite(score)) lines.push(`积分：${score}`);
  if (run.settlementPending) lines.push('结果已保存，收益待入账。重新打开冒险会重试，不会重复领取。');
  if (rank) lines.push(rank);
  const observation = summarizeObservationLines(run);
  if (observation.length) lines.push('\n本局记录（仅含接入后操作）', ...observation);
  if (run.effectMetrics) lines.push('\n效果兑现', ...effectMetricLines(run));
  if (['lantern-rules-v0.9','lantern-rules-v0.10','lantern-rules-v0.11','lantern-rules-v0.12','lantern-rules-v0.13','lantern-rules-v0.14','lantern-rules-v0.15','lantern-rules-v0.16','lantern-rules-v0.17','lantern-rules-v0.18','lantern-rules-v0.19','lantern-rules-v0.20','lantern-rules-v0.21','lantern-rules-v0.22'].includes(run.ruleVersion)) lines.push(`最终牌组：${run.deck?.length ?? 0}张 · 遗物：${run.relics?.length ?? 0}件`);
  const defaultProfession = Object.hasOwn(PROFESSIONS, run.professionId) ? run.professionId : Object.hasOwn(PROFESSIONS, 'traveler') ? 'traveler' : Object.keys(PROFESSIONS)[0];
  return panel('远征结算', lines.join('\n'), [row(button('再来一局', `rl:settings:${defaultProfession}`), button('挑战远征', 'rl:start:challenge')), row(button('返回首页', 'rl:home', 2), button('查看榜单', 'rl:board', 2))], update);
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
    title = '确认领取道具？'; body = `将支付${kind.cost}余烬，${kind.replaceIndex == null ? '放入空道具槽' : `替换第${kind.replaceIndex + 1}格现有道具`}并获得${ACTIVE_ITEMS[kind.itemId]?.name ?? kind.itemId}。`; yes = button('确认付款并领取', cid(run, 'event-item-confirm', `${kind.itemId}:${kind.replaceIndex ?? -1}`), 1);
  } else if (kind && typeof kind === 'object' && kind.type === 'event-trade' && typeof kind.cardId === 'string') {
    const fullText = cardText({ cardId: kind.cardId, upgraded: false });
    title = '确认以生命换牌？'; body = `将失去${kind.cost}生命并获得：${fullText}。`; yes = button('确认交易', cid(run, 'event-trade-confirm', kind.cardId), 1);
  } else if (kind && typeof kind === 'object' && ['event-upgrade','event-remove'].includes(kind.type) && Number.isSafeInteger(kind.uid)) {
    const entity = (run.deck ?? []).find((e) => e.uid === kind.uid);
    if (!entity) throw new TypeError('unknown event card uid');
    const isUpgrade = kind.type === 'event-upgrade';
    const cost = kind.cost ?? (isUpgrade ? run.room?.upgradeCost : run.room?.removeCost) ?? 0;
    title = isUpgrade ? '确认升级？' : '确认移除？';
    body = isUpgrade ? `将支付${cost}余烬，升级实体牌 #${entity.uid}：${cardText(entity)}。` : `将支付${cost}余烬，永久移除实体牌 #${entity.uid}：${cardText(entity)}。`;
    const preview = changePreview(run, entity, isUpgrade ? 'upgrade' : 'remove');
    if (preview) body += `\n\n${preview}`;
    yes = button(isUpgrade ? '确认付款并升级' : '确认付款并移除', cid(run, `${kind.type}-confirm`, kind.uid), 1);
  } else if (kind && typeof kind === 'object' && kind.type === 'event-pact') {
    const room = run.room ?? {};
    const relic = room.relicCandidate ? `${relicName(room.relicCandidate)}：${relicOf(room.relicCandidate)?.description ?? ''}` : '无遗物候选。';
    const consequence = room.consequence ?? {};
    const impact = consequence.kind === 'debt' ? `支付后余烬${(run.embers ?? 0)+(consequence.emberAmount ?? 0)}；影响未来${consequence.battles ?? 0}场战斗，每段敌方攻击伤害+${consequence.attackBonus ?? 1}。` : consequence.kind === 'sacrifice' ? `支付后生命${Math.max(0,(run.hp ?? 0)-(consequence.hpCost ?? 0))}；营地基础治疗持续减少${consequence.campPenalty ?? 0}点。` : consequence.kind === 'boss_weaken' ? `支付后余烬${Math.max(0,(run.embers ?? 0)-(consequence.emberCost ?? 0))}；仅本幕首领生命降低15%。` : '影响范围见上方契约代价。';
    title = room.pactLabel ?? '确认契约？';
    body = `${room.consequenceText ?? consequence.text ?? '契约会改变后续远征。'}\n${impact}\n遗物候选：${relic}\n确认后按所列代价与范围生效。`;
    yes = button('确认接受契约', cid(run, 'event-pact-confirm'), 4);
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
  if (customId === 'rl:guide') return { ui: 'reading', kind: 'guide' };
  if (customId === 'rl:lore') return { ui: 'reading', kind: 'lore' };
  const lore = /^rl:lore:([a-z0-9_-]{1,40})$/.exec(customId);
  if (lore && Object.hasOwn(PROFESSIONS, lore[1])) return { ui: 'reading', kind: 'lore', professionId: lore[1] };
  if (customId === 'rl:lore-profession') {
    const professionId = selection(values);
    return professionId && Object.hasOwn(PROFESSIONS, professionId) ? { ui: 'reading', kind: 'lore', professionId } : null;
  }
  if (customId === 'rl:board') return { ui: 'board' };
  let settings = /^rl:settings:([a-z0-9_-]{1,40})$/.exec(customId);
  if (settings && Object.hasOwn(PROFESSIONS, settings[1])) return { ui: 'settings', professionId: settings[1], difficulty: 0 };
  if (customId === 'rl:settings-profession') {
    const professionId = selection(values);
    return professionId && Object.hasOwn(PROFESSIONS, professionId) ? { ui: 'settings', professionId, difficulty: 0 } : null;
  }
  settings = /^rl:settings-difficulty:([a-z0-9_-]{1,40})$/.exec(customId);
  if (settings && Object.hasOwn(PROFESSIONS, settings[1])) {
    const value = selection(values);
    return /^\d{1,2}$/.test(value ?? '') && Number(value) <= 10 ? { ui: 'settings', professionId: settings[1], difficulty: Number(value) } : null;
  }
  let m = /^rl:(start|practice):(normal|challenge)(?::([a-z0-9_-]{1,40}))?(?::(\d{1,2}))?$/.exec(customId);
  if (m) {
    const value = m[3] ?? (((m[1] === 'start' && m[2] === 'normal') || (m[1] === 'practice' && m[2] === 'normal')) ? selection(values) ?? undefined : undefined);
    if (m[2] === 'challenge' && value) return null;
    const professionId = m[2] === 'challenge' ? undefined : value;
    if (professionId && Object.keys(PROFESSIONS).length && !Object.hasOwn(PROFESSIONS, professionId)) return null;
    const difficulty = m[4] === undefined ? 0 : Number(m[4]);
    if (difficulty > 10 || (m[4] !== undefined && professionId === undefined)) return null;
    if (m[4] === undefined) return professionId === undefined ? { ui: m[1], mode: m[2] } : { ui: m[1], mode: m[2], professionId };
    return professionId === undefined ? { ui: m[1], mode: m[2] } : { ui: m[1], mode: m[2], professionId, difficulty };
  }
  const p = validRunParts(customId.split(':'));
  if (!p) return null;
  const { runId, version, action, arg } = p;
  const tagged = (a) => ({ runId, version, action: a });
  switch (action) {
    case 'refresh': return { ui: 'refresh', runId, version };
    case 'echo': return { ui: 'echo', runId, version };
    case 'echo-page': return /^\d{1,4}$/.test(arg ?? '') ? { ui: 'echo', runId, version, page: Number(arg) } : null;
    case 'echo-pick': {
      const value = selection(values);
      return value && /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) ? tagged({ type: 'ECHO', uid: Number(value) }) : null;
    }
    case 'details-prev':
    case 'details-next':
    case 'details': {
      const match = /^(deck|hand|relics|inventory|map|guide|lore)(?::(\d{1,4}))?$/.exec(arg ?? '');
      return match && Number(match[2] ?? 0) <= 9999 ? { ui: 'details', runId, version, kind: match[1], page: Number(match[2] ?? 0) } : null;
    }
    case 'uid-prev':
    case 'uid-next':
    case 'uid-page': {
      const match = /^(shop|camp|event):(upgrade|remove):(\d{1,4})$/.exec(arg ?? '');
      return match && Number(match[3]) <= 9999 ? { ui: 'uid-page', runId, version, source: match[1], kind: match[2], page: Number(match[3]) } : null;
    }
    case 'uid-select': {
      const match = /^(shop|camp|event):(upgrade|remove)$/.exec(arg ?? '');
      const value = selection(values);
      return match && value && /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value))
        ? { ui: 'uid-select', runId, version, source: match[1], kind: match[2], uid: Number(value) } : null;
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
    case 'reward-select': {
      const value = selection(values);
      const match = /^(card|relic|item)$/.exec(arg ?? '');
      if (!match) return null;
      if (value === 'skip') return tagged({ type: 'REWARD_SELECT', kind: match[1], choice: null });
      if (match[1] === 'item') {
        const item = /^([^:]{1,80}):(-1|0|1)$/.exec(value ?? '');
        return item ? tagged({ type: 'REWARD_SELECT', kind: 'item', choice: item[1], replaceIndex: Number(item[2]) < 0 ? null : Number(item[2]) }) : null;
      }
      return value && value.length <= 80 ? tagged({ type: 'REWARD_SELECT', kind: match[1], choice: value }) : null;
    }
    case 'reward-claim': return tagged({ type: 'REWARD_CLAIM' });
    case 'reward-skip': return tagged({ type: 'REWARD_SKIP' });
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
    case 'event-pact-ask': return { ui: 'event-confirm', runId, version, kind: 'pact' };
    case 'event-pact-confirm': return tagged({ type: 'EVENT', choice: 'pact' });
    case 'event-heal-ask': return { ui: 'event-confirm', runId, version, kind: 'heal' };
    case 'event-heal-confirm': return tagged({ type: 'EVENT', choice: 'heal' });
    case 'event-card-ask': { const value = selection(values); return value ? { ui: 'event-confirm', runId, version, kind: 'card', cardId: value } : null; }
    case 'event-card-confirm': return arg ? tagged({ type: 'EVENT', choice: 'card', cardId: arg }) : null;
    case 'event-item-ask': { const value = selection(values); const match = /^([^:]{1,80}):(-1|0|1)$/.exec(value ?? ''); return match ? { ui: 'event-confirm', runId, version, kind: 'item', itemId: match[1], replaceIndex: Number(match[2]) < 0 ? null : Number(match[2]) } : null; }
    case 'event-item-confirm': { const match = /^([^:]{1,80}):(-1|0|1)$/.exec(arg ?? ''); return match ? tagged({ type: 'EVENT', choice: 'item', itemId: match[1], replaceIndex: Number(match[2]) < 0 ? null : Number(match[2]) }) : null; }
    case 'event-trade-ask': { const value = selection(values); return value ? { ui: 'event-confirm', runId, version, kind: 'trade', cardId: value } : null; }
    case 'event-trade-confirm': return arg ? tagged({ type: 'EVENT', choice: 'trade', cardId: arg }) : null;
    case 'event-upgrade-ask': case 'event-remove-ask': {
      const value = selection(values);
      return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
        ? { ui: 'event-confirm', runId, version, kind: action === 'event-upgrade-ask' ? 'upgrade' : 'remove', uid: Number(value) } : null;
    }
    case 'event-upgrade-confirm': case 'event-remove-confirm':
      return /^\d+$/.test(arg ?? '') && Number.isSafeInteger(Number(arg))
        ? tagged({ type: 'EVENT', choice: action === 'event-upgrade-confirm' ? 'upgrade' : 'remove', uid: Number(arg) }) : null;
    case 'event-gain': return tagged({ type: 'EVENT', choice: 'gain' });
    default: return null;
  }
}

