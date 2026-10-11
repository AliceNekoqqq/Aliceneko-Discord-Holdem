import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMetric,mergeRunMetrics,EFFECT_METRIC_KEYS,normalizeEffectMetrics} from './rogue-effect-metrics.mjs';

test('applyMetric is pure, fixed-key, nonnegative, and bounded',()=>{
 const b={hp:4,effectMetrics:{healing:2,custom:999},log:['detail']};
 const n=applyMetric(b,'healing',3);
 assert.equal(b.effectMetrics.healing,2);
 assert.deepEqual(n.effectMetrics,{healing:5,overheal:0,shieldAbsorbed:0,prepareConsumed:0,markConsumed:0,drawSucceeded:0,retainSucceeded:0,upgradedCardsPlayed:0,echoReplays:0});
 assert.deepEqual(n.log,['detail']);
 assert.throws(()=>applyMetric(b,'hpDelta',1),/unknown effect metric/);
 assert.throws(()=>applyMetric(b,'healing',-1),/non-negative/);
 assert.equal(applyMetric({...b,effectMetrics:{healing:1_000_000_000}},'healing',1).effectMetrics.healing,1_000_000_000);
});

test('legacy snapshots normalize fixed counters to zero and ignore untrusted values',()=>{
 assert.deepEqual(normalizeEffectMetrics(undefined),Object.fromEntries(EFFECT_METRIC_KEYS.map(k=>[k,0])));
 assert.equal(normalizeEffectMetrics({healing:-2,shieldAbsorbed:1.5,drawSucceeded:4}).healing,0);
 assert.equal(normalizeEffectMetrics({healing:-2,shieldAbsorbed:1.5,drawSucceeded:4}).drawSucceeded,4);
});

test('run merge aggregates only explicit counter deltas, never net HP as healing',()=>{
 const before={effectMetrics:{healing:7},battle:{hp:10,effectMetrics:{healing:0,overheal:0,shieldAbsorbed:0}}};
 const next={battle:{hp:10,effectMetrics:{healing:0,overheal:0,shieldAbsorbed:0}},log:['heal then damage']};
 const merged=mergeRunMetrics(before,next,{type:'PLAY'});
 assert.equal(merged.effectMetrics.healing,7);
 assert.equal(merged.effectMetrics.overheal,0);
 assert.equal(merged.effectMetrics.shieldAbsorbed,0);
 assert.deepEqual(next.log,['heal then damage']);
});

test('run merge separates upgraded active plays from echo replay and supports settled battle deltas',()=>{
 const before={effectMetrics:{},battle:{effectMetrics:{upgradedCardsPlayed:1,echoReplays:0,drawSucceeded:2}}};
 const next={battle:{effectMetrics:{upgradedCardsPlayed:1,echoReplays:1,drawSucceeded:3}}};
 const merged=mergeRunMetrics(before,next,{type:'PLAY',uid:22});
 assert.equal(merged.effectMetrics.upgradedCardsPlayed,0);
 assert.equal(merged.effectMetrics.echoReplays,1);
 assert.equal(merged.effectMetrics.drawSucceeded,1);

 const settled=mergeRunMetrics({...before,version:4},{version:5,battle:null,settledEffectMetrics:{healing:2,overheal:1,rawLog:['must not copy']}},{type:'PLAY'});
 assert.equal(settled.effectMetrics.healing,2);
 assert.equal(settled.effectMetrics.overheal,1);
 assert.equal(Object.hasOwn(settled.effectMetrics,'rawLog'),false);
 assert.equal(Object.hasOwn(settled,'settledEffectMetrics'),false);

 // Chaining a duplicate/stale snapshot cannot re-apply transport counters.
 const chained=mergeRunMetrics(settled,{version:5,battle:null,settledEffectMetrics:{healing:2,overheal:1}},{type:'PLAY'});
 assert.equal(chained.effectMetrics.healing,2);
 assert.equal(chained.effectMetrics.overheal,1);
 const stale=mergeRunMetrics({...before,version:6},{version:5,battle:null,settledEffectMetrics:{healing:99}},{type:'PLAY'});
 assert.equal(stale.effectMetrics.healing,0);
 assert.equal(Object.hasOwn(stale,'settledEffectMetrics'),false);
});
