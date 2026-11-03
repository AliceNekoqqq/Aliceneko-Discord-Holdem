import test from "node:test";
import assert from "node:assert/strict";
import { buildSeatStage, SEAT_COUNT, SEAT_ROUNDS } from "./web/auction/assets/seat-stage.mjs";

const NAMES = ["你", "阿吉", "老猫", "掌柜"];
const base = { priority: [0, 1, 2, 3], round: 1, status: "active", names: NAMES };

test("a round that has not been submitted yet keeps every seat sealed", () => {
  const stage = buildSeatStage({ ...base, history: [] });
  assert.equal(stage.open, false);
  assert.equal(stage.decided, false);
  assert.equal(stage.round, 1);
  assert.equal(stage.total, SEAT_ROUNDS);
  assert.equal(stage.seats.length, SEAT_COUNT);
  for (const seat of stage.seats) {
    assert.equal(seat.state, "sealed");
    assert.equal(seat.bid, null);
    assert.equal(seat.leader, false);
  }
  assert.deepEqual(
    stage.seats.map((s) => s.name),
    NAMES,
  );
});

test("the highest published bid leads and the margin is measured against second place", () => {
  const stage = buildSeatStage({
    ...base,
    history: [{ round: 1, bids: [400, 900, 700, 0], winner: 1, done: false }],
  });
  assert.equal(stage.open, true);
  assert.equal(stage.top, 900);
  assert.equal(stage.margin, 200);
  assert.equal(stage.seats[1].state, "top");
  assert.equal(stage.seats[1].leader, true);
  assert.equal(stage.seats[0].state, "bid");
  assert.equal(stage.seats[3].state, "pass");
  assert.equal(stage.seats[3].bid, 0);
});

test("equal top bids are ordered by the session's sealed priority draw", () => {
  const history = [{ round: 2, bids: [500, 500, 300, 100], winner: 0, done: false }];
  const byDefault = buildSeatStage({ ...base, history });
  assert.equal(byDefault.seats[0].state, "top");
  assert.equal(byDefault.seats[1].state, "bid");
  // Seat 1 was drawn first this session, so it wins the tie instead.
  const byDraw = buildSeatStage({ ...base, priority: [1, 2, 3, 0], history });
  assert.equal(byDraw.seats[1].state, "top");
  assert.equal(byDraw.seats[0].state, "bid");
});

test("an invalid priority draw falls back to seat order instead of crashing", () => {
  const stage = buildSeatStage({
    ...base,
    priority: [0, 0, 1, 2],
    history: [{ round: 1, bids: [100, 100, 0, 0], winner: 0, done: false }],
  });
  assert.equal(stage.seats[0].state, "top");
});

test("a settled session marks the winning seat and carries the hammer price", () => {
  const stage = buildSeatStage({
    ...base,
    status: "settled",
    result: { winner: 2, price: 1250 },
    history: [{ round: 3, bids: [800, 600, 1250, 0], winner: 2, done: true }],
  });
  assert.equal(stage.settled, true);
  assert.equal(stage.decided, true);
  assert.equal(stage.winner, 2);
  assert.equal(stage.price, 1250);
  assert.equal(stage.seats[2].state, "won");
  assert.equal(stage.seats[2].winner, true);
  assert.equal(stage.seats[2].leader, true);
});

test("a passed-in auction with no winner leaves every seat without a winner", () => {
  const stage = buildSeatStage({
    ...base,
    status: "settled",
    result: { winner: null, price: 0 },
    history: [{ round: 5, bids: [0, 0, 0, 0], winner: null, done: true }],
  });
  assert.equal(stage.settled, true);
  assert.equal(stage.winner, null);
  assert.equal(stage.price, 0);
  assert.equal(stage.seats.filter((s) => s.state === "pass").length, 4);
});

test("the latest round is the one presented after several bids", () => {
  const stage = buildSeatStage({
    ...base,
    history: [
      { round: 1, bids: [100, 200, 300, 0], winner: 2, done: false },
      { round: 2, bids: [900, 200, 300, 50], winner: 0, done: false },
    ],
  });
  assert.equal(stage.round, 2);
  assert.equal(stage.seats[0].state, "top");
  assert.equal(stage.seats[3].bid, 50);
});

test("missing names and malformed history degrade to safe defaults", () => {
  const stage = buildSeatStage({ history: [{ round: 1, bids: [1] }, null] });
  assert.equal(stage.open, false);
  assert.equal(stage.seats[3].name, "席位4");
  assert.equal(stage.round, 1);
});
