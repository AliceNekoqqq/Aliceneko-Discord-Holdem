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
  const act = (who, action, extra = {}) =>
    auction.rooms.dispatch({ ...who, action, ...extra });
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
  assert.equal("items" in started.room.started, false);
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
    .exec("SELECT COUNT(*) n FROM tavern_auction_inventory WHERE source=?", `room:${code}`)
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
  // Dismissing a finished room just clears it off the lobby.
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