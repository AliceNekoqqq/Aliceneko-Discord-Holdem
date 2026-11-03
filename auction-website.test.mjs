import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  AuctionWebAuth,
  webDigest,
  WEB_FLOW_TTL,
  WEB_SESSION_TTL,
} from "./auction-web-auth.mjs";
import { handleAuctionWebsite, publicAuctionData } from "./auction-website.mjs";
import { TavernService } from "./tavern-service.mjs";
import { TavernAuction, AUCTION_ROLES } from "./tavern-auction.mjs";
import { largeCatalog } from "./tavern-auction-large.mjs";
const ROOT = "https://auction.alicenekoqqq.cc.cd",
  B = { guild: "3", id: "1", channel: "2", name: "Alice" };
function storage(t) {
  const db = new DatabaseSync(":memory:"),
    map = new Map();
  t.after(() => db.close());
  return {
    sql: {
      exec(q, ...a) {
        const st = db.prepare(q);
        if (st.columns().length) return { toArray: () => st.all(...a) };
        st.run(...a);
        return { toArray: () => [] };
      },
    },
    get: async (k) => map.get(k),
    put: async (k, v) => map.set(k, v),
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const x = fn();
        db.exec("COMMIT");
        return x;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
function setup(t) {
  const auth = new AuctionWebAuth(storage(t)),
    stores = new Map(),
    calls = [];
  let membership = true;
  const env = {
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "test-client-secret",
    BOT_TOKEN: "test-bot-token",
    TABLES: {
      idFromName: (n) => n,
      get: (n) => ({
        fetch: async (url, opts) => {
          const p = JSON.parse(opts.body);
          try {
            if (n === "auction-web-auth-v1")
              return Response.json(await auth.dispatch(p));
            if (!stores.has(n)) {
              const tavern = new TavernService(storage(t));
              tavern._auction = new TavernAuction(tavern, (n) =>
                n === 10000 ? 0 : n - 1,
              );
              stores.set(n, tavern);
            }
            return Response.json(await stores.get(n).dispatch(p));
          } catch (e) {
            return Response.json({ error: e.message }, { status: 400 });
          }
        },
      }),
    },
    ASSETS: {
      fetch: async (req) => {
        const path = new URL(req.url).pathname;
        try {
          const bytes = await readFile("public" + path);
          return new Response(req.method === "HEAD" ? null : bytes, {
            headers: {
              "Content-Type": path.endsWith(".html")
                ? "text/html"
                : path.endsWith(".css")
                  ? "text/css"
                  : path.endsWith(".js")
                    ? "text/javascript"
                    : "image/webp",
            },
          });
        } catch {
          return new Response("missing", { status: 404 });
        }
      },
    },
  };
  const fetcher = async (url, opts = {}) => {
    calls.push({ url, opts });
    const u = new URL(url);
    if (u.pathname === "/api/oauth2/token") {
      assert.equal(opts.method, "POST");
      assert.equal(
        opts.headers["Content-Type"],
        "application/x-www-form-urlencoded",
      );
      assert.equal(opts.body.get("client_id"), env.DISCORD_APPLICATION_ID);
      assert.equal(opts.body.get("client_secret"), env.DISCORD_CLIENT_SECRET);
      assert.equal(
        opts.body.get("redirect_uri"),
        ROOT + "/auction/auth/callback",
      );
      assert.match(opts.body.get("code_verifier"), /^[a-f0-9]{64}$/);
      return Response.json({
        access_token: "user-access-test",
        refresh_token: "never-stored-refresh-test",
        scope: "identify guilds",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    if (u.pathname === "/api/v10/users/@me")
      return Response.json({
        id: "1",
        username: "Alice",
        global_name: "Alice <b>",
        avatar: null,
      });
    if (u.pathname === "/api/v10/users/@me/guilds") {
      assert.equal(u.searchParams.get("limit"), "200");
      return Response.json(
        opts.headers.Authorization.startsWith("Bot")
          ? [
              { id: "3", name: "小酒馆" },
              { id: "9", name: "别的服" },
            ]
          : [
              { id: "3", name: "小酒馆" },
              { id: "4", name: "没有Bot的服" },
            ],
      );
    }
    if (u.pathname === "/api/v10/guilds/3/members/1")
      return membership
        ? Response.json({ user: { id: "1", bot: false }, pending: false })
        : Response.json({ message: "Unknown Member" }, { status: 404 });
    throw Error("unexpected external request " + url);
  };
  const request = (
    path,
    { method = "GET", body, cookie, csrf, origin = ROOT, ...other } = {},
  ) =>
    handleAuctionWebsite(
      new Request(ROOT + "/auction/" + path, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body !== undefined
            ? { "Content-Type": "application/json", Origin: origin }
            : {}),
          ...(csrf ? { "X-Auction-CSRF": csrf } : {}),
          ...other.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      {},
      fetcher,
    );
  return {
    env,
    auth,
    stores,
    calls,
    request,
    setMembership: (v) => (membership = v),
  };
}
const firstCookie = (r, name) =>
  r.headers
    .getSetCookie()
    .find((s) => s.startsWith(name + "="))
    ?.split(";")[0];
async function login(e) {
  const start = await e.request("auth/login");
  assert.equal(start.status, 303);
  const u = new URL(start.headers.get("Location")),
    browser = firstCookie(start, "__Host-auction_flow");
  const callback = await e.request(
    "auth/callback?" +
      new URLSearchParams({
        state: u.searchParams.get("state"),
        code: "single-use-code",
        iss: "https://discord.com",
      }),
    { cookie: browser },
  );
  assert.equal(callback.status, 303, await callback.clone().text());
  const cookie = firstCookie(callback, "__Host-auction_session");
  assert(cookie);
  const me = await (await e.request("api/me", { cookie })).json();
  return { cookie, me, start, callback, flow: u, browser };
}
const j = async (r) => {
  const x = await r.json();
  assert(r.ok, JSON.stringify(x));
  return x;
};
async function action(e, s, action, fields = {}) {
  return e.request("api/action", {
    method: "POST",
    cookie: s.cookie,
    csrf: s.me.csrf,
    body: { action, guild: "3", ...fields },
  });
}

test("public 244-item catalog exactly matches four production pools, prices, odds, skills and rules without touching wallets", async (t) => {
  const e = setup(t);
  for (const tier of ["small", "standard", "high", "collection"]) {
    const r = await e.request("api/catalog?tier=" + tier),
      d = await j(r);
    assert.equal(d.items.length, 244);
    assert.equal(d.items.filter((x) => x.width * x.height > 4).length, 20);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
    assert.match(r.headers.get("Cache-Control"), /public/);
    for (const x of d.items) {
      const p = largeCatalog(tier).find((p) => p.id === x.id);
      assert.equal(x.value, Math.floor(p.value * d.tiers[tier].scale));
      assert(x.image.startsWith("/art/auction/"));
    }
    const roleKeys = Object.keys(d.roles);
    assert.equal(roleKeys.length, Object.keys(AUCTION_ROLES).length);
    for (const key of ["sophie", "gabriella", "viktor", "zhou", "lucia"])
      assert(roleKeys.includes(key), key);
    for (const [key, role] of Object.entries(d.roles)) {
      assert.equal(role.name, AUCTION_ROLES[key].name);
      assert(typeof role.skill === "string" && role.skill.length > 0);
    }
    assert(d.rules.includes("2 / 1.6 / 1.3 / 1.1倍"));
  }
  assert.equal(e.stores.size, 0);
  assert.equal((await e.request("api/catalog?tier=__proto__")).status, 400);
});
test("missing OAuth configuration stays signed out and never creates a fake identity or wallet", async (t) => {
  const e = setup(t);
  delete e.env.DISCORD_CLIENT_SECRET;
  const r = await e.request("auth/login");
  assert.match(r.headers.get("Location"), /login=unavailable/);
  const me = await j(await e.request("api/me"));
  assert.equal(me.user, null);
  assert.equal(me.loginConfigured, false);
  assert.equal(e.stores.size, 0);
  assert.equal((await e.request("api/state?guild=3")).status, 401);
});
test("authorization code + S256 uses a bound one-use state, secure cookies and only common guilds; tokens stay server-side", async (t) => {
  const e = setup(t),
    s = await login(e);
  assert.equal(s.flow.origin, "https://discord.com");
  assert.equal(s.flow.searchParams.get("response_type"), "code");
  assert.equal(s.flow.searchParams.get("code_challenge_method"), "S256");
  assert.equal(s.flow.searchParams.get("scope"), "identify guilds");
  assert.equal(s.flow.searchParams.get("code_challenge").length, 43);
  assert.deepEqual(s.me.guilds, [{ id: "3", name: "小酒馆", icon: null }]);
  assert.equal(s.me.user.id, "1");
  assert(!JSON.stringify(s.me).includes("user-access-test"));
  assert(!JSON.stringify(s.me).includes("never-stored"));
  assert(!s.callback.headers.get("Location").includes("code="));
  for (const value of s.callback.headers.getSetCookie()) {
    assert.match(value, /HttpOnly/);
    assert.match(value, /Secure/);
    assert.match(value, /SameSite=Lax/);
    assert.match(value, /Path=\//);
  }
  const repeat = await e.request(
    "auth/callback?" +
      new URLSearchParams({
        state: s.flow.searchParams.get("state"),
        code: "single-use-code",
      }),
    { cookie: s.browser },
  );
  assert.equal(repeat.status, 400);
  const tokenCall = e.calls.find((x) => x.url.endsWith("/oauth2/token"));
  assert.equal(
    createHash("sha256")
      .update(tokenCall.opts.body.get("code_verifier"))
      .digest("base64url"),
    s.flow.searchParams.get("code_challenge"),
  );
});
test("wrong browser cookie and issuer do not consume a legitimate login; cancellation is explicit", async (t) => {
  const e = setup(t),
    start = await e.request("auth/login"),
    u = new URL(start.headers.get("Location")),
    state = u.searchParams.get("state"),
    cookie = firstCookie(start, "__Host-auction_flow");
  assert.equal(
    (
      await e.request(`auth/callback?state=${state}&code=abc`, {
        cookie: "__Host-auction_flow=" + "a".repeat(64),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await e.request(
        `auth/callback?state=${state}&code=abc&iss=https://evil.invalid`,
        { cookie },
      )
    ).status,
    400,
  );
  const r = await e.request(
    `auth/callback?state=${state}&error=access_denied`,
    { cookie },
  );
  assert.equal(r.status, 303);
  assert.match(r.headers.get("Location"), /cancelled/);
  assert.equal(e.calls.length, 0);
});
test("flow expiry, concurrent consumption, login throttling, session expiry and logout are enforced", async (t) => {
  const e = setup(t),
    browserHash = await webDigest("browser"),
    f = await e.auth.dispatch(
      { kind: "flowCreate", browserHash, rateKey: "expiry" },
      1000,
    );
  assert.equal(
    await e.auth.dispatch(
      { kind: "flowConsume", state: f.state, browserHash },
      1000 + WEB_FLOW_TTL,
    ),
    null,
  );
  const g = await e.auth.dispatch(
      { kind: "flowCreate", browserHash, rateKey: "race" },
      2000,
    ),
    rs = await Promise.all([
      e.auth.dispatch(
        { kind: "flowConsume", state: g.state, browserHash },
        2001,
      ),
      e.auth.dispatch(
        { kind: "flowConsume", state: g.state, browserHash },
        2001,
      ),
    ]);
  assert.equal(rs.filter(Boolean).length, 1);
  for (let i = 0; i < 12; i++)
    await e.auth.dispatch(
      { kind: "flowCreate", browserHash, rateKey: "limit" },
      3000,
    );
  await assert.rejects(
    e.auth.dispatch(
      { kind: "flowCreate", browserHash, rateKey: "limit" },
      3001,
    ),
    /过多/,
  );
  const made = await e.auth.dispatch(
      {
        kind: "sessionCreate",
        user: { id: "1" },
        guilds: [],
        expires: 10 ** 12,
      },
      5000,
    ),
    hash = await webDigest(made.token);
  assert.equal(
    (await e.auth.dispatch({ kind: "sessionRead", hash }, 5001)).user.id,
    "1",
  );
  assert.equal(
    await e.auth.dispatch(
      { kind: "sessionRead", hash },
      5000 + WEB_SESSION_TTL,
    ),
    null,
  );
  const s = await login(e);
  assert.equal(
    (
      await e.request("api/logout", {
        method: "POST",
        cookie: s.cookie,
        csrf: s.me.csrf,
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await j(await e.request("api/me", { cookie: s.cookie }))).user,
    null,
  );
});
test("private mutations reject CSRF, foreign Origin, wrong guild, forged identity, unknown action, stale membership and oversized bodies before financial effects", async (t) => {
  const e = setup(t),
    s = await login(e),
    body = {
      guild: "3",
      action: "auctionStart",
      token: "a".repeat(16),
      role: "sophie",
    };
  for (const opts of [
    { cookie: s.cookie, body },
    { cookie: s.cookie, body, csrf: "a".repeat(64) },
    { cookie: s.cookie, body, csrf: s.me.csrf, origin: "https://evil.invalid" },
  ])
    assert.equal(
      (await e.request("api/action", { method: "POST", ...opts })).status,
      403,
    );
  assert.equal(
    (await e.request("api/state?guild=4", { cookie: s.cookie })).status,
    403,
  );
  assert.equal((await action(e, s, "auctionStart", { id: "2" })).status, 400);
  assert.equal((await action(e, s, "reward", { amount: 100000 })).status, 400);
  assert.equal((await action(e, s, "__proto__")).status, 400);
  assert.equal(
    (await action(e, s, "auctionBid", { padding: "x".repeat(10000) })).ok,
    false,
  );
  e.setMembership(false);
  assert.equal(
    (
      await action(e, s, "auctionBid", {
        token: "a".repeat(16),
        round: 1,
        bid: 0,
      })
    ).status,
    403,
  );
  assert.equal(e.stores.size, 0);
});
test("same live wallet and exchange receipt are shared with Discord, with exact integer dust and idempotent retry", async (t) => {
  const e = setup(t),
    s = await login(e);
  const w = (
    await j(await e.request("api/wallet?guild=3", { cookie: s.cookie }))
  ).data;
  assert.equal(w.tavernBalance, 500);
  const fields = { token: w.token, direction: "buy", amount: 100 },
    a = (await j(await action(e, s, "auctionExchangeConvert", fields))).data,
    b = (await j(await action(e, s, "auctionExchangeConvert", fields))).data;
  assert.equal(a.auctionBalance, 10000000);
  assert.equal(a.tavernBalance, 400);
  assert(b.repeated);
  const tv = e.stores.get("tavern:3"),
    discord = tv.auctionCurrency.view(B);
  assert.equal(discord.auctionBalance, a.auctionBalance);
  assert.equal(discord.tavernBalance, 400);
  assert.equal(
    (await action(e, s, "auctionExchangeConvert", { ...fields, amount: 101 }))
      .status,
    400,
  );
  assert.equal(tv.auctionCurrency.balance("1"), 10000000);
  assert.equal(
    (await e.request("api/wallet?guild=9", { cookie: s.cookie })).status,
    403,
  );
});
test("web-started auction can bid on Discord, resume on web, reveal after restart and sell/display the very same inventory once", async (t) => {
  const e = setup(t),
    s = await login(e);
  const w = (
    await j(await e.request("api/wallet?guild=3", { cookie: s.cookie }))
  ).data;
  await j(
    await action(e, s, "auctionExchangeConvert", {
      token: w.token,
      direction: "buy",
      amount: 100,
    }),
  );
  const state = (
      await j(await e.request("api/state?guild=3", { cookie: s.cookie }))
    ).data,
    started = (
      await j(
        await action(e, s, "auctionStart", {
          token: state.offerToken,
          role: "sophie",
          tier: "small",
        }),
      )
    ).data;
  assert.equal(started.session.channel, "0");
  assert.equal(started.session.items, null);
  assert.equal(started.session.readOnly, false);
  const tv = e.stores.get("tavern:3"),
    row = tv.one(
      "SELECT * FROM tavern_auctions WHERE token=?",
      started.session.token,
    ),
    raw = JSON.parse(row.state);
  raw.committed = [raw.budget, raw.budget, raw.budget];
  tv.sql.exec(
    "UPDATE tavern_auctions SET state=? WHERE token=?",
    JSON.stringify(raw),
    row.token,
  );
  const d = tv.auction.bid({ ...B, token: row.token, round: 1, bid: 0 });
  assert.equal(d.session.round, 2);
  assert.equal(d.session.readOnly, false);
  const restored = new TavernAuction(
    new TavernService(tv.storage),
    (n) => n - 1,
  );
  tv._auction = restored;
  const v = (
    await j(await e.request("api/state?guild=3", { cookie: s.cookie }))
  ).data;
  assert.equal(v.session.round, 2);
  assert.equal(v.session.token, row.token);
  const rr = JSON.parse(
    tv.one("SELECT state FROM tavern_auctions WHERE token=?", row.token).state,
  );
  rr.committed = [0, 0, 0];
  tv.sql.exec(
    "UPDATE tavern_auctions SET state=? WHERE token=?",
    JSON.stringify(rr),
    row.token,
  );
  const won = (
    await j(
      await action(e, s, "auctionBid", { token: row.token, round: 2, bid: 1 }),
    )
  ).data;
  assert.equal(won.session.result.total, undefined);
  // The web auto-reveal loop steps one item at a time using the server's own
  // count. Replaying a step must stay a no-op and a step ahead must be refused.
  const firstOpen = (
    await j(
      await action(e, s, "auctionReveal", {
        token: row.token,
        step: 0,
        all: false,
      }),
    )
  ).data;
  assert.equal(firstOpen.session.reveal.count, 1);
  assert.equal(firstOpen.session.reveal.complete, false);
  const replay = (
    await j(
      await action(e, s, "auctionReveal", {
        token: row.token,
        step: 0,
        all: false,
      }),
    )
  ).data;
  assert.equal(replay.session.reveal.count, 1);
  assert.equal(
    (
      await action(e, s, "auctionReveal", {
        token: row.token,
        step: 5,
        all: false,
      })
    ).status,
    400,
  );
  await j(
    await action(e, s, "auctionReveal", {
      token: row.token,
      step: 1,
      all: true,
    }),
  );
  const inv = (
    await j(await e.request("api/inventory?guild=3", { cookie: s.cookie }))
  ).data;
  assert.equal(inv.count, 8);
  const chosen = (
    await j(
      await action(e, s, "auctionInventorySelect", {
        token: inv.token,
        selected: [inv.items[0].id],
      }),
    )
  ).data;
  const placed = (
    await j(
      await action(e, s, "auctionInventoryPlace", {
        token: chosen.token,
        slot: 0,
      }),
    )
  ).data;
  assert.equal(tv.auction.inventory.view(B).cabinet[0].id, inv.items[0].id);
  const q = (
    await j(
      await action(e, s, "auctionInventoryQuote", {
        token: placed.token,
        quality: 6,
      }),
    )
  ).data;
  assert.equal(q.count, 7);
  const before = tv.auctionCurrency.balance("1");
  await j(await action(e, s, "auctionInventorySell", { token: q.token }));
  await j(await action(e, s, "auctionInventorySell", { token: q.token }));
  assert.equal(tv.auctionCurrency.balance("1"), before + q.total);
  assert.equal(tv.auction.inventory.view(B).count, 1);
});
test("Discord-started auctions are actionable on the website while real Discord channel ownership stays unchanged", async (t) => {
  const e = setup(t),
    s = await login(e);
  await j(await e.request("api/wallet?guild=3", { cookie: s.cookie }));
  const tv = e.stores.get("tavern:3"),
    fx = tv.auctionCurrency.view(B);
  tv.auctionCurrency.convert({
    ...B,
    token: fx.token,
    direction: "buy",
    amount: 100,
  });
  const ready = tv.auction.view(B),
    d = tv.auction.start({
      ...B,
      token: ready.offerToken,
      role: "viktor",
      tier: "small",
      presentation: "warehouse",
    });
  const onWeb = (
    await j(await e.request("api/state?guild=3", { cookie: s.cookie }))
  ).data;
  assert.equal(onWeb.session.token, d.session.token);
  assert.equal(onWeb.session.readOnly, false);
  assert.equal(tv.auction.view({ ...B, channel: "8" }).session.readOnly, true);
  assert.throws(
    () =>
      tv.auction.bid({
        ...B,
        channel: "8",
        token: d.session.token,
        round: 1,
        bid: 0,
      }),
    /频道/,
  );
  const left = await action(e, s, "auctionLeave", {
    token: d.session.token,
    round: 1,
  });
  assert(left.ok);
  assert.equal(tv.auction.view(B).session.status, "settled");
  assert.equal(tv.auction.view({ ...B, id: "2", channel: "0" }).session, null);
  assert.equal(
    (
      await action(e, s, "auctionBid", {
        token: d.session.token,
        round: 1,
        bid: 0,
      })
    ).status,
    200,
  );
});
test("served HTML, scripts, styles and original website images have security headers; unknown paths and methods stay closed", async (t) => {
  const e = setup(t);
  for (const path of [
    "",
    "assets/app.js",
    "assets/reveal-loop.mjs",
    "assets/seat-stage.mjs",
    "assets/sound.mjs",
    "assets/sfx/seal.wav",
    "assets/style.css",
    "assets/warehouse-v1.webp",
    "assets/appraisers-v1.webp",
  ]) {
    const r = await e.request(path);
    assert.equal(r.status, 200, path);
    assert.match(
      r.headers.get("Content-Security-Policy"),
      /frame-ancestors 'none'/,
    );
    assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
    if (path === "") assert((await r.text()).includes("拍卖大厅"));
  }
  assert.equal((await e.request("assets/missing.js")).status, 404);
  assert.equal((await e.request("", { method: "POST", body: {} })).status, 405);
  assert.equal((await e.request("api/action", { method: "GET" })).status, 401);
  const r = await e.request("api/me");
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.equal(e.stores.size, 0);
});

test("read-only member proofs reduce Discord calls while every mutation still checks live membership", async (t) => {
  const e = setup(t),
    s = await login(e),
    count = () =>
      e.calls.filter((x) => x.url.includes("/guilds/3/members/1")).length;
  await j(await e.request("api/state?guild=3", { cookie: s.cookie }));
  assert.equal(count(), 1);
  await j(await e.request("api/wallet?guild=3", { cookie: s.cookie }));
  await j(await e.request("api/inventory?guild=3", { cookie: s.cookie }));
  assert.equal(count(), 1);
  e.setMembership(false);
  assert.equal(
    (
      await action(e, s, "auctionExchangeConvert", {
        token: "a".repeat(16),
        direction: "buy",
        amount: 1,
      })
    ).status,
    403,
  );
  assert.equal(count(), 2);
  const hash = await webDigest(s.cookie.split("=")[1]),
    stored = await e.auth.dispatch({ kind: "sessionRead", hash });
  assert(stored.checkedGuilds["3"] > Date.now());
});
