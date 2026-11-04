import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildSeatStage} from './web/auction/assets/seat-stage.mjs';
const source=readFileSync(new URL('./web/auction/assets/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/boot\(\);\s*$/,'');
function harness(search=''){
 const nodes=new Map(),events=new Map(),saved=new Map(),copies=[],messages=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},value:'',addEventListener(){},setAttribute(){},classList:{toggle(){}},showModal(){},close(){}});return nodes.get(id);};
 const location={origin:'https://auction.alicenekoqqq.cc.cd',search,hash:'#play',href:'https://auction.alicenekoqqq.cc.cd/auction/'+search+'#play'};
 const context=vm.createContext({document:{hidden:false,body:node('body'),querySelector:node,querySelectorAll:()=>[],addEventListener(){}},
  location,window:{addEventListener:(name,fn)=>events.set(name,fn),scrollTo(){},history:{replaceState(a,b,url){location.href=url.href;location.search=url.search;location.hash=url.hash;}}},
  sessionStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  navigator:{onLine:true,clipboard:{writeText:async value=>copies.push(value)}},URL,URLSearchParams,Date,crypto,setInterval(){},clearInterval(){},setTimeout,clearTimeout,buildSeatStage,
  play(){},soundEnabled:()=>false,createRevealLoop(){}});
 vm.runInContext(source+`
  const renderActual=renderPlay;renderPlay=()=>{};toast=text=>messages.push(text);dialog=html=>messages.push(html);
  globalThis.h={
   init(){account={user:{id:'b'}};guild='3';view='room';roomConnection='live';meta={roles:{sophie:{name:'索菲',skill:'首轮五件品质'},viktor:{name:'维克托',skill:'聚合线索'}},tiers:{small:{name:'小额',fee:25000,budget:4000000}},qualities:['白','绿','蓝','紫','金','红']};},
   setApi(fn){api=fn;},setRoom(room){roomState={room};},get room(){return roomState?.room;},get connection(){return roomConnection;},
   switchGuild(){guild='4';epoch++;},get pending(){return pendingRoomInvite;},setPending(code){pendingRoomInvite=code;},
   readRoomInvite,clearRoomInvite,roomInviteURL,copyRoomInvite,acceptRoom,renderRoom,renderActual,roomAction,pollRoom,setRoomConnection,
   appraiserCard,roomClues,setMeta(value){meta=value;},
  };`,Object.assign(context,{messages}));
 context.h.init();return {h:context.h,context,nodes,saved,copies,messages,events};
}
function room(history=[],status='active'){
 return {id:'1234567890abcdef',code:'ABC234',status,tier:'small',host:false,you:'b',seats:[
  {id:'a',name:'甲',role:'sophie',index:0,you:false,submitted:true,bid:999999},
  {id:'b',name:'乙',role:'viktor',index:1,you:true,submitted:false,bid:null},
  {id:'npc:a',name:'阿吉',role:'sophie',index:2,npc:true},
  {id:'npc:b',name:'老猫',role:'viktor',index:3,npc:true}],
  started:{round:2,rounds:5,roundEndsAt:Date.now()+60000,warehouse:{name:'小仓'},itemCount:6,history,priority:[1,0,2,3],budget:4000000,fee:25000},result:null};
}

test('actual appraisal cards retain old skill text and display focused private clues with escaped categories',()=>{
 const {h}=harness();h.setMeta({skillVersion:3,roles:{zhou:{name:'老周',skill:'新版鉴定类别',legacySkill:'旧版每轮品质',focus:'重点鉴定'}},qualities:['白','绿','蓝','紫','金','红']});
 assert(h.appraiserCard({role:'zhou',skillVersion:2}).includes('旧版每轮品质'));
 assert(!h.appraiserCard({role:'zhou',skillVersion:2}).includes('新版鉴定类别'));
 assert(h.appraiserCard({role:'zhou',skillVersion:3}).includes('新版鉴定类别'));
 const html=h.roomClues({focus:0,largeAbsent:true,highCount:null,items:[{quality:1,width:1,height:2,category:'<img onerror=alert(1)>'}]});
 assert(html.includes('第1件'));assert(html.includes('未发现镇仓大件'));assert(html.includes('类别：&lt;img'));
 assert(!html.includes('<img onerror'));
});

test('invite links contain only a validated room code and survive the OAuth return without joining automatically',()=>{
 const {h,context,saved}=harness('?room=abc234&next=https://evil.invalid');
 const code=h.readRoomInvite(1000);assert.equal(code,'ABC234');
 assert.equal(h.roomInviteURL(code),'https://auction.alicenekoqqq.cc.cd/auction/?room=ABC234#play');
 context.location.search='';assert.equal(h.readRoomInvite(1100),'ABC234');
 assert.equal(h.room,undefined);assert.equal(h.readRoomInvite(1000+30*60000),'');assert.equal(saved.size,0);
});
test('malformed and expired invitation data cannot supply markup or an arbitrary destination',()=>{
 const {h,context,saved}=harness('?room=%22%3E%3Cscript%3E');
 assert.equal(h.readRoomInvite(),'');
 assert.throws(()=>h.roomInviteURL('https://evil.invalid'),/房号无效/);
 context.location.search='';saved.set('auction-room-invite','{"code":"ABC234","expires":999999999999999}');
 assert.equal(h.readRoomInvite(1000),'');saved.set('auction-room-invite','broken');assert.equal(h.readRoomInvite(1000),'');
});
test('joining clears the stored invitation and only its query parameter, preserving the current page',()=>{
 const {h,context,saved}=harness('?room=ABC234&keep=1');h.readRoomInvite();h.setPending('ABC234');h.clearRoomInvite();
 assert.equal(h.pending,'');assert.equal(saved.size,0);assert.equal(context.location.search,'?keep=1');assert.equal(context.location.hash,'#play');
});
test('copy code and copy link work and a denied clipboard has a manual-copy fallback',async()=>{
 const {h,context,copies,messages}=harness();h.setRoom(room());
 await h.copyRoomInvite('code');await h.copyRoomInvite('link');
 assert.deepEqual(copies,['ABC234','https://auction.alicenekoqqq.cc.cd/auction/?room=ABC234#play']);
 context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.copyRoomInvite('link');
 assert.match(messages.at(-1),/readonly value="https:\/\/auction/);
});
test('room cards never show a current opponent bid and identify a guest as the local player',()=>{
 const {h}=harness();h.setRoom(room());const html=h.renderRoom();
 assert.doesNotMatch(html,/999,999/);assert.match(html,/甲[\s\S]*已封牌/);assert.match(html,/乙 <i>你<\/i>/);
 assert.doesNotMatch(html,/甲 <i>你<\/i>/);assert.match(html,/NPC · 等待开牌/);
});
test('only published bids appear in the cards and the actual winning seat is highlighted',()=>{
 const {h}=harness(),r=room([{round:1,bids:[10,50,0,20],done:true,winner:1,price:50}],'settled');
 r.result={winner:1,winnerName:'乙',price:50,won:true,total:100,net:25,cashNet:-50};r.started.result=r.result;
 h.setRoom(r);const html=h.renderRoom();assert.match(html,/room-seat you won/);assert.match(html,/第 1 轮已公开 · 成交/);
 assert.match(html,/>50<\/strong>/);assert.doesNotMatch(html,/999,999/);
});
test('leaving the play route or hiding the document suppresses room polling',async()=>{
 const {h,context}=harness();let calls=0;h.setApi(async()=>{calls++;return {kind:'room',data:{room:room()}};});
 context.location.hash='#rules';await h.pollRoom();context.location.hash='#play';context.document.hidden=true;await h.pollRoom();assert.equal(calls,0);
});
test('a failed poll marks stale state, prevents a blind mutation retry and recovers through a fresh read',async()=>{
 const {h}=harness();h.setRoom(room());let posts=0;
 h.setApi(async(path,body)=>{if(body)posts++;throw Error('network');});await h.pollRoom();assert.equal(h.connection,'stale');
 await assert.rejects(h.roomAction('roomBid',{bid:1}),/恢复同步/);assert.equal(posts,0);
 h.setApi(async()=>({kind:'room',data:{room:room()}}));await h.pollRoom();assert.equal(h.connection,'live');
});
test('overlapping polls are coalesced and an old guild response cannot restore a previous room',async()=>{
 const {h}=harness();let resolve,calls=0;h.setApi(()=>{calls++;return new Promise(r=>resolve=r);});
 const first=h.pollRoom();await h.pollRoom();assert.equal(calls,1);h.switchGuild();resolve({kind:'room',data:{room:room()}});await first;assert.equal(h.room,undefined);
});
test('a lost bid response is never resent automatically; a failed recovery read leaves the room stale',async()=>{
 const {h}=harness();h.setRoom(room());const paths=[];h.setApi(async(path,body)=>{paths.push(body?.action??path);throw Error('network');});
 await assert.rejects(h.roomAction('roomBid',{round:1,requestId:'one-request',bid:100}),/network/);
 assert.deepEqual(paths,['roomBid','room?guild=3']);assert.equal(h.connection,'stale');
});
test('a preset bid survives a same-round redraw without stealing focus; a new round clears it',()=>{
 const {h,context,nodes}=harness();h.setRoom(room());h.renderActual();
 const input=nodes.get('#room-bid-input'),form=nodes.get('#room-bid-form'),content=nodes.get('#game-content');
 form.dataset={roomId:room().id,round:'2'};input.value='4000000';
 let focused=0;input.focus=()=>focused++;context.document.activeElement={id:'preset-button'};
 Object.defineProperty(content,'innerHTML',{set(){input.value='';},configurable:true});
 h.renderActual();assert.equal(input.value,'4000000');assert.equal(focused,0);
 context.document.activeElement=input;h.renderActual();assert.equal(input.value,'4000000');assert.equal(focused,1);
 const next=room();next.started.round=3;h.setRoom(next);h.renderActual();assert.equal(input.value,'');
});
test('public theme clues render from the current projection and escape their text',()=>{
 const {h}=harness(),r=room();r.started.info={highCount:null,items:[]};r.started.publicInfo={clues:[{round:1,text:'最高品质：红 <script>'}]};
 r.started.theme={id:'arts',name:'文艺收藏仓',categories:['文艺','收藏'],multiplier:3};
 h.setRoom(r);const html=h.renderRoom();assert.match(html,/全桌公共情报/);assert.match(html,/文艺收藏仓/);
 assert.match(html,/最高品质：红 &lt;script&gt;/);assert.doesNotMatch(html,/第3轮|<script>/);
});
