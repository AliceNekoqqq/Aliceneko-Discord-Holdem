"""Independent, bounded v0.2 balance model; no Discord, persistence or wallet.

Reads the JSON catalog. Strategy previews only the current hand and current
intent, never later draws. Metrics are model outputs, not human win rates.
"""
import copy
import hashlib
import itertools
import json
import random
import statistics
from pathlib import Path

CAT = json.loads(Path(__file__).with_name('FIRST_ACT_CATALOG.json').read_text())

def rng(seed, scope):
    return random.Random(int.from_bytes(hashlib.sha256(f'{seed}:{scope}'.encode()).digest()[:8], 'big'))

def card(entity):
    c = copy.deepcopy(CAT['cards'][entity[0]])
    if entity[2]:
        c.update(c['upgrade'])
    return c

def make(enemy_id, deck, relics, hp, seed):
    enemy = CAT['enemies'][enemy_id]
    draw = list(deck)
    rng(seed, 'draw-start').shuffle(draw)
    return dict(hp=hp, maxHp=CAT['player']['maxHp'], enemyHp=enemy['hp'],
                armor=enemy['armor'], enemyId=enemy_id, shield=0, enemyShield=0,
                burn=0, enemyBurn=0, energy=0, plays=0, turn=0,
                draw=draw, hand=[], discard=[], exhaust=[], relics=list(relics),
                battleFlags=[], turnFlags=[], echo=None, result=None,
                heals=0, selfLoss=0, attacksTaken=0, picked=[], intent=None)

def terminal(s):
    if s['hp'] <= 0:
        s['result'] = 'defeat'
    elif s['enemyHp'] <= 0:
        s['result'] = 'win'
    return s['result']

def damage_enemy(s, value, ignore_armor=False):
    value = max(0, value - (0 if ignore_armor else s['armor']))
    absorbed = min(s['enemyShield'], value)
    s['enemyShield'] -= absorbed
    hp_loss = min(s['enemyHp'], value - absorbed)
    s['enemyHp'] -= hp_loss
    terminal(s)
    return hp_loss

def relics_for(s, trigger):
    return [(rid, CAT['relics'][rid]) for rid in s['relics']
            if CAT['relics'][rid]['trigger'] == trigger]

def apply_card(s, definition, active=True):
    c = definition
    if s['result']:
        return
    # Life cost is paid before any of this card's effects.
    s['hp'] -= c['selfCost']
    s['selfLoss'] += c['selfCost']
    if terminal(s):
        return
    attack = any(e['kind'] == 'damage' for e in c['effects'])
    attack_bonus = 0
    if active and attack:
        for rid, r in relics_for(s, 'first_attack_damage'):
            if rid not in s['battleFlags']:
                s['battleFlags'].append(rid)
                attack_bonus += r['value']
    first_damage = True
    first_block = True
    for effect in c['effects']:
        kind, value = effect['kind'], effect['value']
        if kind == 'damage':
            extra = attack_bonus if first_damage else 0
            first_damage = False
            loss = damage_enemy(s, value + extra, effect.get('ignoreArmor', False))
            if s['result']:
                return
            if active and loss > 0:
                for rid, r in relics_for(s, 'first_attack_burn'):
                    if rid not in s['battleFlags']:
                        s['battleFlags'].append(rid)
                        s['enemyBurn'] = min(20, s['enemyBurn'] + r['value'])
        elif kind == 'block':
            extra = 0
            if active and first_block:
                for rid, r in relics_for(s, 'first_block_per_turn'):
                    if rid not in s['turnFlags']:
                        s['turnFlags'].append(rid)
                        extra += r['value']
            first_block = False
            s['shield'] = min(30, s['shield'] + value + extra)
        elif kind == 'burn':
            extra = sum(r['value'] for _, r in relics_for(s, 'burn_bonus')) if active else 0
            s['enemyBurn'] = min(20, s['enemyBurn'] + value + extra)
        elif kind == 'heal':
            healing = min(s['maxHp'] - s['hp'], value)
            s['hp'] += healing
            s['heals'] += healing
        else:
            raise ValueError(f'Unsupported effect {kind}')
        if terminal(s):
            return
    if active and c['replayable']:
        for rid, _ in relics_for(s, 'echo'):
            if rid not in s['battleFlags']:
                s['battleFlags'].append(rid)
                s['echo'] = copy.deepcopy(c)

def legal(s, entity):
    c = card(entity)
    if s['result'] or s['plays'] >= 2 or c['cost'] > s['energy']:
        return False
    if any(e['kind'] == 'heal' for e in c['effects']) and s['hp'] >= s['maxHp']:
        return False
    return entity in s['hand']

def play(s, uid):
    entity = next((e for e in s['hand'] if e[1] == uid), None)
    if entity is None or not legal(s, entity):
        return False
    c = card(entity)
    s['hand'].remove(entity)
    s['exhaust' if c['exhaust'] else 'discard'].append(entity)
    s['energy'] -= c['cost']
    s['plays'] += 1
    s['picked'].append(entity[0])
    apply_card(s, c)
    return True

def begin_turn(s, seed):
    s['turn'] += 1
    s['shield'] = 0
    s['energy'] = CAT['player']['energy']
    s['plays'] = 0
    s['turnFlags'] = []
    intents = CAT['enemies'][s['enemyId']]['intents']
    s['intent'] = intents[(s['turn'] - 1) % len(intents)]
    echo, s['echo'] = s['echo'], None
    if echo:
        apply_card(s, echo, active=False)
    if s['result']:
        return
    while len(s['hand']) < CAT['player']['draw']:
        if not s['draw']:
            if not s['discard']:
                break
            s['draw'], s['discard'] = s['discard'], []
            rng(seed, f'reshuffle-{s["turn"]}').shuffle(s['draw'])
        s['hand'].append(s['draw'].pop(0))
    assert_unique(s)

def end_turn(s):
    if s['result']:
        return
    s['discard'].extend(s['hand'])
    s['hand'] = []
    s['enemyShield'] = 0
    intent = s['intent']
    if intent['kind'] == 'attack':
        s['attacksTaken'] += 1
        absorbed = min(s['shield'], intent['value'])
        s['shield'] -= absorbed
        s['hp'] -= intent['value'] - absorbed
        if terminal(s):
            return
        if absorbed:
            for _, r in relics_for(s, 'reflect'):
                damage_enemy(s, r['value'])
                if s['result']:
                    return
    elif intent['kind'] == 'guard':
        s['enemyShield'] = intent['value']
    elif intent['kind'] != 'charge':
        raise ValueError('Unsupported intent')
    for hp_key, burn_key in [('hp', 'burn'), ('enemyHp', 'enemyBurn')]:
        s[hp_key] -= s[burn_key]
        s[burn_key] = max(0, s[burn_key] - 1)
        if terminal(s):
            return
    s['shield'] = 0
    if s['turn'] >= CAT['player']['turnLimit']:
        s['result'] = 'lost_light'
    assert_unique(s)

def assert_unique(s):
    ids = [e[1] for pile in ['draw', 'hand', 'discard', 'exhaust'] for e in s[pile]]
    assert len(ids) == len(set(ids)), 'physical card appears in multiple piles'
    assert s['energy'] >= 0 and s['plays'] <= 2

def choose(s, strategy):
    candidates = [()]
    ids = [e[1] for e in s['hand']]
    candidates += [(i,) for i in ids]
    candidates += list(itertools.permutations(ids, 2))
    best = None
    for seq in candidates:
        trial = copy.deepcopy(s)
        valid = True
        for uid in seq:
            if trial['result']:
                break
            if not play(trial, uid):
                valid = False
                break
        if not valid:
            continue
        end_turn(trial)
        if trial['result'] in ('defeat', 'lost_light'):
            score = -10000 + trial['enemyBurn']
        else:
            damage = s['enemyHp'] - max(0, trial['enemyHp'])
            hp_delta = trial['hp'] - s['hp']
            weights = {'aggressive': (10, 2), 'balanced': (5, 9), 'defensive': (3, 14)}[strategy]
            score = weights[0] * damage + weights[1] * hp_delta + trial['enemyBurn']
            if trial['result'] == 'win':
                score += 1000 + 2 * trial['hp']
        # Equal scores prefer fewer life costs then fewer actions.
        key = (score, -trial['selfLoss'], -len(seq))
        if best is None or key > best[0]:
            best = (key, trial)
    assert best is not None
    return best[1]

def battle(enemy, deck, relics, hp, seed, strategy, trace=False):
    s = make(enemy, deck, relics, hp, seed)
    records = []
    while not s['result']:
        begin_turn(s, seed)
        if s['result']:
            break
        before = {k: copy.deepcopy(s[k]) for k in ['hp', 'enemyHp', 'enemyShield', 'enemyBurn', 'hand', 'intent']}
        already = len(s['picked'])
        s = choose(s, strategy)
        if trace:
            records.append(dict(turn=s['turn'], before=before, played=s['picked'][already:],
                                hp=s['hp'], enemyHp=max(0, s['enemyHp']),
                                enemyBurn=s['enemyBurn'], result=s['result']))
    return s, records

def deck_entities(ids):
    return [(cid, i, False) for i, cid in enumerate(ids)]

def percentile(values, frac):
    values = sorted(values)
    return values[max(0, int((len(values) - 1) * frac))]

def summary(rows):
    return dict(n=len(rows), wins=sum(s['result'] == 'win' for s in rows),
                meanTurns=round(statistics.mean(s['turn'] for s in rows), 2),
                p90Turns=percentile([s['turn'] for s in rows], .9),
                meanEndHp=round(statistics.mean(max(0, s['hp']) for s in rows), 2),
                p10EndHp=percentile([max(0, s['hp']) for s in rows], .1),
                meanHeal=round(statistics.mean(s['heals'] for s in rows), 2),
                lostLight=sum(s['result'] == 'lost_light' for s in rows))

def pick_reward(candidates, strategy):
    # A declared static preference; no inspection of later draws or enemies.
    priorities = {
        'aggressive': ['heavy_blow', 'cinder_cut', 'ember_burst', 'measured_thrust', 'kindle', 'coal_screen', 'riposte_stance', 'ash_wall', 'field_dressing'],
        'balanced': ['coal_screen', 'cinder_cut', 'ember_burst', 'heavy_blow', 'measured_thrust', 'kindle', 'ash_wall', 'riposte_stance', 'field_dressing'],
        'defensive': ['ash_wall', 'coal_screen', 'riposte_stance', 'field_dressing', 'cinder_cut', 'ember_burst', 'heavy_blow', 'kindle', 'measured_thrust'],
    }
    return min(candidates, key=priorities[strategy].index)

def act_one(seed, starter, strategy, route, trace=False):
    deck = deck_entities(CAT['starterDeck'])
    relics = [starter]
    hp, embers = 30, 0
    stages = []
    normal = 'lantern_rat' if seed % 2 == 0 else 'ash_guard'
    s, records = battle(normal, deck, relics, hp, f'{seed}:normal', strategy, trace)
    stages.append(dict(room=normal, hp=s['hp'], turns=s['turn'], result=s['result'], trace=records))
    if s['result'] != 'win':
        return dict(result='DEFEAT', hp=0, stages=stages, completed=0, embers=embers)
    hp, embers = s['hp'], 8
    candidates = rng(seed, 'normal-reward').sample(CAT['cardRewards'], 3)
    reward = pick_reward(candidates, strategy)
    deck.append((reward, len(deck), False))
    stages.append(dict(room='normal_reward', candidates=candidates, selected=reward))
    if route.startswith('camp'):
        if route == 'camp_heal':
            hp = min(30, hp + 9)
            stages.append(dict(room='camp', choice='heal', hp=hp))
        else:
            cid = 'guard' if strategy == 'defensive' else 'slash'
            index = next(i for i, e in enumerate(deck) if e[0] == cid and not e[2])
            before = deck[index]
            deck[index] = (before[0], before[1], True)
            stages.append(dict(room='camp', choice='upgrade', entityId=before[1], card=cid, hp=hp))
    else:
        s, records = battle('cinder_knight', deck, relics, hp, f'{seed}:elite', strategy, trace)
        stages.append(dict(room='cinder_knight', hp=s['hp'], turns=s['turn'], result=s['result'], trace=records))
        if s['result'] != 'win':
            return dict(result='DEFEAT', hp=0, stages=stages, completed=1, embers=embers)
        hp, embers = s['hp'], embers + 14
        candidates = rng(seed, 'elite-card-reward').sample(CAT['cardRewards'], 3)
        reward = pick_reward(candidates, strategy)
        deck.append((reward, len(deck), False))
        # Cycle through all elite relic choices over the seed set.
        extra = CAT['eliteRelics'][seed % len(CAT['eliteRelics'])]
        relics.append(extra)
        stages.append(dict(room='elite_reward', candidates=candidates, selected=reward, relic=extra))
    s, records = battle('dark_lantern', deck, relics, hp, f'{seed}:boss', strategy, trace)
    stages.append(dict(room='dark_lantern', hp=s['hp'], turns=s['turn'], result=s['result'], trace=records))
    return dict(result='CHECKPOINT' if s['result'] == 'win' else 'DEFEAT',
                hp=max(0, s['hp']), stages=stages, completed=3 if s['result'] == 'win' else 2,
                embers=embers + (20 if s['result'] == 'win' else 0),
                deck=[list(e) for e in deck], relics=relics)

def summarize_acts(rows):
    wins = [r for r in rows if r['result'] == 'CHECKPOINT']
    fights = [[s for s in r['stages'] if 'turns' in s] for r in rows]
    return dict(n=len(rows), checkpoints=len(wins),
                meanEndHp=round(statistics.mean(r['hp'] for r in rows), 2),
                p10EndHp=percentile([r['hp'] for r in rows], .1),
                meanTotalTurns=round(statistics.mean(sum(s['turns'] for s in fs) for fs in fights), 2),
                meanBossTurns=round(statistics.mean(fs[-1]['turns'] for fs in fights), 2))

def validate_catalog():
    assert CAT['player'] == dict(maxHp=30, energy=2, draw=4, playLimit=2, turnLimit=12)
    assert len(CAT['starterDeck']) == 8 and len(CAT['cards']) == 14
    available = set(CAT['starterDeck']) | set(CAT['cardRewards'])
    assert available == set(CAT['cards']), 'unobtainable card definition'
    for c in CAT['cards'].values():
        assert c['cost'] in (1, 2) and c['upgrade']['cost'] in (1, 2)
        assert c['selfCost'] >= 0 and c['upgrade']['selfCost'] >= 0
        for effects in [c['effects'], c['upgrade']['effects']]:
            assert all(e['kind'] in ('damage', 'block', 'burn', 'heal') and e['value'] >= 0 for e in effects)
        if any(e['kind'] == 'heal' for e in c['effects']):
            assert c['exhaust'] and not c['replayable']
    for e in CAT['enemies'].values():
        assert e['hp'] > 0 and e['armor'] >= 0
        assert all(i['kind'] in ('attack', 'guard', 'charge') and i['value'] >= 0 for i in e['intents'])

def boundary_checks():
    # Check consequences with fixed inputs independently of random strategies.
    deck = deck_entities(CAT['starterDeck'])
    s = make('dark_lantern', deck, ['reflect'], 2, 1)
    s['energy'], s['hand'] = 2, [deck[6]]
    s['draw'] = [e for e in deck if e != deck[6]]
    play(s, deck[6][1])
    assert s['result'] == 'defeat' and s['enemyHp'] == CAT['enemies']['dark_lantern']['hp']
    s = make('dark_lantern', deck, [], 30, 1)
    s['energy'], s['hand'], s['draw'] = 2, [deck[0]], [e for e in deck if e != deck[0]]
    s['enemyHp'], s['armor'], s['intent'] = 6, 0, dict(kind='attack', value=8)
    play(s, 0)
    end_turn(s)
    assert s['result'] == 'win' and s['hp'] == 30
    s = make('dark_lantern', deck, [], 25, 1)
    s['energy'], s['hand'], s['draw'] = 2, [deck[7]], [e for e in deck if e != deck[7]]
    play(s, 7)
    assert s['hp'] == 29 and len(s['exhaust']) == 1 and not s['discard']
    s = make('dark_lantern', deck, ['brooch'], 30, 1)
    apply_card(s, card(deck[3]))
    apply_card(s, card(deck[4]))
    assert s['shield'] == 11
    s = make('dark_lantern', deck, ['reflect'], 1, 1)
    s['shield'], s['intent'] = 1, dict(kind='attack', value=8)
    end_turn(s)
    assert s['result'] == 'defeat' and s['enemyHp'] == CAT['enemies']['dark_lantern']['hp']
    s = make('dark_lantern', deck, ['echo', 'badge'], 30, 1)
    apply_card(s, card(deck[0]))
    hp_after = s['enemyHp']
    echo, s['echo'] = s['echo'], None
    apply_card(s, echo, active=False)
    assert s['echo'] is None and hp_after - s['enemyHp'] == 5
    # Exhausted cards never duplicated to satisfy the draw count.
    tiny = [('bandage', 0, False), ('field_dressing', 1, False), ('slash', 2, False), ('guard', 3, False)]
    s = make('dark_lantern', tiny, [], 20, 1)
    s['exhaust'], s['draw'] = tiny[:2], tiny[2:]
    begin_turn(s, 1)
    assert len(s['hand']) == 2 and len(s['exhaust']) == 2
    s = make('dark_lantern', deck, [], 30, 1)
    s['turn'], s['intent'] = 12, dict(kind='charge', value=0)
    end_turn(s)
    assert s['result'] == 'lost_light'
    # Armor blocks ordinary damage per packet; shield persists until next action.
    s = make('dark_lantern', deck, [], 30, 1)
    s['intent'] = dict(kind='guard', value=6)
    end_turn(s)
    assert s['enemyShield'] == 6
    damage_enemy(s, 6)
    assert s['enemyHp'] == 40 and s['enemyShield'] == 1
    s['intent'] = dict(kind='charge', value=0)
    end_turn(s)
    assert s['enemyShield'] == 0
    # A two-energy card spends the whole budget even with one action left.
    heavy = ('heavy_blow', 8, False)
    s = make('dark_lantern', deck + [heavy], [], 30, 1)
    s['energy'], s['hand'] = 2, [heavy, deck[0]]
    s['draw'] = [e for e in deck if e != deck[0]]
    play(s, 8)
    assert s['energy'] == 0 and s['plays'] == 1 and not legal(s, deck[0])
    # Card order changes survival; later healing cannot rescue life-cost death.
    outcomes = []
    for order in [(7, 6), (6, 7)]:
        s = make('dark_lantern', deck, [], 2, 1)
        s['energy'], s['hand'] = 2, [deck[7], deck[6]]
        s['draw'] = [e for e in deck if e not in s['hand']]
        for uid in order:
            play(s, uid)
        outcomes.append((s['hp'], s['result'], s['enemyHp']))
    assert outcomes == [(4, None, 32), (0, 'defeat', 40)]
    s = make('dark_lantern', deck, ['tinder'], 30, 1)
    s['enemyShield'] = 100
    apply_card(s, card(deck[0]))
    assert not s['battleFlags'] and s['enemyBurn'] == 0
    s['enemyShield'] = 0
    apply_card(s, card(deck[0]))
    assert s['enemyBurn'] == 2 and s['battleFlags'] == ['tinder']
    s = make('dark_lantern', deck, ['burn_bonus'], 30, 1)
    s['enemyBurn'] = 19
    apply_card(s, CAT['cards']['kindle'])
    assert s['enemyBurn'] == 20
    return 13

def run(n=64):
    validate_catalog()
    checks = boundary_checks()
    base = deck_entities(CAT['starterDeck'])
    metrics = {}
    for enemy in CAT['enemies']:
        for relic in CAT['starterRelics']:
            for strategy in ['aggressive', 'balanced', 'defensive']:
                rows = [battle(enemy, base, [relic], 30, seed, strategy)[0] for seed in range(n)]
                metrics[f'{enemy}/{relic}/{strategy}'] = summary(rows)
    # Every reward/elite relic combination, without upgrades, at reduced HP.
    growth = {}
    for reward in CAT['cardRewards']:
        for extra in CAT['eliteRelics']:
            deck = base + [(reward, len(base), False)]
            rows = [battle('dark_lantern', deck, ['tinder', extra], 24, seed, 'balanced')[0] for seed in range(n)]
            growth[f'{reward}/{extra}'] = summary(rows)
    acts = {}
    for starter in CAT['starterRelics']:
        for strategy in ['aggressive', 'balanced', 'defensive']:
            for route in ['camp_heal', 'camp_upgrade', 'elite']:
                rows = [act_one(seed, starter, strategy, route) for seed in range(n)]
                acts[f'{starter}/{strategy}/{route}'] = summarize_acts(rows)
    stress = {}
    for starter in CAT['starterRelics']:
        for strategy in ['aggressive', 'balanced', 'defensive']:
            rows = [battle('dark_lantern', base, [starter], 8, seed, strategy)[0] for seed in range(n)]
            stress[f'{starter}/{strategy}/startHP8'] = summary(rows)
    sample_runs = [dict(seed=7, starter='brooch', strategy='balanced', route=route,
                        run=act_one(7, 'brooch', 'balanced', route, trace=True))
                   for route in ['camp_upgrade', 'elite']]
    out = dict(catalogVersion=CAT['version'], boundaryChecks=checks, seedsPerCell=n,
               isolatedBattles=metrics, growthBoss=growth,
               fullFirstAct=acts, lowHpStress=stress, sampleRuns=sample_runs,
               limitations=['known-current-turn greedy strategy; not human play',
                            'first act only; no second/third act or full-run payout',
                            'static reward preferences; no skip-reward or optimal path search',
                            'no timing model or human mistakes or information reading costs',
                            'no Discord or durable storage or wallet',
                            'catalog-specific reference engine, not production engine'])
    Path(__file__).with_name('BALANCE_RESULTS.json').write_text(json.dumps(out, ensure_ascii=False, indent=2)+'\n')
    return out

if __name__ == '__main__':
    out = run()
    print(json.dumps(dict(boundaryChecks=out['boundaryChecks'], cells=sum(len(out[k]) for k in ['isolatedBattles','growthBoss','fullFirstAct','lowHpStress']),
                          seedsPerCell=out['seedsPerCell']), ensure_ascii=False))
