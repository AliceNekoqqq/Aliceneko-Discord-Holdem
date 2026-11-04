import {AUCTION_OPPONENTS,AUCTION_NPC_STYLES} from './tavern-auction-opponents.mjs';
import {AUCTION_SKILL_VERSION} from './tavern-auction-skills.mjs';
import {AUCTION_THEMES} from './tavern-auction-themes.mjs';
import {
  AuctionWebAuth,
  randomWebToken,
  webDigest,
  sameWebToken,
  WEB_FLOW_TTL,
} from "./auction-web-auth.mjs";
import {
  AUCTION_TIERS,
  AUCTION_ROLES,
  AUCTION_QUALITIES,
} from "./tavern-auction.mjs";
import { largeCatalog, largeItemChance } from "./tavern-auction-large.mjs";
import {
  AUCTION_REGIONS,
  AUCTION_WAREHOUSES,
} from "./tavern-auction-regions.mjs";
import { auctionRules } from "./tavern-auction-ui.mjs";
import art from "./auction-art-manifest.mjs";
import { validId } from "./tavern-catalog.mjs";
import { tavernRequest } from "./tavern-service.mjs";
export { AuctionWebAuth };
export const AUCTION_WEBSITE_VERSION = "auction-web.1";
const SESSION = "__Host-auction_session",
  FLOW = "__Host-auction_flow",
  TOKEN = /^[a-f0-9]{64}$/;
const allowedActions = {
  auctionStart: ["token", "role", "tier", "theme"],
  auctionBid: ["token", "round", "bid"],
  auctionLeave: ["token", "round"],
  auctionReveal: ["token", "step", "all"],
  roomView: ["roomId"],
  roomCreate: ["tier", "theme"],
  roomJoin: ["code"],
  roomLeave: ["roomId"],
  roomRole: ["roomId", "role"],
  roomReady: ["roomId", "ready"],
  roomStart: ["roomId"],
  roomBid: ["roomId", "round", "requestId", "bid"],
  roomReveal: ["roomId", "mode", "step"],
  auctionExchangeConvert: ["token", "direction", "amount"],
  auctionInventorySelect: ["token", "selected"],
  auctionInventoryQuote: ["token", "quality"],
  auctionInventorySell: ["token"],
  auctionInventoryPlace: ["token", "slot"],
  auctionInventoryRemove: ["token", "slot"],
};
const baseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com https://discord-holdem.aliceneko.workers.dev https://auction.alicenekoqqq.cc.cd; connect-src 'self' https://discord-holdem.aliceneko.workers.dev; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
class WebsiteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const reply = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { ...baseHeaders, ...headers } });
function cookies(req) {
  const out = {};
  for (const item of (req.headers.get("Cookie") || "").split(";")) {
    const i = item.indexOf("=");
    if (i > 0) out[item.slice(0, i).trim()] = item.slice(i + 1).trim();
  }
  return out;
}
const cookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
async function auth(env, p) {
  const r = await env.TABLES.get(
    env.TABLES.idFromName("auction-web-auth-v1"),
  ).fetch("https://internal", {
    method: "POST",
    body: JSON.stringify({ op: "auctionWebAuth", ...p }),
  });
  const data = await r.json();
  if (!r.ok || data?.error)
    throw new WebsiteError(429, data?.error || "登录服务暂时繁忙。");
  return data;
}
async function session(req, env) {
  const token = cookies(req)[SESSION];
  if (!TOKEN.test(token || ""))
    throw new WebsiteError(401, "请先使用Discord登录。");
  const s = await auth(env, {
    kind: "sessionRead",
    hash: await webDigest(token),
  });
  if (!s) throw new WebsiteError(401, "登录已过期，请重新登录。");
  return s;
}
async function boundedJSON(response, limit = 1_000_000) {
  const reader = response.body?.getReader();
  if (!reader) throw new WebsiteError(502, "Discord暂时没有返回数据。");
  let total = 0;
  const parts = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new WebsiteError(502, "返回数据过大，请稍后重试。");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new WebsiteError(502, "Discord返回格式异常，请稍后重试。");
  }
}
async function discord(fetcher, path, authorization) {
  const r = await fetcher("https://discord.com/api/v10" + path, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok)
    throw new WebsiteError(
      r.status === 404 || r.status === 403 ? 403 : 502,
      r.status === 404 || r.status === 403
        ? "当前账户或小酒馆已不在这个服务器。"
        : "Discord验证暂时繁忙，请稍后重试。",
    );
  return boundedJSON(r);
}
async function guildPages(fetcher, authorization) {
  const all = [];
  let after = "0";
  for (let page = 0; page < 10; page++) {
    const xs = await discord(
      fetcher,
      `/users/@me/guilds?limit=200&after=${after}`,
      authorization,
    );
    if (!Array.isArray(xs)) throw new WebsiteError(502, "服务器列表读取失败。");
    all.push(...xs);
    if (xs.length < 200) return all;
    after = xs.at(-1).id;
    if (!validId(after)) break;
  }
  throw new WebsiteError(502, "服务器列表暂时无法完整读取，请稍后重试。");
}
function redirect(location, values = []) {
  const headers = new Headers({ ...baseHeaders, Location: location });
  for (const v of values) headers.append("Set-Cookie", v);
  return new Response(null, { status: 303, headers });
}
async function requestBody(req) {
  if (req.method !== "POST") throw new WebsiteError(405, "此操作只接受POST。");
  if (
    req.headers.get("Origin") !== new URL(req.url).origin ||
    req.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw new WebsiteError(403, "操作来源不匹配，请返回本站。");
  if (
    (req.headers.get("Content-Type") || "").split(";")[0].trim() !==
    "application/json"
  )
    throw new WebsiteError(415, "请使用JSON提交操作。");
  let data;
  try {
    data = await boundedJSON(req, 8192);
  } catch {
    throw new WebsiteError(400, "操作格式无效或内容过长。");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new WebsiteError(400, "操作格式无效。");
  return data;
}
export function publicAuctionData(tier = "standard") {
  if (!Object.hasOwn(AUCTION_TIERS, tier))
    throw new WebsiteError(400, "无效竞拍区域。");
  return {
    version: AUCTION_WEBSITE_VERSION,
    qualities: AUCTION_QUALITIES,
    roles: AUCTION_ROLES,
    opponents:AUCTION_OPPONENTS,opponentStyles:AUCTION_NPC_STYLES,
    skillVersion:AUCTION_SKILL_VERSION,
    tiers: AUCTION_TIERS,
    warehouses: AUCTION_WAREHOUSES,
    catalogVersion:9,themes:AUCTION_THEMES,
    region: AUCTION_REGIONS[tier],
    regions: AUCTION_REGIONS,
    tier,
    rate: 100000,
    rules: auctionRules("0", "0").content,
    items: largeCatalog(tier).map((x) => ({
      ...x,
      value: Math.floor(x.value * AUCTION_TIERS[tier].scale),
      image: art.items[x.id].path,
      chance: largeItemChance(x, tier, 9),
      chanceByTheme:Object.fromEntries(AUCTION_THEMES.map(t=>[t.id,largeItemChance(x,tier,9,t.id)])),
    })),
  };
}
export async function handleAuctionWebsite(request, env, ctx, fetcher = fetch) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path !== "/" && path !== "/auction" && !path.startsWith("/auction/"))
    return null;
  try {
    if (path === "/" || path === "/auction") return redirect("/auction/");
    if (path === "/auction/auth/login") {
      if (request.method !== "GET")
        throw new WebsiteError(405, "此入口只接受GET。");
      if (!env.DISCORD_CLIENT_SECRET || !validId(env.DISCORD_APPLICATION_ID))
        return redirect("/auction/?login=unavailable#play");
      const browser = randomWebToken(),
        flow = await auth(env, {
          kind: "flowCreate",
          browserHash: await webDigest(browser),
          rateKey: await webDigest(
            request.headers.get("CF-Connecting-IP") || "unknown",
          ),
        });
      const digest = new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(flow.verifier),
          ),
        ),
        challenge = btoa(String.fromCharCode(...digest))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replace(/=+$/, "");
      const target = new URL("https://discord.com/oauth2/authorize");
      target.search = new URLSearchParams({
        client_id: env.DISCORD_APPLICATION_ID,
        response_type: "code",
        redirect_uri: url.origin + "/auction/auth/callback",
        scope: "identify guilds",
        state: flow.state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      return redirect(target.href, [
        cookie(FLOW, browser, WEB_FLOW_TTL / 1000),
      ]);
    }
    if (path === "/auction/auth/callback") {
      if (request.method !== "GET") throw new WebsiteError(405, "无效回调。");
      const state = url.searchParams.get("state"),
        browser = cookies(request)[FLOW],
        code = url.searchParams.get("code"),
        issuer = url.searchParams.get("iss");
      if (
        !TOKEN.test(state || "") ||
        !TOKEN.test(browser || "") ||
        (issuer && issuer !== "https://discord.com")
      )
        throw new WebsiteError(400, "登录验证失败，请重新登录。");
      const flow = await auth(env, {
        kind: "flowConsume",
        state,
        browserHash: await webDigest(browser),
      });
      if (!flow)
        throw new WebsiteError(400, "登录链接已过期或已使用，请重新登录。");
      if (url.searchParams.has("error"))
        return redirect("/auction/?login=cancelled#play", [
          cookie(FLOW, "", 0),
        ]);
      if (!code || code.length > 2048 || !env.DISCORD_CLIENT_SECRET)
        throw new WebsiteError(400, "登录配置尚未完成，请联系店主。");
      const r = await fetcher("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: env.DISCORD_APPLICATION_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          code,
          redirect_uri: url.origin + "/auction/auth/callback",
          code_verifier: flow.verifier,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new WebsiteError(401, "Discord登录未完成，请重新登录。");
      const token = await boundedJSON(r);
      if (
        typeof token.access_token !== "string" ||
        token.token_type?.toLowerCase() !== "bearer" ||
        !["identify", "guilds"].every((s) =>
          String(token.scope).split(" ").includes(s),
        ) ||
        !Number.isFinite(token.expires_in) ||
        token.expires_in <= 0
      )
        throw new WebsiteError(401, "Discord授权不完整，请重新登录。");
      const bearer = "Bearer " + token.access_token,
        [user, us, bs] = await Promise.all([
          discord(fetcher, "/users/@me", bearer),
          guildPages(fetcher, bearer),
          guildPages(fetcher, "Bot " + env.BOT_TOKEN),
        ]);
      if (!validId(user.id) || user.bot)
        throw new WebsiteError(401, "请使用本人的Discord账户登录。");
      const botGuilds = new Set(bs.map((g) => g.id)),
        guilds = us
          .filter((g) => validId(g.id) && botGuilds.has(g.id))
          .map((g) => ({
            id: g.id,
            name: String(g.name).slice(0, 100),
            icon: /^[a-f0-9_]+$/.test(g.icon || "") ? g.icon : null,
          }));
      const s = await auth(env, {
        kind: "sessionCreate",
        user: {
          id: user.id,
          name: String(user.global_name || user.username || "来客").slice(
            0,
            80,
          ),
          avatar: /^[a-f0-9_]+$/.test(user.avatar || "") ? user.avatar : null,
        },
        guilds,
        expires: Date.now() + Math.floor(token.expires_in * 1000),
      });
      const previous = cookies(request)[SESSION];
      if (TOKEN.test(previous || ""))
        await auth(env, {
          kind: "sessionDelete",
          hash: await webDigest(previous),
        });
      return redirect("/auction/#play", [
        cookie(SESSION, s.token, Math.floor((s.expires - Date.now()) / 1000)),
        cookie(FLOW, "", 0),
      ]);
    }
    if (path === "/auction/api/catalog") {
      if (!["GET", "HEAD"].includes(request.method))
        throw new WebsiteError(405, "此入口只接受GET。");
      const data = publicAuctionData(
        url.searchParams.get("tier") || "standard",
      );
      return request.method === "HEAD"
        ? new Response(null, {
            headers: {
              ...baseHeaders,
              "Cache-Control": "public, max-age=300",
              "Access-Control-Allow-Origin": "*",
            },
          })
        : reply(data, 200, {
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
          });
    }
    if (path === "/auction/api/me") {
      if (request.method !== "GET")
        throw new WebsiteError(405, "此入口只接受GET。");
      try {
        const s = await session(request, env);
        return reply({
          user: s.user,
          guilds: s.guilds,
          csrf: s.csrf,
          expires: s.expires,
          loginConfigured: !!env.DISCORD_CLIENT_SECRET,
        });
      } catch (e) {
        if (e.status === 401)
          return reply({
            user: null,
            guilds: [],
            loginConfigured: !!env.DISCORD_CLIENT_SECRET,
          });
        throw e;
      }
    }
    if (path.startsWith("/auction/api/")) {
      const s = await session(request, env),
        post = path === "/auction/api/action" || path === "/auction/api/logout";
      let body;
      if (post) {
        body = await requestBody(request);
        if (!sameWebToken(s.csrf, request.headers.get("X-Auction-CSRF")))
          throw new WebsiteError(403, "操作验证已失效，请刷新网页。");
      } else if (request.method !== "GET")
        throw new WebsiteError(405, "此入口只接受GET。");
      if (path === "/auction/api/logout") {
        await auth(env, {
          kind: "sessionDelete",
          hash: await webDigest(cookies(request)[SESSION]),
        });
        return reply({ ok: true }, 200, {
          "Set-Cookie": cookie(SESSION, "", 0),
        });
      }
      const guild = post ? body.guild : url.searchParams.get("guild");
      if (!validId(guild) || !s.guilds.some((g) => g.id === guild))
        throw new WebsiteError(403, "请选择已授权的小酒馆服务器。");
      // Mutations always verify live membership; reads reuse a server-side proof for 60s.
      if (post || !(s.checkedGuilds?.[guild] > Date.now())) {
        const member = await discord(
          fetcher,
          `/guilds/${guild}/members/${s.user.id}`,
          "Bot " + env.BOT_TOKEN,
        );
        if (member.user?.id !== s.user.id || member.user.bot || member.pending)
          throw new WebsiteError(403, "请先完成这个服务器的成员验证。");
        await auth(env, {
          kind: "membershipRemember",
          hash: await webDigest(cookies(request)[SESSION]),
          guild,
        });
      }
      const p = { guild, id: s.user.id, name: s.user.name, channel: "0" };
      let kind, action;
      if (path === "/auction/api/room") {
        kind = "room";
        action = "roomView";
        if (url.searchParams.has("roomId")) p.roomId = url.searchParams.get("roomId");
      } else if (path === "/auction/api/state") {
        kind = "game";
        action = "auctionView";
        if (url.searchParams.has("token"))
          p.token = url.searchParams.get("token");
      } else if (path === "/auction/api/wallet") {
        kind = "wallet";
        action = "auctionExchangeView";
      } else if (path === "/auction/api/inventory") {
        kind = "inventory";
        action = "auctionInventoryView";
        const page = Number(url.searchParams.get("page") || 0);
        if (!Number.isSafeInteger(page) || page < 0 || page > 100000)
          throw new WebsiteError(400, "无效页码。");
        p.page = page;
      } else if (path === "/auction/api/action") {
        action = body.action;
        const fields = Object.hasOwn(allowedActions, action)
          ? allowedActions[action]
          : null;
        if (
          !fields ||
          Object.keys(body).some(
            (k) => !["action", "guild", ...fields].includes(k),
          )
        )
          throw new WebsiteError(400, "无效游戏操作。");
        for (const key of fields)
          if (Object.hasOwn(body, key)) p[key] = body[key];
        if (action === "auctionStart") p.presentation = "warehouse";
        kind = action.startsWith("room")
          ? "room"
          : action.startsWith("auctionExchange")
            ? "wallet"
            : action.startsWith("auctionInventory")
              ? "inventory"
              : "game";
      } else throw new WebsiteError(404, "页面不存在。");
      try {
        return reply({
          kind,
          data: await tavernRequest(env, { ...p, action }),
        });
      } catch (e) {
        throw new WebsiteError(400, e.message);
      }
    }
    const file =
      path === "/auction/"
        ? "/auction/index.html"
        : /^\/auction\/assets\/(?:app\.js|tutorial\.mjs|reveal-loop\.mjs|reveal-stage\.mjs|seat-stage\.mjs|opponent-stage\.mjs|npc-(?:aji|laomao|zhanggui)-v1\.png|sound\.mjs|sfx\/[a-z0-9-]+\.wav|style\.css|favicon\.svg|warehouse-v1\.webp|appraisers-v1\.webp)$/.test(
              path,
            )
          ? path
          : null;
    if (!file) throw new WebsiteError(404, "页面不存在。");
    if (!["GET", "HEAD"].includes(request.method))
      throw new WebsiteError(405, "此入口只接受GET。");
    if (!env.ASSETS?.fetch) throw new WebsiteError(503, "网站资源尚未准备好。");
    const asset = await env.ASSETS.fetch(
      new Request(new URL(file, url.origin), { method: request.method }),
    );
    if (!asset.ok) throw new WebsiteError(404, "页面不存在。");
    const headers = new Headers(asset.headers);
    for (const [k, v] of Object.entries(baseHeaders)) headers.set(k, v);
    headers.set("Content-Security-Policy", csp);
    headers.set(
      "Cache-Control",
      file.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    );
    return new Response(asset.body, { status: asset.status, headers });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof WebsiteError ? e.message : "网站暂时繁忙，请稍后重试。",
      },
      e instanceof WebsiteError ? e.status : 503,
    );
  }
}
