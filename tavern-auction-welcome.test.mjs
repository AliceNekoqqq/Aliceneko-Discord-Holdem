import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { TavernService } from "./tavern-service.mjs";
import { TavernAuction } from "./tavern-auction.mjs";
import { INITIAL_AUCTION_BALANCE } from "./tavern-auction-currency.mjs";

const base = { guild: "3", channel: "2", id: "1", name: "Alice" };

function setup(t, grant) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const map = new Map();
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
    get: async (k) => map.get(k),
    put: async (k, v) => map.set(k, v),
  };
  const tavern = new TavernService(storage);
  if (grant) tavern.welcomeGrant = true;
  const auction = new TavernAuction(tavern, (n) => (n === 10000 ? 0 : n - 1));
  tavern._auction = auction;
  return { tavern, auction };
}

test("every new player starts with twenty million auction coins, exactly once", (t) => {
  const { tavern } = setup(t, true);
  const fx = tavern.auctionCurrency;
  assert.equal(INITIAL_AUCTION_BALANCE, 20_000_000);
  assert.equal(fx.balance("1"), 20_000_000);
  // Reading again must not top the wallet up twice.
  assert.equal(fx.balance("1"), 20_000_000);
  assert.equal(fx.balance("1"), 20_000_000);
  const rows = tavern.sql
    .exec("SELECT kind, amount FROM tavern_auction_ledger WHERE user_id=?", "1")
    .toArray()
    .filter((r) => r.kind === "auction_grant");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 20_000_000);
  // Another player gets their own stake.
  assert.equal(fx.balance("2"), 20_000_000);
});

test("the welcome stake is spendable: a newcomer can open a warehouse without exchanging", (t) => {
  const { tavern, auction } = setup(t, true);
  tavern.member(base.id, base.name, 1000);
  const offer = auction.view(base, 1000);
  const started = auction.start({ ...base, token: offer.offerToken, role: "sophie", tier: "small" }, 1001);
  assert.equal(started.session.status, "active");
  assert(started.session.budget <= INITIAL_AUCTION_BALANCE);
  // The fee and the escrow both left the wallet, and the ledger still shows one grant.
  assert.equal(
    tavern.auctionCurrency.balance(base.id),
    INITIAL_AUCTION_BALANCE - started.session.fee - started.session.budget,
  );
});

test("with the policy switched off nothing is granted, so the old behaviour still exists", (t) => {
  const { tavern } = setup(t, false);
  const fx = tavern.auctionCurrency;
  assert.equal(fx.balance("1"), 0);
  assert.equal(
    tavern.sql
      .exec("SELECT COUNT(*) n FROM tavern_auction_ledger WHERE kind='auction_grant'")
      .one().n,
    0,
  );
});
