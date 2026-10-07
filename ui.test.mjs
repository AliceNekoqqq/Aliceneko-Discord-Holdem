import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from './engine.mjs';
import {board,quickRaises} from './ui.mjs';
const controls=t=>board(t).components.flatMap(r=>r.components);
test('buttons match the betting state and use legal, deduplicated raise totals',()=>{
 const t=g.newTable('1','2','3');g.join(t,'4');g.start(t,'1');
 let buttons=controls(t);assert.equal(buttons.find(b=>b.custom_id.endsWith(':call')).label,'跟注 10');
 assert(!buttons.some(b=>b.custom_id.endsWith(':check')));assert(!buttons.some(b=>b.custom_id.endsWith(':join')));
 const q=quickRaises(t);assert.equal(new Set(q.map(x=>x.target)).size,q.length);
 for(const b of q){const copy=structuredClone(t);g.act(copy,copy.turn,'raise',b.target);assert.equal(copy.currentBet,b.target);}
 g.act(t,'1','call');buttons=controls(t);assert(buttons.some(b=>b.custom_id.endsWith(':check')));assert(!buttons.some(b=>b.custom_id.endsWith(':call')));
 assert(board(t).components.every(r=>r.components.length<=5));assert(board(t).components.length<=5);
});
test('short all-in does not show raise shortcuts; bot turns hide betting controls',()=>{
 const t=g.newTable('1','2','3');for(const id of ['2','3','4'])g.join(t,id);
 t.players[0].stack=30;g.start(t,'1');g.act(t,'4','call');g.act(t,'1','allin');g.act(t,'2','call');g.act(t,'3','call');
 assert.deepEqual(quickRaises(t),[]);assert(controls(t).find(b=>b.custom_id.endsWith(':raise')).disabled);
 const u=g.newTable('1','2','3');g.addComputers(u,'1');g.start(u,'1');g.act(u,'1','call');
 assert(!controls(u).some(b=>b.custom_id.endsWith(':fold')));assert(controls(u).find(b=>b.custom_id.endsWith(':wait')).disabled);
});
