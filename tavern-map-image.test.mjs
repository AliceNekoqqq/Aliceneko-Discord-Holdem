import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {renderTavernMap,TAVERN_SCENE_VERSION} from './tavern-map-image.mjs';
import {Canvas} from './card-image.mjs';
import {glyphs} from './card-glyphs.mjs';
import {TAVERN_BUILDING} from './tavern-building.mjs';

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
 assert(drawn.some(x=>x.includes('抽鬼牌')));assert(drawn.some(x=>x.includes('骗子酒馆')));assert.equal(drawn.filter(x=>x.includes('游戏中')).length,2);assert(!drawn.includes('active'));assert(!drawn.includes('in_progress'));
 const missing=drawn.flatMap(value=>[...value].filter(char=>!glyphs[char]));assert.equal(missing.length,0,[...new Set(missing)].join(''));
});


test('every purchased fixture ID draws and higher levels visibly refine its furniture',async()=>{
 const ids=['oak_table','window_seat','bookshelf','coat_rack','bar_counter','copper_lamp','paper_lanterns','table_lamp','neon_sign','river_photo','ceramic_vase','chalk_menu','wall_clock','record_player','plant_corner','rain_bell','tea_station','pastry_case','seating','lighting','sound','climate','counter','patio'];
 const assets=ids.map(id=>({id,level:1})),base=await bytes({at:'2026-10-09T04:05:00Z',room:{name:'小酒馆',assets}});assert.deepEqual([decode(base).width,decode(base).height],[1000,760]);
 const upgraded=await bytes({at:'2026-10-09T04:05:00Z',room:{name:'小酒馆',assets:assets.map(a=>({...a,level:3}))}});assert.notDeepEqual(upgraded,base);
});

test('all eight table players remain visible and never duplicate into visitor seating',async()=>{
 const players=[...'甲乙丙丁戊己庚辛'].map((initial,i)=>({id:`p${i+1}`,name:`${initial}来客`,bot:false}));
 const snapshot={at:safeAt(),visitorCount:8,visitors:[],tableCount:1,tables:[{game:'uno',phase:'active',players}],room:{name:'小酒馆',assets:[]}};
 const drawn=[],original=Canvas.prototype.text;let base;
 try{Canvas.prototype.text=function(value,...args){drawn.push(String(value));return original.call(this,value,...args);};base=await bytes(snapshot);}
 finally{Canvas.prototype.text=original;}
 for(const p of players)assert.equal(drawn.filter(x=>x===p.name[0]).length,1,`${p.name} has one visible marker`);
 assert.deepEqual(await bytes({...snapshot,visitors:players}),base);
 assert.notDeepEqual(await bytes({...snapshot,tables:[{...snapshot.tables[0],players:players.slice(0,6)}]}),base);
});

test('real area changes alter the map; legacy visitors default to commons and input order does not reshuffle seats',async()=>{
 assert.equal(TAVERN_SCENE_VERSION,'riverside-depth-v4');
 const base={at:safeAt(),visitorCount:2,tableCount:0,tables:[],room:{name:'小酒馆',assets:[]}},visitors=[{id:'u2',name:'乙',location:{area:'window',changedAt:1}},{id:'u1',name:'甲',location:{area:'bar',changedAt:2}}];
 const a=await bytes({...base,visitors}),b=await bytes({...base,visitors:[...visitors].reverse()});assert.deepEqual(a,b);
 const moved=await bytes({...base,visitors:[{...visitors[0],location:{area:'quiet',changedAt:3}},visitors[1]]});assert.notDeepEqual(a,moved);
 const legacy=await bytes({...base,visitors:[{id:'u3',name:'旧客'}]}),explicit=await bytes({...base,visitors:[{id:'u3',name:'旧客',location:{area:'commons'}}]});assert.deepEqual(legacy,explicit);
});

test('displaySlot keeps visible tables anchored, hides overflow players from commons, and deduplicates across tables',async()=>{
 const s={at:safeAt(),visitorCount:1,tableCount:5,room:{name:'小酒馆',assets:[]},tables:[
  {displaySlot:2,game:'uno',phase:'active',players:[{id:'shared',name:'同桌'}]},
  {displaySlot:0,game:'poker',phase:'waiting',players:[{id:'shared',name:'重复'}]},
  {displaySlot:null,game:'ghost',phase:'active',players:[{id:'hidden-game',name:'溢出玩家'}]}
 ],visitors:[{id:'shared',name:'不重复访客',location:{area:'commons'}},{id:'hidden-game',name:'不落客厅',location:{area:'game'}}]};
 const drawn=[],original=Canvas.prototype.text;let image;
 try{Canvas.prototype.text=function(value,...args){drawn.push(String(value));return original.call(this,value,...args);};image=await bytes(s);}
 finally{Canvas.prototype.text=original;}
 assert.equal(drawn.filter(x=>x==='同').length,1);assert(!drawn.includes('不重复访客'));assert(!drawn.includes('不落客厅'));assert(drawn.includes('游戏区另有 1 位玩家'));
 const permuted=await bytes({...s,tables:[...s.tables].reverse()});assert.deepEqual(image,permuted);
});

test('area seating capacity is fixed and overflow is summarized without drawing unbounded crowds',async()=>{
 const visitors=Array.from({length:40},(_,i)=>({id:`guest-${i}`,name:`客${i}`,location:{area:['bar','window','quiet','commons'][i%4]}}));
 const drawn=[],original=Canvas.prototype.text;
 try{Canvas.prototype.text=function(value,...args){drawn.push(String(value));return original.call(this,value,...args);};await bytes({at:safeAt(),visitorCount:40,tables:[],tableCount:0,visitors,room:{name:'小酒馆',assets:[]}});}
 finally{Canvas.prototype.text=original;}
 assert(drawn.some(x=>x.includes('吧台 +')));assert(drawn.some(x=>x.includes('窗边 +')));assert(drawn.some(x=>x.includes('静谧角 +')));assert(drawn.some(x=>x.includes('客厅 +')));
 assert.equal(drawn.filter(x=>x==='客').length,16);
});

test('game labels stay with their own table instead of drifting over the lounge or river',async()=>{
 const games=['poker','uno','ghost','liar'],names=['德州','UNO','抽鬼牌','骗子酒馆'],drawn=[],original=Canvas.prototype.text;
 try{Canvas.prototype.text=function(value,x,y,size,...rest){drawn.push({text:String(value),x,y,size});return original.call(this,value,x,y,size,...rest);};await bytes({at:safeAt(),tableCount:4,visitors:[],tables:games.map((game,displaySlot)=>({game,displaySlot,phase:'waiting',players:[]})),room:{name:'小酒馆',assets:[]}});}
 finally{Canvas.prototype.text=original;}
 const p=TAVERN_BUILDING.projection;
 names.forEach((name,index)=>{const a=TAVERN_BUILDING.anchors.tables[index],x=p.originX+(a.x-a.y)*p.scaleX,y=p.baseY+(a.x+a.y)*p.scaleY,label=drawn.find(v=>v.text.includes(name));assert(label,`${name} table has a label`);assert(Math.abs(label.x-x)<=60&&Math.abs(label.y-y)<=65,`${name} label belongs to its table`);assert(label.size>=20,'table identity remains readable');});
});


test('physical layer order is independent of asset purchase order',async()=>{
 const assets=Object.keys(TAVERN_BUILDING.fixtures).map(id=>({id,level:2}));
 const s={at:safeAt(),room:{name:'小酒馆',assets}};
 assert.deepEqual(await bytes(s),await bytes({...s,room:{...s.room,assets:[...assets].reverse()}}));
});
test('table top occludes the rear stool legs before UI tags are drawn',async()=>{
 const hits=[],original=Canvas.prototype.pixel;
 try{Canvas.prototype.pixel=function(x,y,color,...rest){if(x===573&&y===362)hits.push([...color]);return original.call(this,x,y,color,...rest);};await bytes({at:safeAt()});}
 finally{Canvas.prototype.pixel=original;}
 // This overlap previously ended in the stool side color because every chair drew last.
 const tag=hits.findIndex(c=>c.join(',')==='255,229,237');assert(tag>0);
 assert.deepEqual(hits[tag-1],[185,132,91]);
});
