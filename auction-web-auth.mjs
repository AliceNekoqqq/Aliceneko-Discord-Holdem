// Private Durable Object storage. No public endpoint accepts these operations directly.
export const WEB_SESSION_TTL = 8 * 60 * 60_000,
  WEB_FLOW_TTL = 10 * 60_000;
export const randomWebToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export const webDigest = async (s) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
export function sameWebToken(a, b) {
  if (!/^[a-f0-9]{64}$/.test(a || "") || !/^[a-f0-9]{64}$/.test(b || ""))
    return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export class AuctionWebAuth {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS auction_web_flows(state TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS auction_web_sessions(hash TEXT PRIMARY KEY,body TEXT NOT NULL,expires INTEGER NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS auction_web_login_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)",
    );
  }
  async dispatch(p, now = Date.now()) {
    if (p.kind === "flowCreate") {
      const state = randomWebToken(),
        verifier = randomWebToken();
      this.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM auction_web_flows WHERE expires<=?", now);
        this.sql.exec("DELETE FROM auction_web_sessions WHERE expires<=?", now);
        this.sql.exec(
          "DELETE FROM auction_web_login_limits WHERE expires<=?",
          now,
        );
        const rate = this.sql
          .exec(
            "SELECT count FROM auction_web_login_limits WHERE key=?",
            p.rateKey,
          )
          .toArray()[0];
        if ((rate?.count ?? 0) >= 12) throw Error("登录尝试过多，请稍后重试。");
        this.sql.exec(
          "INSERT INTO auction_web_login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
          p.rateKey,
          now + WEB_FLOW_TTL,
        );
        this.sql.exec(
          "INSERT INTO auction_web_flows VALUES(?,?,?,?)",
          state,
          p.browserHash,
          verifier,
          now + WEB_FLOW_TTL,
        );
      });
      return { state, verifier };
    }
    if (p.kind === "flowConsume") {
      let row;
      this.storage.transactionSync(() => {
        row = this.sql
          .exec("SELECT * FROM auction_web_flows WHERE state=?", p.state)
          .toArray()[0];
        if (
          !row ||
          row.expires <= now ||
          !sameWebToken(row.browser_hash, p.browserHash)
        ) {
          row = null;
          return;
        }
        this.sql.exec("DELETE FROM auction_web_flows WHERE state=?", p.state);
      });
      return row ? { verifier: row.verifier } : null;
    }
    if (p.kind === "sessionCreate") {
      const token = randomWebToken(),
        hash = await webDigest(token),
        body = {
          user: p.user,
          guilds: p.guilds,
          csrf: randomWebToken(),
          expires: Math.min(now + WEB_SESSION_TTL, p.expires),
        };
      if (!Number.isSafeInteger(body.expires) || body.expires <= now)
        throw Error("登录已过期，请重新登录。");
      this.sql.exec(
        "INSERT INTO auction_web_sessions VALUES(?,?,?)",
        hash,
        JSON.stringify(body),
        body.expires,
      );
      return { token, expires: body.expires };
    }
    if (p.kind === "sessionRead") {
      const row = this.sql
        .exec(
          "SELECT body,expires FROM auction_web_sessions WHERE hash=?",
          p.hash,
        )
        .toArray()[0];
      if (!row || row.expires <= now) {
        if (row)
          this.sql.exec(
            "DELETE FROM auction_web_sessions WHERE hash=?",
            p.hash,
          );
        return null;
      }
      return JSON.parse(row.body);
    }
    if (p.kind === "membershipRemember") {
      const row = this.sql
        .exec(
          "SELECT body,expires FROM auction_web_sessions WHERE hash=?",
          p.hash,
        )
        .toArray()[0];
      if (!row || row.expires <= now) return null;
      const body = JSON.parse(row.body);
      body.checkedGuilds = {
        ...(body.checkedGuilds || {}),
        [p.guild]: now + 60_000,
      };
      this.sql.exec(
        "UPDATE auction_web_sessions SET body=? WHERE hash=?",
        JSON.stringify(body),
        p.hash,
      );
      return { ok: true };
    }
    if (p.kind === "sessionDelete") {
      this.sql.exec("DELETE FROM auction_web_sessions WHERE hash=?", p.hash);
      return { ok: true };
    }
    throw Error("无效登录操作。");
  }
}
