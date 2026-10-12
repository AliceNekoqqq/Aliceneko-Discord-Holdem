import { getDifficultyRules as previous, DIFFICULTIES as previousDifficulties, MAX_DIFFICULTY } from './rogue-difficulty-v08.mjs';
export { MAX_DIFFICULTY };
export function getDifficultyRules(level = 0) {
  const rules = previous(level);
  return { ...rules, allHpMultiplier: rules.allHpMultiplier * 1.08, attackBonus: rules.attackBonus + 1 };
}
export const DIFFICULTIES = Object.freeze(previousDifficulties.map(entry => ({ ...entry,
  description: entry.level === 0 ? `${entry.description} 敌人生命提高8%，每段攻击增加1。` : entry.description
})));
