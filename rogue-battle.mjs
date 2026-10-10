import { CATALOG } from './rogue-catalog.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const MAX_HP = CATALOG.player.maxHp;
const MAX_SHIELD = 30;
const MAX_BURN = 20;

function hashSeed(seed) {
  // FNV-1a over a stable string representation. This intentionally does not
  // reproduce Python's random.Random sequence; it only promises JS stability.
  const text = String(seed ?? 0);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 0x9e3779b9;
}

function nextRandom(state) {
  let x = state.rngState >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x >>> 0 || 0x9e3779b9;
  return state.rngState / 0x100000000;
}

function shuffleInPlace(state, values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}

function assertDeck(deck) {
  if (!Array.isArray(deck) || deck.length === 0) throw new TypeError('deck must be a non-empty entity array');
  const seen = new Set();
  for (const entity of deck) {
    if (!entity || !Number.isInteger(entity.uid) || entity.uid < 0 || typeof entity.cardId !== 'string' || typeof entity.upgraded !== 'boolean') {
      throw new TypeError('each deck entity needs uid:number, cardId:string, upgraded:boolean');
    }
    if (seen.has(entity.uid)) throw new TypeError(`duplicate entity uid: ${entity.uid}`);
    if (!CATALOG.cards[entity.cardId]) throw new TypeError(`unknown cardId: ${entity.cardId}`);
    seen.add(entity.uid);
  }
}

function assertRelics(relics) {
  if (!Array.isArray(relics)) throw new TypeError('relics must be an ID array');
  const seen = new Set();
  for (const id of relics) {
    if (typeof id !== 'string' || !CATALOG.relics[id]) throw new TypeError(`unknown relic ID: ${id}`);
    if (seen.has(id)) throw new TypeError(`duplicate relic ID: ${id}`);
    seen.add(id);
  }
}

function cardDefinition(entity) {
  const base = CATALOG.cards[entity.cardId];
  if (!entity.upgraded) return base;
  return { ...base, ...base.upgrade };
}

function terminal(state) {
  if (state.hp <= 0) state.result = 'DEFEAT';
  else if (state.enemyHp <= 0) state.result = 'WIN';
  if (state.result) state.echo = null;
  return state.result;
}

function relicsFor(state, trigger) {
  return state.relics
    .filter((id) => CATALOG.relics[id].trigger === trigger)
    .map((id) => [id, CATALOG.relics[id]]);
}

function damageEnemy(state, amount, ignoreArmor = false) {
  const afterArmor = Math.max(0, amount - (ignoreArmor ? 0 : state.enemyArmor));
  const blocked = Math.min(state.enemyShield, afterArmor);
  state.enemyShield -= blocked;
  const hpLoss = Math.min(state.enemyHp, afterArmor - blocked);
  state.enemyHp -= hpLoss;
  terminal(state);
  return hpLoss;
}

function applyDefinition(state, definition, active) {
  if (state.result) return;
  state.hp -= definition.selfCost;
  state.selfLoss += definition.selfCost;
  if (terminal(state)) return;

  const isAttack = definition.effects.some((effect) => effect.kind === 'damage');
  let attackBonus = 0;
  if (active && isAttack) {
    for (const [id, relic] of relicsFor(state, 'first_attack_damage')) {
      if (!state.battleFlags.includes(id)) {
        state.battleFlags.push(id);
        attackBonus += relic.value;
      }
    }
  }

  let firstDamage = true;
  let firstBlock = true;
  for (const effect of definition.effects) {
    const value = effect.value;
    if (effect.kind === 'damage') {
      const bonus = firstDamage ? attackBonus : 0;
      firstDamage = false;
      const hpLoss = damageEnemy(state, value + bonus, effect.ignoreArmor === true);
      // A lethal effect ends the battle before later triggers/effects resolve.
      if (state.result) return;
      if (active && hpLoss > 0) {
        for (const [id, relic] of relicsFor(state, 'first_attack_burn')) {
          if (!state.battleFlags.includes(id)) {
            state.battleFlags.push(id);
            state.enemyBurn = Math.min(MAX_BURN, state.enemyBurn + relic.value);
          }
        }
      }
    } else if (effect.kind === 'block') {
      let extra = 0;
      if (active && firstBlock) {
        for (const [id, relic] of relicsFor(state, 'first_block_per_turn')) {
          if (!state.turnFlags.includes(id)) {
            state.turnFlags.push(id);
            extra += relic.value;
          }
        }
      }
      firstBlock = false;
      state.shield = Math.min(MAX_SHIELD, state.shield + value + extra);
    } else if (effect.kind === 'burn') {
      const extra = active
        ? relicsFor(state, 'burn_bonus').reduce((sum, [, relic]) => sum + relic.value, 0)
        : 0;
      state.enemyBurn = Math.min(MAX_BURN, state.enemyBurn + value + extra);
    } else if (effect.kind === 'heal') {
      const healing = Math.min(state.maxHp - state.hp, value);
      state.hp += healing;
      state.heals += healing;
    } else {
      throw new TypeError(`unsupported effect kind: ${effect.kind}`);
    }
    if (terminal(state)) return;
  }

  if (active && definition.replayable) {
    for (const [id] of relicsFor(state, 'echo')) {
      if (!state.battleFlags.includes(id)) {
        state.battleFlags.push(id);
        if (state.echo === null) {
          state.echo = {
            cardId: definition.cardId,
            upgraded: definition.upgraded,
            definition: clone({
              cost: definition.cost,
              selfCost: definition.selfCost,
              exhaust: definition.exhaust,
              replayable: definition.replayable,
              effects: definition.effects,
            }),
          };
        }
      }
    }
  }
}

function drawHand(state) {
  while (state.hand.length < CATALOG.player.draw) {
    if (state.draw.length === 0) {
      if (state.discard.length === 0) break;
      state.draw = state.discard;
      state.discard = [];
      shuffleInPlace(state, state.draw);
    }
    state.hand.push(state.draw.pop());
  }
}

function startTurn(state) {
  state.turn += 1;
  state.shield = 0;
  state.energy = CATALOG.player.energy;
  state.plays = 0;
  state.turnFlags = [];
  const intents = CATALOG.enemies[state.enemyId].intents;
  state.intent = clone(intents[(state.turn - 1) % intents.length]);

  const pendingEcho = state.echo;
  state.echo = null;
  if (pendingEcho) applyDefinition(state, pendingEcho.definition, false);
  if (state.result) return;
  drawHand(state);
}

function endTurnInPlace(state) {
  if (state.result) return;
  state.discard.push(...state.hand);
  state.hand = [];

  // A previous enemy guard lasts through this player turn and is cleared just
  // before the enemy's next action.
  state.enemyShield = 0;
  const intent = state.intent;
  if (intent.kind === 'attack') {
    const hits = intent.hits ?? 1;
    for (let hit = 0; hit < hits; hit += 1) {
      state.attacksTaken += 1;
      const absorbed = Math.min(state.shield, intent.value);
      state.shield -= absorbed;
      state.hp -= intent.value - absorbed;
      if (terminal(state)) return;
      if (absorbed > 0) {
        for (const [, relic] of relicsFor(state, 'reflect')) {
          damageEnemy(state, relic.value);
          if (state.result) return;
        }
      }
    }
  } else if (intent.kind === 'guard') {
    state.enemyShield = intent.value;
  } else if (intent.kind !== 'charge') {
    throw new TypeError(`unsupported intent kind: ${intent.kind}`);
  }

  state.hp -= state.burn;
  state.burn = Math.max(0, state.burn - 1);
  if (terminal(state)) return;
  state.enemyHp -= state.enemyBurn;
  state.enemyBurn = Math.max(0, state.enemyBurn - 1);
  if (terminal(state)) return;

  state.shield = 0;
  if (state.turn >= CATALOG.player.turnLimit) {
    state.result = 'LOST_LIGHT';
    state.echo = null;
  }
}

function drawPileIds(state) {
  return ['hand', 'draw', 'discard', 'exhaust'].flatMap((pile) => state[pile].map((entity) => entity.uid));
}

function assertPileInvariant(state) {
  const pileIds = drawPileIds(state);
  if (new Set(pileIds).size !== pileIds.length) throw new Error('entity UID appears in multiple battle piles');
  const permanentIds = state.deck.map((entity) => entity.uid);
  if (new Set(permanentIds).size !== permanentIds.length) throw new Error('duplicate permanent deck UID');
  if (pileIds.some((uid) => !permanentIds.includes(uid))) throw new Error('battle pile contains unknown entity UID');
  if (state.energy < 0 || state.plays > CATALOG.player.playLimit) throw new Error('battle resource invariant failed');
}

function advanceUntilActionable(state) {
  while (!state.result) {
    if (legalCards(state).length > 0) break;
    endTurnInPlace(state);
    if (state.result) break;
    startTurn(state);
  }
  assertPileInvariant(state);
}

export function beginBattle({ enemyId, deck, relics, hp, seed = 0 }) {
  if (!CATALOG.enemies[enemyId]) throw new TypeError(`unknown enemyId: ${enemyId}`);
  assertDeck(deck);
  assertRelics(relics);
  if (!Number.isInteger(hp) || hp < 0 || hp > MAX_HP) throw new TypeError(`hp must be an integer from 0 to ${MAX_HP}`);

  const state = {
    enemyId,
    hp,
    maxHp: MAX_HP,
    result: hp <= 0 ? 'DEFEAT' : null,
    turn: 0,
    picked: [],
    hand: [],
    draw: clone(deck),
    discard: [],
    exhaust: [],
    energy: 0,
    plays: 0,
    intent: null,
    enemyHp: CATALOG.enemies[enemyId].hp,
    enemyArmor: CATALOG.enemies[enemyId].armor,
    enemyShield: 0,
    enemyBurn: 0,
    shield: 0,
    burn: 0,
    echo: null,
    deck: clone(deck),
    relics: [...relics],
    battleFlags: [],
    turnFlags: [],
    heals: 0,
    selfLoss: 0,
    attacksTaken: 0,
    rngState: hashSeed(seed),
  };

  if (!state.result) {
    shuffleInPlace(state, state.draw);
    startTurn(state);
    advanceUntilActionable(state);
  }
  assertPileInvariant(state);
  return state;
}

export function legalCards(battle) {
  if (!battle || battle.result) return [];
  return battle.hand.filter((entity) => {
    const definition = cardDefinition(entity);
    if (battle.plays >= CATALOG.player.playLimit || definition.cost > battle.energy) return false;
    const pureHealing = definition.effects.every((effect) => effect.kind === 'heal');
    return !(pureHealing && battle.hp >= battle.maxHp);
  }).map((entity) => clone(entity));
}

export function battleAction(battle, action) {
  if (!battle || typeof battle !== 'object') throw new TypeError('battle must be a battle state');
  if (!action || typeof action !== 'object') throw new TypeError('action must be an object');
  if (battle.result) throw new RangeError('battle is already finished');
  const state = clone(battle);

  if (action.type === 'PLAY') {
    if (!Number.isInteger(action.uid)) throw new TypeError('PLAY action requires integer uid');
    const index = state.hand.findIndex((entity) => entity.uid === action.uid);
    if (index < 0) throw new RangeError(`entity ${action.uid} is not in hand`);
    const entity = state.hand[index];
    if (!legalCards(state).some((candidate) => candidate.uid === entity.uid)) {
      throw new RangeError(`entity ${action.uid} is not currently playable`);
    }

    const definition = cardDefinition(entity);
    state.hand.splice(index, 1);
    state[definition.exhaust ? 'exhaust' : 'discard'].push(entity);
    state.energy -= definition.cost;
    state.plays += 1;
    state.picked.push(entity.cardId);
    applyDefinition(state, { ...definition, cardId: entity.cardId, upgraded: entity.upgraded }, true);

    if (!state.result && (state.plays >= CATALOG.player.playLimit || legalCards(state).length === 0)) {
      endTurnInPlace(state);
      if (!state.result) {
        startTurn(state);
        advanceUntilActionable(state);
      }
    }
  } else if (action.type === 'END_TURN') {
    endTurnInPlace(state);
    if (!state.result) {
      startTurn(state);
      advanceUntilActionable(state);
    }
  } else {
    throw new TypeError(`unsupported action type: ${action.type}`);
  }

  assertPileInvariant(state);
  return state;
}
