import { createRevealLoop } from "./reveal-loop.mjs";
import { buildSeatStage } from "./seat-stage.mjs";
const PRIMARY = "https://auction.alicenekoqqq.cc.cd",
  sameOrigin = [PRIMARY, "https://discord-holdem.aliceneko.workers.dev"].includes(
    location.origin,
  ),
  LIVE = sameOrigin ? location.origin : PRIMARY;
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  escape = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  number = (x) =>
    Number(x ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 5 }),
  money = (x) => `${number(x)} 竞拍币`;
let meta,
  account = null,
  guild = "",
  game = null,
  wallet = null,
  inventory = null,
  view = "auction",
  playTier = "small",
  role = "sophie",
  catalogTier = "standard",
  quality = "all",
  size = "all",
  query = "",
  limit = 24,
  busy = false,
  epoch = 0,
  selected = new Set(),
  saleQuote = null,
  pendingExchange = null,
  demoCount = 0,
  revealLoop = null,
  revealPausedByHidden = false;
const catalogs = new Map(),
  images = new Map(),
  npc = ["你", "阿吉", "老猫", "掌柜"];
const imageFor = (x) =>
  images.get(x.id) || `${LIVE}/art/auction/${encodeURIComponent(x.id)}-v5.png`;
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 6500);
}
function dialog(html) {
  $("#dialog-content").innerHTML = html;
  $("#detail-dialog").showModal();
}
function closeDialog() {
  $("#detail-dialog").close();
}
function setBusy(value) {
  busy = value;
  document.body.classList.toggle("busy", value);
  $("#game-content").setAttribute("aria-busy", String(value));
  $("#guild-select")?.toggleAttribute("disabled", value);
}
async function api(path, body) {
  const opts = {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  };
  if (body) {
    opts.method = "POST";
    opts.headers["Content-Type"] = "application/json";
    opts.headers["X-Auction-CSRF"] = account?.csrf || "";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch("/auction/api/" + path, opts);
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("网络暂时繁忙，请稍后刷新。");
  }
  if (!r.ok) {
    if (r.status === 401) {
      account = null;
      game = wallet = inventory = null;
      renderAccount();
      renderPlay();
    }
    throw Error(data.error || "操作未完成，请刷新后重试。");
  }
  return data;
}
async function loadCatalog(tier) {
  if (catalogs.has(tier)) return catalogs.get(tier);
  const path = sameOrigin
    ? `/auction/api/catalog?tier=${tier}`
    : `./assets/catalog-${tier}.json`;
  const r = await fetch(path, { credentials: "omit" });
  if (!r.ok) throw Error("藏品册暂时无法打开，请稍后刷新。");
  const data = await r.json();
  catalogs.set(tier, data);
  for (const x of data.items) images.set(x.id, LIVE + x.image);
  return data;
}
function card(x, extra = "") {
  return `<button class="collectible q${x.quality}" data-item="${escape(x.id)}" ${extra}><div class="item-top"><b>${escape(meta.qualities[x.quality])} · ${escape(x.rarity)}</b><span>${x.width}×${x.height} · ${x.width * x.height}格</span></div><div class="prop-stage"><img loading="lazy" src="${escape(imageFor(x))}" alt="${escape(x.name)}"></div><div class="item-description"><h3>${escape(x.name)}</h3><p>${escape(x.flavor || x.category)}</p><span class="item-value">${number(x.value)}<small>竞拍币</small></span></div></button>`;
}
function showItem(id, ownedValue, unit = "竞拍币") {
  const data = catalogs.get(catalogTier) || meta,
    x =
      data.items.find((x) => x.id === id) ||
      meta.items.find((x) => x.id === id);
  if (!x) return;
  const p = x.chance;
  dialog(
    `<div class="detail-art"><img src="${escape(imageFor(x))}" alt="${escape(x.name)}"></div><p class="eyebrow q${x.quality}">${escape(meta.qualities[x.quality])}品质 · ${escape(x.rarity)} · ${x.width * x.height}格</p><h2 class="detail-title">${escape(x.name)}</h2><p class="detail-flavor">${escape(x.flavor || "")}</p><p class="detail-meta">${escape(x.category)} · ${x.width}×${x.height}<br>${ownedValue === undefined ? escape(meta.tiers[data.tier].name) + "区图鉴价值" : "本局固定价值"}：<strong>${number(ownedValue ?? x.value)} ${escape(unit)}</strong></p>${ownedValue === undefined ? `<div class="detail-odds"><div><small>同色占比</small><strong>${(p.within * 100).toFixed(4)}%</strong></div><div><small>每件平均概率</small><strong>${(p.slot * 100).toFixed(6)}%</strong></div><div><small>每仓出现概率</small><strong>${(p.warehouse * 100).toFixed(5)}%</strong></div></div><p class="mini-note">以上为${escape(meta.tiers[data.tier].name)}区新局概率。每件=期望出现件数/期望藏品数；每仓=至少出现一次，已计入大小仓、件数与大件容量限制。无保底，拍中才入仓。</p>` : ""}`,
  );
}
function renderHome() {
  const ids = ["tavern-1-26", "tavern-2-30", "tavern-3-30", "tavern-5-54"];
  $("#featured-items").innerHTML = ids
    .map((id) => card(meta.items.find((x) => x.id === id)))
    .join("");
}
function renderCatalog() {
  const data = catalogs.get(catalogTier);
  if (!data) return;
  $("#catalog-regions").innerHTML = Object.entries(meta.tiers)
    .map(
      ([key, t]) =>
        `<button data-catalog-tier="${key}" class="${key === catalogTier ? "active" : ""}">${escape(t.name)}区</button>`,
    )
    .join("");
  $("#quality-filters").innerHTML =
    `<button data-quality="all" class="${quality === "all" ? "active" : ""}">全部</button>` +
    meta.qualities
      .map(
        (q, i) =>
          `<button data-quality="${i}" class="q${i} ${String(i) === quality ? "active" : ""}">${q}</button>`,
      )
      .join("");
  const xs = data.items.filter(
    (x) =>
      (quality === "all" || x.quality === Number(quality)) &&
      (size === "all" ||
        (size === "large" && x.width * x.height > 4) ||
        x.width * x.height === Number(size)) &&
      (!query ||
        `${x.name} ${x.category} ${x.flavor}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  $("#catalog-count").textContent =
    `${meta.tiers[catalogTier].name}区 · 找到 ${xs.length} 件藏品`;
  $("#catalog-grid").innerHTML = xs.length
    ? xs
        .slice(0, limit)
        .map((x) => card(x))
        .join("")
    : '<div class="empty-state"><h2>这页暂时没有藏品</h2><p>换个关键词，或试试其他品质与尺寸。</p></div>';
  $("#catalog-more").innerHTML =
    xs.length > limit
      ? `<button class="button outline" data-more>继续翻阅 · 还有${xs.length - limit}件 ↓</button>`
      : "";
}
function renderRoles() {
  const notes = {
    sophie: "先掌握更多品质，逐轮缩小估值范围。",
    gabriella: "同时看见品质与尺寸，更容易识别占格线索。",
    viktor: "从高品质藏品的数量与总占格，判断整仓价值。",
  };
  $("#role-cards").innerHTML = Object.entries(meta.roles)
    .map(
      ([key, r], i) =>
        `<article class="role-card"><div class="role-portrait portrait-${i}" role="img" aria-label="${escape(r.name)}，本作鉴赏师形象"></div><div class="role-info"><small>信息能力 / 0${i + 1}</small><h2>${escape(r.name)}</h2><p>${escape(r.skill)}</p><p class="role-extra">${notes[key]}</p><a class="text-link" href="#play" data-role-pick="${key}">带上这份眼力 →</a></div></article>`,
    )
    .join("");
  $("#rules-tiers").innerHTML =
    `<table><thead><tr><th>区域</th><th>竞拍预算</th><th>入场费</th><th>单件出红</th></tr></thead><tbody>${Object.entries(
      meta.tiers,
    )
      .map(
        ([k, t], i) =>
          `<tr><td>${escape(t.name)}</td><td>${number(t.budget)}币</td><td>${number(t.fee)}币</td><td>${[1, 1.2, 1.5, 2][i]}%</td></tr>`,
      )
      .join("")}</tbody></table>`;
  $("#full-rules").textContent = meta.rules.replaceAll("**", "");
}
function route() {
  const hash = location.hash.slice(1) || "home",
    name = hash.startsWith("rule-")
      ? "rules"
      : ["home", "play", "catalog", "roles", "rules"].includes(hash)
        ? hash
        : "home";
  $$(".page").forEach((p) => (p.hidden = p.id !== `page-${name}`));
  $$(".site-header nav a").forEach((a) =>
    a.toggleAttribute("aria-current", a.hash === `#${name}`),
  );
  $$(".site-header nav a[aria-current]").forEach((a) =>
    a.setAttribute("aria-current", "page"),
  );
  document.title = `${{ home: "仓库盲拍", play: "拍卖大厅", catalog: "藏品图鉴", roles: "人物技能", rules: "拍卖指南" }[name]} · 红豆粉小酒馆`;
  if (name === "play") renderPlay();
  if (!hash.startsWith("rule-"))
    window.scrollTo({ top: 0, behavior: "instant" });
}
function renderAccount() {
  const auth = !!account?.user;
  $$("[data-login] span").forEach(
    (x) => (x.textContent = auth ? account.user.name : "Discord 登录"),
  );
  $("#game-tabs").hidden = !auth || !guild;
  $("#account-bar").hidden = !auth;
  if (auth) {
    $("#login-status").innerHTML = "";
    $("#account-bar").innerHTML =
      `<div class="account-name">${account.user.avatar ? `<img src="https://cdn.discordapp.com/avatars/${account.user.id}/${account.user.avatar}.png?size=64" alt="">` : '<span class="brand-mark">仓</span>'}<div><strong>${escape(account.user.name)}</strong><small>Discord 已登录 · 共通小酒馆资产</small></div></div><label>所在服务器<select id="guild-select" aria-label="选择服务器">${account.guilds.length ? account.guilds.map((g) => `<option value="${g.id}" ${g.id === guild ? "selected" : ""}>${escape(g.name)}</option>`).join("") : '<option value="">暂无共同服务器</option>'}</select></label><button class="logout" data-logout>退出登录</button>`;
  } else {
    const unavailable =
        account?.loginConfigured === false ||
        new URLSearchParams(location.search).get("login") === "unavailable",
      cancelled =
        new URLSearchParams(location.search).get("login") === "cancelled";
    $("#login-status").innerHTML =
      `${unavailable ? '<div class="notice">Discord登录正在准备中。你可以先浏览藏品、了解能力和规则，或查看下方开仓演示。</div>' : cancelled ? '<div class="notice">本次登录已取消，随时可以重新进入。</div>' : ""}<div class="login-panel"><div><p class="eyebrow">从你熟悉的小酒馆，走进来</p><h2>用Discord，打开你的仓库。</h2><p>登录后选择服务器，读取同一个小酒馆钱包、竞拍币和藏品。Discord里开始的拍卖，也可以在这里继续。</p><button class="button primary" data-login>Discord 登录 ↗</button><p class="mini-note">只读取身份与服务器列表，不读取聊天消息。</p></div><div class="login-art"><img src="${LIVE}/art/auction/tavern-5-53-v5.png" alt="装着街道的旅行箱"></div></div>`;
  }
}
function legend() {
  return `<div class="quality-legend">${meta.qualities.map((q, i) => `<span class="q${i}">${q}品质</span>`).join("")}</div>`;
}
function mountBoard(s, selector = "#warehouse-board") {
  const board = $(selector);
  if (!board) return;
  const b = s.board;
  board.style.aspectRatio = `${b.cols} / ${b.rows}`;
  board.style.backgroundSize = `${100 / b.cols}% 100%, 100% ${100 / b.rows}%`;
  board.innerHTML = "";
  b.slots.forEach((p, i) => {
    if (!p) return;
    const item = s.items?.[i],
      clue = s.info.items[i],
      quality = item ? item.quality : clue.quality,
      el = document.createElement(item ? "button" : "div");
    const fresh = item && s.reveal && s.reveal.last === i;
    el.className = `board-item ${quality === null ? "" : `q${quality}`} ${item ? "" : "unknown"}${fresh ? " just-revealed" : ""}`;
    el.style.left = `${(p.x / b.cols) * 100}%`;
    el.style.top = `${(p.y / b.rows) * 100}%`;
    el.style.width = `${((p.width ?? 1) / b.cols) * 100}%`;
    el.style.height = `${((p.height ?? 1) / b.rows) * 100}%`;
    el.setAttribute(
      "aria-label",
      item
        ? `${i + 1}. ${item.name}，${money(item.value)}`
        : `${i + 1}. ${quality === null ? "未知品质" : meta.qualities[quality] + "品质"}，${p.width ? `${p.width}×${p.height}格` : "轮廓未知"}`,
    );
    el.innerHTML = item
      ? `<img src="${escape(imageFor(item))}" alt="${escape(item.name)}"><span>${i + 1}</span>`
      : `?<span>${i + 1}</span>`;
    if (item)
      el.addEventListener("click", () =>
        showItem(
          item.id,
          item.value,
          s.currency === "tavern" ? "酒馆币" : "竞拍币",
        ),
      );
    board.append(el);
  });
}
function demo() {
  const ids = [
    "tavern-5-52",
    "tavern-1-26",
    "tavern-5-53",
    "tavern-2-30",
    "tavern-3-30",
    "tavern-5-54",
  ];
  const xs = ids
    .slice(0, demoCount)
    .map((id) => meta.items.find((x) => x.id === id));
  return `<div class="panel"><p class="demo-label">开仓演示 · 不读写钱包</p><h2>先看看，仓门后有什么。</h2><p>这是一组展示用藏品。真实拍卖需要登录，藏品与大小仓随机生成。</p><div class="featured-items">${xs.map((x) => card(x)).join("")}${demoCount < ids.length ? '<div class="empty-state"><h2>?</h2><p>下一件尚未揭晓</p></div>' : ""}</div><div class="demo-actions"><button class="button outline" data-demo>${demoCount >= ids.length ? "再看一次" : "揭晓一件演示藏品 →"}</button></div></div>`;
}
function summary() {
  return `<div class="wallet-summary"><div><small>可用酒馆币</small><strong>${number(wallet?.tavernBalance)}<span>酒馆币</span></strong></div><div><small>可用竞拍币</small><strong>${number(wallet?.auctionBalance)}<span>竞拍币</span></strong></div></div>`;
}
function setup() {
  return `<div class="panel"><p class="eyebrow">下一仓，轮到你出价。</p><h2>选择竞拍区域</h2><div class="setup-grid">${Object.entries(
    meta.tiers,
  )
    .map(
      ([k, t]) =>
        `<button class="tier-option ${k === playTier ? "active" : ""}" data-play-tier="${k}"><strong>${t.name}区</strong><p>入场费 ${number(t.fee)}</p><p>竞拍预算 ${number(t.budget)}</p><small>红色率 ${[1, 1.2, 1.5, 2][Object.keys(meta.tiers).indexOf(k)]}% / 件</small></button>`,
    )
    .join(
      "",
    )}</div><h3>选择信息能力</h3><div class="ability-options">${Object.entries(
    meta.roles,
  )
    .map(
      ([k, r]) =>
        `<button data-play-role="${k}" class="${k === role ? "active" : ""}">${r.name}</button>`,
    )
    .join(
      "",
    )}</div><p>${escape(meta.roles[role].skill)}</p><div class="setup-actions"><button class="button primary" data-start ${!game?.offerToken ? "disabled" : ""}>暂存预算并入场 ↗</button><span class="mini-note">需 ${money(meta.tiers[playTier].budget + meta.tiers[playTier].fee)}，含${number(meta.tiers[playTier].fee)}入场费</span><button class="text-link" data-view="wallet">先兑换竞拍币 →</button></div></div>`;
}
const gameMoney = (s, value) =>
  `${number(value)} ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}`;
async function unlockAfterReveal() {
  if (!guild) return;
  wallet = (await api(`wallet?guild=${guild}`)).data;
  inventory = (await api(`inventory?guild=${guild}`)).data;
  toast("开仓完成，藏品已解锁到个人仓库。");
}
function buildRevealLoop(token) {
  const loop = createRevealLoop({
    getStep: () => game?.session?.reveal?.count ?? 0,
    isComplete: () => Boolean(game?.session?.reveal?.complete),
    canRun: () =>
      game?.session?.token === token &&
      game.session.status !== "active" &&
      view === "auction" &&
      location.hash === "#play" &&
      !document.hidden &&
      !busy,
    reveal: async (step) => {
      // `step` comes from the loop and is always the server's own count.
      await mutation("auctionReveal", { token, step, all: false });
      if (game?.session?.reveal?.complete) await unlockAfterReveal();
      renderPlay();
    },
    onChange: () => renderPlay(),
    onStall: () => toast("开仓进度没有推进，已暂停。请刷新后继续。"),
    onError: (error) =>
      toast(error?.message || "自动揭露中断，请刷新后继续。"),
  });
  loop.token = token;
  return loop;
}
function ensureRevealLoop() {
  const s = game?.session,
    token = s && s.status !== "active" && !s.reveal?.complete ? s.token : null;
  if (!token) {
    if (revealLoop) revealLoop.dispose();
    revealLoop = null;
    revealPausedByHidden = false;
    return null;
  }
  if (revealLoop?.token === token) return revealLoop;
  if (revealLoop) revealLoop.dispose();
  revealPausedByHidden = false;
  revealLoop = buildRevealLoop(token);
  return revealLoop;
}
function revealControls(s) {
  const loop = ensureRevealLoop(),
    state = loop?.state || "idle",
    running = state === "running",
    paused = state === "paused",
    total = s.reveal.total || 1,
    pct = Math.min(100, Math.round((s.reveal.count / total) * 100));
  return `<div class="reveal-controls" data-reveal-state="${state}"><div class="reveal-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${s.reveal.total}" aria-valuenow="${s.reveal.count}"><span style="width:${pct}%"></span></div><p class="reveal-note">${running ? "逐件揭露中" : paused ? "已暂停，可继续逐件揭露" : "仓门已开，可以逐件揭露"} · ${s.reveal.count} / ${s.reveal.total}</p><div class="reveal-buttons"><button class="button primary wide" data-reveal="auto">${running ? "暂停揭露" : paused ? "继续揭露 →" : "自动逐件揭露 →"}</button><button class="button outline" data-reveal="next"${running ? " disabled" : ""}>单件</button><button class="button outline" data-reveal="all"${running ? " disabled" : ""}>全部打开</button></div></div>`;
}
function gameView() {
  const s = game?.session;
  if (!s || (s.status !== "active" && (!s.reveal || s.reveal.complete))) {
    if (revealLoop) revealLoop.dispose();
    revealLoop = null;
    return `${s ? resultView(s) : ""}${setup()}`;
  }
  const active = s.status === "active",
    r = s.result,
    subtotal = s.items?.filter(Boolean).reduce((n, x) => n + x.value, 0) || 0;
  return `<div class="play-layout"><div>${seatStrip(s)}<div class="board-heading"><h2>${escape(s.warehouse?.name || "仓库")} · ${s.itemCount}件</h2><p>${s.board.cols}×${s.board.rows}格板<br>${active ? "只展示已知品质与轮廓" : `开仓揭晓 ${s.reveal.count} / ${s.reveal.total}`}</p></div><div class="board-wrap"><div id="warehouse-board" class="warehouse-board"></div></div>${legend()}${history(s)}</div><aside class="panel">${
    active
      ? `<span class="auction-stage">第 ${s.round} / 5 轮 · ${meta.roles[s.role].name}</span><p>本局预算 ${gameMoney(s, s.budget)}<br>线索估值约</p><div class="line-value">${number(s.estimate)}</div><p>${s.currency === "tavern" ? "酒馆币" : "竞拍币"} · 参考价不保证盈利<br>剩余 <span data-countdown="${s.expires}"></span> · 同价优先 ${s.priority.map((i) => npc[i]).join(" / ")}</p><div class="bid-presets">${[
          [0.8, "估值80%"],
          [0.95, "估值95%"],
        ]
          .map(([v, l]) => {
            const b = Math.min(s.budget, Math.floor(s.estimate * v));
            return `<button data-bid="${b}">${l}<small>${gameMoney(s, b)}</small></button>`;
          })
          .join(
            "",
          )}<button data-bid="0">本轮不出价<small>0 ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}</small></button><button data-bid="${s.budget}">预算上限<small>${gameMoney(s, s.budget)}</small></button></div><form id="bid-form" class="bid-form"><label for="bid-amount">本轮暗标总价（整数）</label><input id="bid-amount" name="bid" type="number" min="0" max="${s.budget}" step="1" placeholder="输入报价" required inputmode="numeric"><button class="button primary wide" type="submit">封存本轮暗标 →</button></form><details class="clue-list"><summary>查看本局线索</summary>${s.info.highCount === null ? "" : `<p>紫 / 金 / 红合计 ${s.info.highCount} 件</p>`}${s.info.highCounts ? `<p>紫${s.info.highCounts[0]} / 金${s.info.highCounts[1]} / 红${s.info.highCounts[2]}</p>` : ""}${s.info.highArea === undefined ? "" : `<p>高品质总占格 ${s.info.highArea} 格</p>`}${s.info.items.map((c, i) => `<p>${i + 1}. ${c.quality === null ? "品质未知" : meta.qualities[c.quality] + "品质"} · ${c.width === null ? "轮廓未知" : `${c.width}×${c.height} / ${c.width * c.height}格`}</p>`).join("")}</details><button class="danger-link" data-leave>放弃余下竞拍</button>`
      : `<span class="auction-stage">仓门打开，惊喜揭晓。</span><h2>${r.winner === null ? "本局流拍" : `${npc[r.winner]}拍中`}</h2><p>成交价 ${gameMoney(s, r.price)}<br>已揭晓 ${s.reveal.count} / ${s.reveal.total}件</p><div class="line-value">${number(subtotal)}</div><p>已揭晓总值 · ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}<br>未开齐前不提前公开总值和最终盈亏。</p>${revealControls(s)}<p>资金已结算，开仓不再扣币。拍得的藏品将在揭晓后解锁到个人仓库。</p>`
  }</aside></div>`;
}
let seatSweptKey = null;
function seatStrip(s) {
  const stage = buildSeatStage({
      history: s.history,
      priority: s.priority,
      round: s.round,
      status: s.status,
      result: s.result,
      names: npc,
    }),
    key = `${s.token}:${stage.open ? stage.round : 0}`,
    sweep = key !== seatSweptKey,
    unit = s.currency === "tavern" ? "酒馆币" : "竞拍币";
  if (sweep) seatSweptKey = key;
  const labels = {
      sealed: "封存",
      pass: "不出价",
      top: stage.settled ? "已成交" : "最高",
      bid: "出价",
      won: "成交",
    },
    note = stage.settled
      ? stage.winner === null
        ? "本局流拍"
        : `${npc[stage.winner]} 以 ${number(stage.price)} ${unit} 成交`
      : stage.open
        ? stage.decided
          ? "本轮提前成交"
          : `第 ${stage.round} / ${stage.total} 轮已开价`
        : `第 ${stage.round} / ${stage.total} 轮 · 四位封存中`;
  return `<div class="seat-strip${sweep ? " sweep" : ""}${stage.settled ? " final" : ""}" data-round="${stage.round}"><div class="seat-strip-head"><span class="auction-stage">拍卖席</span><small>${note}</small></div><div class="seat-row">${stage.seats
    .map(
      (seat) =>
        `<div class="seat${seat.you ? " you" : ""}${seat.leader ? " leading" : ""}${seat.winner ? " won" : ""}" data-state="${seat.state}" style="--i:${seat.index}"><span class="seat-name">${escape(seat.name)}</span><strong class="seat-bid">${seat.bid === null ? "—" : number(seat.bid)}</strong><small class="seat-state">${labels[seat.state] || "—"}</small></div>`,
    )
    .join("")}</div>${stage.open && !stage.settled && stage.margin > 0 ? `<p class="seat-margin">领先 ${number(stage.margin)} ${unit} · 同价优先 ${s.priority.map((i) => npc[i]).join(" → ")}</p>` : ""}</div>`;
}
function history(s) {
  if (!s.history.length) return "";
  return `<div class="history"><table><thead><tr><th>轮次</th>${npc.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${s.history.map((h) => `<tr><td>第${h.round}轮${h.done ? " · 落锤" : ""}</td>${h.bids.map((b) => `<td>${number(b)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function resultView(s) {
  const r = s.result,
    won = r.winner === 0;
  return `${seatStrip(s)}<div class="panel"><p class="eyebrow">${r.winner === null ? "本局流拍" : `${npc[r.winner]}以 ${gameMoney(s, r.price)} 拍中`}</p><h2>这一仓，${r.net > 0 ? "赚到了。" : r.net < 0 ? "留点经验。" : "不赚不亏。"}</h2><div class="result-grid"><div><small>成交价</small><strong>${number(r.price)}</strong></div><div><small>仓库藏品总值</small><strong>${number(r.total)}</strong></div><div><small>本局盈亏 · 含入场费${won ? "与藏品价值" : ""}</small><strong class="${r.net >= 0 ? "profit" : "loss"}">${r.net > 0 ? "+" : ""}${number(r.net)}</strong></div><div><small>现金变化 · ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}</small><strong>${r.cashNet > 0 ? "+" : ""}${number(r.cashNet ?? r.net)}</strong></div></div><p>本局入场费 ${gameMoney(s, s.fee)}。${won ? (r.inventory ? "拍得藏品留在个人仓库，手动出售后才计入现金。" : "本局沿用开局时的自动折算规则，藏品已按当时规则结算。") : "未拍中只承担入场费。"} ${s.currency === "tavern" ? "这是旧版酒馆币对局，以上金额仍按当时规则计算。" : ""}</p><div class="board-wrap"><div id="warehouse-board" class="warehouse-board"></div></div>${history(s)}<button class="text-link" data-view="inventory">到个人仓库看看 →</button></div><br>`;
}
function inventoryView() {
  if (!inventory) return '<p class="loading">正在读取个人仓库…</p>';
  return `<div class="wallet-summary"><div><small>已揭晓藏品</small><strong>${inventory.count}<span>件</span></strong></div><div><small>藏品总值</small><strong>${number(inventory.value)}<span>竞拍币</span></strong></div><div><small>陈列中</small><strong>${inventory.displayed}<span>/ 6</span></strong></div></div>${inventory.pending ? `<div class="notice">还有${inventory.locked}件藏品待开仓。<button class="text-link" data-resume="${inventory.pending.token}">继续揭晓 →</button></div>` : ""}<div class="inventory-tools"><button class="button primary" data-sale-selected ${!selected.size ? "disabled" : ""}>出售已选 ${selected.size ? `· ${selected.size}件` : ""}</button><button class="button outline" data-display-selected ${selected.size !== 1 ? "disabled" : ""}>放入展示柜</button><label>按品质批卖 <select id="bulk-quality">${["白", "绿", "蓝", "紫", "金", "红", "全部"].map((x, i) => `<option value="${i}" ${i === 6 ? "selected" : ""}>${x}品质</option>`).join("")}</select></label><button class="button outline" data-sale-bulk>预览批卖</button></div>${inventory.items.length ? `<div class="inventory-grid">${inventory.items.map((u) => `<div class="owned-card"><label class="owned-select"><input type="checkbox" data-select="${u.id}" ${selected.has(u.id) ? "checked" : ""}>选择</label>${card(u.item, `data-owned="${u.id}"`)}<p class="owned-state">${u.display_slot !== null ? `展示中 · 第${u.display_slot + 1}格` : "已开仓"}</p></div>`).join("")}</div><div class="load-more"><button class="button outline" data-page="${inventory.page - 1}" ${inventory.page <= 0 ? "disabled" : ""}>← 上一页</button> <span class="mini-note">${inventory.page + 1} / ${inventory.pages}</span> <button class="button outline" data-page="${inventory.page + 1}" ${inventory.page + 1 >= inventory.pages ? "disabled" : ""}>下一页 →</button></div>` : '<div class="empty-state"><h2>仓库还空着。</h2><p>拍中并开仓后，喜欢的藏品就能留在这里。</p><button class="button outline" data-view="auction">去拍下一仓 →</button></div>'}`;
}
function cabinetView() {
  if (!inventory) return '<p class="loading">正在打开展示柜…</p>';
  return `<div class="section-heading"><div><p class="eyebrow">六格珍藏，留住喜欢</p><h2>你的藏品展示柜</h2></div><button class="text-link" data-view="inventory">从仓库挑一件 →</button></div><div class="cabinet"><div class="cabinet-grid">${Array.from(
    { length: 6 },
    (_, slot) => {
      const u = inventory.cabinet.find((x) => x.display_slot === slot);
      return `<div class="cabinet-slot"><small>0${slot + 1}</small>${u ? `<button data-item="${u.item.id}" data-cabinet-value="${u.item.value}"><img src="${escape(imageFor(u.item))}" alt="${escape(u.item.name)}"></button><h3>${escape(u.item.name)}</h3><p>${u.item.width * u.item.height}格 · ${money(u.item.value)}</p><button data-remove="${slot}">撤下，放回仓库</button>` : '<div class="cabinet-empty"><span>◇</span>等待一件珍藏</div>'}</div>`;
    },
  ).join(
    "",
  )}</div></div><p class="quiet-note">展示中的藏品会避开批量出售。撤下后回到个人仓库，固定价值保持不变。</p>`;
}
function walletView() {
  return `${summary()}<div class="panel wallet-panel"><p class="eyebrow">同一间小酒馆，同一个钱包</p><h2>竞拍币双向兑换</h2><div class="exchange-rate"><div>1<small>酒馆币</small></div><span>⇄</span><div>100,000<small>竞拍币</small></div></div><p>双向免手续费，按整数酒馆币兑换。不足100,000的竞拍币会保留。</p><form id="exchange-form"><label>兑换方向<select id="exchange-direction"><option value="buy">酒馆币 → 竞拍币</option><option value="sell">竞拍币 → 酒馆币</option></select></label><label>酒馆币数量（整数）<input id="exchange-amount" type="number" min="1" max="1000000" step="1" required placeholder="例如：100" inputmode="numeric"></label><button class="button primary wide" type="submit">预览本次兑换 →</button></form><p>这是所选服务器的小酒馆钱包。网页与Discord的兑换、入场费、退款和售出记录共通。</p></div>`;
}
function renderPlay() {
  if (!meta) return;
  $("#game-tabs").hidden = !account?.user || !guild;
  $$("[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view),
  );
  if (!account?.user) {
    $("#game-content").innerHTML = demo();
    return;
  }
  if (!guild) {
    $("#game-content").innerHTML =
      '<div class="empty-state"><h2>还没遇见共同的小酒馆。</h2><p>请先加入有红豆粉小酒馆机器人的服务器，再重新登录。</p></div>';
    return;
  }
  $("#game-content").innerHTML =
    view === "wallet"
      ? walletView()
      : view === "cabinet"
        ? cabinetView()
        : view === "inventory"
          ? inventoryView()
          : `${summary()}${game ? gameView() : '<p class="loading">正在恢复你的拍卖…</p>'}`;
  if (view === "auction" && game?.session) mountBoard(game.session);
  tick();
}
async function refreshAll() {
  if (!account?.user || !guild) return;
  const e = ++epoch,
    g = guild;
  const a = await api(`state?guild=${g}`);
  if (e !== epoch || g !== guild) return;
  const [w, i] = await Promise.all([
    api(`wallet?guild=${g}`),
    api(`inventory?guild=${g}&page=${inventory?.page || 0}`),
  ]);
  if (e !== epoch || g !== guild) return;
  game = a.data;
  wallet = w.data;
  inventory = i.data;
  selected = new Set();
  renderPlay();
}
async function mutation(action, fields = {}) {
  const g = guild,
    e = ++epoch,
    answer = await api("action", { action, guild: g, ...fields });
  if (g !== guild || e !== epoch) return;
  const data = answer.data;
  if (answer.kind === "game") game = data;
  else if (answer.kind === "wallet") wallet = data;
  else if (data.mode === "sale") saleQuote = data;
  else {
    inventory = data;
    selected = new Set(data.selected || []);
  }
  return answer;
}
async function perform(fn) {
  if (busy) return;
  setBusy(true);
  try {
    await fn();
  } catch (e) {
    toast(e.message);
  } finally {
    setBusy(false);
  }
}
async function selectOnServer() {
  if (!inventory) throw Error("请先刷新个人仓库。");
  await mutation("auctionInventorySelect", {
    token: inventory.token,
    selected: [...selected],
  });
}
async function quoteSale(quality) {
  if (quality === undefined) await selectOnServer();
  const fields = { token: inventory.token };
  if (quality !== undefined) fields.quality = quality;
  await mutation("auctionInventoryQuote", fields);
  const q = saleQuote;
  dialog(
    `<p class="eyebrow">出售前，再看一眼</p><h2 class="detail-title">出售 ${q.count} 件藏品？</h2><p class="detail-flavor">到账 ${money(q.total)}</p><p class="detail-meta">${q.items.map((u) => escape(u.item.name)).join("、")}${q.count > q.items.length ? ` 等${q.count}件` : ""}</p><p class="mini-note">展示中的藏品不会批量出售，每批最多500件。确认后这些藏品将从个人仓库移出。</p><div class="dialog-buttons"><button class="button outline" data-close>先留着</button><button class="button primary" data-confirm-sale>确认出售</button></div>`,
  );
}
function tick() {
  $$("[data-countdown]").forEach((el) => {
    const seconds = Math.max(
      0,
      Math.ceil((Number(el.dataset.countdown) - Date.now()) / 1000),
    );
    el.textContent = `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
  });
}
setInterval(tick, 1000);
let polling = false;
setInterval(async () => {
  if (
    busy ||
    polling ||
    !account?.user ||
    !guild ||
    view !== "auction" ||
    location.hash !== "#play" ||
    game?.session?.status !== "active"
  )
    return;
  polling = true;
  const g = guild,
    e = epoch,
    previous = game.session;
  try {
    const r = await api(`state?guild=${g}`);
    if (g === guild && e === epoch) {
      game = r.data;
      const next = game.session;
      if (
        next?.token !== previous.token ||
        next?.round !== previous.round ||
        next?.status !== previous.status
      ) {
        if (next?.status !== "active") {
          wallet = (await api(`wallet?guild=${g}`)).data;
          inventory = (await api(`inventory?guild=${g}`)).data;
        }
        if (g === guild && e === epoch) renderPlay();
      }
    }
  } catch (error) {
    toast(error.message);
  } finally {
    polling = false;
  }
}, 15000);

function login() {
  location.href = LIVE + "/auction/auth/login";
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("button,a");
  if (!b) return;
  if (b.matches(".dialog-close,[data-close]")) {
    closeDialog();
    return;
  }
  if (b.hasAttribute("data-login")) {
    if (account?.user) {
      location.hash = "play";
    } else login();
    return;
  }
  if (b.hasAttribute("data-item")) {
    const own = b.dataset.owned
      ? inventory?.items.find((x) => x.id === b.dataset.owned)
      : null;
    showItem(
      b.dataset.item,
      own?.item.value ??
        (b.hasAttribute("data-cabinet-value")
          ? Number(b.dataset.cabinetValue)
          : undefined),
    );
    return;
  }
  if (b.hasAttribute("data-role-pick")) {
    role = b.dataset.rolePick;
    view = "auction";
    return;
  }
  if (b.hasAttribute("data-catalog-tier")) {
    perform(async () => {
      const t = b.dataset.catalogTier;
      await loadCatalog(t);
      catalogTier = t;
      limit = 24;
      renderCatalog();
    });
    return;
  }
  if (b.hasAttribute("data-quality")) {
    quality = b.dataset.quality;
    limit = 24;
    renderCatalog();
    return;
  }
  if (b.hasAttribute("data-more")) {
    limit += 24;
    renderCatalog();
    return;
  }
  if (b.hasAttribute("data-demo")) {
    demoCount = demoCount >= 6 ? 0 : demoCount + 1;
    renderPlay();
    return;
  }
  if (!account?.user) return;
  if (b.hasAttribute("data-view")) {
    view = b.dataset.view;
    renderPlay();
    perform(async () => {
      const g = guild,
        e = ++epoch;
      if (view === "inventory" || view === "cabinet") {
        const data = await api(`inventory?guild=${g}`);
        if (g === guild && e === epoch) {
          inventory = data.data;
          selected = new Set();
        }
      } else if (view === "wallet") {
        const data = await api(`wallet?guild=${g}`);
        if (g === guild && e === epoch) wallet = data.data;
      } else {
        const data = await api(`state?guild=${g}`);
        if (g === guild && e === epoch) game = data.data;
      }
      if (g === guild && e === epoch) renderPlay();
    });
    return;
  }
  if (b.hasAttribute("data-play-tier")) {
    playTier = b.dataset.playTier;
    renderPlay();
    return;
  }
  if (b.hasAttribute("data-play-role")) {
    role = b.dataset.playRole;
    renderPlay();
    return;
  }
  if (b.hasAttribute("data-bid")) {
    $("#bid-amount").value = b.dataset.bid;
    $("#bid-amount").focus();
    return;
  }
  if (b.hasAttribute("data-reveal") && b.dataset.reveal === "auto") {
    const loop = ensureRevealLoop();
    if (!loop) return;
    if (loop.state === "running") loop.pause();
    else loop.start();
    renderPlay();
    return;
  }
  perform(async () => {
    if (b.hasAttribute("data-logout")) {
      await api("logout", {});
      account = null;
      guild = "";
      game = wallet = inventory = null;
      epoch++;
      renderAccount();
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-refresh")) {
      await refreshAll();
      toast("资产和拍卖进度已刷新。");
      return;
    }
    if (b.hasAttribute("data-start")) {
      await mutation("auctionStart", {
        token: game.offerToken,
        role,
        tier: playTier,
      });
      wallet = (await api(`wallet?guild=${guild}`)).data;
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-leave")) {
      dialog(
        '<h2 class="detail-title">放弃余下竞拍？</h2><p class="detail-meta">余下轮次会按不出价处理，按实际结果退回未用预算，入场费不退。</p><div class="dialog-buttons"><button class="button outline" data-close>继续看看</button><button class="button primary" data-confirm-leave>确认离场</button></div>',
      );
      return;
    }
    if (b.hasAttribute("data-confirm-leave")) {
      await mutation("auctionLeave", {
        token: game.session.token,
        round: game.session.round,
      });
      closeDialog();
      await refreshAll();
      return;
    }
    if (b.hasAttribute("data-reveal")) {
      if (revealLoop) {
        revealLoop.dispose();
        revealLoop = null;
      }
      const s = game.session;
      await mutation("auctionReveal", {
        token: s.token,
        step: s.reveal.count,
        all: b.dataset.reveal === "all",
      });
      if (game.session.reveal.complete) await unlockAfterReveal();
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-resume")) {
      game = (await api(`state?guild=${guild}&token=${b.dataset.resume}`)).data;
      view = "auction";
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-page")) {
      inventory = (
        await api(`inventory?guild=${guild}&page=${Number(b.dataset.page)}`)
      ).data;
      selected = new Set();
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-sale-selected")) {
      await quoteSale();
      return;
    }
    if (b.hasAttribute("data-sale-bulk")) {
      await quoteSale(Number($("#bulk-quality").value));
      return;
    }
    if (b.hasAttribute("data-confirm-sale")) {
      await mutation("auctionInventorySell", { token: saleQuote.token });
      closeDialog();
      wallet = (await api(`wallet?guild=${guild}`)).data;
      renderPlay();
      toast("藏品已售出，竞拍币已到账。");
      return;
    }
    if (b.hasAttribute("data-display-selected")) {
      await selectOnServer();
      dialog(
        `<p class="eyebrow">让喜欢的藏品留下来</p><h2 class="detail-title">选择展示位置</h2><div class="slot-picker">${Array.from(
          { length: 6 },
          (_, n) => {
            const u = inventory.cabinet.find((x) => x.display_slot === n);
            return `<button data-place="${n}">${u ? "替换" : "放入"}第${n + 1}格<small>${escape(u?.item.name || "当前空位")}${u ? "<br>原藏品将放回仓库" : ""}</small></button>`;
          },
        ).join("")}</div>`,
      );
      return;
    }
    if (b.hasAttribute("data-place")) {
      await mutation("auctionInventoryPlace", {
        token: inventory.token,
        slot: Number(b.dataset.place),
      });
      closeDialog();
      view = "cabinet";
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-remove")) {
      await mutation("auctionInventoryRemove", {
        token: inventory.token,
        slot: Number(b.dataset.remove),
      });
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-confirm-exchange")) {
      await mutation("auctionExchangeConvert", pendingExchange);
      pendingExchange = null;
      closeDialog();
      game = (await api(`state?guild=${guild}`)).data;
      renderPlay();
      toast("兑换完成，钱包已同步。");
    }
  });
});
document.addEventListener("change", (event) => {
  const t = event.target;
  if (t.id === "guild-select") {
    perform(async () => {
      epoch++;
      guild = t.value;
      game = wallet = inventory = null;
      selected = new Set();
      renderAccount();
      renderPlay();
      await refreshAll();
    });
  } else if (t.hasAttribute("data-select")) {
    if (t.checked) selected.add(t.dataset.select);
    else selected.delete(t.dataset.select);
    const b = $("[data-sale-selected]");
    b.disabled = !selected.size;
    b.textContent = `出售已选${selected.size ? ` · ${selected.size}件` : ""}`;
    $("[data-display-selected]").disabled = selected.size !== 1;
  } else if (t.id === "size-filter") {
    size = t.value;
    limit = 24;
    renderCatalog();
  }
});
$("#catalog-search").addEventListener("input", (event) => {
  query = event.target.value;
  limit = 24;
  renderCatalog();
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "bid-form") {
    event.preventDefault();
    const bid = Number($("#bid-amount").value);
    if (!Number.isSafeInteger(bid) || bid < 0 || bid > game.session.budget)
      return toast("请输入预算内的整数报价。");
    perform(async () => {
      const s = game.session;
      await mutation("auctionBid", { token: s.token, round: s.round, bid });
      if (game.session.status !== "active") {
        wallet = (await api(`wallet?guild=${guild}`)).data;
        inventory = (await api(`inventory?guild=${guild}`)).data;
      }
      renderPlay();
    });
  } else if (event.target.id === "exchange-form") {
    event.preventDefault();
    const amount = Number($("#exchange-amount").value),
      direction = $("#exchange-direction").value;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000)
      return toast("请输入1至1,000,000的整数酒馆币数量。");
    pendingExchange = { token: wallet.token, direction, amount };
    dialog(
      `<p class="eyebrow">确认双向兑换</p><h2 class="detail-title">${direction === "buy" ? "换入竞拍币" : "换回酒馆币"}</h2><p class="detail-meta">${direction === "buy" ? `扣除 ${number(amount)} 酒馆币，获得 ${number(amount * 100000)} 竞拍币。` : `扣除 ${number(amount * 100000)} 竞拍币，获得 ${number(amount)} 酒馆币。`}<br>手续费：0</p><div class="dialog-buttons"><button class="button outline" data-close>取消</button><button class="button primary" data-confirm-exchange>确认兑换</button></div>`,
    );
  }
});
$("#detail-dialog").addEventListener("click", (event) => {
  if (event.target === $("#detail-dialog")) {
    const r = event.target.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeDialog();
  }
});
window.addEventListener("hashchange", route);
// Auto-reveal stops while the tab is hidden and only resumes after the session
// has been re-read from the server, so a background tab can never double-open.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (revealLoop?.state === "running") {
      revealPausedByHidden = true;
      revealLoop.pause();
    }
    return;
  }
  if (!revealPausedByHidden || !revealLoop || !guild) return;
  revealPausedByHidden = false;
  const loop = revealLoop;
  (async () => {
    try {
      game = (await api(`state?guild=${guild}`)).data;
      if (revealLoop === loop && loop.state === "paused") {
        renderPlay();
        loop.start();
      } else renderPlay();
    } catch {
      renderPlay();
    }
  })();
});
async function boot() {
  try {
    meta = await loadCatalog("standard");
    renderHome();
    renderCatalog();
    renderRoles();
    if (sameOrigin) {
      account = await api("me");
      if (account.user) {
        guild = account.guilds[0]?.id || "";
        playTier = "small";
      }
    }
    renderAccount();
    route();
    if (account?.user && guild) await refreshAll();
  } catch (e) {
    toast(e.message);
    $("#game-content").innerHTML =
      '<div class="notice error">页面暂时未能完整加载，请稍后刷新。</div>';
  }
}
boot();
