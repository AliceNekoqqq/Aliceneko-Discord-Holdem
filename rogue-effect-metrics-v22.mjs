/**
 * Small, bounded, cumulative counters for observed combat effects.
 * Hooks belong at the engine's successful resolution points. Missing counters
 * in old snapshots intentionally mean zero; this module never infers effects
 * from net HP or shield changes.
 */
export const EFFECT_METRIC_KEYS = Object.freeze([
  'healing',
  'overheal',
  'shieldAbsorbed',
  'prepareConsumed',
  'markConsumed',
  'drawSucceeded',
  'retainSucceeded',
  'upgradedCardsPlayed',
  'echoReplays',
  'incomingAttackDamage',
  'petAbsorbed',
  'attackHpLost',
  'burnHpLost',
]);

const MAX_COUNT = 1_000_000_000;
const isCount = value => Number.isSafeInteger(value) && value >= 0;

function cleanCounts(value) {
  const counts = {};
  for (const key of EFFECT_METRIC_KEYS) {
    const n = value?.[key];
    counts[key] = isCount(n) ? Math.min(MAX_COUNT, n) : 0;
  }
  return counts;
}

/** Return a battle snapshot with one validated counter incremented. */
export function applyMetric(battle, key, amount = 1) {
  if (!battle || typeof battle !== 'object' || Array.isArray(battle)) {
    throw new TypeError('battle snapshot must be an object');
  }
  if (!EFFECT_METRIC_KEYS.includes(key)) throw new RangeError(`unknown effect metric: ${key}`);
  if (!isCount(amount)) throw new RangeError('metric increment must be a non-negative safe integer');
  const effectMetrics = cleanCounts(battle.effectMetrics);
  effectMetrics[key] = Math.min(MAX_COUNT, effectMetrics[key] + amount);
  return { ...battle, effectMetrics };
}

/** Normalize fixed counters; absent keys in legacy snapshots are zero. */
export function normalizeEffectMetrics(value) {
  return cleanCounts(value);
}

/**
 * Aggregate observed battle-counter deltas into the run snapshot. Call only
 * after runAction succeeds. The service's successful-action/idempotency gate
 * owns retry protection; this pure function does not invent an action ledger.
 *
 * Active upgraded-card plays and echo replays are distinct counters. Echoes
 * must never increment `upgradedCardsPlayed`.
 */
export function mergeRunMetrics(before, next, _action) {
  if (!next || typeof next !== 'object') throw new TypeError('next run snapshot must be an object');
  const prior = cleanCounts(before?.effectMetrics);
  const beforeBattle = cleanCounts(before?.battle?.effectMetrics);
  const nextBattle = cleanCounts(next?.battle?.effectMetrics);
  const merged = { ...prior };
  const isNewSnapshot = !Number.isSafeInteger(before?.version) || !Number.isSafeInteger(next?.version)
    ? true
    : next.version > before.version;

  // Battle counters are cumulative within a battle. A missing legacy counter
  // is zero, but net HP/shield/log observations are deliberately ignored.
  for (const key of EFFECT_METRIC_KEYS) {
    const delta = isNewSnapshot ? Math.max(0, nextBattle[key] - beforeBattle[key]) : 0;
    merged[key] = Math.min(MAX_COUNT, merged[key] + delta);
  }

  // Optional engine-reported per-action deltas support a transition that
  // clears `battle`; only fixed, validated keys are accepted.
  const settled = isNewSnapshot ? next?.settledEffectMetrics : null;
  if (settled && typeof settled === 'object') {
    for (const key of EFFECT_METRIC_KEYS) {
      const n = settled[key];
      if (isCount(n)) {
        const delta = Math.max(0, nextBattle[key] - beforeBattle[key]);
        merged[key] = Math.min(MAX_COUNT, merged[key] - delta + n);
      }
    }
  }
  const result = { ...next, effectMetrics: merged };
  // settledEffectMetrics is per-action transport data, never durable run state.
  delete result.settledEffectMetrics;
  return result;
}
