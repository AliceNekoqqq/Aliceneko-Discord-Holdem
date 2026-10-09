import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {renderTavernMap} from './tavern-map-image.mjs';
import {Canvas} from './card-image.mjs';
import {glyphs} from './card-glyphs.mjs';

const bytes=async s=>Buffer.from(await renderTavernMap(s));
function decode(png){
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 let offset=8,width,height,parts=[];
 while(offset<png.length){const n=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+n);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],2);}if(type==='IDAT')parts.push(data);offset+=n+12;if(type==='IEND')break;}
 const raw=inflateSync(Buffer.concat(parts));assert.equal(raw.length,(width*3+1)*height);return {width,height,raw};
}
test('empty tavern map is a decodable deterministic 1000x760 RGB PNG',async()=>{
 const a=await bytes({at:'2026-10-09T04:05:00Z',room:{name:'小酒馆'}}),b=await bytes({at:'2026-10-09T04:05:00Z',room:{name:'小酒馆'}});
 assert.deepEqual(a,b);assert.deepEqual([decode(a).width,decode(a).height],[1000,760]);
});
test('busy map deduplicates guests, draws only supplied players and summarizes excess tables/guests',async()=>{
 const s={source:'test',at:'2026-10-09T04:05:00Z',windowMs:1800000,visitorCount:2,visitors:[{id:'u1',name:'红豆粉',kind:'visit'},{id:'u2',name:'小花',kind:'order'},{id:'u2',name:'重复',kind:'visit'}],tableCount:6,tables:Array.from({length:6},(_,i)=>({channel:`secret-${i}`,epoch:i,game:'poker',phase:'active',players:i===0?[{id:'u1',name:'桌上玩家',bot:false},{id:'bot1',name:'电脑甲',bot:true}]:[],at:safeAt(),expires:0})),recentOrders:{orderCount:3,paidOrders:2},room:{name:'暖灯小酒馆',level:1,assets:[]},operations:{manager:{id:'secret-manager',name:'红豆店长'},settings:{},choices:{}}};
 const before=structuredClone(s),png=await bytes(s),d=decode(png);assert.deepEqual([d.width,d.height],[1000,760]);assert.deepEqual(s,before);assert.deepEqual(png,await bytes(s));
});
function safeAt(){return '2026-10-09T04:05:00Z';}
test('malicious and overlong nicknames are bounded; excessive visitor counts remain summarized',async()=>{
 const visitors=Array.from({length:40},(_,i)=>({id:`id-${i}`,name:i===0?'\u0000</svg><script>alert(1)</script>':`中文来客${i}超长名字${'🌸'.repeat(50)}`,kind:'visit'}));
 const p=await bytes({at:'not-a-date',visitorCount:44,visitors,tableCount:0,tables:[],recentOrders:{orderCount:0},operations:{manager:null}});assert.deepEqual([decode(p).width,decode(p).height],[1000,760]);
});
test('formal game names and phases are localized before drawing',async()=>{
 const drawn=[],original=Canvas.prototype.text;
 try{Canvas.prototype.text=function(value,...args){drawn.push(String(value));return original.call(this,value,...args);};await renderTavernMap({at:'2026-10-09T04:05:00Z',visitorCount:0,visitors:[],tableCount:4,tables:[{game:'ghost',phase:'active',players:[]},{game:'liar',phase:'in_progress',players:[]}],room:{name:'小酒馆',assets:[]}});}
 finally{Canvas.prototype.text=original;}
 assert(drawn.includes('抽鬼牌'));assert(drawn.includes('骗子酒馆'));assert.equal(drawn.filter(x=>x==='游戏中').length,2);assert(!drawn.includes('active'));assert(!drawn.includes('in_progress'));
 const missing=drawn.flatMap(value=>[...value].filter(char=>!glyphs[char]));assert.equal(missing.length,0,[...new Set(missing)].join(''));
});


test('every purchased fixture ID draws and higher levels visibly refine its furniture',async()=>{
 const ids=['oak_table','window_seat','bookshelf','coat_rack','bar_counter','copper_lamp','paper_lanterns','table_lamp','neon_sign','river_photo','ceramic_vase','chalk_menu','wall_clock','record_player','plant_corner','rain_bell','tea_station','pastry_case','seating','lighting','sound','climate','counter','patio'];
 const assets=ids.map(id=>({id,level:1})),base=await bytes({at:'2026-10-09T04:05:00Z',room:{name:'小酒馆',assets}});assert.deepEqual([decode(base).width,decode(base).height],[1000,760]);
 const upgraded=await bytes({at:'2026-10-09T04:05:00Z',room:{name:'小酒馆',assets:assets.map(a=>({...a,level:3}))}});assert.notDeepEqual(upgraded,base);
});

test('all eight table players remain visible and never duplicate into visitor seating',async()=>{
 const players=Array.from({length:8},(_,i)=>({id:`p${i+1}`,name:`P${i+1}`,bot:false}));
 const snapshot={at:safeAt(),visitorCount:8,visitors:[],tableCount:1,tables:[{game:'uno',phase:'active',players}],room:{name:'小酒馆',assets:[]}};
 const drawn=[],original=Canvas.prototype.text;let base;
 try{Canvas.prototype.text=function(value,...args){drawn.push(String(value));return original.call(this,value,...args);};base=await bytes(snapshot);}
 finally{Canvas.prototype.text=original;}
 for(const p of players)assert(drawn.includes(p.name),`${p.name} remains visible`);
 assert.deepEqual(await bytes({...snapshot,visitors:players}),base);
 assert.notDeepEqual(await bytes({...snapshot,tables:[{...snapshot.tables[0],players:players.slice(0,6)}]}),base);
});
