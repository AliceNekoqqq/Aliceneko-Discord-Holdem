import * as legacy from './rogue-battle-v04.mjs';
import * as expanded from './rogue-battle-v06.mjs';
import * as latest from './rogue-battle-v07.mjs';
const current = state => state?.ruleVersion === 'lantern-rules-v0.7' ? latest : state?.ruleVersion === 'lantern-rules-v0.6' ? expanded : legacy;
export const beginBattle = options => current(options).beginBattle(options);
export const battleAction = (state, action) => current(state).battleAction(state, action);
export const legalCards = state => current(state).legalCards(state);
export const legalItems = state => current(state).legalItems?.(state) ?? [];
