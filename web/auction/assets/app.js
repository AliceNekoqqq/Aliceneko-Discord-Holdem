import { createAuctionTutorial, tutorialView } from "./tutorial.mjs";
import { createRevealLoop } from "./reveal-loop.mjs";
import { rareRevealMoment, createRevealPresentation } from "./reveal-stage.mjs";
import { buildSeatStage } from "./seat-stage.mjs";
import { buildOpponentReaction } from "./opponent-stage.mjs";
import { initSound, play, soundEnabled, setSoundEnabled } from "./sound.mjs";
const PRIMARY = "https://auction.alicenekoqqq.cc.cd",
  sameOrigin = [
    PRIMARY,
    "https://discord-holdem.aliceneko.workers.dev",
  ].includes(location.origin),
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
  playTheme = "random",
  roomTheme = "random",
  guideTheme = "living",
  catalogTheme = "all",
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
  revealPausedByHidden = false,
  revealResumeEpoch = 0;
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
function pauseReveal() {
  revealResumeEpoch++;
  revealPausedByHidden = false;
  revealLoop?.pause();
  revealPresentation?.clear();
}
function dialog(html) {
  pauseReveal();
  $("#dialog-content").innerHTML = html;
  $("#detail-dialog").showModal();
}
function closeDialog() {
  $("#detail-dialog").close();
}
function setBusy(value) {
  if (value) pauseReveal();
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
      game = wallet = inventory = roomState = null;
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
    `<div class="detail-art"><img src="${escape(imageFor(x))}" alt="${escape(x.name)}"></div><p class="eyebrow q${x.quality}">${escape(meta.qualities[x.quality])}品质 · ${escape(x.rarity)} · ${x.width * x.height}格</p><h2 class="detail-title">${escape(x.name)}</h2><p class="detail-flavor">${escape(x.flavor || "")}</p><p class="detail-meta">${escape(x.category)} · ${x.width}×${x.height}<br>${ownedValue === undefined ? escape(meta.tiers[data.tier].name) + "区图鉴价值" : "本局固定价值"}：<strong>${number(ownedValue ?? x.value)} ${escape(unit)}</strong></p>${ownedValue === undefined ? `<div class="detail-odds"><div><small>同色占比</small><strong>${(p.within * 100).toFixed(4)}%</strong></div><div><small>随机主题 · 每件平均概率</small><strong>${(p.slot * 100).toFixed(6)}%</strong></div><div><small>每仓出现概率</small><strong>${(p.warehouse * 100).toFixed(5)}%</strong></div></div>${x.chanceByTheme?`<div class="theme-odds">${(meta.themes||[]).map(t=>`<span>${escape(t.name)}<strong>${(x.chanceByTheme[t.id].slot*100).toFixed(6)}%</strong></span>`).join('')}</div>`:""}<p class="mini-note">各主题均为单件概率；默认统计按随机主题平均。${escape(meta.tiers[data.tier].name)}区新局概率 · 无保底，拍中才入仓。</p>` : ""}`,
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
  const affinity=(meta.themes||[]).find(t=>t.id===catalogTheme);
  $("#catalog-theme").innerHTML=`<option value="all">全部类别</option>${(meta.themes||[]).map(t=>`<option value="${t.id}"${catalogTheme===t.id?' selected':''}>${escape(t.name)}偏好</option>`).join('')}`;
  $("#catalog-theme-note").textContent=affinity?`${affinity.name}偏好：${affinity.categories.join(" / ")}。这里只筛选加权类别，其他类别仍可能出现在该主题仓；各主题概率请点开藏品查看。`:"按主题偏好类别浏览；主题仓仍保留全部类别。";
  const xs = data.items.filter(
    (x) =>
      (!affinity || affinity.categories.includes(x.category)) &&
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
    zhou: "先确认仓里有没有大件，再慢慢看清其余。",
    lucia: "前四轮忍手，最后一轮把账本摊开。",
  };
  const withArt = ["sophie", "gabriella", "viktor"];
  $("#role-cards").innerHTML = Object.entries(meta.roles)
    .map(
      ([key, r], i) =>
        `<article class="role-card">${withArt.includes(key) ? `<div class="role-portrait portrait-${withArt.indexOf(key)}" role="img" aria-label="${escape(r.name)}，本作鉴赏师形象"></div>` : `<div class="role-portrait portrait-fallback" role="img" aria-label="${escape(r.name)}"><span>${escape(r.name.slice(0, 1))}</span></div>`}<div class="role-info"><small>信息能力 / 0${i + 1}</small><h2>${escape(r.name)}</h2><p>${escape(r.skill)}</p><p class="role-extra">${escape(r.tip||notes[key])}</p><a class="text-link" href="#play" data-role-pick="${key}">带上这份眼力 →</a></div></article>`,
    )
    .join("");
  renderOpponents();
  $("#rules-tiers").innerHTML =
    `<table><thead><tr><th>区域</th><th>竞拍预算</th><th>入场费</th><th>单件出红</th></tr></thead><tbody>${Object.entries(
      meta.tiers,
    )
      .map(
        ([k, t], i) =>
          `<tr><td>${escape(t.name)}</td><td>${number(t.budget)}币</td><td>${number(t.fee)}币</td><td>${redOdds(k)}%</td></tr>`,
      )
      .join("")}</tbody></table>`;
  $("#full-rules").textContent = meta.rules.replaceAll("**", "");
}
let tutorial=null;
function renderTutorial(focus=false) {
  if(!meta)return;
  try {
    tutorial??=createAuctionTutorial(meta);
    $("#tutorial-content").innerHTML=tutorialView(tutorial.view,meta);
    if(focus){const heading=$("#tutorial-step-title");heading?.focus?.({preventScroll:true});heading?.scrollIntoView?.({block:"start",behavior:"instant"});}
  }catch(error){$("#tutorial-content").textContent=error.message;}
}
function tutorialDispatch(action,value) {
  if(location.hash!=="#tutorial"||!tutorial)return;
  if(action==='fill-bid'){
    const input=$("#tutorial-bid");if(input&&tutorial.view.phase==='bid'){input.value=String(tutorial.view.recommended);input.focus?.();}return;
  }
  const before=tutorial.view.phase,changed=tutorial.act(action,value);
  if(!changed){$("#tutorial-feedback").textContent=tutorial.view.feedback;return;}
  renderTutorial(before!==tutorial.view.phase);
  if(before===tutorial.view.phase)$$("[data-tutorial]").find(b=>b.dataset.tutorial===action&&(value===undefined||b.dataset.index===String(value)))?.focus?.({preventScroll:true});
}
function route() {
  if (location.hash !== "#play") {pauseReveal();stopRoomTimer();}
  const hash = location.hash.slice(1) || "home",
    name = hash.startsWith("rule-")
      ? "rules"
      : ["home", "play", "catalog", "roles", "rules", "tutorial"].includes(hash)
        ? hash
        : "home";
  $$(".page").forEach((p) => (p.hidden = p.id !== `page-${name}`));
  $$(".site-header nav a").forEach((a) =>
    a.toggleAttribute("aria-current", a.hash === `#${name}`),
  );
  $$(".site-header nav a[aria-current]").forEach((a) =>
    a.setAttribute("aria-current", "page"),
  );
  document.title = `${{ home: "仓库盲拍", play: "拍卖大厅", catalog: "藏品图鉴", roles: "人物技能", rules: "拍卖指南", tutorial:"新手教程" }[name]} · 红豆粉小酒馆`;
  document.body.classList.toggle("game-route", name === "play");
  if (name === "play") renderPlay();
  if (name === "tutorial") renderTutorial();
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
      `${pendingRoomInvite?`<div class="notice">收到房间 ${escape(pendingRoomInvite)} 的邀请。登录后选择朋友所在的服务器，再确认加入。</div>`:""}${unavailable ? '<div class="notice">Discord登录正在准备中。你可以先浏览藏品、了解能力和规则，或查看下方开仓演示。</div>' : cancelled ? '<div class="notice">本次登录已取消，随时可以重新进入。</div>' : ""}<div class="login-panel"><div><p class="eyebrow">从你熟悉的小酒馆，走进来</p><h2>用Discord，打开你的仓库。</h2><p>同一个钱包，同一个仓库。这边开的局，Discord 里也能接着打。</p><button class="button primary" data-login>Discord 登录 ↗</button><p class="mini-note">只读取身份与服务器列表。</p></div><div class="login-art"><img src="${LIVE}/art/auction/tavern-5-53-v5.png" alt="装着街道的旅行箱"></div></div>`;
  }
}
// Red chance per item comes from the live region table, so tuning the odds
// never leaves stale percentages on the site.
function redOdds(tier) {
  const w = meta?.regions?.[tier]?.quality;
  return Number.isFinite(w?.[5]) ? (w[5] / 10).toFixed(1) : "—";
}// Opening notice: the warehouse announces only its best quality tier.
function noticeLine(s) {
  const top = s?.notice?.top;
  if (!Number.isInteger(top) || !meta.qualities?.[top]) return "";
  return `<p class="notice-line">开局公示 · 本仓最高品质 <strong class="q${top}">${meta.qualities[top]}</strong></p>`;
}
function warehouseIntel(s) {
  if(!s?.publicInfo)return noticeLine(s);
  const theme=s.theme;
  return `<section class="warehouse-intel" data-theme="${escape(theme?.id||'mixed')}" aria-label="全桌公共情报"><div class="intel-heading"><strong>${escape(theme?.name||'仓库情报')}</strong><span>全桌共享</span></div>${theme?`<p class="intel-affinity">${theme.categories.map(escape).join(' / ')} · 同品质抽取权重 ×${theme.multiplier}</p>`:""}<ol>${s.publicInfo.clues.map(c=>`<li><span>第${c.round}轮</span>${escape(c.text)}</li>`).join('')}</ol>${s.round<5?'<p class="mini-note">下一轮追加公共情报，所有人同步获得。</p>':''}</section>`;
}
// Decorative rooms depend only on the public theme ID. Never inspect hidden goods.
const THEME_SCENES=Object.freeze({
  living:{number:'01',place:'日用收纳间',drawing:`<path class="scene-fill" d="M35 67h99v82H35z"/><path d="M35 94h99M35 122h99M84 67v82"/><rect class="scene-paper" x="43" y="75" width="32" height="13" rx="3"/><rect class="scene-accent" x="94" y="74" width="30" height="15" rx="3"/><path d="M101 74v15M43 108h32m-16-7v15"/><rect class="scene-paper" x="45" y="130" width="27" height="13" rx="2"/><rect class="scene-accent" x="95" y="129" width="29" height="14" rx="2"/><path class="scene-accent" d="M167 120h31l-4 29h-23z"/><path d="M182 122V87m0 21c-23-1-24-20-24-20 20 0 24 20 24 20m0-9c20 0 23-24 23-24-22 1-23 24-23 24"/><path class="scene-paper" d="M218 114h29v35h-29z"/><path d="M220 114v-11h25v11m-20 16h15"/>`},
  dining:{number:'02',place:'餐具备藏室',drawing:`<path class="scene-fill" d="M31 104h213v45H31z"/><path d="M31 113h213m-143 0v36m70-36v36m-119-25h25m44 0h27m44 0h24"/><path class="scene-paper" d="M39 65h58v32H39z"/><path d="M45 72h27v18H45m52-17h9v16h-9"/><circle class="scene-accent" cx="86" cy="74" r="3"/><path class="scene-paper" d="M126 85h23v17h-23z"/><path d="M149 88h8v9h-8m-17-23v5m9-5v5M33 54h113"/><path d="M43 54v-8m18 8v-8m19 8v-8"/><path class="scene-accent" d="M181 73h39l-4 29h-31z"/><path d="M188 72c-6-26 23-25 16-9m-6 10c24-12 30 10 14 17"/>`},
  arts:{number:'03',place:'文艺陈列室',drawing:`<path class="scene-fill" d="M35 36h80v65H35z"/><path class="scene-paper" d="M43 44h64v49H43z"/><circle class="scene-accent" cx="88" cy="58" r="7"/><path d="m44 89 20-23 16 16 9-10 17 17"/><path class="scene-fill" d="M144 43h47v57h-47z"/><path class="scene-paper" d="M151 50h33v43h-33z"/><path d="M158 82V62m0 11 9 8 10-19"/><path class="scene-accent" d="M208 109V78c-17-5-20 20-9 26-21 22-6 45 13 41 14-3 19-25 3-36z"/><path d="m207 81 12-24m-5 18 10 4M39 119h140v30H39z"/><path class="scene-paper" d="M47 108h24v11H47zM76 98h12v21H76zM92 104h11v15H92z"/><circle class="scene-accent" cx="146" cy="132" r="10"/><circle cx="146" cy="132" r="3"/>`},
  tech:{number:'04',place:'数码工坊',drawing:`<path class="scene-fill" d="M34 103h211v12H34z"/><path d="M44 115v34m191-34v34M40 40h187v45H40zM51 51h5m15 0h5m15 0h5m15 0h5m15 0h5m15 0h5m15 0h5m15 0h5m15 0h5M56 63v12m20-12v12m20-12v12"/><path class="scene-paper" d="M111 60h65v37h-65z"/><path class="scene-accent" d="M117 66h53v25h-53z"/><path d="m125 82 9-7 9 10 17-13m-16 25v6m-11 0h23"/><path class="scene-fill" d="M49 85h45v18H49z"/><path d="M59 85v-8h24v8M49 94h45m-25-3h6"/><path class="scene-paper" d="M190 77h39v26h-39z"/><circle class="scene-accent" cx="201" cy="90" r="6"/><path d="M215 84h7m-7 7h7m-6-14 9-13"/>`},
});
function themeArt(id) {
  const scene=Object.hasOwn(THEME_SCENES,id)?THEME_SCENES[id]:null;if(!scene)return '';
  return `<svg class="theme-art" viewBox="0 0 280 170" aria-hidden="true" focusable="false"><path class="scene-wall" d="M14 18h252v131H14z"/><path class="scene-floor" d="M14 149h252l-19 15H33z"/><path class="scene-window" d="M231 29h22v29h-22z"/><path d="M242 29v29m-11-14h22"/>${scene.drawing}<path d="M18 149h244"/></svg>`;
}
function themeScene(id,{preview=false}={}) {
  const theme=(meta.themes||[]).find(t=>t.id===id),scene=Object.hasOwn(THEME_SCENES,id)?THEME_SCENES[id]:null;
  if(!theme||!scene)return preview?'<section class="theme-random"><strong>随机主题</strong><span>四种主题等概率，入场后确定本仓场景。</span><small>类别权重随主题变化，品质概率不变。</small></section>':'';
  return `<section class="theme-scene" data-scene="${id}" aria-label="${escape(theme.name)}场景${preview?'预览':''}">${themeArt(id)}<div class="theme-scene-copy"><p class="eyebrow">主题场景 / ${scene.number}${preview?' · 预览':''}</p><h3>${scene.place}</h3><strong>${escape(theme.name)}</strong><div class="theme-chips">${theme.categories.map(c=>`<span>${escape(c)}</span>`).join('')}</div><p>同品质内，上述类别抽取权重 ×${theme.multiplier}；其他类别也可能出现。</p><small>装饰场景，不展示本仓藏品。</small></div></section>`;
}
function themeGuide() {
  return `<section class="panel theme-guide" aria-label="四类主题仓预览"><p class="eyebrow">四类主题仓</p><h2>先选想逛的仓，再看里面的线索。</h2><div class="theme-guide-tabs" role="group" aria-label="预览主题">${(meta.themes||[]).filter(t=>THEME_SCENES[t.id]).map(t=>`<button data-theme-guide="${t.id}" aria-pressed="${guideTheme===t.id}">${escape(t.name)}</button>`).join('')}</div><div id="theme-guide-scene">${themeScene(guideTheme,{preview:true})}</div><button class="text-link" data-theme-catalog="${guideTheme}">查看这个主题的偏好类别 →</button><p class="mini-note">预览不入场；实际仓型与藏品仍由本局确定。</p></section>`;
}
function themeOptions(value='random') {
  return `<option value="random"${value==='random'?' selected':''}>随机主题</option>${(meta.themes||[]).map(t=>`<option value="${t.id}"${value===t.id?' selected':''}>${escape(t.name)} · ${t.categories.map(escape).join('/')}</option>`).join('')}`;
}
function legend() {
  return `<div class="quality-legend">${meta.qualities.map((q, i) => `<span class="q${i}">${q}品质</span>`).join("")}</div>`;
}
// Portrait card for the appraiser the player brought into this session.
function appraiserCard(s) {
  const role = meta.roles?.[s.role];
  if (!role) return "";
  const withArt = ["sophie", "gabriella", "viktor"];
  const portrait = withArt.includes(s.role)
    ? `<div class="appraiser-portrait ${s.role}" role="img" aria-label="${escape(role.name)}"></div>`
    : `<div class="appraiser-portrait fallback" role="img" aria-label="${escape(role.name)}"><span>${escape(role.name.slice(0, 1))}</span></div>`;
  return `<div class="appraiser-card">${portrait}<div class="appraiser-meta"><strong>${escape(role.name)}</strong><small>${escape((s.skillVersion??meta.skillVersion??2)<3?((s.skillVersion??2)<2&&role.skillV1?role.skillV1:role.legacySkill||role.skill):role.skill)}</small>${role.focus?`<span class="appraiser-focus">${escape(role.focus)}</span>`:''}</div></div>`;
}
// Column letters and row numbers around the warehouse grid. Labels are built
// from the session's own board size, so 8x4, 8x6 and 10x8 all read correctly.
function frameBoard(board, b) {
  const host = board.parentElement;
  if (!host) return;
  let frame = host.querySelector(":scope > .board-frame");
  if (!frame) {
    frame = document.createElement("div");
    frame.className = "board-frame";
    const cols = document.createElement("div");
    cols.className = "board-col-labels";
    cols.setAttribute("aria-hidden", "true");
    const rows = document.createElement("div");
    rows.className = "board-row-labels";
    rows.setAttribute("aria-hidden", "true");
    board.replaceWith(frame);
    frame.append(cols, rows, board);
  }
  const cols = frame.querySelector(".board-col-labels"),
    rows = frame.querySelector(".board-row-labels");
  cols.replaceChildren(
    ...Array.from({ length: b.cols }, (_, i) => {
      const n = document.createElement("span");
      n.textContent = String.fromCharCode(65 + i);
      return n;
    }),
  );
  rows.replaceChildren(
    ...Array.from({ length: b.rows }, (_, i) => {
      const n = document.createElement("span");
      n.textContent = String(i + 1);
      return n;
    }),
  );
}
function mountBoard(s, selector = "#warehouse-board") {
  const board = $(selector);
  if (!board) return;
  const b = s.board;
  frameBoard(board, b);
  board.style.aspectRatio = `${b.cols} / ${b.rows}`;
  board.style.backgroundSize = `${100 / b.cols}% 100%, 100% ${100 / b.rows}%`;
  board.innerHTML = "";
  b.slots.forEach((p, i) => {
    if (!p) return;
    const item = s.items?.[i],
      clue = s.info.items[i],
      quality = item ? item.quality : clue.quality,
      el = document.createElement(item ? "button" : "div");
    const fresh = item && s.reveal && s.reveal.last === i,spinning=spinningIndex()===i;
    el.className = `board-item ${quality === null ? "" : `q${quality}`} ${item ? "" : "unknown"}${fresh ? " just-revealed" : ""}`;
    el.style.left = `${(p.x / b.cols) * 100}%`;
    el.style.top = `${(p.y / b.rows) * 100}%`;
    el.style.width = `${((p.width ?? 1) / b.cols) * 100}%`;
    el.style.height = `${((p.height ?? 1) / b.rows) * 100}%`;
    el.setAttribute(
      "aria-label",
      spinning?`第${i+1}件正在揭晓`:item
        ? `${i + 1}. ${item.name}，${money(item.value)}`
        : `${i + 1}. ${quality === null ? "未知品质" : meta.qualities[quality] + "品质"}，${p.width ? `${p.width}×${p.height}格` : "轮廓未知"}${clue.category?`，类别：${clue.category}`:""}`,
    );
    el.innerHTML = item
      ? spinning
        ? '<span class="spin-ring" role="status" aria-label="正在揭晓"></span>'
        : `<img src="${escape(imageFor(item))}" alt="${escape(item.name)}"><span>${i + 1}</span>`
      : `?<span>${i + 1}</span>`;
    if (item && spinning) {el.classList.add("spinning");el.disabled=true;}
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
function demoGoods(){return [meta.items.find(x=>x.quality===4),...['tavern-5-52','tavern-1-26','tavern-5-53','tavern-2-30','tavern-3-30'].map(id=>meta.items.find(x=>x.id===id))].filter(Boolean);}
function demoReceipt(count){return {token:`demo-${demoRun}`,status:'settled',reveal:{count},items:demoGoods().map((x,i)=>i<count?x:null)};}
function demo() {
  const goods=demoGoods(),xs=goods.slice(0,demoCount);
  return `<div class="panel"><p class="demo-label">开仓演示 · 不碰你的钱包</p><h2>先开一个，看看里面有什么。</h2><p>固定藏品示例，不代表掉率；想真拍得先登录。</p>${rareMomentView()}<div class="featured-items">${xs.map(x=>card(x)).join('')}${demoCount<goods.length?'<div class="empty-state"><h2>?</h2><p>下一件尚未揭晓</p></div>':''}</div><div class="demo-actions"><button class="button outline" data-demo>${demoCount>=goods.length?'再看一次':'揭晓一件演示藏品 →'}</button></div></div>${themeGuide()}`;
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
        `<button class="tier-option ${k === playTier ? "active" : ""}" data-play-tier="${k}"><strong>${t.name}区</strong><p>入场费 ${number(t.fee)}</p><p>竞拍预算 ${number(t.budget)}</p><small>红色率 ${redOdds(k)}% / 件</small></button>`,
    )
    .join(
      "",
    )}</div><label class="theme-select">仓库主题<select id="play-theme">${themeOptions(playTheme)}</select></label><p class="mini-note">主题改变类别权重；预算、入场费和品质概率不变。</p><p class="mini-note">预算是整仓报价上限，未用部分结算退回。小额适合初试；高额、典藏需要更多入场本金，藏品总值仍可能高于预算。</p><div id="solo-theme-preview">${themeScene(playTheme,{preview:true})}</div><h3>选择信息能力</h3><div class="ability-options">${Object.entries(
    meta.roles,
  )
    .map(
      ([k, r]) =>
        `<button data-play-role="${k}" class="${k === role ? "active" : ""}">${r.name}</button>`,
    )
    .join(
      "",
    )}</div><p>${escape(meta.roles[role].skill)}</p><p class="role-strategy">${escape(meta.roles[role].tip||"")}</p><div class="setup-actions"><button class="button primary" data-start ${!game?.offerToken ? "disabled" : ""}>暂存预算并入场 ↗</button><span class="mini-note">需 ${money(meta.tiers[playTier].budget + meta.tiers[playTier].fee)}，含${number(meta.tiers[playTier].fee)}入场费</span><button class="text-link" data-view="wallet">先兑换竞拍币 →</button></div></div>`;
}
const gameMoney = (s, value) =>
  `${number(value)} ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}`;
// One click moves the sealed offer by 1% of this session's budget, so the
// stepper feels the same in 小额 (2.5M) and 典藏 (100M).
const bidStep = (s) => Math.max(1, Math.round((s?.budget ?? 0) / 100));
// The suspense ring before an item is shown. Rarer goods spin longer so a red
// pull actually lands as a moment instead of appearing instantly.
const REVEAL_SPIN_MS = [420, 620, 820, 1080, 1340, 1700];
let revealPresentation=null,rarePaintKey=null,rareQueuedKey=null,demoRun=0;
let settledSoundToken = null;
let roomState = null;
let pendingRoomInvite = "";
let roomConnection = "idle";
let roomOpenKey = "";
const ROOM_INVITE_KEY = "auction-room-invite";
const validRoomCode = code => /^[A-HJ-NP-Z2-9]{6}$/.test(code);
function readRoomInvite(now = Date.now()) {
  const params = new URLSearchParams(location.search);
  try {
    if(params.has("room")) {
      const code = (params.get("room") || "").toUpperCase();
      if(!validRoomCode(code)){sessionStorage.removeItem(ROOM_INVITE_KEY);return "";}
      sessionStorage.setItem(ROOM_INVITE_KEY,JSON.stringify({code,expires:now+30*60_000}));
      return code;
    }
    const saved = JSON.parse(sessionStorage.getItem(ROOM_INVITE_KEY) || "null");
    if(saved && validRoomCode(saved.code) && saved.expires>now && saved.expires<=now+30*60_000)return saved.code;
    sessionStorage.removeItem(ROOM_INVITE_KEY);
  } catch { return validRoomCode((params.get("room") || "").toUpperCase()) ? params.get("room").toUpperCase() : ""; }
  return "";
}
function roomInviteURL(code) {
  if(!validRoomCode(code))throw Error("房号无效，请刷新房间。");
  const url = new URL("/auction/",PRIMARY);
  url.searchParams.set("room",code);url.hash="play";
  return url.href;
}
function clearRoomInvite() {
  pendingRoomInvite="";
  try{sessionStorage.removeItem(ROOM_INVITE_KEY);}catch{}
  const url=new URL(location.href);
  if(url.searchParams.has("room")){url.searchParams.delete("room");window.history.replaceState(null,"",url);}
}
async function copyRoomInvite(kind) {
  const code=roomState?.room?.code;
  if(!validRoomCode(code))return;
  const value=kind==="code"?code:roomInviteURL(code);
  try{await navigator.clipboard.writeText(value);toast(kind==="code"?"房号已复制。":"邀请链接已复制，发给同服务器的朋友即可。");}
  catch{dialog(`<h2>邀请朋友</h2><p>复制下面的${kind==="code"?"房号":"链接"}，发给同服务器的朋友。</p><input class="room-share-value" aria-label="邀请内容" readonly value="${escape(value)}"><button class="button outline" data-close>完成</button>`);}
}
function setRoomConnection(state) {
  roomConnection=state;
  const label=$("#room-connection");
  if(label){label.dataset.state=state;const text={idle:"正在读取房间…",live:"房间已同步",stale:"连接中断，正在重试；报价不会自动重发。",offline:"网络已断开，恢复连接后会重新读取进度。"}[state];if(label.textContent!==text)label.textContent=text;}
}
function roomConnectionView() {
  return `<div class="room-sync"><span id="room-connection" role="status" aria-live="polite" data-state="${roomConnection}"></span><button class="text-link" data-room-refresh>刷新房间</button></div>`;
}

function presentationKey(source,id,scope=guild){return JSON.stringify([scope,source,id]);}
function presentationContext(){
  if(location.hash!=="#play")return null;
  if(!account?.user)return presentationKey("demo",demoRun,"");
  if(!guild)return null;
  if(view==="room"&&roomState?.room)return presentationKey("room",roomState.room.id);
  if(view==="auction"&&game?.session)return presentationKey("auction",game.session.token);
  return null;
}
function reducedRevealMotion(){return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches===true;}
function presenter(){
  return revealPresentation??=createRevealPresentation({
    isCurrent:key=>key===presentationContext()&&!document.hidden&&!$("#detail-dialog").open,
    onChange:()=>{if(!revealPresentation?.state){const live=$("#reveal-announcement");if(live)live.textContent="";}renderPlay();},onReveal:(quality,moment)=>{
      play("reveal",{quality});
      const live=$("#reveal-announcement");
      if(live&&moment)live.textContent=`${moment.demo?'演示 · ':''}第${moment.index+1}件 · ${quality===5?'红色':'金色'}珍藏：${moment.item.name}`;
    },
  });
}
function spinningIndex(){const p=revealPresentation?.state;return p?.phase==="spin"&&p.key===presentationContext()?p.index:null;}
function rareMomentView(){
  const p=revealPresentation?.state,m=p?.moment;
  if(!m||p.key!==presentationContext()||p.phase==="spin")return "";
  const fresh=p.active&&!reducedRevealMotion()&&rarePaintKey!==p.id;
  if(fresh&&window.requestAnimationFrame){
    if(rareQueuedKey!==p.id){rareQueuedKey=p.id;window.requestAnimationFrame(()=>{if(revealPresentation?.state?.id===p.id)rarePaintKey=p.id;});}
  }else if(fresh)rarePaintKey=p.id;
  const x=m.item,red=x.quality===5,unit=m.currency==="tavern"?'酒馆币':'竞拍币';
  return `<section class="rare-reveal ${red?'rare-red':'rare-gold'}${fresh?' rare-enter':''}" role="region" aria-label="${red?'红色':'金色'}藏品揭晓"><div class="rare-reveal-art"><div class="rare-reveal-rays" aria-hidden="true"></div><div class="rare-reveal-sparks" aria-hidden="true">${'<i></i>'.repeat(8)}</div><img src="${escape(imageFor(x))}" alt="${escape(x.name)}" width="220" height="220"></div><div class="rare-reveal-copy"><p class="rare-reveal-quality">${m.demo?'开仓演示 · ':''}${red?'红色珍藏':'金色珍藏'}</p><h3>${escape(x.name)}</h3><p class="rare-reveal-value">${number(x.value)}<span>${unit}</span></p><p class="rare-reveal-meta">${m.added>1?`本次揭晓${m.added}件 · 最高品质展示`:`第${m.index+1}件`}${x.width&&x.height?` · ${x.width}×${x.height}，占${x.width*x.height}格`:''}${m.demo?' · 示例价值，不代表掉率':''}</p><div class="rare-reveal-actions"><button class="button outline" data-rare-details>查看藏品</button>${p.active?'<button class="text-link" data-rare-skip>跳过演出</button>':''}<button class="text-link" data-rare-dismiss>收起</button></div></div></section>`;
}
async function playSuspense(session,previous,{batch=false,scope=guild,resume=revealResumeEpoch}={}){
  if(session?.status==="active")return;
  const last=session?.reveal?.last,item=Number.isInteger(last)?session.items?.[last]:null,
    key=presentationKey("auction",session?.token,scope);
  if(!item||key!==presentationContext()||resume!==revealResumeEpoch)return;
  const moment=rareRevealMoment(previous,session),reduced=reducedRevealMotion(),quality=moment?.item.quality??item.quality;
  if(!batch&&!reduced)play("spin");
  return presenter().play({key,index:moment?.index??last,quality,moment:moment?{...moment,currency:session.currency}:null,
    spin:batch?0:REVEAL_SPIN_MS[quality]??700,hold:moment?(moment.item.quality===5?1600:1100):0,reduced});
}
async function unlockAfterReveal(g = guild, token = game?.session?.token) {
  if (!g) return;
  const e = epoch;
  const [w, i] = await Promise.all([
    api(`wallet?guild=${g}`),
    api(`inventory?guild=${g}`),
  ]);
  if (g !== guild || e !== epoch || token !== game?.session?.token) return;
  wallet = w.data;
  inventory = i.data;
  toast(
    game.session.result?.winner === 0
      ? "开仓完成，藏品已解锁到个人仓库。"
      : "开仓完成，可以查看本仓结果。",
  );
}
function buildRevealLoop(token) {
  const g = guild;
  const current = () => guild === g && game?.session?.token === token;
  const loop = createRevealLoop({
    // The suspense ring already paces each item, so the next one starts as soon
    // as the previous cell has painted instead of waiting out a fixed gap.
    interval: 120,
    getStep: () => game?.session?.reveal?.count ?? 0,
    isComplete: () => current() && Boolean(game?.session?.reveal?.complete),
    canRun: () =>
      current() &&
      game.session.status !== "active" &&
      view === "auction" &&
      location.hash === "#play" &&
      !document.hidden &&
      !$("#detail-dialog").open &&
      !busy,
    reveal: async (step) => {
      // Only the server's last confirmed count is sent; never guess progress.
      const previous=game.session,resume=revealResumeEpoch;
      const answer = await mutation("auctionReveal", {
        token,
        step,
        all: false,
      });
      if (!answer || !current()) return;
      const session=game.session;
      if (session.reveal?.complete) await unlockAfterReveal(g, token);
      await playSuspense(session,previous,{scope:g,resume});
      if (current()) renderPlay();
    },
    onChange: () => renderPlay(),
    onStall: () => toast("开仓卡住了，先停下；刷新一下再继续。"),
    onError: (error) => toast(error?.message || "自动揭露中断，请刷新后继续。"),
  });
  loop.token = token;
  loop.guild = g;
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
  if (revealLoop?.token === token && revealLoop.guild === guild)
    return revealLoop;
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
    pending = loop?.busy;
  return `<div class="reveal-controls" data-reveal-state="${state}"><progress class="reveal-meter" aria-label="开仓揭露进度" max="${s.reveal.total || 1}" value="${s.reveal.count}"></progress><p class="reveal-note">${running ? "正在一件件翻" : paused ? "暂停了，随时可以继续" : "仓门开着，慢慢翻"} · ${s.reveal.count} / ${s.reveal.total}</p><div class="reveal-buttons"><button class="button primary wide" data-reveal="auto">${running ? "暂停揭露" : paused ? "继续揭露 →" : "自动逐件揭露 →"}</button><button class="button outline" data-reveal="next"${running || pending ? " disabled" : ""}>单件</button><button class="button outline" data-reveal="all"${running || pending ? " disabled" : ""}>全部打开</button></div></div>`;
}
function gameView() {
  const s = game?.session;
  if (!s || (s.status !== "active" && (!s.reveal || s.reveal.complete) && spinningIndex()===null)) {
    if (revealLoop) revealLoop.dispose();
    revealLoop = null;
    return `${s ? resultView(s) : ""}${setup()}`;
  }
  const active = s.status === "active",
    r = s.result,
    subtotal = s.items?.reduce((n,x,i)=>n+(x&&i!==spinningIndex()?x.value:0),0)||0;
  return `<div class="play-layout"><div>${seatStrip(s)}${themeScene(s.theme?.id)}<div class="board-heading"><h2>${escape(s.warehouse?.name || "仓库")} · ${s.itemCount}件</h2><p>${s.board.cols}×${s.board.rows}格板<br>${active ? "只展示已知品质与轮廓" : `开仓揭晓 ${s.reveal.count} / ${s.reveal.total}`}</p></div>${rareMomentView()}<div class="board-wrap"><div id="warehouse-board" class="warehouse-board"></div></div>${legend()}${history(s)}</div><aside class="panel">${
    active
      ? `${appraiserCard(s)}<span class="auction-stage">第 ${s.round} / 5 轮 · ${meta.roles[s.role].name}</span><p>本局预算 ${gameMoney(s, s.budget)}<br>线索估值约</p><div class="line-value">${number(s.estimate)}</div><p>${s.currency === "tavern" ? "酒馆币" : "竞拍币"} · 剩余 <span data-countdown="${s.expires}"></span> · 同价优先 ${s.priority.map((i) => npc[i]).join(" / ")}</p>${warehouseIntel(s)}<div class="bid-presets">${[
          [0.8, "估值80%"],
          [0.95, "估值95%"],
        ]
          .map(([v, l]) => {
            const b = Math.min(s.budget, Math.floor(s.estimate * v));
            return `<button data-bid="${b}">${l}<small>${gameMoney(s, b)}</small></button>`;
          })
          .join(
            "",
          )}<button data-bid="0">本轮不出价<small>0 ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}</small></button><button data-bid="${s.budget}">预算上限<small>${gameMoney(s, s.budget)}</small></button></div><form id="bid-form" class="bid-form"><label for="bid-amount">本轮暗标总价（整数）</label><div class="bid-stepper"><button type="button" class="step-button" data-bid-step="-1" aria-label="减少报价">−</button><input id="bid-amount" name="bid" type="number" min="0" max="${s.budget}" step="1" placeholder="输入报价" required inputmode="numeric"><button type="button" class="step-button" data-bid-step="1" aria-label="增加报价">+</button></div><small class="step-hint">每次 ±${number(bidStep(s))}，上限 ${gameMoney(s, s.budget)}</small><button class="button primary wide" type="submit">封牌，压上这一轮 →</button></form><details class="clue-list"><summary>翻翻这局的线索</summary>${focusClue(s.info)}${s.info.highCount === null ? "" : `<p>紫 / 金 / 红合计 ${s.info.highCount} 件</p>`}${s.info.highCounts ? `<p>紫${s.info.highCounts[0]} / 金${s.info.highCounts[1]} / 红${s.info.highCounts[2]}</p>` : ""}${s.info.highArea === undefined ? "" : `<p>高品质总占格 ${s.info.highArea} 格</p>`}${s.info.items.map((c, i) => `<p>${i + 1}. ${c.quality === null ? "品质未知" : meta.qualities[c.quality] + "品质"} · ${c.width === null ? "轮廓未知" : `${c.width}×${c.height} / ${c.width * c.height}格`}${c.category?` · 类别：${escape(c.category)}`:""}</p>`).join("")}</details><button class="danger-link" data-leave>放弃余下竞拍</button>`
      : `<span class="auction-stage">仓门开了，看看里面有什么。</span><h2>${r.winner === null ? "没人接盘，流拍了" : r.winner === 0 ? "竞拍成功！" : `${npc[r.winner]}拍中`}</h2><p>成交价 ${gameMoney(s, r.price)}<br>已揭晓 ${s.reveal.count} / ${s.reveal.total}件</p><div class="line-value">${number(subtotal)}</div><p>已揭晓总值 · ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}</p>${s.reveal.complete?'<p class="reveal-note">最后一件正在揭晓…</p>':revealControls(s)}`
  }</aside></div>`;
}
let seatSweptKey = null;
function opponentProfile(key) {
  return meta.opponents?.find(x=>x.key===key)??null;
}
function opponentIdentity(profile,style,name,you=false) {
  const tone=meta.opponentStyles?.[style],image=profile?`<img class="opponent-avatar" src="${escape(profile.portrait)}" alt="${escape(profile.title)}" width="56" height="56">`:`<span class="opponent-avatar opponent-player" aria-hidden="true">${escape(Array.from(String(name))[0]||'客')}</span>`;
  return `<div class="opponent-identity">${image}<div><span class="seat-name">${escape(name)}${you?' <i>你</i>':''}</span>${profile&&tone?`<small class="opponent-style" title="${escape(tone.description)}">${escape(tone.label)}</small>`:''}</div></div>`;
}
function opponentMoment(stage,history,index) {
  const m=buildOpponentReaction({stage,history,index});
  return `<div class="opponent-moment" data-reaction="${m.kind}"><span>${escape(m.label)}</span>${m.round?`<small>第${m.round}轮已公开${m.delta&&m.previousRound?` · 较第${m.previousRound}轮 ${m.delta>0?'+':'−'}${number(Math.abs(m.delta))}`:''}</small>`:'<small>本轮报价未公开</small>'}</div>`;
}
function renderOpponents() {
  const node=$("#opponent-cards");if(!node)return;
  node.innerHTML=(meta.opponents||[]).map(p=>{const tone=meta.opponentStyles?.[p.style];return `<article class="opponent-card"><img src="${escape(p.portrait)}" alt="${escape(p.title)}" width="160" height="160" loading="lazy"><div><h3>${escape(p.title)}</h3><span class="opponent-style">${escape(tone?.label||'')}</span><p>${escape(tone?.description||'')}</p></div></article>`;}).join('');
}
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
        ? "没人接盘，流拍了"
        : `${npc[stage.winner]} 以 ${number(stage.price)} ${unit} 成交`
      : stage.open
        ? stage.decided
          ? "这轮直接落锤"
          : `第 ${stage.round} / ${stage.total} 轮已亮牌`
        : `第 ${stage.round} / ${stage.total} 轮 · 四个人都在憋`;
  return `<div class="seat-strip${sweep ? " sweep" : ""}${stage.settled ? " final" : ""}" data-round="${stage.round}"><div class="seat-strip-head"><span class="auction-stage">拍卖席</span><small>${note}</small></div><div class="seat-row">${stage.seats
    .map(
      (seat) => {
        const p=meta.opponents?.find(x=>x.soloIndex===seat.index);
        return `<div class="seat${seat.you ? " you" : ""}${seat.leader ? " leading" : ""}${seat.winner ? " won" : ""}" data-state="${seat.state}">${opponentIdentity(p,p?.style,seat.name)}<strong class="seat-bid">${seat.bid === null ? "—" : number(seat.bid)}</strong><small class="seat-state">${labels[seat.state] || "—"}</small>${p?opponentMoment(stage,s.history,seat.index):''}</div>`;
      },
    )
    .join(
      "",
    )}</div>${stage.open && !stage.settled && stage.margin > 0 ? `<p class="seat-margin">领先 ${number(stage.margin)} ${unit} · 同价优先 ${s.priority.map((i) => npc[i]).join(" → ")}</p>` : ""}</div>`;
}
function history(s) {
  if (!s.history.length) return "";
  return `<div class="history"><table><thead><tr><th>轮次</th>${npc.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${s.history.map((h) => `<tr><td>第${h.round}轮${h.done ? " · 落锤" : ""}</td>${h.bids.map((b) => `<td>${number(b)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function resultView(s) {
  const r = s.result,
    won = r.winner === 0;
  return `${seatStrip(s)}${themeScene(s.theme?.id)}<div class="panel"><p class="eyebrow">${r.winner === null ? "没人接盘，流拍了" : `${npc[r.winner]}以 ${gameMoney(s, r.price)} 拍中`}</p><h2>这一仓，${r.net > 0 ? "赚到了，手气不错。" : r.net < 0 ? "亏了，当交学费。" : "不赚不亏，白忙一场。"}</h2><div class="result-grid"><div><small>成交价</small><strong>${number(r.price)}</strong></div><div><small>仓库藏品总值</small><strong>${number(r.total)}</strong></div><div><small>本局盈亏 · 含入场费${won ? "与藏品价值" : ""}</small><strong class="${r.net >= 0 ? "profit" : "loss"}">${r.net > 0 ? "+" : ""}${number(r.net)}</strong></div><div><small>现金变化 · ${s.currency === "tavern" ? "酒馆币" : "竞拍币"}</small><strong>${r.cashNet > 0 ? "+" : ""}${number(r.cashNet ?? r.net)}</strong></div></div><p>入场费 ${gameMoney(s, s.fee)}。${won ? (r.inventory ? "藏品已入仓，卖出才计现金。" : "藏品已按开局规则结算。") : "未拍中，只付入场费。"}${s.currency === "tavern" ? " 旧版酒馆币对局，按当时规则计算。" : ""}</p>${rareMomentView()}<div class="board-wrap"><div id="warehouse-board" class="warehouse-board"></div></div>${history(s)}<button class="text-link" data-view="inventory">到个人仓库看看 →</button></div><br>`;
}
function inventoryView() {
  if (!inventory) return '<p class="loading">正在读取个人仓库…</p>';
  return `<div class="wallet-summary"><div><small>已揭晓藏品</small><strong>${inventory.count}<span>件</span></strong></div><div><small>藏品总值</small><strong>${number(inventory.value)}<span>竞拍币</span></strong></div><div><small>陈列中</small><strong>${inventory.displayed}<span>/ 6</span></strong></div></div>${inventory.pending ? `<div class="notice">还有${inventory.locked}件藏品待开仓。<button class="text-link" data-resume="${inventory.pending.token}" ${inventory.pending.room?`data-resume-room="${escape(inventory.pending.roomId)}"`:""}>继续揭晓 →</button></div>` : ""}<div class="inventory-tools"><button class="button primary" data-sale-selected ${!selected.size ? "disabled" : ""}>出售已选 ${selected.size ? `· ${selected.size}件` : ""}</button><button class="button outline" data-display-selected ${selected.size !== 1 ? "disabled" : ""}>放入展示柜</button><label>按品质批卖 <select id="bulk-quality">${["白", "绿", "蓝", "紫", "金", "红", "全部"].map((x, i) => `<option value="${i}" ${i === 6 ? "selected" : ""}>${x}品质</option>`).join("")}</select></label><button class="button outline" data-sale-bulk>预览批卖</button></div>${inventory.items.length ? `<div class="inventory-grid">${inventory.items.map((u) => `<div class="owned-card"><label class="owned-select"><input type="checkbox" data-select="${u.id}" ${selected.has(u.id) ? "checked" : ""}>选择</label>${card(u.item, `data-owned="${u.id}"`)}<p class="owned-state">${u.display_slot !== null ? `展示中 · 第${u.display_slot + 1}格` : "已开仓"}</p></div>`).join("")}</div><div class="load-more"><button class="button outline" data-page="${inventory.page - 1}" ${inventory.page <= 0 ? "disabled" : ""}>← 上一页</button> <span class="mini-note">${inventory.page + 1} / ${inventory.pages}</span> <button class="button outline" data-page="${inventory.page + 1}" ${inventory.page + 1 >= inventory.pages ? "disabled" : ""}>下一页 →</button></div>` : '<div class="empty-state"><h2>仓库还空着。</h2><p>拍中并开仓后，喜欢的藏品就能留在这里。</p><button class="button outline" data-view="auction">去拍下一仓 →</button></div>'}`;
}
function cabinetView() {
  if (!inventory) return '<p class="loading">正在打开展示柜…</p>';
  return `<div class="section-heading"><div><p class="eyebrow">六格珍藏，留住喜欢</p><h2>你的藏品展示柜</h2></div><button class="text-link" data-view="inventory">从仓库挑一件 →</button></div><div class="cabinet"><div class="cabinet-grid">${Array.from(
    { length: 6 },
    (_, slot) => {
      const u = inventory.cabinet.find((x) => x.display_slot === slot);
      return `<div class="cabinet-slot${u ? ` q${u.item.quality}` : ""}"><small>0${slot + 1}</small>${u ? `<span class="cabinet-quality">${escape(meta.qualities[u.item.quality])}品质</span><button data-item="${u.item.id}" data-cabinet-value="${u.item.value}"><img src="${escape(imageFor(u.item))}" alt="${escape(u.item.name)}"></button><h3>${escape(u.item.name)}</h3><p>${u.item.width * u.item.height}格 · ${money(u.item.value)}</p><button data-remove="${slot}">撤下，放回仓库</button>` : '<div class="cabinet-empty"><span>◇</span>等待一件珍藏</div>'}</div>`;
    },
  ).join(
    "",
  )}</div></div><p class="quiet-note">陈列中不参与批卖，撤下即回仓。</p>`;
}
function walletView() {
  return `${summary()}<div class="panel wallet-panel"><p class="eyebrow">同一间小酒馆，同一个钱包</p><h2>竞拍币双向兑换</h2><div class="exchange-rate"><div>1<small>酒馆币</small></div><span>⇄</span><div>100,000<small>竞拍币</small></div></div><p>整数兑换，免手续费。</p><p class="wallet-gift">新玩家见面礼：开局送 2,000 万竞拍币，不用先换。</p><form id="exchange-form"><label>兑换方向<select id="exchange-direction"><option value="buy">酒馆币 → 竞拍币</option><option value="sell">竞拍币 → 酒馆币</option></select></label><label>酒馆币数量（整数）<input id="exchange-amount" type="number" min="1" max="1000000" step="1" required placeholder="例如：100" inputmode="numeric"></label><button class="button primary wide" type="submit">预览兑换 →</button></form><p>与 Discord 同一个钱包。</p></div>`;
}
// Room actions all return the same payload shape: the caller's room, or null.
async function refreshRoomWallet(g, e) {
  const [w,i] = await Promise.all([api(`wallet?guild=${g}`),api(`inventory?guild=${g}`)]);
  if(g!==guild || e!==epoch) return;
  wallet=w.data;inventory=i.data;selected=new Set();
}
function acceptRoom(data) {
  setRoomConnection("live");
  const previous=roomState?.room, next=data?.room;
  if(next?.status==="settled" && (previous?.id!==next.id || previous?.status!=="settled"))
    play(next.result?.won ? "win" : "lose");
  roomState=data;
  if(previous?.id===next?.id && next?.status==="settled" && next?.started?.reveal?.count>previous?.started?.reveal?.count){
    const moment=rareRevealMoment(previous.started,next.started),item=next.started.items?.[next.started.reveal.last];
    if(moment&&view==="room")void presenter().play({key:presentationKey("room",next.id),index:moment.index,quality:moment.item.quality,moment:{...moment,currency:'auction'},hold:1600,reduced:reducedRevealMotion()});
    else if(item&&!document.hidden&&!$("#detail-dialog").open)play("reveal",{quality:item.quality});
  }
}
const roomWalletKey = r => `${r?.id}:${r?.status}:${r?.started?.reveal?.complete??false}`;
async function roomAction(action, fields = {}) {
  if(roomConnection==="stale" || roomConnection==="offline")throw Error("先刷新房间并恢复同步，再提交操作。");
  const g=guild,e=++epoch,previous=roomWalletKey(roomState?.room),
    roomId=roomState?.room?.id;
  let answer;
  try {
    answer=await api("action",{action,guild:g,
      ...(!["roomCreate","roomJoin"].includes(action)?{roomId}:{}),...fields});
  } catch(error) {
    if(g===guild && e===epoch){
      try{const fresh=await api(`room?guild=${g}`);if(g===guild && e===epoch)acceptRoom(fresh.data);}catch{if(g===guild && e===epoch)setRoomConnection(navigator.onLine===false?"offline":"stale");}
      if(g===guild && e===epoch)renderPlay();
    }
    throw error;
  }
  if(g!==guild || e!==epoch) return;
  if(answer?.kind==="room")acceptRoom(answer.data);
  if(["roomJoin","roomCreate"].includes(action))clearRoomInvite();
  if(previous!==roomWalletKey(roomState?.room)) await refreshRoomWallet(g,e);
  if(g===guild && e===epoch)renderPlay();
  return answer;
}
function focusClue(info) {
  return Number.isInteger(info?.focus)?`<p class="focus-clue">重点鉴定：第${info.focus+1}件${info.largeAbsent?' · 未发现镇仓大件':''}</p>`:"";
}
function roomClues(info) {
  if(!info)return "";
  return `<details class="clue-list"><summary>你的专属线索</summary>${focusClue(info)}${info.highCount===null?"":`<p>紫 / 金 / 红合计 ${info.highCount} 件</p>`}${info.highCounts?`<p>紫 ${info.highCounts[0]} / 金 ${info.highCounts[1]} / 红 ${info.highCounts[2]}</p>`:""}${info.highArea===undefined?"":`<p>高品质总占格 ${info.highArea} 格</p>`}${info.items.map((c,i)=>`<p>${i+1}. ${c.quality===null?"品质未知":meta.qualities[c.quality]+"品质"} · ${c.width===null?"轮廓未知":`${c.width}×${c.height} / ${c.width*c.height}格`}${c.category?` · 类别：${escape(c.category)}`:""}</p>`).join("")}</details>`;
}
function roomSeatView(seat, room, stage) {
  const role=meta.roles?.[seat.role],waiting=room.status==="waiting",
    published=stage?.seats.find(s=>s.index===seat.index),
    won=Boolean(published?.winner),leading=!stage?.settled && Boolean(published?.leader),
    current=waiting?(seat.ready?"已就绪":"尚未准备"):
      room.status==="settled"?(won?"竞拍成功":"本仓已结束"):
      seat.npc?"NPC · 等待开牌":seat.submitted?(seat.you?`已封 ${number(seat.bid)}`:"已封牌"):"本轮尚未封牌";
  const profile=seat.npc?opponentProfile(seat.id):null;
  return `<div class="room-seat${seat.you?" you":""}${seat.npc?" npc":""}${won?" won":""}${leading?" leading":""}">${opponentIdentity(profile,seat.npcStyle,seat.name,seat.you)}<small>${escape(role?.name??"待定")}</small><em>${current}</em>${published?.bid==null?"":`<div class="room-seat-offer"><small>第 ${stage.round} 轮已公开${won?" · 成交":leading?" · 最高":""}</small><strong>${published.bid===0?"过牌":number(published.bid)}</strong></div>`}${profile&&stage?opponentMoment(stage,room.started?.history,seat.index):""}</div>`;
}

function renderRoom() {
  const r = roomState?.room;
  if (!r)
    return `${summary()}${roomConnectionView()}<div class="panel room-panel"><p class="eyebrow">联机 · 同服开黑</p><h2>凑一桌，四个人抢一个仓库。</h2><p class="room-hint">房间只有本服务器的人能看到。开好之后，把 6 位房号或邀请链接发给朋友。${pendingRoomInvite?"已有邀请房号，请选择朋友所在服务器后确认加入。":""}</p><div class="room-boot"><label>区域<select id="room-tier">${Object.entries(
      meta.tiers,
    )
      .map(
        ([k, t]) =>
          `<option value="${k}">${escape(t.name)}区 · 入场 ${number(t.fee)}</option>`,
      )
      .join("")}</select></label><label>仓库主题<select id="room-theme">${themeOptions(roomTheme)}</select></label><button class="button primary" data-room-create>开一个房间</button></div><div id="room-theme-preview">${themeScene(roomTheme,{preview:true})}</div><div class="room-boot"><label>房号<input id="room-code" maxlength="6" value="${escape(pendingRoomInvite)}" placeholder="比如 A7K2M9" autocomplete="off" spellcheck="false"></label><button class="button outline" data-room-join>加入</button></div></div>`;

  const seats = r.seats,
    you = seats.find((s) => s.you),
    waiting = r.status === "waiting",
    live = r.status === "active",
    settled = r.status === "settled",
    st = r.started ?? null,
    stage=waiting?null:buildSeatStage({...st,status:r.status,result:r.result,names:seats.map(s=>s.name)}),
    tier={...meta.tiers[r.tier],...r.terms},
    fees=`<div class="room-fees"><span>${escape(tier.name)}区 · ${escape(meta.themes?.find(t=>t.id===r.themeChoice)?.name||"随机主题")}</span><span>每人入场 ${number(tier.fee)}</span><span>托管预算 ${number(tier.budget)}</span></div>`;
  const head = waiting
    ? `<p class="eyebrow">联机 · 等人中</p><h2>房号 <span class="room-code">${escape(r.code)}</span></h2><p class="room-hint">至少两名真人；还剩 ${4-seats.length} 个位置，开局后空位由 NPC 补齐。</p><div class="room-invite-actions"><button class="button outline" data-room-copy="code">复制房号</button><button class="button outline" data-room-copy="link">复制邀请链接</button></div>${fees}${themeScene(r.themeChoice,{preview:true})}`
    : `<p class="eyebrow">联机 · ${live ? `第 ${st.round} / ${st.rounds} 轮` : "已结束"} · ${escape(r.code)}</p><h2>${escape(st?.warehouse?.name ?? "仓库")} · ${escape(st?.itemCount ?? 0)} 件</h2>${
        live
          ? `<p class="room-hint">还有 <strong data-room-clock="${st.roundEndsAt}">…</strong> 秒自动开牌；所有真人都封好牌后立即开牌。</p>`
          : `<p class="room-hint">这一仓已经定了。</p>`
      }`;

  const openKey=`${r.id}:${stage?.open?stage.round:0}:${stage?.settled??false}`,
    opening=roomOpenKey!==openKey && stage?.open;
  roomOpenKey=openKey;
  const seatGrid = `<div class="room-seats${opening?" opening":""}">${seats.map((s) => roomSeatView(s, r, stage)).join("")}${Array.from(
    { length: Math.max(0, 4 - seats.length) },
    () => '<div class="room-seat empty"><span class="room-seat-name">空位</span><small>开局后 NPC 顶上</small><em>——</em></div>',
  ).join("")}</div>`;

  // Bids only become public once their round closes.
  const history = st?.history?.length
    ? `<div class="room-history"><table><thead><tr><th>轮</th>${seats
        .map((s) => `<th>${escape(s.name)}</th>`)
        .join("")}<th>结果</th></tr></thead><tbody>${st.history
        .map((h) => {
          const winner =
            h.winner === null
              ? (h.done === false ? "继续竞拍" : "流拍")
              : `${escape(seats.find((s) => s.index === h.winner)?.name ?? "?")} ${number(h.price)}`;
          return `<tr><td>${h.round}</td>${h.bids
            .map((b, i) => `<td${h.winner === i ? ' class="won"' : ""}>${number(b)}</td>`)
            .join("")}<td>${winner}</td></tr>`;
        })
        .join("")}</tbody></table></div>`
    : "";

  let controls = "";
  if (waiting) {
    if (r.host) {
      controls = `<button class="button primary wide" data-room-start${r.canStart ? "" : " disabled"}>开局${r.canStart ? "" : (r.humans ?? 1) < 2 ? "（还差一个真人）" : "（等大家准备）"} →</button>`;
    } else {
      controls = `<button class="button ${you?.ready ? "outline" : "primary"} wide" data-room-ready="${you?.ready ? "0" : "1"}">${you?.ready ? "取消准备" : "准备好了"}</button>`;
    }
    if (you)
      controls += `<div class="room-role"><label>你的眼力<select id="room-role">${Object.entries(
        meta.roles,
      )
        .map(
          ([k, role]) =>
            `<option value="${k}"${you.role===k?" selected":""}${seats.some(s=>s.role===k && !s.you)?" disabled":""}>${escape(role.name)}${seats.some(s=>s.role===k && !s.you)?" · 已被选择":""}</option>`,
        )
        .join("")}</select></label><button class="button outline" data-room-role>确认更换</button></div><p id="room-role-description" class="mini-note">${escape(meta.roles[you.role]?.skill)}</p><p class="mini-note">换能力后需要重新准备。开局才扣入场费并托管预算。</p>`;
  } else if (live && you) {
    const presets = [0, 0.25, 0.5, 0.75, 1]
      .map(
        (p) =>
          `<button type="button" class="chip" data-room-preset="${Math.floor(st.budget * p)}">${p === 0 ? "过牌" : `${p * 100}%`}</button>`,
      )
      .join("");
    controls = `<form id="room-bid-form" class="room-bid" data-room-id="${escape(r.id)}" data-round="${st.round}"><label>这一轮出价（0 到 ${number(st.budget)}）<input id="room-bid-input" type="number" min="0" max="${st.budget}" step="1" value="${you.bid ?? ""}" inputmode="numeric" placeholder="整数，币"></label><div class="room-presets">${presets}</div><button class="button primary" type="submit">${you.submitted ? "改一下 →" : "封牌 →"}</button></form>`;
  }
  if (settled && st?.result) {
    const result=st.result,reveal=st.reveal;
    controls=`<div class="room-result"><p class="eyebrow">${result.won?"竞拍成功！":"落槌结果"}</p><h2>${result.winner===null?"无人出价，本仓流拍":`${escape(result.winnerName)} 以 ${number(result.price)} 拍中`}</h2><p>${result.won?(reveal?.complete?"这一仓归你，藏品已解锁到个人仓库。":"这一仓归你；共享揭晓完成后，藏品解锁到个人仓库。 "):"预算已退回，你只支付入场费。一起看看这一仓。"}</p></div>`;
    if(reveal && !reveal.complete) {
      const subtotal=st.items.filter(Boolean).reduce((n,x)=>n+x.value,0);
      controls+=`<div class="line-value">${number(subtotal)}</div><p>已揭晓藏品价值 · 竞拍币</p><div class="reveal-controls"><progress class="reveal-meter" aria-label="共享开仓进度" value="${reveal.count}" max="${reveal.total}"></progress><p class="reveal-note">全桌共享 · ${reveal.count} / ${reveal.total} 件${reveal.running?" · 正在逐件揭晓":""}</p><div class="reveal-buttons"><button class="button primary wide" data-room-reveal="${reveal.running?"pause":"start"}">${reveal.running?"暂停共享揭晓":"自动逐件揭晓 →"}</button><button class="button outline" data-room-reveal="next"${reveal.running?" disabled":""}>单件</button><button class="button outline" data-room-reveal="all"${reveal.running?" disabled":""}>全部打开</button></div></div><p class="mini-note">任何一位玩家都可控制；重新进入会恢复同一进度。</p>`;
    } else {
      controls+=`<div class="result-grid"><div><small>藏品预估总值</small><strong>${number(result.total)}</strong></div><div><small>成交价</small><strong>${number(result.price)}</strong></div><div><small>你的单仓盈亏 · 含入场费</small><strong class="${result.net>=0?"profit":"loss"}">${result.net>0?"+":""}${number(result.net)}</strong></div><div><small>你的现金变化</small><strong>${number(result.cashNet)}</strong></div></div><p class="mini-note">入场费 ${number(st.fee)} 竞拍币。${result.won?"藏品已入仓，出售后才增加现金。":"未拍中，只付入场费。"}</p><button class="button outline wide" data-room-leave>返回联机大厅</button>${result.won?'<button class="text-link" data-view="inventory">查看我的藏品 →</button>':""}`;
    }
  } else if(waiting) controls+='<button class="text-link" data-room-leave>退出房间</button>';
  if(waiting) return `${summary()}${roomConnectionView()}<div class="panel room-panel">${head}${seatGrid}${controls}</div>`;
  const ownInfo=live && st.info ? `${appraiserCard({...st,role:you.role})}${warehouseIntel(st)}<span class="auction-stage">只属于你的判断</span><p>线索估值约</p><div class="line-value">${number(st.estimate)}</div><p>竞拍币 · 预算 ${number(st.budget)}</p><p class="mini-note">同价优先：${(st.priority??[]).map(i=>escape(seats.find(x=>x.index===i)?.name??"?")).join(" → ")}</p>` : "";
  return `${summary()}${roomConnectionView()}<div class="panel room-panel">${head}${seatGrid}</div><div class="play-layout room-match"><div>${themeScene(st.theme?.id)}<div class="board-heading"><h2>${live?"你的仓库视野":"全桌共享开仓"}</h2><p>${st.board?`${st.board.cols}×${st.board.rows}格`:""} · ${live?"展示公共情报与技能已知信息":"同一仓库，同一揭晓进度"}</p></div>${rareMomentView()}${st.board?'<div class="board-wrap"><div id="room-warehouse-board" class="warehouse-board"></div></div>':""}${legend()}${history}</div><aside class="panel">${ownInfo}${controls}${live?roomClues(st.info):""}</aside></div>`;
}

// --- room polling ---------------------------------------------------------
let roomTimer = null;
let roomTick = 0;
let roomSignature = "";

function signatureOf(room) { return JSON.stringify(room); }
let roomPolling=false;

function tickRoomClock() {
  const el = document.querySelector("[data-room-clock]");
  if (!el) return;
  const deadline = Number(el.dataset.roomClock);
  if (!Number.isFinite(deadline)) return;
  el.textContent = String(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
}

async function pollRoom() {
  if(view!=="room" || location.hash!=="#play" || !account?.user || !guild || busy || roomPolling || document.hidden) return;
  const g=guild,e=epoch,previous=roomWalletKey(roomState?.room);
  roomPolling=true;
  try {
    const answer=await api(`room?guild=${g}`);
    if(g!==guild || e!==epoch || view!=="room" || answer?.kind!=="room")return;
    acceptRoom(answer.data);
    if(previous!==roomWalletKey(roomState?.room)) await refreshRoomWallet(g,e);
    if(g===guild && e===epoch && view==="room" && signatureOf(roomState?.room)!==roomSignature)renderPlay();
  } catch(error) { if(g===guild && e===epoch && view==="room")setRoomConnection(navigator.onLine===false?"offline":"stale"); }
  finally {roomPolling=false;}
}

function ensureRoomTimer() {
  if (roomTimer) return;
  roomTick = 0;
  roomSignature = signatureOf(roomState?.room ?? null);
  roomTimer = setInterval(() => {
    roomTick++;
    tickRoomClock();
    if (roomState?.room?.started?.reveal?.running || roomTick % 3 === 0) pollRoom();
  }, 1000);
}

function stopRoomTimer() {
  if (!roomTimer) return;
  clearInterval(roomTimer);
  roomTimer = null;
}

function renderPlay() {
  if (!meta) return;
  const focused=document.activeElement,oldForm=$("#room-bid-form"),oldBid=$("#room-bid-input"),
    draft=oldBid && oldForm ? {
      value:oldBid.value,id:oldForm.dataset.roomId,round:Number(oldForm.dataset.round),focused:focused===oldBid,
    } : null,
    roleDraft=focused?.id==="room-role"?focused.value:null;
  $("#game-tabs").hidden = !account?.user || !guild;
  const bar = $("#game-statusbar");
  if (bar) {
    const guildName = account?.guilds?.find((g) => g.id === guild)?.name;
    bar.innerHTML = `<span class="status-dot${account?.user ? " on" : ""}"></span><span class="status-text">${
      account?.user
        ? `Discord 已连接 · ${escape(guildName || "未选择服务器")}`
        : "还没登录 · 先随便逛逛"
    }</span><button class="sound-toggle" data-sound aria-pressed="${soundEnabled() ? "false" : "true"}">音效：${soundEnabled() ? "开" : "关"}</button><span class="status-version">${escape(meta.version || "auction-web")}</span>`;
  }
  $$("[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view),
  );
  const settledNow = game?.session;
  if (
    settledNow &&
    settledNow.status !== "active" &&
    settledNow.result &&
    settledSoundToken !== settledNow.token
  ) {
    settledSoundToken = settledNow.token;
    play(settledNow.result.winner === 0 ? "win" : "lose");
  }
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
    view === "room"
      ? renderRoom()
      : view === "wallet"
        ? walletView()
        : view === "cabinet"
          ? cabinetView()
          : view === "inventory"
            ? inventoryView()
            : `${summary()}${game ? gameView() : '<p class="loading">正在恢复你的拍卖…</p>'}`;
  if (view === "auction" && game?.session) mountBoard(game.session);
  if(view==="room") {
    tickRoomClock();
    if(roomState?.room?.started?.board) mountBoard(roomState.room.started,"#room-warehouse-board");
    roomSignature=signatureOf(roomState?.room);
  }
  if (view === "room" && account?.user && location.hash==="#play") {ensureRoomTimer();setRoomConnection(roomConnection);}
  else stopRoomTimer();
  if(draft && draft.id===roomState?.room?.id && draft.round===roomState?.room?.started?.round) {
    const input=$("#room-bid-input");if(input){input.value=draft.value;if(draft.focused)input.focus({preventScroll:true});}
  }
  if(roleDraft && $("#room-role")){$("#room-role").value=roleDraft;$("#room-role-description").textContent=meta.roles[roleDraft]?.skill||"";$("#room-role").focus({preventScroll:true});}
  tick();
}
async function refreshAll() {
  if (!account?.user || !guild) return;
  const e = ++epoch,
    g = guild;
  const a = await api(`state?guild=${g}`);
  if (e !== epoch || g !== guild) return;
  const [w, i, r] = await Promise.all([
    api(`wallet?guild=${g}`),
    api(`inventory?guild=${g}&page=${inventory?.page || 0}`),
    view==="room"?api(`room?guild=${g}`):null,
  ]);
  if (e !== epoch || g !== guild) return;
  game = a.data;
  if(r)acceptRoom(r.data);
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
    `<p class="eyebrow">卖之前，再确认一眼</p><h2 class="detail-title">出售 ${q.count} 件藏品？</h2><p class="detail-flavor">到账 ${money(q.total)}</p><p class="detail-meta">${q.items.map((u) => escape(u.item.name)).join("、")}${q.count > q.items.length ? ` 等${q.count}件` : ""}</p><p class="mini-note">陈列中不参与批卖 · 每批最多 500 件。</p><div class="dialog-buttons"><button class="button outline" data-close>先留着</button><button class="button primary" data-confirm-sale>确认出售</button></div>`,
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
  if (b.matches("button")) play("click");
  if(b.hasAttribute("data-tutorial")){tutorialDispatch(b.dataset.tutorial,b.dataset.index);return;}
  if(b.hasAttribute("data-rare-skip")){revealPresentation?.skip();return;}
  if(b.hasAttribute("data-rare-dismiss")){revealPresentation?.clear();return;}
  if(b.hasAttribute("data-rare-details")){
    const p=revealPresentation?.state,m=p?.moment;
    if(m&&p.key===presentationContext())showItem(m.item.id,m.demo?undefined:m.item.value,m.currency==="tavern"?'酒馆币':'竞拍币');
    return;
  }
  if(b.hasAttribute("data-theme-guide")) {
    if(Object.hasOwn(THEME_SCENES,b.dataset.themeGuide)){
      guideTheme=b.dataset.themeGuide;
      $("#theme-guide-scene").innerHTML=themeScene(guideTheme,{preview:true});
      $$(".theme-guide-tabs button").forEach(t=>t.setAttribute("aria-pressed",String(t.dataset.themeGuide===guideTheme)));
      $("[data-theme-catalog]").dataset.themeCatalog=guideTheme;
    }return;
  }
  if(b.hasAttribute("data-theme-catalog")) {
    if(!(meta.themes||[]).some(t=>t.id===b.dataset.themeCatalog))return;
    catalogTheme=b.dataset.themeCatalog;quality=size='all';query='';limit=24;
    $("#catalog-search").value='';$("#size-filter").value='all';renderCatalog();location.hash='#catalog';return;
  }
  if(b.hasAttribute("data-room-copy")){copyRoomInvite(b.dataset.roomCopy);return;}
  if(b.hasAttribute("data-room-refresh")){pollRoom();return;}
  if(b.hasAttribute("data-room-reveal")) {
    const r=roomState?.room,mode=b.dataset.roomReveal,step=r?.started?.reveal?.count;
    perform(()=>roomAction("roomReveal",{roomId:r?.id,mode,step}));
    return;
  }
  if (b.hasAttribute("data-room-preset")) {
    const input = $("#room-bid-input");
    if (input) input.value = b.dataset.roomPreset;
    return;
  }
  if (b.hasAttribute("data-room-create")) {
    const tier = $("#room-tier")?.value || "standard",theme=$("#room-theme")?.value||"random";
    perform(async () => {
      await roomAction("roomCreate", { tier,theme,expectedBudget:meta.tiers[tier].budget });
    });
    return;
  }
  if (b.hasAttribute("data-room-join")) {
    const code = ($("#room-code")?.value || "").trim().toUpperCase();
    if (!code) return toast("先念一下房号。");
    perform(async () => {
      await roomAction("roomJoin", { code });
    });
    return;
  }
  if (b.hasAttribute("data-room-ready")) {
    perform(async () => {
      await roomAction("roomReady", { ready: b.dataset.roomReady === "1" });
    });
    return;
  }
  if (b.hasAttribute("data-room-role")) {
    const role = $("#room-role")?.value;
    if (!role) return;
    perform(async () => {
      await roomAction("roomRole", { role });
    });
    return;
  }
  if (b.hasAttribute("data-room-start")) {
    perform(async () => {
      await roomAction("roomStart", {expectedBudget:roomState.room.terms?.budget??meta.tiers[roomState.room.tier].budget});
    });
    return;
  }
  if (b.hasAttribute("data-room-leave")) {
    perform(async () => {
      await roomAction("roomLeave");
    });
    return;
  }
  if (b.hasAttribute("data-sound")) {
    setSoundEnabled(!soundEnabled());
    renderPlay();
    return;
  }
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
    const before=demoReceipt(demoCount);
    if(demoCount>=demoGoods().length){demoRun++;demoCount=0;revealPresentation?.clear();}
    else {
      demoCount++;
      const moment=rareRevealMoment(before,demoReceipt(demoCount));
      if(moment)void presenter().play({key:presentationContext(),index:moment.index,quality:moment.item.quality,moment:{...moment,currency:'auction',demo:true},hold:moment.item.quality===5?1600:1100,reduced:reducedRevealMotion()});
    }
    renderPlay();
    return;
  }
  if (!account?.user) return;
  if (b.hasAttribute("data-view")) {
    pauseReveal();
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
      } else if (view === "room") {
        const data = await api(`room?guild=${g}`);
        if (g === guild && e === epoch) acceptRoom(data.data);
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
  if (b.hasAttribute("data-bid-step")) {
    const field = $("#bid-amount"),
      session = game?.session;
    if (!field || !session) return;
    const next = Math.max(
      0,
      Math.min(
        session.budget,
        (Number(field.value) || 0) +
          Number(b.dataset.bidStep) * bidStep(session),
      ),
    );
    field.value = String(next);
    return;
  }
  if (b.hasAttribute("data-reveal") && b.dataset.reveal === "auto") {
    const loop = ensureRevealLoop();
    if (!loop) return;
    revealResumeEpoch++;
    revealPausedByHidden = false;
    if (loop.state === "running") pauseReveal();
    else loop.start();
    renderPlay();
    return;
  }
  perform(async () => {
    if (b.hasAttribute("data-logout")) {
      await api("logout", {});
      account = null;
      guild = "";
      game = wallet = inventory = roomState = null;
      epoch++;
      renderAccount();
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-refresh")) {
      await refreshAll();
      toast("都刷新过了，钱包和进度都是最新的。");
      return;
    }
    if (b.hasAttribute("data-start")) {
      await mutation("auctionStart", {
        token: game.offerToken,
        role,
        tier: playTier,
        expectedBudget: meta.tiers[playTier].budget,
        theme: playTheme,
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
      if (revealLoop?.busy) {
        toast("上一件还在确认，马上好。");
        return;
      }
      if (revealLoop) {
        revealLoop.dispose();
        revealLoop = null;
      }
      const s = game.session,g=guild,resume=revealResumeEpoch;
      const answer=await mutation("auctionReveal", {
        token: s.token,
        step: s.reveal.count,
        all: b.dataset.reveal === "all",
      });
      if(!answer||g!==guild||game?.session?.token!==s.token)return;
      const session=game.session;
      if (session.reveal.complete) await unlockAfterReveal(g,s.token);
      await playSuspense(session,s,{batch:b.dataset.reveal==="all",scope:g,resume});
      renderPlay();
      return;
    }
    if (b.hasAttribute("data-resume")) {
      const g=guild,e=++epoch;
      if(b.dataset.resumeRoom){
        const answer=await api(`room?guild=${g}&roomId=${encodeURIComponent(b.dataset.resumeRoom)}`);
        if(g!==guild || e!==epoch)return;
        acceptRoom(answer.data);view="room";
      } else {
        const answer=await api(`state?guild=${g}&token=${b.dataset.resume}`);
        if(g!==guild || e!==epoch)return;
        game=answer.data;view="auction";
      }
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
      play("coin");
      renderPlay();
      toast("卖掉了，钱已经进了竞拍币钱包。");
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
      toast("换好了，两个钱包都同步了。");
    }
  });
});
document.addEventListener("change", (event) => {
  const t = event.target;
  if(t.id==="play-theme") {
    playTheme=t.value;
    $("#solo-theme-preview").innerHTML=themeScene(playTheme,{preview:true});
  } else if(t.id==="room-theme") {
    roomTheme=t.value;
    $("#room-theme-preview").innerHTML=themeScene(roomTheme,{preview:true});
  } else if(t.id==="catalog-theme") {
    catalogTheme=t.value;limit=24;renderCatalog();
  } else if(t.id==="room-role") {
    $("#room-role-description").textContent=meta.roles[t.value]?.skill||"";
  } else if (t.id === "guild-select") {
    perform(async () => {
      epoch++;
      guild = t.value;
      game = wallet = inventory = roomState = null;
      roomConnection="idle";
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
  if(event.target.id==="tutorial-bid-form"){event.preventDefault();tutorialDispatch("bid",$("#tutorial-bid").value);return;}
  if (event.target.id === "room-bid-form") {
    event.preventDefault();
    const budget = roomState?.room?.started?.budget ?? 0,
      roomId=event.target.dataset.roomId,round=Number(event.target.dataset.round),
      requestId=crypto.randomUUID();
    const raw=$("#room-bid-input").value.trim();
    if(!raw)return toast("先填写报价；不出价请填 0。");
    const bid = Number(raw);
    if (!Number.isSafeInteger(bid) || bid < 0 || bid > budget)
      return toast(`报价得是 0 到 ${number(budget)} 之间的整数。`);
    play("seal");
    perform(async () => {
      await roomAction("roomBid", { roomId,round,requestId,bid });
    });
    return;
  }
  if (event.target.id === "bid-form") {
    event.preventDefault();
    const bid = Number($("#bid-amount").value);
    if (!Number.isSafeInteger(bid) || bid < 0 || bid > game.session.budget)
      return toast("报价得是整数，也别超过本局预算。");
    play("seal");
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
      return toast("酒馆币要填 1 到 1,000,000 之间的整数。");
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
window.addEventListener("offline",()=>{if(view==="room")setRoomConnection("offline");});
window.addEventListener("online",()=>{if(view==="room")pollRoom();});
window.addEventListener("hashchange", route);
// Auto-reveal stops while the tab is hidden and only resumes after the session
// has been re-read from the server, so a background tab can never double-open.
document.addEventListener("visibilitychange", () => {
  if(!document.hidden && view==="room")pollRoom();
  if (document.hidden) {
    revealPresentation?.clear();
    if (revealLoop?.state === "running") {
      revealPausedByHidden = true;
      revealLoop.pause();
    }
    return;
  }
  if (!revealPausedByHidden || !revealLoop || !guild) return;
  revealPausedByHidden = false;
  const loop = revealLoop,
    g = guild,
    e = epoch,
    resume = revealResumeEpoch;
  (async () => {
    try {
      // A step already in flight will finish naturally; keep its server answer.
      if (loop.busy) {
        if (
          view === "auction" &&
          location.hash === "#play" &&
          !document.hidden &&
          !$("#detail-dialog").open &&
          !busy
        )
          loop.start();
        return;
      }
      const answer = await api(`state?guild=${g}`);
      if (
        guild !== g ||
        epoch !== e ||
        revealLoop !== loop ||
        resume !== revealResumeEpoch
      )
        return;
      game = answer.data;
      if (
        loop.state === "paused" &&
        view === "auction" &&
        location.hash === "#play" &&
        !document.hidden &&
        !$("#detail-dialog").open &&
        !busy
      ) {
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
    initSound();
    pendingRoomInvite=readRoomInvite();
    if(pendingRoomInvite){view="room";location.hash="#play";}
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
