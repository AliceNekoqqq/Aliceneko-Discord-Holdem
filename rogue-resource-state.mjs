// Read-only views of the saved effect lifecycle; no UI counter changes rules.
export function resourceEffectLines(run) {
  const story = run.story ?? {}, lines = [];
  const debt = Math.max(0, story.debtBattles ?? 0);
  if (debt) lines.push(`借火债：未来${debt}场战斗每段敌方攻击伤害+1（跨幕保留）`);
  else if (story.history?.some(h => h.kind === 'debt') && !(run.phase === 'BATTLE' && run.room?.storyEffect?.includes('借火债'))) lines.push('借火债：已偿清');
  if (story.campPenalty > 0) lines.push(`封印代价：之后所有营地基础治疗-${story.campPenalty}，持续至本局结束`);
  const weakened = story.weakenedBossActs ?? [];
  if (weakened.includes(run.act) && (run.completedActs ?? 0) < run.act) lines.push('本幕首领生命-15%，击败本幕首领后结束');
  else if (weakened.length) lines.push('首领削弱：已结束，不影响后续幕');
  return lines;
}

export function lastResourceReceipt(run) {
  const entry = run.resourceLog?.at(-1);
  return entry?.summary ? `上次资源操作（第${entry.act}幕第${entry.slot}站）：${entry.summary}` : null;
}

export function appendResourceReceipt(before, after, action, catalog) {
  if (!['SHOP', 'EVENT', 'CAMP'].includes(action.type) || action.choice === 'leave') return;
  const name = action.cardId ? catalog.cards[action.cardId]?.name : action.uid != null ? catalog.cards[before.deck.find(c => c.uid === action.uid)?.cardId]?.name : null;
  const labels = { buy: '购牌', item: '领取道具', upgrade: '升级', remove: '移除', heal: '治疗', card: '获得牌', trade: '换牌', gain: '领取余烬', pact: '接受契约' };
  const title = action.choice === 'pact' ? before.room?.title : labels[action.choice];
  const details = [title ?? '资源操作', name, action.itemId ? catalog.items[action.itemId]?.name : null].filter(Boolean);
  const embers = after.embers - before.embers, hp = after.hp - before.hp;
  if (embers) details.push(`余烬${embers > 0 ? '+' : ''}${embers}`);
  if (hp) details.push(`生命${hp > 0 ? '+' : ''}${hp}`);
  details.push(`余额${after.embers}`);
  after.resourceLog = [...(before.resourceLog ?? []), { act: before.act, slot: before.slot, kind: action.type, choice: action.choice, embers, hp, summary: details.join(' · ') }].slice(-24);
}
