"""v0.3 full-run reference model. No Discord, persistence, scores or wallet.

Reuses reference_sim combat and the first-act catalog. Later content and rooms
come from RUN_CATALOG_V03.json. Runs are bounded and deterministic per seed.
"""
import copy
import json
import statistics
from pathlib import Path
import reference_sim as combat

CAT = json.loads(Path(__file__).with_name('RUN_CATALOG_V03.json').read_text())
combat.CAT = CAT

def card_value(cid, strategy):
    c = CAT['cards'][cid]
    # Fixed content-based preference; ignores upcoming deck order/encounters.
    weights = {'aggressive': (2.0, .3, 1.6, .3),
               'balanced': (1.0, 1.0, 1.3, 1.0),
               'defensive': (.5, 1.5, 1.0, 1.3)}[strategy]
    values = dict(zip(['damage','block','burn','heal'], weights))
    score = sum(values[e['kind']] * e['value'] for e in c['effects']) / c['cost']
    score += sum(1 for e in c['effects'] if e.get('ignoreArmor'))
    score -= c['selfCost']
    return score

def pick(candidates, strategy):
    return max(candidates, key=lambda cid: (card_value(cid, strategy), cid)) if candidates else None

def choose_relic(candidates, strategy, obtained):
    allowed = [rid for rid in candidates if rid not in obtained]
    priorities = {
        'aggressive': ['first_attack_damage','echo','burn_bonus','first_attack_burn','reflect','first_block_per_turn'],
        'balanced': ['burn_bonus','first_block_per_turn','echo','first_attack_burn','first_attack_damage','reflect'],
        'defensive': ['first_block_per_turn','reflect','burn_bonus','echo','first_attack_burn','first_attack_damage'],
    }
    return min(allowed, key=lambda rid: priorities[strategy].index(CAT['relics'][rid]['trigger'])) if allowed else None

def reward(pool, seed, scope, strategy):
    candidates = combat.rng(seed, scope).sample(pool, min(3, len(pool)))
    return candidates, pick(candidates, strategy)

def upgrade_index(deck, strategy):
    eligible = [(i,e) for i,e in enumerate(deck) if not e[2]]
    def gain(e):
        cid = e[0]
        c = CAT['cards'][cid]
        values = {'damage':1 if strategy!='defensive' else .5,
                  'block':1.5 if strategy=='defensive' else 1,
                  'burn':1.5,'heal':1}
        before = sum(values[x['kind']] * x['value'] for x in c['effects'])
        after = sum(values[x['kind']] * x['value'] for x in c['upgrade']['effects'])
        return (after-before + c['selfCost']-c['upgrade']['selfCost'], -e[1])
    return max(eligible, key=lambda ie: gain(ie[1]))[0] if eligible else None

def shop(deck, embers, seed, pool, strategy):
    out = []
    offers = combat.rng(seed, 'shop-offers').sample(pool, min(2,len(pool)))
    ranked = sorted(offers, key=lambda c: (card_value(c,strategy), c), reverse=True)
    purchased = None
    for cid in ranked:
        price = CAT['shop']['cardCostByEnergy'][str(CAT['cards'][cid]['cost'])]
        if embers >= price:
            embers -= price
            purchased = cid
            out.append(dict(action='buy',card=cid,cost=price))
            break
    # Model buys at most one card, then removes one conditionally weak entity.
    # The room contract permits two purchases; this is a declared policy limit.
    if embers >= CAT['shop']['removeCost'] and len(deck)>CAT['shop']['minimumDeck']:
        target = next((i for i,e in enumerate(deck) if e[0]=='pierce' and not e[2]), None)
        if target is not None:
            removed = deck.pop(target)
            embers -= CAT['shop']['removeCost']
            out.append(dict(action='remove',card=removed[0],entityId=removed[1],cost=CAT['shop']['removeCost']))
    return embers, purchased, dict(offers=offers,actions=out)

def run_one(seed, starter, strategy, route_policy, trace=False):
    deck = combat.deck_entities(CAT['starterDeck'])
    next_uid = len(deck)
    relics = [starter] if starter else []
    hp, embers, completed = 30, 0, 0
    records, pool = [], []
    total_turns, active_plays, manual_ends, room_actions = 0, 0, 0, 1
    def add(cid):
        nonlocal next_uid
        if cid:
            deck.append((cid,next_uid,False))
            next_uid += 1
    def fight(enemy, act, slot):
        nonlocal hp,total_turns,active_plays,manual_ends
        s, turns = combat.battle(enemy,deck,relics,hp,f'{seed}:a{act}s{slot}',strategy,trace)
        hp = max(0,s['hp'])
        total_turns += s['turn']
        active_plays += len(s['picked'])
        manual_ends += s.get('manualEnds',0)
        entry = dict(act=act,slot=slot,room=enemy,hp=hp,result=s['result'],turns=s['turn'],
                     plays=len(s['picked']),manualEnds=s.get('manualEnds',0),heal=s['heals'],
                     selfLoss=s['selfLoss'])
        if trace:
            entry['trace']=turns
        records.append(entry)
        return s['result']
    def result(reason, act):
        return dict(seed=seed,starter=starter,strategy=strategy,route=route_policy,
                    result=reason,lastAct=act,hp=hp,completed=completed,embers=embers,
                    totalTurns=total_turns,activePlays=active_plays,manualEnds=manual_ends,
                    actionProxy=active_plays+manual_ends+room_actions,
                    deckSize=len(deck),upgraded=sum(e[2] for e in deck),relics=list(relics),records=records)
    for a in CAT['acts']:
        act=a['index']
        pool += a['newCardRewards']
        if act>1:
            picked=choose_relic(a['chapterRelics'],strategy,relics)
            if picked:
                relics.append(picked)
            records.append(dict(act=act,room='blessing',selected=picked,hp=hp))
            room_actions += 1
        # Slot 1: optional shop/event belongs to the safe route only.
        safe=route_policy=='safe'
        if act==2 and safe:
            embers,cid,data=shop(deck,embers,seed,pool,strategy)
            add(cid)
            room_actions += len(data['actions'])+1
            records.append(dict(act=act,slot=1,room='shop',hp=hp,embers=embers,**data))
        elif act==3 and safe:
            if hp<=24 and embers>=CAT['event']['healCost']:
                price=CAT['event']['healCost']
                embers-=price
                hp=min(30,hp+CAT['event']['healAmount'])
                data=dict(choice='heal',cost=price)
            elif embers>=CAT['event']['cardCost']:
                price=CAT['event']['cardCost']
                candidates,cid=reward(a['newCardRewards'],seed,'event-cards',strategy)
                embers-=price
                add(cid)
                data=dict(choice='card',cost=price,candidates=candidates,selected=cid)
            else:
                data=dict(choice='leave',cost=0)
            room_actions += 1
            records.append(dict(act=act,slot=1,room='repair_event',hp=hp,embers=embers,**data))
        else:
            enemy=combat.rng(seed,f'normal-a{act}').choice(a['normalEnemies'])
            room_actions += 1
            reason=fight(enemy,act,1)
            if reason!='win':
                return result('LOST_LIGHT' if reason=='lost_light' else 'DEFEAT',act)
            embers+=a['normalEmbers']
            candidates,cid=reward(pool,seed,f'normal-reward-a{act}',strategy)
            add(cid)
            room_actions += 1
            records.append(dict(act=act,room='card_reward',candidates=candidates,selected=cid))
        completed+=1
        # Slot 2: cautious always rests, risk always fights, balanced uses HP22.
        elite=route_policy=='risk' or (route_policy=='balanced' and hp>=22)
        room_actions+=1
        if elite:
            reason=fight(a['eliteEnemy'],act,2)
            if reason!='win':
                return result('LOST_LIGHT' if reason=='lost_light' else 'DEFEAT',act)
            embers+=a['eliteEmbers']
            candidates,cid=reward(pool,seed,f'elite-reward-a{act}',strategy)
            add(cid)
            picked=choose_relic(CAT['eliteRelics'],strategy,relics)
            if picked:
                relics.append(picked)
            room_actions+=2
            records.append(dict(act=act,room='elite_reward',candidates=candidates,selected=cid,relic=picked))
        else:
            index=upgrade_index(deck,strategy)
            if hp<=21:
                hp=min(30,hp+9)
                data=dict(choice='heal')
            elif index is not None:
                cid,uid,_=deck[index]
                deck[index]=(cid,uid,True)
                data=dict(choice='upgrade',card=cid,entityId=uid)
            elif hp<30:
                hp=min(30,hp+9)
                data=dict(choice='heal')
            else:
                data=dict(choice='leave')
            room_actions+=1
            records.append(dict(act=act,slot=2,room='camp',hp=hp,**data))
        completed+=1
        reason=fight(a['bossEnemy'],act,3)
        if reason!='win':
            return result('LOST_LIGHT' if reason=='lost_light' else 'DEFEAT',act)
        embers+=a['bossEmbers']
        completed+=1
        records.append(dict(act=act,room='checkpoint' if act<3 else 'clear',hp=hp,embers=embers))
        if act<3:
            room_actions+=1  # all sampled full runs continue; retreat separately checked
    return result('CLEAR',3)

def stats(rows):
    clears=[r for r in rows if r['result']=='CLEAR']
    return dict(n=len(rows),clears=len(clears),failures=len(rows)-len(clears),
                lostLight=sum(r['result']=='LOST_LIGHT' for r in rows),
                reachAct2=sum(r['lastAct']>=2 for r in rows),reachAct3=sum(r['lastAct']>=3 for r in rows),
                meanTurns=round(statistics.mean(r['totalTurns'] for r in rows),2),
                meanClearTurns=round(statistics.mean(r['totalTurns'] for r in clears),2) if clears else None,
                meanClearActions=round(statistics.mean(r['actionProxy'] for r in clears),2) if clears else None,
                p90ClearActions=combat.percentile([r['actionProxy'] for r in clears],.9) if clears else None,
                meanClearHp=round(statistics.mean(r['hp'] for r in clears),2) if clears else None,
                meanClearEmbers=round(statistics.mean(r['embers'] for r in clears),2) if clears else None,
                meanClearDeck=round(statistics.mean(r['deckSize'] for r in clears),2) if clears else None)

def checks():
    assert len(CAT['acts'])==3 and len(CAT['cards'])==20 and len(CAT['relics'])==12 and len(CAT['enemies'])==12
    unlocked=set(CAT['starterDeck'])
    for a in CAT['acts']:
        unlocked.update(a['newCardRewards'])
        for eid in a['normalEnemies']+[a['eliteEnemy'],a['bossEnemy']]:
            e=CAT['enemies'][eid]
            for i in e['intents']:
                assert i['kind'] in ('attack','charge','guard') and i.get('hits',1) in (1,2,3)
    assert unlocked==set(CAT['cards'])
    for c in CAT['cards'].values():
        assert c['cost'] in (1,2) and c['upgrade']['cost'] in (1,2)
        assert all(x['kind'] in ('damage','block','burn','heal') for x in c['effects']+c['upgrade']['effects'])
        if any(x['kind']=='heal' for x in c['effects']):
            assert c['exhaust'] and not c['replayable']
    legacy=combat.boundary_checks()
    base=combat.deck_entities(CAT['starterDeck'])
    s=combat.make('dark_lantern',base,['reflect'],10,0)
    s.update(armor=0,shield=6,intent=dict(kind='attack',value=4,hits=3))
    combat.end_turn(s)
    assert s['hp']==4 and s['enemyHp']==36 and s['attacksTaken']==3
    s=combat.make('dark_lantern',base,['reflect'],10,0)
    s.update(armor=0,enemyHp=2,shield=1,intent=dict(kind='attack',value=4,hits=3))
    combat.end_turn(s)
    assert s['result']=='win' and s['hp']==7 and s['attacksTaken']==1
    hybrid=('a3_counterweight',8,False)
    s=combat.make('dark_lantern',base+[hybrid],[],30,0)
    s.update(energy=2,hand=[hybrid],draw=list(base))
    assert combat.legal(s,hybrid)
    combat.play(s,8)
    assert s['shield']==12 and s['hp']==30 and s['exhaust']==[hybrid]
    obtained=list(CAT['eliteRelics'])
    assert choose_relic(CAT['eliteRelics'],'balanced',obtained) is None
    d=list(base)
    embers,added,_=shop(d,0,0,CAT['cardRewards'],'balanced')
    assert embers==0 and added is None and d==base
    # Partial run stops at checked terminal facts; checkpoint retreat does not
    # open next chapter or assign an extra relic. This is a record projection,
    # not a test of durable persistence or an implemented withdrawal service.
    r=run_one(7,'brooch','balanced','safe')
    checkpoints=[x for x in r['records'] if x['room']=='checkpoint']
    assert checkpoints and checkpoints[0]['act']==1
    return legacy+6

def run(n=24):
    count=checks()
    cells={}
    failures=[]
    samples=[]
    for starter in CAT['starterRelics']:
        for strategy in ['aggressive','balanced','defensive']:
            for route in ['safe','balanced','risk']:
                rows=[run_one(seed,starter,strategy,route) for seed in range(n)]
                cells[f'{starter}/{strategy}/{route}']=stats(rows)
                failures.extend(dict(seed=r['seed'],cell=f'{starter}/{strategy}/{route}',result=r['result'],act=r['lastAct']) for r in rows if r['result']!='CLEAR')
    for route in ['safe','risk']:
        samples.append(run_one(7,'brooch','balanced',route,trace=True))
    out=dict(version=CAT['version'],seedsPerCell=n,cells=cells,boundaryChecks=count,
             failures=failures,samples=samples,limitations=[
             'greedy current-turn strategy, not human win rates',
             'content-based fixed rewards, no reward-skipping/optimal search',
             'safe shop policy buys at most one card and removes unupgraded pierce if affordable',
             'no simulation of shop upgrading or event cancellation/concurrent persistence',
             'actionProxy omits confirmation/detail/refresh/network cost and is not minutes',
             'no Discord, wallet, ranking integration or random events beyond declared rooms'])
    Path(__file__).with_name('FULL_RUN_RESULTS_V03.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(boundaryChecks=count,cells=len(cells),runs=n*len(cells),clears=sum(c['clears'] for c in cells.values()),lostLight=sum(c['lostLight'] for c in cells.values())),ensure_ascii=False))
    return out

if __name__=='__main__':
    run()
