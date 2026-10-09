import test from 'node:test';
import assert from 'node:assert/strict';
import {MENU, MENU_CATEGORIES, WELCOME_COINS, DAILY_REWARD_CAP, ROSTER_DAILY_LIMIT, ORDER_TTL, REWARDS, makeOrderDetails} from './tavern-catalog.mjs';

test('menu catalogue has stable unique ids, complete metadata, and room for one seasonal item',()=>{
 assert.equal(MENU.length,20);
 assert.ok(MENU.length+1<=25);
 assert.equal(new Set(MENU.map(item=>item.id)).size,MENU.length);
 assert.deepEqual(MENU_CATEGORIES.map(({id})=>id),['drinks','desserts','savory','seasonal']);
 assert.ok(MENU.every(item=>['drinks','desserts','savory'].includes(item.category)));
 assert.ok(MENU.every(item=>Array.isArray(item.ingredients)&&item.ingredients.length>0&&typeof item.flavor==='string'&&Array.isArray(item.allergens)));
 assert.ok(MENU.every(item=>typeof item.pairing==='string'&&item.pairing.length>0));
 assert.ok(MENU.every(item=>item.description.length<=40));
 assert.ok(MENU.every(item=>Object.isFrozen(item)&&Object.isFrozen(item.ingredients)&&Object.isFrozen(item.allergens)));
});

test('original seven menu ids, names, prices, and serving text are preserved',()=>{
 const expected=[
  ['water','白水',0,'把一杯清水放到你手边。'],
  ['tea','热茶',0,'端来热茶，把杯柄转向你。'],
  ['milk','红豆牛奶',15,'端来红豆牛奶，杯底的红豆轻轻晃了一下。'],
  ['soda','蝶影苏打',25,'把蝶影苏打推到你面前，气泡沿着杯壁升起来。'],
  ['special','今日心情特调',35,'调好今天的心情特饮，在杯下压了一张小小的名字卡。'],
  ['cake','红豆小酥',20,'端来两块红豆小酥，旁边放好一张餐巾。'],
  ['snack','深夜小食拼盘',40,'把小食拼盘摆上桌，让出杯子旁的一块位置。']
 ];
 for(const [id,name,price,serve] of expected){
  const item=MENU.find(entry=>entry.id===id);
  assert.ok(item,id);
  assert.deepEqual([item.name,item.price,item.serve],[name,price,serve]);
 }
});

test('fixed temperatures and order metadata come from the catalogue',()=>{
 const profile={sweetness:'normal',temperature:'cold',seat:'window',restrictions:''};
 assert.equal(makeOrderDetails(MENU.find(item=>item.id==='tea'),profile,{temperature:'cold'}).temperature,'warm');
 assert.equal(makeOrderDetails(MENU.find(item=>item.id==='mushroom-noodles'),profile,{temperature:'cold'}).temperature,'warm');
 assert.equal(makeOrderDetails(MENU.find(item=>item.id==='milk'),profile,{temperature:'warm'}).temperature,'warm');
 assert.equal(makeOrderDetails(MENU.find(item=>item.id==='soda'),profile,{temperature:'room'}).temperature,'room');
 assert.equal(makeOrderDetails(MENU.find(item=>item.id==='cake'),profile,{temperature:'cold'}).temperature,'room');
 const details=makeOrderDetails(MENU.find(item=>item.id==='cake'),profile);
 assert.equal(details.category,'desserts');
 assert.deepEqual(details.ingredients,['红豆沙','面粉','黄油']);
 assert.equal(details.flavor,'酥松香甜');
 assert.equal(details.pairing,'适合搭配热茶');
 assert.deepEqual(details.allergens,['麸质','乳制品']);
 assert.equal(Object.hasOwn(details,'price'),false);
});

test('program-owned economic ceilings stay stable while reward rates match the revised policy',()=>{
 assert.deepEqual([WELCOME_COINS,DAILY_REWARD_CAP,ROSTER_DAILY_LIMIT,ORDER_TTL],[60,150,8,180000]);
 assert.deepEqual(REWARDS,{ghost:{name:'抽鬼牌',base:6,bonus:4,minMs:15000},poker:{name:'德州扑克',base:8,bonus:4,minMs:30000},uno:{name:'UNO',base:12,bonus:6,minMs:45000},liar:{name:'骗子酒馆',base:14,bonus:6,minMs:60000}});
});
