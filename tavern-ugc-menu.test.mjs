import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { TavernService } from './tavern-service.mjs';
import { renderMenu } from './tavern-menu-view.mjs';
import { receiptData } from './tavern-ui.mjs';

function storage(){const db=new DatabaseSync(':memory:'),map=new Map();return {db,sql:{exec(q,...a){const s=db.prepare(q);if(s.columns().length){const rows=s.all(...a);return {toArray:()=>rows,one:()=>rows[0]}}s.run(...a);return {toArray:()=>[]}}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}},get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k)}}
const ugcItems=Array.from({length:100},(_,i)=>({id:`ugc_${String(i).padStart(3,'0')}`,name:`玩家创作菜品${i}`,emoji:'🍰',price:10+i%41,category:'desserts',description:'清香软糯',serve:'为你上桌。',source:'ugc'}));

test('menu pagination exposes every item at 20 per page for all and UGC categories, including public browsing',()=>{
  for(const [category,items] of [['all',ugcItems],['desserts',ugcItems]]){
    const reached=[];
    for(let page=0;page<5;page++){
      const view=renderMenu({menu:items},'user-1','guild-1',false,category,page);
      assert.ok(view.components.length<=5);assert.ok(view.components.every(row=>row.components.length<=5));
      assert.equal(new Set(view.components.flatMap(row=>row.components.map(c=>c.custom_id).filter(Boolean))).size,view.components.flatMap(row=>row.components.map(c=>c.custom_id).filter(Boolean)).length);
      reached.push(...(view.components.find(row=>row.components[0]?.type===3)?.components[0].options||[]).map(x=>x.value));
    }
    assert.deepEqual(reached,items.map(x=>x.id));
  }
  for(let page=0;page<5;page++){
    const view=renderMenu({menu:ugcItems},'user-1','guild-1',true,'desserts',page);
    assert.ok(view.components.length<=5);assert.ok(view.components.some(row=>row.components.some(c=>c.custom_id==='t:guild-1:any:menuCat~desserts~'+Math.min(4,page+1)+'~next')));
  }
});

test('published UGC dish can be ordered through the real service and receipt keeps the order snapshot',()=>{
  const store=storage(),service=new TavernService(store),guild='999',user='900',now=Date.parse('2026-10-10T12:00:00Z');
  const item={id:'ugc_snapshot_123456789',name:'秋日桂花糕',emoji:'🍰',price:18,type:'dessert',category:'desserts',description:'桂花与糯米的清甜',flavor:'清香柔软',serve:'红豆粉把秋日桂花糕轻轻端到你手边。',ingredients:['糯米','桂花'],allergens:[],source:'ugc'};
  service.ugc.menu(now); // Initialize UGC schema before seeding a published catalogue entry.
  service.sql.exec("INSERT INTO tavern_ugc_dishes(id,guild,user_id,author_name,name_key,status,current_revision,created_at,price_policy) VALUES(?,?,?,'作者','秋日桂花糕','active',1,?,'fixed')",item.id,guild,'author',now);
  service.sql.exec('INSERT INTO tavern_ugc_revisions(dish_id,revision,recipe_json,recipe_hash,created_at) VALUES(?,1,?,?,?)',item.id,JSON.stringify(item),'hash',now);
  const before=service.member(user,'来客',now).balance;
  const draft=service.prepare({id:user,name:'来客',guild,channel:'901',requestKey:'ugc_order_1',item:item.id},now);
  assert.equal(draft.price,item.price);assert.equal(draft.details.itemName,item.name);
  const answer=service.confirm(user,draft.id,'901',now+1000);
  assert.equal(answer.balance,before-item.price);assert.equal(answer.order.details.itemName,item.name);
  service.sql.exec("UPDATE tavern_ugc_dishes SET status='withdrawn' WHERE id=?",item.id);
  assert.equal(service.operations.item(item.id,now+2000),null);
  const receipt=receiptData(answer,user,guild);
  assert.match(receipt.content,/秋日桂花糕/);assert.match(receipt.content,/红豆粉把秋日桂花糕轻轻端到你手边/);
});
