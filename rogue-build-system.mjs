// Effect-driven v0.10 build guidance. Catalog is injected to avoid import cycles.
const ROLE_BY_KIND = {
  damage: '直接输出', weapon_attack: '武器输出', pet_attack: '伙伴输出', burn: '持续伤害',
  block: '护盾', damage_from_shield: '护盾兑现', counter: '反击', heal: '治疗',
  draw: '抽牌', sift: '择弃循环', retain: '保留衔接', prepare: '备势衔接',
  mark: '追猎衔接', forge: '锻造启动', summon: '召唤启动', cleanse_player: '自我净化',
  cleanse: '清除灼烧', echo_next: '回声循环', self_echo: '回声循环', thorns: '反伤守御',
};
// Keep aligned with rogue-battle-v10.mjs DIRECT: all five effects consume
// prepare/mark on their first damage packet when their prerequisites hold.
const DIRECT_KINDS = ['damage', 'pet_attack', 'weapon_attack', 'sacrifice', 'damage_from_shield'];
const DIRECTIONS = {
  traveler: [
    { id: 'hunt', name: '追猎直击', need: [['mark'], DIRECT_KINDS] },
    { id: 'prepare', name: '备势续攻', need: [['prepare'], DIRECT_KINDS] },
  ],
  warden: [
    { id: 'counter', name: '护盾反击', need: [['block'], ['counter']] },
    { id: 'shield-spend', name: '护盾转伤', need: [['block'], ['damage_from_shield']] },
  ],
  brewer: [
    { id: 'burn', name: '灼烧压制', need: [['burn']] },
    { id: 'fire-guard', name: '火盾反击', need: [['block'], ['burn'], ['counter']] },
  ],
  messenger: [
    { id: 'sift', name: '择弃循环', need: [['sift'], ['damage', 'block']] },
    { id: 'retain', name: '保留衔接', need: [['retain'], ['damage', 'block']] },
  ],
  smith: [
    { id: 'echo', name: '回声续打', need: [['self_echo', 'echo_next'], DIRECT_KINDS] },
    { id: 'prepare', name: '备势攻防', need: [['prepare'], DIRECT_KINDS] },
  ],
  medic: [
    { id: 'heal-block', name: '治疗护盾', need: [['heal'], ['block']], requiresRelic: 'heal_block', note: '治疗与护盾本身无因果链；已持有治疗触发护盾的徽章才构成联动' },
    { id: 'cleanse-hunt', name: '净化追猎', need: [['cleanse_player'], ['mark', 'damage']], note: '净化只处理自身灼烧；它与追猎没有资源因果链，属于并行工具' },
  ],
  tamer: [
    { id: 'pet-defense', name: '伙伴守御', need: [['summon'], ['block'], ['pet_attack']] },
    { id: 'pet-command', name: '召唤爆发', need: [['summon'], ['damage', 'pet_attack']] },
  ],
  forger: [
    { id: 'forge-weapon', name: '锻值武器', need: [['forge'], ['weapon_attack']] },
    { id: 'forge-shield', name: '铸器护盾转伤', need: [['forge'], ['block'], ['damage_from_shield', 'counter']] },
  ],
};

const uniq = (xs) => [...new Set(xs)];
const kindsOf = (card) => new Set((Array.isArray(card?.effects) ? card.effects : []).map((e) => e?.kind).filter(Boolean));
const hasAny = (set, group) => group.some((kind) => set.has(kind));
const catalogOf = (input) => input?.cards ? input : input?.catalog?.cards ? input.catalog : {};
const cardIdOf = (entity) => typeof entity === 'string' ? entity : entity?.cardId ?? entity?.id ?? null;
const cardFor = (entity, catalog) => {
  const card = catalog.cards?.[cardIdOf(entity)];
  return card && entity?.upgraded && card.upgrade ? { ...card, ...card.upgrade } : card;
};
const relOf = (run, catalog) => Array.isArray(run?.relics) ? run.relics.filter((id) => catalog.relics?.[id]) : [];

export function cardRoles(card) {
  return uniq((Array.isArray(card?.effects) ? card.effects : []).map((e) => ROLE_BY_KIND[e?.kind]).filter(Boolean));
}

function deckSnapshot(run, catalog) {
  const entities = (Array.isArray(run?.deck) ? run.deck : []).slice(0, 96);
  const valid = entities.map((entity) => ({ entity, id: cardIdOf(entity), card: cardFor(entity, catalog) })).filter((x) => x.card);
  const counts = new Map();
  const kinds = new Set();
  for (const { id, card } of valid) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const kind of kindsOf(card)) kinds.add(kind);
  }
  return { valid, counts, kinds };
}

function analyzeDirection(direction, snapshot, relics) {
  const hitGroups = direction.need.map((group) => snapshot.valid.filter(({ card }) => hasAny(kindsOf(card), group)));
  const missing = direction.need.flatMap((group, index) => hitGroups[index].length ? [] : [group]);
  const components = uniq(hitGroups.flat().map(({ card }) => card.name).filter(Boolean));
  const gaps = missing.map((group) => `缺少${group.map((kind) => ROLE_BY_KIND[kind] ?? kind).join('或')}效果`);
  const relicReady = !direction.requiresRelic || relics.some((id) => snapshot.relicTriggers?.has(id));
  if (direction.requiresRelic && !relicReady) gaps.push('缺少治疗触发护盾的已持有徽章；仅治疗与护盾共存不算联动');
  if (direction.note) gaps.push(direction.note);
  if (!gaps.length) gaps.push('核心机制已齐；注意能量与手牌空间，避免功能重复');
  return { id: direction.id, name: direction.name, components, gaps };
}

export function analyzeBuild(run, inputCatalog) {
  const catalog = catalogOf(inputCatalog);
  const snapshot = deckSnapshot(run, catalog);
  const relics = relOf(run, catalog);
  snapshot.relicTriggers = new Set(relics.map((id) => catalog.relics[id]?.trigger));
  const routes = DIRECTIONS[run?.professionId] ?? [
    { id: 'direct', name: '直接攻防', need: [['damage'], ['block']] },
    { id: 'resource', name: '资源联动', need: [['forge', 'summon'], ['weapon_attack', 'pet_attack']] },
  ];
  const directions = routes.map((direction) => analyzeDirection(direction, snapshot, relics));
  const complete = directions.filter((direction) => !direction.gaps.some((gap) => gap.startsWith('缺少'))).length;
  const note = complete
    ? '至少一条路线的关键机制已在牌组中出现；组件依据实体效果（含升级效果）整理，仍需实战观察。'
    : '路线缺口按必要效果机制列出；职业牌仅作现有组件示例，不代表只能靠指定牌补齐。建议仅供候选抽样与参考。';
  return { directions, note };
}

function linksFor(candidate, deckKinds, relics, catalog) {
  const k = kindsOf(candidate);
  const links = [];
  if ((k.has('forge') && deckKinds.has('weapon_attack')) || (k.has('weapon_attack') && deckKinds.has('forge'))) links.push('forge-weapon');
  if ((k.has('summon') && deckKinds.has('pet_attack')) || (k.has('pet_attack') && deckKinds.has('summon'))) links.push('summon-pet');
  if ((k.has('block') && hasAny(deckKinds, ['damage_from_shield', 'counter'])) || (hasAny(k, ['damage_from_shield', 'counter']) && deckKinds.has('block'))) links.push('shield-payoff');
  if ((hasAny(k, ['prepare', 'mark']) && hasAny(deckKinds, DIRECT_KINDS)) || (hasAny(deckKinds, ['prepare', 'mark']) && hasAny(k, DIRECT_KINDS))) links.push('setup-direct');
  if ((k.has('sift') && hasAny(deckKinds, ['damage', 'block'])) || (deckKinds.has('sift') && hasAny(k, ['damage', 'block']))) links.push('sift-choice');
  if ((k.has('retain') && hasAny(deckKinds, ['damage', 'block'])) || (deckKinds.has('retain') && hasAny(k, ['damage', 'block']))) links.push('retain-choice');
  if (k.has('heal') && relics.some((id) => catalog.relics?.[id]?.trigger === 'heal_block')) links.push('heal-relic');
  return links;
}

export function candidateFit(run, cardId, inputCatalog) {
  const catalog = catalogOf(inputCatalog);
  const id = cardIdOf(cardId);
  const raw = id && catalog.cards?.[id];
  if (!raw) return { score: 0, reason: '目录无此牌。', role: [], category: '新方向', evidence: null };
  const candidate = cardFor(typeof cardId === 'object' ? cardId : id, catalog);
  const snapshot = deckSnapshot(run, catalog);
  const relics = relOf(run, catalog);
  const links = linksFor(candidate, snapshot.kinds, relics, catalog);
  const ck = kindsOf(candidate);
  const overlap = [...ck].filter((kind) => snapshot.kinds.has(kind));
  const routeGaps = (DIRECTIONS[run?.professionId] ?? []).flatMap((route) => {
    const currentlyMissing = route.need.filter((group) => !hasAny(snapshot.kinds, group));
    const relicReady = !route.requiresRelic || relics.some((rid) => catalog.relics?.[rid]?.trigger === route.requiresRelic);
    const routeCompletable = relicReady && route.need.every((group) => hasAny(snapshot.kinds, group) || hasAny(ck, group));
    const resolved = routeCompletable ? currentlyMissing.filter((group) => hasAny(ck, group)) : [];
    return resolved.map((group) => ({ route, group }));
  });
  const ownCount = snapshot.counts.get(id) ?? 0;
  const completedGap = routeGaps.length > 0;
  const evidence = links.length > 0 || completedGap || overlap.length > 0;
  let category = completedGap ? '衔接' : links.length || overlap.length ? '补强' : '新方向';
  let score = evidence ? 3 + Math.min(3, links.length * 1.5) + Math.min(2, routeGaps.length) + Math.min(1, overlap.length * 0.35) : 0.6;
  if (ownCount) score -= ownCount > 1 ? 2.2 : 0.9;
  if (candidate.exhaust) score -= 0.2;
  if (Number(candidate.cost) > 1) score -= 0.35;
  score = Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
  const explanation = [];
  if (links.includes('forge-weapon')) explanation.push('锻值与武器攻击可供给/兑现');
  if (links.includes('summon-pet')) explanation.push('召唤资源与伙伴攻击相接');
  if (links.includes('shield-payoff')) explanation.push('护盾可供护盾转伤，或用于触发格挡反击');
  if (links.includes('setup-direct')) explanation.push('备势/追猎加成首个直接伤害包，含宠物/武器/护盾转伤');
  if (links.includes('sift-choice')) explanation.push('择弃可筛选攻防牌');
  if (links.includes('retain-choice')) explanation.push('保留可衔接攻防牌');
  if (links.includes('heal-relic')) explanation.push('已持治疗触发护盾的徽章');
  if (completedGap) explanation.push(`补上${routeGaps.slice(0, 2).map(({ group }) => group.map((kind) => ROLE_BY_KIND[kind] ?? kind).join('/')).join('、')}路线缺口`);
  if (overlap.length && !links.length) explanation.push(`补充现有${overlap.slice(0, 2).map((kind) => ROLE_BY_KIND[kind] ?? kind).join('、')}功能`);
  if (!evidence) explanation.push('当前牌组无可验证的资源链或路线缺口补齐证据');
  if (ownCount) explanation.push(ownCount > 1 ? '已有重复副本，牌组稀释风险更高' : '已有同名牌，新增收益有限');
  if (typeof cardId === 'object' && cardId?.upgraded === false && raw.upgrade) explanation.push('实体未升级，可先评估升级');
  return { score, reason: explanation.join('；').slice(0, 100), role: cardRoles(candidate), category, evidence: evidence ? true : null };
}
