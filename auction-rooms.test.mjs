import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { TavernService } from "./tavern-service.mjs";
import { TavernAuction, AUCTION_TIERS } from "./tavern-auction.mjs";

function setup(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let seed = 7;
  const storage = {
    sql: {
      exec(q, ...a) {
        const s = db.prepare(q);
        if (s.columns().length) {
          const r = s.all(...a);
          return { toArray: () => r, one: () => r[0] };
        }
        s.run(...a);
        return { toArray: () => [] };
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    get: async () => undefined,
    put: async () => {},
  };
  const tavern = new TavernService(storage);
  const auction = new TavernAuction(tavern, (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  });
  tavern._auction = auction;
  const A = { id: "a", name: "阿甲", guild: "3", channel: "0" };
  const B = { id: "b", name: "阿乙", guild: "3", channel: "0" };
  const C = { id: "c", name: "阿丙", guild: "3", channel: "0" };
  // The welcome grant is off in tests, so fund the seats explicitly.
  for (const id of ["a", "b", "c", "d", "e", "f"])
    tavern.auctionCurrency.adjust(id, 50_000_000, `test:fund:${id}`, "test", "fund", 1000);
  const act = (who, action, extra = {}) => {
    const match=auction.rooms.mine(who.guild,who.id)??auction.rooms.mineAny(who.guild,who.id);
    const room=match?auction.rooms.row(match.code):null;
    return auction.rooms.dispatch({...who, action, roomId:room?auction.rooms.roomId(room):undefined,
      round:room?.data.round, requestId:crypto.randomUUID(), ...extra});
  };
  return { tavern, auction, A, B, C, act };
}

test("a host can open a room, a friend can join it, and empty seats get NPCs", (t) => {
  const { A, B, act } = setup(t);

  const opened = act(A, "roomCreate", { tier: "standard" });
  const code = opened.room.code;
  assert.equal(opened.room.status, "waiting");
  assert.equal(opened.room.host, true);
  assert.equal(opened.room.seats.length, 1);
  assert.equal(opened.room.code.length, 6);

  const joined = act(B, "roomJoin", { code });
  assert.equal(joined.room.seats.length, 2);
  assert.equal(joined.room.seats.find((s) => s.you).name, "阿乙");
  assert.equal(joined.room.host, false);

  // The host still cannot start while the guest has not readied up.
  assert.throws(() => act(A, "roomStart"), /没准备好/);
  act(B, "roomReady", { ready: true });

  const started = act(A, "roomStart");
  assert.equal(started.room.status, "active");
  const seats = started.room.seats;
  assert.equal(seats.filter((s) => s.npc).length, 2);
  assert.deepEqual(
    seats.map((s) => s.name),
    ["阿甲", "阿乙", "阿吉", "老猫"],
  );
  // Every seat has its own skill and the warehouse is frozen on the room.
  assert.equal(new Set(seats.map((s) => s.role)).size, 4);
  assert(started.room.started.itemCount >= 6);
  assert.equal(started.room.started.round, 1);
  assert.equal(started.room.started.warehouse.cols >= 8, true);
  // The warehouse contents stay server-side until the room settles.
  assert(started.room.started.items.every(x=>x===null));
});

test("seats are unique, capped at four, and a room cannot be joined from another guild", (t) => {
  const { A, B, C, act } = setup(t);
  const code = act(A, "roomCreate", { tier: "small" }).room.code;
  act(B, "roomJoin", { code });
  act(C, "roomJoin", { code });
  const fourth = { id: "d", name: "阿丁", guild: "3", channel: "0" };
  act(fourth, "roomJoin", { code });
  assert.throws(
    () => act({ id: "e", name: "阿戊", guild: "3" }, "roomJoin", { code }),
    /人满/,
  );
  assert.throws(
    () => act({ id: "f", name: "外服", guild: "9" }, "roomJoin", { code }),
    /不在这台服务器/,
  );
  // Roles are handed out without collisions.
  const view = act(A, "roomView");
  assert.equal(new Set(view.room.seats.map((s) => s.role)).size, 4);
});

test("leaving as the host closes the room, and a player can only sit in one", (t) => {
  const { A, B, act } = setup(t);
  const first = act(A, "roomCreate", { tier: "small" }).room.code;
  assert.throws(() => act(A, "roomCreate", { tier: "small" }), /已经在/);
  act(B, "roomJoin", { code: first });
  assert.throws(
    () => act(B, "roomCreate", { tier: "small" }),
    /已经在/,
  );
  const left = act(B, "roomLeave");
  assert.equal(left.room, null);
  const closed = act(A, "roomLeave");
  assert.equal(closed.room, null);
  assert.equal(act(B, "roomView").room, null);
});

test("only the host can start, and a wrong code says so plainly", (t) => {
  const { A, B, act } = setup(t);
  const code = act(A, "roomCreate", { tier: "small" }).room.code;
  act(B, "roomJoin", { code });
  act(B, "roomReady", { ready: true });
  assert.throws(() => act(B, "roomStart"), /只有房主/);
  assert.throws(() => act(B, "roomJoin", { code: "ZZZZZZ" }), /没有这个房间/);
  assert.throws(() => act(B, "roomJoin", { code: "abc" }), /6 位/);
});

test("starting holds fee and budget, and the round only closes once every human has bid", (t) => {
  const { tavern, A, B, act } = setup(t);
  const tier = AUCTION_TIERS.small;
  const code = act(A, "roomCreate", { tier: "small", now: 1000 }).room.code;
  act(B, "roomJoin", { code, now: 1000 });
  act(B, "roomReady", { ready: true, now: 1000 });
  const started = act(A, "roomStart", { now: 1000 });
  assert.equal(started.room.status, "active");
  assert.equal(
    tavern.auctionCurrency.balance("a"),
    50_000_000 - tier.fee - tier.budget,
  );
  assert.equal(
    tavern.auctionCurrency.balance("b"),
    50_000_000 - tier.fee - tier.budget,
  );

  // One sealed bid is not enough to open the round.
  const one = act(A, "roomBid", { bid: 1_000_000, now: 2000 });
  assert.equal(one.room.started.round, 1);
  assert.equal(one.room.started.history.length, 0);

  // The second human bid closes it: four bids become public history.
  const two = act(B, "roomBid", { bid: 500_000, now: 2000 });
  const history = two.room.started.history;
  assert.equal(history.length, 1);
  assert.equal(history[0].bids.length, 4);
  assert.equal(history[0].bids[0], 1_000_000);
  assert.equal(history[0].bids[1], 500_000);
  // NPCs sometimes pass on purpose, so only the shape is guaranteed.
  for (const b of history[0].bids)
    assert(Number.isInteger(b) && b >= 0 && b <= tier.budget);
});

test("a round with nobody bidding times out into passes and still settles", (t) => {
  const { tavern, A, B, act } = setup(t);
  const tier = AUCTION_TIERS.small;
  const code = act(A, "roomCreate", { tier: "small", now: 1000 }).room.code;
  act(B, "roomJoin", { code, now: 1000 });
  act(B, "roomReady", { ready: true, now: 1000 });
  act(A, "roomStart", { now: 1000 });

  let view = act(A, "roomView", { now: 1000 + 61_000 });
  assert.equal(view.room.started.history.length, 1);
  assert.equal(view.room.started.history[0].bids[0], 0);
  assert.equal(view.room.started.history[0].bids[1], 0);

  // Keep letting the clock run: five empty rounds end the game. Each stale
  // round is closed on the next request, so poll the way a browser would.
  let stamp = 1000 + 61_000;
  for (let i = 0; i < 8 && view.room.status === "active"; i++) {
    stamp += 61_000;
    view = act(A, "roomView", { now: stamp });
  }
  assert.equal(view.room.status, "settled");
  const seat = view.room.seats.find((s) => s.index === view.room.result.winner);
  assert.equal(seat.npc, true);
  // Nobody human won, so both only lose the entry fee.
  assert.equal(tavern.auctionCurrency.balance("a"), 50_000_000 - tier.fee);
  assert.equal(tavern.auctionCurrency.balance("b"), 50_000_000 - tier.fee);
});

test("settlement takes the winning bid, moves goods to the winner and happens once", (t) => {
  const { tavern, A, B, act } = setup(t);
  const tier = AUCTION_TIERS.small;
  const code = act(A, "roomCreate", { tier: "small", now: 1000 }).room.code;
  act(B, "roomJoin", { code, now: 1000 });
  act(B, "roomReady", { ready: true, now: 1000 });
  act(A, "roomStart", { now: 1000 });

  // Bid the ceiling every round until the game decides itself.
  let view = null;
  for (let r = 1; r <= 5; r++) {
    act(A, "roomBid", { bid: tier.budget, now: 2000 + r });
    view = act(B, "roomBid", { bid: 0, now: 2000 + r });
    if (view.room.status === "settled") break;
  }
  assert.equal(view.room.status, "settled");
  const result = view.room.result;
  // A ceiling bid usually ends it early; however long it took, the books balance.
  assert(view.room.started.history.length >= 1);
  assert.notEqual(result.winner, null);

  const spent = 100_000_000 - (tavern.auctionCurrency.balance("a") + tavern.auctionCurrency.balance("b"));
  assert.equal(spent, tier.fee * 2 + result.price);

  // The winning human owns the goods; NPC wins leave no rows.
  const winnerSeat = view.room.seats.find((s) => s.index === result.winner);
  const rows = tavern.sql
    .exec("SELECT COUNT(*) n FROM tavern_auction_inventory WHERE source=?", view.room.id)
    .one().n;
  assert.equal(rows, winnerSeat.npc ? 0 : view.room.started.itemCount);

  // Reading again must not refund or settle twice.
  const again = act(A, "roomView", { now: 4000 });
  assert.equal(again.room.result.settledAt, result.settledAt);
  assert.equal(
    100_000_000 - (tavern.auctionCurrency.balance("a") + tavern.auctionCurrency.balance("b")),
    spent,
  );
  assert.throws(() => act(A, "roomBid", { bid: 1, now: 5000 }), /结束/);
  act(A,"roomReveal",{mode:"all",step:0,now:5000});
  // Dismissing a finished room clears only the caller’s seat.
  assert.equal(act(A, "roomLeave", { now: 5000 }).room, null);
});
test("an abandoned running room returns the held budgets instead of eating them", (t) => {
  const { tavern, A, B, act } = setup(t);
  const tier = AUCTION_TIERS.small;
  const code = act(A, "roomCreate", { tier: "small", now: 1000 }).room.code;
  act(B, "roomJoin", { code, now: 1000 });
  act(B, "roomReady", { ready: true, now: 1000 });
  act(A, "roomStart", { now: 1000 });
  assert.equal(tavern.auctionCurrency.balance("a"), 50_000_000 - tier.fee - tier.budget);

  // Two hours later the sweep closes it; the fee is gone, the budget is not.
  const late = 1000 + 2 * 60 * 60_000 + 1;
  assert.equal(act(A, "roomView", { now: late }).room, null);
  assert.equal(tavern.auctionCurrency.balance("a"), 50_000_000 - tier.fee);
  assert.equal(tavern.auctionCurrency.balance("b"), 50_000_000 - tier.fee);
  // Sweeping twice must not refund twice.
  assert.equal(act(B, "roomView", { now: late + 1000 }).room, null);
  assert.equal(tavern.auctionCurrency.balance("a"), 50_000_000 - tier.fee);
});
test("a lone host cannot start: a second human is required", (t) => {
  const { A, act } = setup(t);
  act(A, "roomCreate", { tier: "small", now: 1000 });
  assert.equal(act(A, "roomView", { now: 1000 }).room.canStart, false);
  assert.throws(() => act(A, "roomStart", { now: 1000 }), /两个真人/);
});

test("failed start rolls back every wallet and retry cannot debit the first player", t => {
  const {tavern, auction, A, B, act} = setup(t);
  const code = act(A, "roomCreate", {tier:"standard"}).room.code;
  act(B,"roomJoin",{code}); act(B,"roomReady",{ready:true});
  tavern.auctionCurrency.adjust(B.id,-tavern.auctionCurrency.balance(B.id),"test:drain","test","drain",1000);
  const before = tavern.auctionCurrency.balance(A.id);
  for (let i=0;i<2;i++) {
    assert.throws(()=>act(A,"roomStart"), /不足/);
    assert.equal(tavern.auctionCurrency.balance(A.id),before);
    assert.equal(tavern.auctionCurrency.balance(B.id),0);
    assert.equal(auction.rooms.row(code).status,"waiting");
    assert.equal(auction.rooms.seats(code).length,2);
  }
});
test("generation failure after escrow leaves wallets and lobby untouched", t => {
  const {tavern, auction, A, B, act} = setup(t);
  const code=act(A,"roomCreate").room.code;
  act(B,"roomJoin",{code}); act(B,"roomReady",{ready:true});
  auction.rooms.random=()=>{throw Error("generation failed");};
  assert.throws(()=>act(A,"roomStart"),/generation failed/);
  assert.equal(tavern.auctionCurrency.balance(A.id),50_000_000);
  assert.equal(tavern.auctionCurrency.balance(B.id),50_000_000);
  assert.equal(auction.rooms.row(code).status,"waiting");
});

function running(t, roles=null) {
  const x=setup(t),{A,B,act,auction}=x;
  const room=act(A,"roomCreate",{tier:"small",now:1000}).room;
  act(B,"roomJoin",{code:room.code,now:1000});
  if(roles){act(A,"roomRole",{role:roles[0],now:1000});act(B,"roomRole",{role:roles[1],now:1000});}
  act(B,"roomReady",{ready:true,now:1000});
  act(A,"roomStart",{now:1000});
  auction.rooms.npcBid=()=>0;
  return {...x,room};
}
function won(t) {
  const x=running(t);
  x.act(x.A,"roomBid",{bid:AUCTION_TIERS.small.budget,now:2000});
  const settled=x.act(x.B,"roomBid",{bid:0,now:2000}).room;
  assert.equal(settled.result.won,false);
  assert.equal(settled.result.winner,0);
  return {...x,settled};
}

test('V3 room skills use the same version for each seat and keep focused/category information private',t=>{
 const {A,B,act,auction,room}=running(t,['zhou','lucia']);
 const a=act(A,'roomView',{now:1001}).room,b=act(B,'roomView',{now:1001}).room;
 assert.equal(a.started.skillVersion,3);assert.equal(b.started.skillVersion,3);
 assert(Number.isInteger(a.started.info.focus));assert.equal(b.started.info.focus,undefined);
 const raw=auction.rooms.row(room.code).data;
 assert.equal(raw.skillVersion,3);assert(raw.infos[1].items.some(x=>x.category!==undefined));
 assert(raw.infos[0].items.every(x=>x.category===undefined));
 assert(a.started.info.items.every(x=>x.category===null));
 assert(b.started.info.items.some(x=>x.category!==null));
 const frozen=JSON.stringify(raw.infos);act(A,'roomView',{now:1002});act(B,'roomView',{now:1002});
 assert.equal(JSON.stringify(auction.rooms.row(room.code).data.infos),frozen);
});

test('ongoing V2 themed rooms retain old reveal behavior and report the saved skill version',t=>{
 const {A,B,act,auction,room}=running(t,['zhou','lucia']),stored=auction.rooms.row(room.code);
 stored.data.skillVersion=2;stored.data.infos=stored.data.infos.map(info=>({highCount:null,items:info.items.map(()=>({quality:null,width:null,height:null}))}));
 auction.rooms.revealClues(stored.data,1);auction.rooms.save(stored);
 for(let round=1;round<=3;round++){
  const a=act(A,'roomView',{now:1000+round}).room;
  assert.equal(a.started.skillVersion,2);assert.equal(a.started.info.focus,undefined);
  assert(auction.rooms.row(room.code).data.infos[1].items.every(x=>x.category===undefined));
  if(round<3){
   act(A,'roomBid',{bid:0,now:2000+round*1000});act(B,'roomBid',{bid:0,now:2000+round*1000});
  }
 }
});

test("a retried closing bid cannot become a bid in the next round; stale rounds and changed replays fail",t=>{
  const {A,B,act,room}=running(t);
  act(A,"roomBid",{bid:100,now:2000});
  const request={bid:100,roomId:room.id,round:1,requestId:"same-request-001",now:2000};
  const second=act(B,"roomBid",request);
  assert.equal(second.room.started.round,2);
  for(let i=0;i<3;i++){
    const retry=act(B,"roomBid",request);
    assert.equal(retry.room.started.round,2);
    assert.equal(retry.room.seats.find(s=>s.you).submitted,false);
  }
  assert.throws(()=>act(B,"roomBid",{...request,bid:101}),/不一致/);
  assert.throws(()=>act(B,"roomBid",{...request,requestId:"different-request"}),/已经开牌/);
});

test("edits remain possible within the displayed round and room identity cannot target a replacement room",t=>{
  const {A,B,act,room,auction}=running(t);
  act(A,"roomBid",{bid:100,now:2000});
  assert.equal(act(A,"roomBid",{bid:200,now:2000}).room.seats.find(s=>s.you).bid,200);
  assert.throws(()=>act(A,"roomBid",{bid:300,roomId:"0000000000000000",now:2000}),/房间已变化/);
  assert.equal(auction.rooms.row(room.code).data.bids[0][0],200);
  assert.throws(()=>act(B,"roomBid",{bid:1,roomId:undefined,now:2000}),/房间已变化/);
});

test("starting twice holds one escrow only, and readiness and role are visible to the host",t=>{
  const {A,B,act,tavern,room}=running(t);
  const balance=tavern.auctionCurrency.balance(A.id);
  assert.equal(act(A,"roomStart",{now:2000}).room.status,"active");
  assert.equal(tavern.auctionCurrency.balance(A.id),balance);
  assert.equal(act(A,"roomView",{now:2000}).room.id,room.id);
  assert.throws(()=>act(B,"roomRole",{role:"zhou",now:2000}),/不能换/);
});

test("each player sees their own persistent clues, masked board and regional estimate without hidden values or sealed bids",t=>{
  const {A,B,act,auction,room}=running(t,["sophie","viktor"]);
  const a=act(A,"roomView",{now:1500}).room.started,b=act(B,"roomView",{now:1500}).room.started;
  assert.equal(a.info.highCount,null);
  assert.equal(typeof b.info.highCount,"number");
  assert.equal(a.info.items.filter(c=>c.quality!==null).length,Math.min(5,a.itemCount));
  assert(b.info.items.every(c=>c.quality===null));
  assert(a.estimate>0 && b.estimate>0);
  for(const v of [a,b]){
    assert(v.items.every(x=>x===null));
    assert.equal("total" in v,false);assert.equal("infos" in v,false);
    v.board.slots.forEach((slot,i)=>{if(v.info.items[i].quality===null && v.info.items[i].width===null)assert.equal(slot,null);});
  }
  const before=auction.rooms.row(room.code).data.infos;
  act(A,"roomBid",{bid:100,now:2000});
  const guest=act(B,"roomView",{now:2000});
  assert.equal(guest.room.seats[0].bid,null);assert.equal(guest.room.seats[0].submitted,true);
  assert.deepEqual(auction.rooms.row(room.code).data.infos,before);
  const round2=act(B,"roomBid",{bid:100,now:2000}).room.started;
  assert.equal(round2.round,2);
  assert(Array.isArray(round2.info.highCounts));
  const after=auction.rooms.row(room.code).data.infos;
  assert.notDeepEqual(after,before);
  assert.equal(auction.rooms.row(room.code).data.warehouse.count,a.itemCount);
});

test("shared reveal follows one server clock, hides the final value and unlocks inventory only when complete",t=>{
  const {A,B,act,tavern,settled,auction}=won(t);
  const source=settled.id,total=settled.started.itemCount;
  assert.equal("total" in settled.result,false);assert.equal("net" in settled.result,false);
  assert(settled.started.items.every(x=>x===null));
  const locked=()=>tavern.one("SELECT COUNT(*) n FROM tavern_auction_inventory WHERE source=? AND revealed=0",source).n;
  assert.equal(locked(),total);
  const first=act(A,"roomReveal",{mode:"start",now:2100}).room;
  assert.equal(first.started.reveal.count,1);
  assert.equal(act(B,"roomReveal",{mode:"start",now:2100}).room.started.reveal.count,1);
  for(const who of [A,B,A,B])assert.equal(act(who,"roomView",{now:3000}).room.started.reveal.count,2);
  assert.equal(act(B,"roomView",{now:3000}).room.started.items.filter(Boolean).length,2);
  assert.equal(locked(),total);
  act(B,"roomReveal",{mode:"pause",now:3000});
  assert.equal(act(A,"roomView",{now:5000}).room.started.reveal.count,2);
  act(A,"roomReveal",{mode:"next",step:2,now:5000});
  assert.throws(()=>act(B,"roomReveal",{mode:"next",step:2,now:5000}),/进度已变化/);
  const complete=act(B,"roomReveal",{mode:"all",step:3,now:5000}).room;
  const winner=act(A,"roomView",{now:5000}).room;
  assert.equal(locked(),0);assert.equal(complete.started.reveal.complete,true);
  assert.equal(complete.result.total,auction.rooms.row(settled.code).data.total);
  assert.equal(winner.result.net,winner.result.total-winner.result.price-AUCTION_TIERS.small.fee);
  assert.equal(complete.result.net,-AUCTION_TIERS.small.fee);
  assert.equal(winner.result.cashNet,-winner.result.price-AUCTION_TIERS.small.fee);
  assert(winner.started.items.every(Boolean));
  const balances=[tavern.auctionCurrency.balance(A.id),tavern.auctionCurrency.balance(B.id)];
  act(A,"roomReveal",{mode:"all",step:0,now:5000});
  assert.deepEqual([tavern.auctionCurrency.balance(A.id),tavern.auctionCurrency.balance(B.id)],balances);
});

test("rejoining catches up automatic reveal and a participant leaving cannot erase the other result",t=>{
  const {A,B,act,settled}=won(t);
  assert.throws(()=>act(A,"roomLeave",{now:2100}),/完成共享揭晓/);
  assert.throws(()=>act(A,"roomCreate",{now:2100}),/已经在/);
  act(A,"roomReveal",{mode:"start",now:2100});
  const done=act(B,"roomView",{now:2100+900*settled.started.itemCount}).room;
  assert.equal(done.started.reveal.complete,true);
  act(A,"roomLeave",{now:25000});
  assert.equal(act(A,"roomView",{roomId:settled.id,now:25000}).room,null);
  assert.equal(act(B,"roomView",{roomId:settled.id,now:25000}).room.result.total,done.result.total);
});

test("inventory failure rolls back the last bid, settlement refunds and acquired rows, allowing a clean retry",t=>{
  const {A,B,act,tavern,auction,room}=running(t);
  act(A,"roomBid",{bid:AUCTION_TIERS.small.budget,now:2000});
  const before=[tavern.auctionCurrency.balance(A.id),tavern.auctionCurrency.balance(B.id)],inventory=auction.inventory,
    acquire=inventory.acquire.bind(inventory);
  inventory.acquire=(...args)=>{acquire(...args);throw Error("inventory failed");};
  assert.throws(()=>act(B,"roomBid",{bid:0,now:2000}),/inventory failed/);
  assert.deepEqual([tavern.auctionCurrency.balance(A.id),tavern.auctionCurrency.balance(B.id)],before);
  assert.equal(auction.rooms.row(room.code).status,"active");
  assert.equal(tavern.one("SELECT COUNT(*) n FROM tavern_auction_inventory").n,0);
  assert.equal(auction.rooms.row(room.code).data.bids[0][1],undefined);
  inventory.acquire=acquire;
  assert.equal(act(B,"roomBid",{bid:0,now:2000}).room.status,"settled");
});

test("new winnings have selectable IDs, pending reveal is resumable, and expiry cannot strand locked goods",t=>{
  const {tavern,auction,act}=setup(t),A={id:"101",name:"测试甲",guild:"3",channel:"0"},B={id:"102",name:"测试乙",guild:"3",channel:"0"};
  for(const p of [A,B])tavern.auctionCurrency.adjust(p.id,50_000_000,`fund:${p.id}`,"test","fund",1000);
  const room=act(A,"roomCreate",{tier:"small",now:1000}).room;
  act(B,"roomJoin",{code:room.code,now:1000});act(B,"roomReady",{ready:true,now:1000});act(A,"roomStart",{now:1000});
  auction.rooms.npcBid=()=>0;
  act(A,"roomBid",{bid:AUCTION_TIERS.small.budget,now:2000});act(B,"roomBid",{bid:0,now:2000});
  const pending=auction.inventory.summary(A).pending;
  assert.equal(pending.room,true);assert.equal(pending.roomId,room.id);
  assert.equal(pending.code,room.code);
  act(A,"roomReveal",{mode:"all",step:0,now:3000});
  let page=auction.inventory.view(A,3000);
  assert(page.items.length>0);assert.equal(page.pending,null);
  page=auction.inventory.select({...A,token:page.token,selected:[page.items[0].id]},3000);
  assert.equal(page.selected.length,1);
  // A separate unresolved result is automatically unlocked by the expiry sweep.
  const raw=auction.rooms.row(room.code);raw.data.reveal.complete=false;
  auction.rooms.save(raw);tavern.sql.exec("UPDATE tavern_auction_inventory SET revealed=0 WHERE source=?",room.id);
  act(B,"roomView",{now:1000+2*60*60_000+1});
  assert.equal(auction.inventory.summary(A).locked,0);
});

test("legacy room inventory IDs can be selected without accepting arbitrary source strings",t=>{
  const {auction}=setup(t),p={id:"101",name:"旧版玩家",channel:"0"};
  auction.inventory.acquire({token:"room:ABCD23",user_id:p.id},{tier:"small",items:[{id:"sample",value:100,quality:1}]},1000);
  const page=auction.inventory.view(p,2000);
  const selected=auction.inventory.select({...p,token:page.token,selected:[page.items[0].id]},2000);
  assert.deepEqual(selected.selected,["room:ABCD23_0"]);
  assert.throws(()=>auction.inventory.select({...p,token:page.token,selected:["room:../../_0"]},2000),/选择已变化/);
});

test("room code reuse gets a fresh financial identity and cannot accept a stale previous-room action",t=>{
 const {A,B,act,auction,tavern,room}=running(t);
 const before=tavern.auctionCurrency.balance(A.id);
 auction.rooms.drop(room.code);
 auction.rooms.newCode=()=>room.code;
 const fresh=act(A,"roomCreate",{tier:"small",now:3000}).room;
 assert.notEqual(fresh.id,room.id);
 act(B,"roomJoin",{code:fresh.code,now:3000});act(B,"roomReady",{ready:true,now:3000});
 act(A,"roomStart",{now:3000});
 assert.equal(tavern.auctionCurrency.balance(A.id),before-AUCTION_TIERS.small.fee);
 assert.throws(()=>act(A,"roomBid",{roomId:room.id,round:1,bid:0,now:3000}),/房间已变化/);
 assert.equal(auction.rooms.row(fresh.code).data.bids[0].length,0);
});

test("room clues and shared clock survive a service restart without rolling skills again",t=>{
 const {A,B,act,auction,tavern,settled}=won(t);
 act(B,"roomReveal",{mode:"start",now:3000});
 const before=auction.rooms.row(settled.code).data.infos;
 tavern._auction=new TavernAuction(tavern,n=>n-1);
 const restored=tavern.auction.rooms.dispatch({...A,action:"roomView",roomId:settled.id,now:3900}).room;
 assert.equal(restored.started.reveal.count,2);
 assert.deepEqual(tavern.auction.rooms.row(settled.code).data.infos,before);
 assert.equal(restored.result.won,true);
});

test("selecting a different role cancels readiness and publishes the new role and start eligibility",t=>{
 const {A,B,act}=setup(t);
 const code=act(A,"roomCreate",{now:1000}).room.code;
 act(B,"roomJoin",{code,now:1000});act(B,"roomReady",{ready:true,now:1000});
 assert.equal(act(A,"roomView",{now:1000}).room.canStart,true);
 act(B,"roomRole",{role:"viktor",now:1000});
 const host=act(A,"roomView",{now:1000}).room;
 assert.equal(host.canStart,false);assert.equal(host.seats[1].role,"viktor");assert.equal(host.seats[1].ready,false);
});

test("already running legacy rooms remain readable and settle to their original revealed inventory source",t=>{
 const {A,B,act,auction,tavern,room}=running(t);
 const raw=auction.rooms.row(room.code);
 for(const key of ["id","contractVersion","catalogVersion","dropVersion","skillVersion","infos","weights"])delete raw.data[key];
 delete raw.data.warehouse.count;auction.rooms.save(raw);
 const before=act(A,"roomView",{now:1500}).room;
 assert.match(before.id,/^legacy:/);assert.equal(before.started.info,undefined);
 act(A,"roomBid",{bid:AUCTION_TIERS.small.budget,now:2000});
 const done=act(B,"roomBid",{bid:0,now:2000}).room;
 assert.equal(done.status,"settled");assert.equal(typeof done.result.total,"number");
 const goods=tavern.rows("SELECT * FROM tavern_auction_inventory WHERE source=?",`room:${room.code}`);
 assert.equal(goods.length,done.started.itemCount);assert(goods.every(x=>x.revealed===1));
});

test('selectable themes and progressive public clues are shared across all seats and survive restart',t=>{
 const {A,B,act,auction,tavern}=setup(t);
 const code=act(A,'roomCreate',{tier:'small',theme:'arts',now:1000}).room.code;
 assert.equal(act(A,'roomView',{now:1000}).room.themeChoice,'arts');
 act(B,'roomJoin',{code,now:1000});act(B,'roomRole',{role:'viktor',now:1000});act(B,'roomReady',{ready:true,now:1000});
 act(A,'roomStart',{now:1000});auction.rooms.npcBid=()=>0;
 for(let r=1;r<=5;r++){
  const a=act(A,'roomView',{now:2000}).room.started,b=act(B,'roomView',{now:2000}).room.started;
  assert.equal(a.theme.id,'arts');assert.equal(a.publicInfo.clues.length,r);assert.deepEqual(a.publicInfo,b.publicInfo);
  assert.equal(a.items.filter(Boolean).length,0);assert.equal(b.info.highCount>=0,true);
  assert(Number.isFinite(a.estimate)&&Number.isFinite(b.estimate));
  assert.equal('publicOrder' in a,false);assert.equal('total' in a,false);
  act(A,'roomBid',{bid:100,now:2000});act(B,'roomBid',{bid:100,now:2000});
 }
 const before=act(A,'roomView',{now:2000}).room;
 tavern._auction=new TavernAuction(tavern,()=>{throw Error('rerolled');});
 const restored=tavern.auction.rooms.dispatch({...A,action:'roomView',roomId:before.id,now:2000}).room;
 assert.deepEqual(restored.started.publicInfo,before.started.publicInfo);assert.equal(restored.started.theme.id,'arts');
});
test('invalid themes cannot create a room or debit any wallet',t=>{
 const {A,act,tavern}=setup(t),before=tavern.auctionCurrency.balance(A.id);
 assert.throws(()=>act(A,'roomCreate',{theme:'invalid',now:1000}),/主题/);assert.equal(act(A,'roomView',{now:1000}).room,null);assert.equal(tavern.auctionCurrency.balance(A.id),before);
});
