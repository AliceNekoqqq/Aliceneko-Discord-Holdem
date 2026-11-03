import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { TavernService } from "./tavern-service.mjs";
import { TavernAuction } from "./tavern-auction.mjs";

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
  assert(started.room.started.items.length >= 6);
  assert(started.room.started.total > 0);
  assert.equal(started.room.started.board.length, started.room.started.items.length);
  assert.equal(started.room.started.warehouse.cols >= 8, true);
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
