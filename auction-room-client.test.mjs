import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildSeatStage} from './web/auction/assets/seat-stage.mjs';
import {buildOpponentReaction} from './web/auction/assets/opponent-stage.mjs';
import {rareRevealMoment,createRevealPresentation} from './web/auction/assets/reveal-stage.mjs';
import {createAuctionTutorial,tutorialView} from './web/auction/assets/tutorial.mjs';
import {publicAuctionData} from './auction-website.mjs';
import {AUCTION_THEMES} from './tavern-auction-themes.mjs';
import {AUCTION_OPPONENTS,AUCTION_NPC_STYLES} from './tavern-auction-opponents.mjs';
const source=readFileSync(new URL('./web/auction/assets/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/boot\(\);\s*$/,'');
function harness(search=''){
 const nodes=new Map(),events=new Map(),saved=new Map(),copies=[],messages=[],presentationTimers=new Map(),sounds=[];let timerId=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},value:'',addEventListener(){},setAttribute(){},classList:{values:new Set(),toggle(k,on){on??=!this.values.has(k);on?this.values.add(k):this.values.delete(k);return on;},contains(k){return this.values.has(k);}},showModal(){},close(){}});return nodes.get(id);};
 const location={origin:'https://auction.alicenekoqqq.cc.cd',search,hash:'#play',href:'https://auction.alicenekoqqq.cc.cd/auction/'+search+'#play'};
 const context=vm.createContext({document:{hidden:false,body:node('body'),querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events.set('doc:'+name,fn)},
  location,window:{addEventListener:(name,fn)=>events.set(name,fn),scrollTo(){},history:{replaceState(a,b,url){location.href=url.href;location.search=url.search;location.hash=url.hash;}}},
  sessionStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  navigator:{onLine:true,clipboard:{writeText:async value=>copies.push(value)}},URL,URLSearchParams,Date,crypto,setInterval(){},clearInterval(){},setTimeout,clearTimeout,buildSeatStage,buildOpponentReaction,rareRevealMoment,createAuctionTutorial,tutorialView,createRevealPresentation:options=>createRevealPresentation({...options,schedule:(fn,ms)=>{presentationTimers.set(++timerId,{fn,ms});return timerId;},cancel:id=>presentationTimers.delete(id)}),
  play:(...args)=>sounds.push(args),soundEnabled:()=>false,createRevealLoop(){}});
 vm.runInContext(source+`
  const renderActual=renderPlay;renderPlay=()=>{};toast=text=>messages.push(text);dialog=html=>messages.push(html);
  globalThis.h={
   init(){account={user:{id:'b'}};guild='3';view='room';roomConnection='live';meta={themes:AUCTION_THEMES,opponents:AUCTION_OPPONENTS,opponentStyles:AUCTION_NPC_STYLES,roles:{sophie:{name:'索菲',skill:'首轮五件品质'},viktor:{name:'维克托',skill:'聚合线索'}},tiers:{small:{name:'小额',fee:25000,budget:4000000}},qualities:['白','绿','蓝','紫','金','红']};},
   setApi(fn){api=fn;},setRoom(room){roomState={room};},get room(){return roomState?.room;},get connection(){return roomConnection;},
   switchGuild(){guild='4';epoch++;},get pending(){return pendingRoomInvite;},setPending(code){pendingRoomInvite=code;},
   readRoomInvite,clearRoomInvite,roomInviteURL,copyRoomInvite,acceptRoom,renderRoom,renderActual,roomAction,pollRoom,setRoomConnection,
   syncPlayLayout,matchToolbar,openMatchPanel,appraiserCard,roomClues,rareMomentView,playSuspense,gameView,demo,pauseReveal,get presentation(){return revealPresentation?.state;},setGame(value){game=value;view="auction";},setPublicDemo(items){account=null;guild="";view="auction";meta.items=items;},seatStrip,roomSeatView,opponentMoment,renderOpponents,setMeta(value){meta=value;},
   route,renderTutorial,tutorialDispatch,get tutorial(){return tutorial;},get game(){return game;},get view(){return view;},themeScene,themeGuide,setup,renderCatalog,setCatalog(items){meta.items=items;meta.tiers.standard=meta.tiers.small;catalogs.set('standard',{items});},get themes(){return {playTheme,roomTheme,guideTheme,catalogTheme};},
  };`,Object.assign(context,{messages,AUCTION_THEMES,AUCTION_OPPONENTS,AUCTION_NPC_STYLES}));
 context.h.init();return {h:context.h,context,nodes,saved,copies,messages,events,sounds,presentationTimers,flushPresentation(){const [id,t]=presentationTimers.entries().next().value;presentationTimers.delete(id);t.fn();}};
}
function room(history=[],status='active'){
 return {id:'1234567890abcdef',code:'ABC234',status,tier:'small',host:false,you:'b',seats:[
  {id:'a',name:'甲',role:'sophie',index:0,you:false,submitted:true,bid:999999},
  {id:'b',name:'乙',role:'viktor',index:1,you:true,submitted:false,bid:null},
  {id:'npc:a',name:'阿吉',role:'sophie',index:2,npc:true},
  {id:'npc:b',name:'老猫',role:'viktor',index:3,npc:true}],
  started:{round:2,rounds:5,roundEndsAt:Date.now()+60000,warehouse:{name:'小仓'},itemCount:6,history,priority:[1,0,2,3],budget:4000000,fee:25000},result:null};
}

const revealedArtifact=(id,quality,value)=>({id,name:`<${id}&>`,quality,value,width:2,height:2});
function soloReveal(items,count){return {token:'rare-one',status:'settled',currency:'auction',role:'sophie',tier:'small',budget:4000000,fee:25000,itemCount:items.length,
 reveal:{count,total:items.length,complete:count===items.length,last:count-1},items,board:{cols:8,rows:4,slots:items.map(()=>null)},info:{highCount:null,items:items.map(()=>({quality:null,width:null,height:null}))},history:[],priority:[0,1,2,3],result:{winner:0,price:200,net:999,cashNet:-25200,total:999999}};}
test('actual solo presentation masks the last reveal result, uses receipt value, escapes text and paints its entrance only once',async()=>{
 const x=harness(),before=soloReveal([null],0),next=soloReveal([revealedArtifact('red',5,7654321)],1);
 x.h.setGame({session:next});const pending=x.h.playSuspense(next,before);
 assert.equal(x.h.presentation.phase,'spin');assert.equal(x.h.rareMomentView(),'');
 assert(!x.h.gameView().includes('本局盈亏'));assert(!x.h.gameView().includes('999,999'));assert(!x.h.gameView().includes('7,654,321'));
 x.flushPresentation();const html=x.h.rareMomentView();
 assert(html.includes('rare-red'));assert(html.includes('&lt;red&amp;&gt;'));assert(html.includes('7,654,321'));assert(html.includes('rare-enter'));
 assert(!x.h.rareMomentView().includes('rare-enter'));assert(x.h.gameView().includes('本局盈亏'));
 x.flushPresentation();assert.equal(await pending,true);assert.equal(x.sounds.filter(s=>s[0]==='reveal').length,1);
});
test('actual batch reveal gives one high-quality moment even when the final item is low quality, with reduced motion and no waits',async()=>{
 const x=harness(),before=soloReveal([null,null],0),next=soloReveal([revealedArtifact('red',5,456),revealedArtifact('white',0,12)],2);
 x.context.window.matchMedia=()=>({matches:true});x.h.setGame({session:next});
 await x.h.playSuspense(next,before,{batch:true});assert.equal(x.presentationTimers.size,0);
 assert.equal(x.h.presentation.moment.item.id,'red');assert(x.h.rareMomentView().includes('本次揭晓2件'));
 assert.equal(x.sounds.find(s=>s[0]==='reveal')[1].quality,5);
});
test('same-frame app redraws keep the first entrance until browser paint, then later redraws remain static',async()=>{
 const x=harness(),frames=[],before=soloReveal([null],0),next=soloReveal([revealedArtifact('red',5,456)],1);
 x.context.window.requestAnimationFrame=fn=>frames.push(fn);x.h.setGame({session:next});
 const pending=x.h.playSuspense(next,before);x.flushPresentation();
 assert(x.h.rareMomentView().includes('rare-enter'));assert(x.h.rareMomentView().includes('rare-enter'));
 assert.equal(frames.length,1);frames.shift()();assert(!x.h.rareMomentView().includes('rare-enter'));
 x.h.pauseReveal();assert.equal(await pending,false);
});
test('a pending real app presentation cannot produce a late moment or sound after a guild switch or detail pause',async()=>{
 for(const interrupt of ['guild','details']){
  const x=harness(),before=soloReveal([null],0),next=soloReveal([revealedArtifact('red',5,456)],1);
  x.h.setGame({session:next});const pending=x.h.playSuspense(next,before);
  if(interrupt==='guild'){x.h.switchGuild();x.flushPresentation();}else x.h.pauseReveal();
  assert.equal(await pending,false);assert.equal(x.h.presentation,null);assert.equal(x.sounds.filter(s=>s[0]==='reveal').length,0);
 }
});
test('public gold/red demonstration has no API or wallet operations and is visibly identified as a fixed example',()=>{
 const x=harness(),gold=revealedArtifact('gold',4,123),red=revealedArtifact('tavern-5-52',5,456);
 let calls=0;x.h.setApi(()=>{calls++;throw Error('demo cannot use API');});x.h.setPublicDemo([gold,red]);
 const button={matches:s=>s==='button',hasAttribute:k=>k==='data-demo',dataset:{}};
 const click=x.events.get('doc:click');click({target:{closest:()=>button}});
 assert(x.h.demo().includes('金色珍藏'));assert(x.h.demo().includes('不代表掉率'));
 click({target:{closest:()=>button}});assert(x.h.demo().includes('红色珍藏'));assert.equal(calls,0);
 x.h.pauseReveal();
});
test('shared room catch-up emits one moment, does not replay initial data, and never sends a progression action',()=>{
 const x=harness(),r=room([], 'settled');r.started={...soloReveal([null,null],0),round:5};r.id='shared-rare';
 x.h.setRoom(null);x.h.acceptRoom({room:r});assert.equal(x.h.presentation,undefined);
 const next=JSON.parse(JSON.stringify(r));next.started=soloReveal([revealedArtifact('red',5,456),revealedArtifact('white',0,12)],2);
 x.h.acceptRoom({room:next});assert.equal(x.h.presentation.moment.item.id,'red');
 const id=x.h.presentation.id;x.h.acceptRoom({room:next});assert.equal(x.h.presentation.id,id);
 x.h.pauseReveal();
});

test('actual appraisal cards retain old skill text and display focused private clues with escaped categories',()=>{
 const {h}=harness();h.setMeta({skillVersion:3,roles:{zhou:{name:'老周',skill:'新版鉴定类别',legacySkill:'旧版每轮品质',focus:'重点鉴定'}},qualities:['白','绿','蓝','紫','金','红']});
 assert(h.appraiserCard({role:'zhou',skillVersion:2}).includes('旧版每轮品质'));
 assert(!h.appraiserCard({role:'zhou',skillVersion:2}).includes('新版鉴定类别'));
 assert(h.appraiserCard({role:'zhou',skillVersion:3}).includes('新版鉴定类别'));
 const html=h.roomClues({focus:0,largeAbsent:true,highCount:null,items:[{quality:1,width:1,height:2,category:'<img onerror=alert(1)>'}]});
 assert(html.includes('第1件'));assert(html.includes('未发现镇仓大件'));assert(html.includes('类别：&lt;img'));
 assert(!html.includes('<img onerror'));
});

test('actual NPC cards use identity rather than display names, show legacy styles truthfully, and keep current sealed amounts out',()=>{
 const {h}=harness(),r=room([ {round:1,bids:[100,200,300,400],done:false} ]);
 r.seats[2].id='npc:aji';r.seats[2].npcStyle=2;r.seats[2].bid=987654321;h.setRoom(r);
 const html=h.renderRoom();
 assert(html.includes('npc-aji-v1.png'));assert(html.includes('果断竞价'));assert(html.includes('首次出价'));
 assert(!html.includes('987654321'));assert(!html.includes('987,654,321'));
 const fake={...r.seats[0],name:'阿吉',id:'npc:aji',npc:false};
 const plain=h.roomSeatView(fake,r,buildSeatStage({...r.started,status:r.status}));
 assert(!plain.includes('npc-aji-v1.png'));assert(!plain.includes('首次出价'));
 const single={token:'aabbccdd',currency:'auction',round:2,status:'active',history:r.started.history,priority:[0,1,2,3],committed:[987654321,888888888,777777777]};
 const strip=h.seatStrip(single);assert(strip.includes('npc-zhanggui-v1.png'));assert(strip.includes('谨慎出价'));assert(!strip.includes('987654321'));
 assert.equal(h.seatStrip(single),strip.replace('seat-strip sweep','seat-strip'));
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


test('theme previews update only local choices; waiting and active rooms use their own frozen theme, with safe legacy fallback',()=>{
 const x=harness(),change=x.events.get('doc:change');let calls=0;x.h.setApi(()=>{calls++;throw Error('preview cannot start a game');});
 change({target:{id:'play-theme',value:'living'}});change({target:{id:'room-theme',value:'dining'}});
 assert(x.nodes.get('#solo-theme-preview').innerHTML.includes('日用收纳间'));
 assert(x.nodes.get('#room-theme-preview').innerHTML.includes('餐具备藏室'));
 assert(x.h.setup().includes('value="living" selected'));
 const r=room([],'waiting');r.themeChoice='arts';x.h.setRoom(r);
 assert(x.h.renderRoom().includes('文艺陈列室'));assert(!x.h.renderRoom().includes('餐具备藏室'));
 r.status='active';r.started.theme={id:'tech'};x.h.setRoom(r);
 assert(x.h.renderRoom().includes('数码工坊'));assert(!x.h.renderRoom().includes('文艺陈列室'));
 delete r.started.theme;assert(!x.h.renderRoom().includes('data-scene='));
 assert.equal(x.h.themeScene(null),'');assert.equal(x.h.themeScene('unknown'),'');
 assert(x.h.themeScene('random',{preview:true}).includes('四种主题等概率'));assert.equal(calls,0);
});
test('decorative rooms use only canonical theme IDs and public metadata, escaping category labels',()=>{
 const {h}=harness();h.setMeta({themes:[{id:'living',name:'<img onerror=1>',categories:['<script>'],multiplier:3}],get items(){throw Error('scene must not inspect catalogue goods');}});
 const html=h.themeScene('living');assert(html.includes('日用收纳间'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<img onerror'));
 assert(html.includes('装饰场景，不展示本仓藏品'));assert.equal(h.themeScene('__proto__'),'');
});
test('public theme browsing leaves play choices intact and opens a correct category filter without an API action',()=>{
 const x=harness(),items=[
  {...revealedArtifact('daily',0,12),category:'日用'},
  {...revealedArtifact('dining',5,99),category:'厨房'},
  {...revealedArtifact('arts',2,34),category:'收藏'},
  {...revealedArtifact('tech',4,56),category:'数码'}];
 x.h.setCatalog(items);let calls=0;x.h.setApi(()=>{calls++;throw Error('no mutation');});
 const click=x.events.get('doc:click'),press=(key,value)=>click({target:{closest:()=>({matches:s=>s==='button',hasAttribute:k=>k===key,dataset:{themeGuide:value,themeCatalog:value}})}});
 press('data-theme-guide','tech');assert(x.nodes.get('#theme-guide-scene').innerHTML.includes('数码工坊'));
 assert.equal(x.h.themes.playTheme,'random');assert.equal(x.h.themes.roomTheme,'random');
 press('data-theme-catalog','tech');assert.equal(x.context.location.hash,'#catalog');
 const grid=x.nodes.get('#catalog-grid').innerHTML;assert(grid.includes('data-item="tech"'));assert(!grid.includes('data-item="daily"'));
 assert(x.nodes.get('#catalog-theme-note').textContent.includes('其他类别仍可能出现'));
 const change=x.events.get('doc:change');change({target:{id:'catalog-theme',value:'dining'}});
 assert(x.nodes.get('#catalog-grid').innerHTML.includes('data-item="dining"'));assert(!x.nodes.get('#catalog-grid').innerHTML.includes('data-item="tech"'));
 change({target:{id:'catalog-theme',value:'all'}});assert(x.nodes.get('#catalog-count').textContent.includes('4 件'));
 assert.equal(calls,0);assert.equal(x.h.themes.playTheme,'random');
});


test('actual tutorial entry, bidding and completion never call private APIs or replace the real game',()=>{
 const x=harness(),live={token:'real-session-keep',status:'active',expires:Date.now()+100000};
 x.h.setMeta(publicAuctionData('standard'));x.h.setGame({session:live});let calls=0;x.h.setApi(()=>{calls++;throw Error('tutorial cannot call private APIs');});
 x.context.location.hash='#tutorial';x.h.route();assert(x.nodes.get('#tutorial-content').innerHTML.includes('零消耗练习'));
 const click=x.events.get('doc:click'),press=(action,index)=>click({target:{closest:()=>({matches:s=>s==='button',hasAttribute:k=>k==='data-tutorial',dataset:{tutorial:action,index}})}});
 for(const action of ['begin','area','role','enter','read-public','read-private'])press(action);
 for(let r=1;r<=5;r++){
  press('fill-bid');assert.equal(x.nodes.get('#tutorial-bid').value,String(x.h.tutorial.view.recommended));
  let prevented=false;x.events.get('doc:submit')({target:{id:'tutorial-bid-form'},preventDefault(){prevented=true;}});assert(prevented);
  if(r<5)press('next-round');
 }
 for(const action of ['settlement','open',...Array(6).fill('reveal'),'finish-reveal','quiz-inventory'])press(action);
 press('select-sale','0');press('quote-sale');press('confirm-sale');press('to-display');press('select-display','4');press('place');
 assert.equal(x.h.tutorial.view.phase,'done');assert.equal(x.h.game.session.token,'real-session-keep');assert.equal(x.h.view,'auction');assert.equal(calls,0);
 const state=x.h.tutorial.view;x.context.location.hash='#rules';x.h.route();x.context.location.hash='#tutorial';x.h.route();assert.equal(x.h.tutorial.view.cash,state.cash);assert.equal(x.h.tutorial.view.phase,'done');
});


test('room capital display uses frozen server terms rather than the current catalogue budget',()=>{
 const {h}=harness(),r=room([],'waiting');r.terms={budget:7000000,fee:100000};h.setRoom(r);
 const html=h.renderRoom();assert(html.includes('托管预算 7,000,000'));assert(!html.includes('托管预算 4,000,000'));
});


test('phone layout defaults on for a match, respects manual expansion and clears on navigation without any API',()=>{
 const x=harness();let requests=0;x.h.setApi(()=>{requests++;throw Error('no request expected');});
 x.context.window.matchMedia=q=>({matches:q.includes('max-width')});
 const classes=x.context.document.body.classList;
 x.h.syncPlayLayout(true);assert(classes.contains('compact-match'));
 const b={matches:()=>true,hasAttribute:k=>k==='data-compact'};
 x.events.get('doc:click')({target:{closest:()=>b}});assert(!classes.contains('compact-match'));
 x.events.get('resize')();assert(!classes.contains('compact-match'));
 x.events.get('doc:click')({target:{closest:()=>b}});assert(classes.contains('compact-match'));
 x.h.syncPlayLayout(false);assert(!classes.contains('compact-match'));assert.equal(requests,0);
});
test('compact match header keeps exact budget, disclosed clue and deadline but never hidden warehouse totals',()=>{
 const x=harness(),s={status:'active',role:'sophie',round:3,budget:18000000,estimate:9345187,expires:12345,
  publicInfo:{clues:[{text:'<红品质&>'}]},result:{total:99887766}};
 const html=x.h.matchToolbar(s);assert(html.includes('18,000,000'));assert(html.includes('9,345,187'));
 assert(html.includes('data-countdown="12345"'));assert(html.includes('&lt;红品质&amp;&gt;'));assert(!html.includes('99,887,766'));
 assert(html.includes('data-match-info'));assert(html.includes('data-match-menu'));
});
