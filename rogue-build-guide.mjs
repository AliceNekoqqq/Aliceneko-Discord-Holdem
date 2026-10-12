import { getCatalog } from './rogue-content-v15.mjs';
import { cardEffectLines } from './rogue-card-guide.mjs';

const supported09 = (version) => /(?:^|[^0-9])0\.(?:9|1[0-7])(?:$|[^0-9])/.test(String(version ?? ''));
const effectsOf = (card) => Array.isArray(card?.effects) ? card.effects : [];
const countKind = (cards, kind) => cards.reduce((n, card) => n + effectsOf(card).filter((e) => e.kind === kind).length, 0);
const unique = (xs) => [...new Set(xs)];

function summarize(card) {
  return {
    name: card.name,
    cost: card.cost,
    exhaust: Boolean(card.exhaust),
    effects: cardEffectLines(card),
  };
}

function upgradePreview(id, card) {
  if (!card.upgrade) return null;
  const upgraded = { ...card, ...card.upgrade };
  const before = summarize(card);
  const after = summarize(upgraded);
  const beforeTotals = Object.fromEntries(unique([...effectsOf(card), ...effectsOf(upgraded)].map((e) => e.kind)).map((kind) => [kind, [
    effectsOf(card).filter((e) => e.kind === kind).reduce((n, e) => n + (Number(e.value) || 0), 0),
    effectsOf(upgraded).filter((e) => e.kind === kind).reduce((n, e) => n + (Number(e.value) || 0), 0),
  ]]));
  const changes = Object.entries(beforeTotals).filter(([, [a, b]]) => a !== b).map(([kind]) => {
    const beforeLine = cardEffectLines({ effects: effectsOf(card).filter((e) => e.kind === kind) }).join('、');
    const afterLine = cardEffectLines({ effects: effectsOf(upgraded).filter((e) => e.kind === kind) }).join('、');
    return `${beforeLine}→${afterLine}`;
  });
  if (before.cost !== after.cost) changes.push(`费用 ${before.cost}→${after.cost}`);
  return { cardId: id, before, after, changes };
}

function directions(professionId, cards) {
  const has = (...kinds) => kinds.some((kind) => countKind(cards, kind) > 0);
  if (professionId === 'messenger') return [
    { id: 'compact_cycle', name: '择弃紧凑牌组', components: ['抽牌','择弃','保留'].filter((name, i) => has(['draw','sift','retain'][i])), gaps: [...(!has('sift') ? ['当前牌组没有择弃补抽'] : []), ...(!has('draw') ? ['当前牌组没有主动抽牌效果'] : [])] },
    { id: 'retain_burst', name: '保留爆发', components: ['保留','直伤'].filter((name, i) => has(['retain','damage'][i])), gaps: [...(!has('retain') ? ['当前牌组没有保留效果'] : []), ...(!has('damage') ? ['当前牌组没有直接伤害'] : [])] },
  ];
  return [
    { id: 'treatment_guard', name: '治疗护盾', components: ['治疗','护盾'].filter((name, i) => has(['heal','block'][i])), gaps: [...(!has('heal') ? ['当前牌组没有主动治疗（徽章触发条件）'] : []), ...(!has('block') ? ['当前牌组没有护盾效果'] : [])] },
    { id: 'cleanse_hunt', name: '净化追猎', components: ['自净化','追猎'].filter((name, i) => has(['cleanse_player','mark'][i])), gaps: [...(!has('cleanse_player') ? ['当前牌组没有自净化'] : []), ...(!has('mark') ? ['当前牌组没有追猎标记'] : []), ...(!has('damage') ? ['当前牌组没有普通直伤效果（武器、伙伴与灼烧另计）'] : [])] },
  ];
}

function ownsRelic(relics, id) {
  return relics.some((entry) => (typeof entry === 'string' ? entry : entry?.id ?? entry?.relicId) === id);
}

function candidateReason(card, cards, professionId, catalog, relics) {
  const kinds = new Set(effectsOf(card).map((e) => e.kind));
  const lines = [`牌效：${cardEffectLines(card).join('；')}。`];
  if (professionId === 'messenger' && ownsRelic(relics, 'messenger_seal') && ['draw','sift','retain'].some((kind) => kinds.has(kind)) && catalog.relics?.messenger_seal) lines.push(`与信使封蜡的触发条件对应：${catalog.relics.messenger_seal.description}`);
  if (professionId === 'medic' && ownsRelic(relics, 'medic_badge') && kinds.has('heal') && catalog.relics?.medic_badge) lines.push(`治疗与医师徽章的触发条件对应：${catalog.relics.medic_badge.description}`);
  if ((kinds.has('damage') || kinds.has('mark') || kinds.has('burn')) && cards.some((owned) => effectsOf(owned).some((e) => e.kind === 'heal'))) lines.push('当前牌组含治疗牌；该候选另提供伤害或追猎效果，可用于战斗推进。');
  return lines.join(' ');
}

export function explainRogueCandidate(run, cardId) {
  if (!supported09(run?.ruleVersion)) return { supported: false, fallback: true, message: '旧规则版本沿用原有卡牌指引。' };
  const catalog = run.catalog ?? getCatalog(run.ruleVersion);
  const card = catalog.cards?.[cardId];
  if (!card) return { supported: true, available: false, reason: '候选牌不在当前规则目录。' };
  const deck = run.deck ?? [];
  const cards = deck.map((entry) => {
    const base = catalog.cards?.[typeof entry === 'string' ? entry : entry?.cardId];
    return base && entry && typeof entry === 'object' && entry.upgraded ? { ...base, ...base.upgrade } : base;
  }).filter(Boolean);
  return { supported: true, cardId, ...summarize(card), reason: candidateReason(card, cards, run.professionId, catalog, run.relics ?? []) };
}

/** Analyze a v0.9 Messenger or Medic deck. Older saves receive a safe legacy fallback. */
export function analyzeRogueBuild({ ruleVersion, professionId, deck = [], relics = [], act = 1, catalog: suppliedCatalog } = {}) {
  if (!supported09(ruleVersion)) return { supported: false, fallback: true, mode: 'legacy', message: '旧规则版本沿用原有卡牌指引；v0.9构筑分析不套用到旧存档。' };
  if (!['messenger', 'medic'].includes(professionId)) return { supported: true, analyzed: false, reason: 'P1试点目前仅覆盖信使与医师。' };
  const catalog = suppliedCatalog ?? getCatalog(ruleVersion);
  const cardIds = Array.isArray(deck) ? deck.map((entry) => typeof entry === 'string' ? entry : entry?.cardId ?? entry?.id).filter(Boolean) : [];
  const cards = deck.map((entry) => {
    const card = catalog.cards[typeof entry === 'string' ? entry : entry?.cardId ?? entry?.id];
    return card && entry && typeof entry === 'object' && entry.upgraded ? { ...card, ...card.upgrade } : card;
  }).filter(Boolean);
  const directionsReport = directions(professionId, cards);
  const owned = new Set(cardIds);
  const eligible = (catalog.acts?.[Math.max(0, Math.min((Number(act) || 1) - 1, (catalog.acts?.length || 1) - 1))]?.newCardRewards ?? []);
  const recommendations = eligible.filter((id) => !owned.has(id)).slice(0, 4).map((id) => explainRogueCandidate({ ruleVersion, professionId, deck, relics, catalog }, id));
  return {
    supported: true,
    analyzed: true,
    ruleVersion: '0.9',
    professionId,
    deckSize: cardIds.length,
    directions: directionsReport,
    candidates: recommendations,
    note: professionId === 'medic'
      ? ownsRelic(relics, 'medic_badge') ? catalog.relics.medic_badge.description : '当前牌组含治疗组件；候选解释依据牌面效果，不假设拥有医师徽章。'
      : ownsRelic(relics, 'messenger_seal') ? catalog.relics.messenger_seal.description : '当前牌组含手牌整理组件；候选解释依据牌面效果，不假设拥有信使封蜡。',
  };
}

/** Preview actual catalog values before/after upgrade and the deck-cycle trade-off of removing one card. */
export function previewRogueDeckChange({ ruleVersion, deck = [], uid, cardId, action = 'upgrade', catalog: suppliedCatalog } = {}) {
  if (!supported09(ruleVersion)) return { supported: false, fallback: true, mode: 'legacy', message: '旧规则版本不提供v0.9牌组改动预览。' };
  const catalog = suppliedCatalog ?? getCatalog(ruleVersion);
  const entities = deck.map((entry, index) => typeof entry === 'string' ? { uid: undefined, cardId: entry, upgraded: false, _index: index } : { ...entry, _index: index });
  const entity = uid !== undefined ? entities.find((entry) => entry.uid === uid) : entities.find((entry) => entry.cardId === cardId);
  const selectedId = entity?.cardId ?? cardId;
  const card = catalog.cards[selectedId];
  if (!entity || !card) return { supported: true, available: false, reason: '指定牌实体不在当前牌组或不在目录中。' };
  if (action === 'upgrade') {
    if (entity.upgraded) return { supported: true, available: false, reason: '指定牌实体已经升级。', uid: entity.uid, cardId: selectedId };
    if (!card.upgrade) return { supported: true, available: false, reason: '指定牌没有升级数据。', uid: entity.uid, cardId: selectedId };
    return { supported: true, available: true, uid: entity.uid, cardId: selectedId, upgrade: upgradePreview(selectedId, entity.upgraded ? { ...card, ...card.upgrade } : card) };
  }
  if (action !== 'remove') return { supported: true, available: false, reason: 'action须为upgrade或remove。' };
  const before = entities.length;
  if (before <= (catalog.shop?.minimumDeck ?? 4)) return { supported: true, available: false, reason: `牌组已达最小张数${catalog.shop?.minimumDeck ?? 4}，不能继续删牌。` };
  const after = before - 1;
  const nextDeck = entities.filter((entry) => entry._index !== entity._index);
  return { supported: true, available: true, uid: entity.uid, cardId: selectedId, cardName: card.name, beforeDeckSize: before, afterDeckSize: after, cardsToSeeOneCycle: { before, after }, remainingUids: nextDeck.map((entry) => entry.uid).filter((id) => id !== undefined), cycleEffect: `牌堆从${before}张减至${after}张，少了「${card.name}」的效果；洗牌后其余牌重新进入抽牌序列，关键牌的相对抽到机会会变化。` };
}
