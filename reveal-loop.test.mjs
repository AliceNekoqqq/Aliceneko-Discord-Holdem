import test from "node:test";
import assert from "node:assert/strict";
import {
  createRevealLoop,
  REVEAL_INTERVAL_MS,
  REVEAL_STATES,
} from "./web/auction/assets/reveal-loop.mjs";

// Drives the loop with a fake scheduler so every hop is deterministic and no
// real timer is involved.
function harness({
  total = 3,
  start = 0,
  advance = true,
  canRun = () => true,
  failure = null,
} = {}) {
  let count = start;
  const pending = new Map();
  const steps = [];
  const states = [];
  const errors = [];
  const stalls = [];
  let nextId = 1;

  const loop = createRevealLoop({
    getStep: () => count,
    isComplete: () => count >= total,
    reveal: async (step) => {
      steps.push(step);
      if (failure) throw failure;
      // A real server only advances from the step it actually had.
      if (advance && step === count && count < total) count += 1;
    },
    canRun,
    interval: 10,
    schedule: (fn) => {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    cancel: (id) => pending.delete(id),
    onChange: (s) => states.push(s),
    onStall: (step) => stalls.push(step),
    onError: (e) => errors.push(e),
  });

  return {
    loop,
    steps,
    states,
    errors,
    stalls,
    get count() {
      return count;
    },
    get scheduled() {
      return pending.size;
    },
    // Drains scheduled hops and any in-flight `reveal` until the loop is quiet.
    async flush() {
      let guard = 0;
      for (;;) {
        if (guard++ > 400) throw new Error("reveal loop did not settle");
        await new Promise((resolve) => setImmediate(resolve));
        if (pending.size) {
          const [id, fn] = pending.entries().next().value;
          pending.delete(id);
          await fn();
          continue;
        }
        if (!loop.busy) return;
      }
    },
  };
}

test("reveal loop advances one item at a time using the server's own step", async () => {
  const h = harness({ total: 3 });
  h.loop.start();
  await h.flush();
  assert.deepEqual(h.steps, [0, 1, 2]);
  assert.equal(h.loop.state, "done");
  assert.equal(h.count, 3);
  assert.equal(h.scheduled, 0);
});

test("reveal loop never sends a step ahead of the last server answer", async () => {
  const h = harness({ total: 3 });
  h.loop.start();
  await h.flush();
  // Every call carried the count the server had already reported, never a
  // locally incremented guess.
  h.steps.forEach((step, index) => assert.equal(step, index));
});

test("reveal loop stops instead of replaying when progress does not advance", async () => {
  const h = harness({ total: 3, advance: false });
  const states = [];
  h.loop.start();
  await h.flush();
  assert.deepEqual(h.steps, [0]);
  assert.deepEqual(h.stalls, [0]);
  assert.equal(h.loop.state, "paused");
  assert.equal(h.scheduled, 0);
});

test("reveal loop pauses before acting when the page is no longer runnable", async () => {
  const h = harness({ canRun: () => false });
  h.loop.start();
  await h.flush();
  assert.deepEqual(h.steps, []);
  assert.equal(h.loop.state, "paused");
});

test("reveal loop pauses on a failed request and keeps the last good step", async () => {
  const h = harness({ total: 3, failure: new Error("网络中断") });
  h.loop.start();
  await h.flush();
  assert.deepEqual(h.steps, [0]);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].message, "网络中断");
  assert.equal(h.loop.state, "paused");
  assert.equal(h.scheduled, 0);
});

test("reveal loop can resume from the paused state without replaying", async () => {
  let allow = false;
  const h = harness({ total: 3, canRun: () => allow });
  h.loop.start();
  await h.flush();
  assert.equal(h.loop.state, "paused");
  allow = true;
  h.loop.start();
  await h.flush();
  assert.deepEqual(h.steps, [0, 1, 2]);
  assert.equal(h.loop.state, "done");
});

test("reveal loop finishes immediately when the session is already fully open", async () => {
  const h = harness({ total: 0 });
  h.loop.start();
  await h.flush();
  assert.deepEqual(h.steps, []);
  assert.equal(h.loop.state, "done");
});

test("disposing a reveal loop prevents any further step", async () => {
  const h = harness({ total: 3 });
  h.loop.start();
  h.loop.dispose();
  await h.flush();
  assert.deepEqual(h.steps, [0]);
  assert.equal(h.scheduled, 0);
  assert.equal(h.loop.state, "idle");
});

test("reveal loop exposes the documented states and default interval", () => {
  assert.deepEqual([...REVEAL_STATES], ["idle", "running", "paused", "done"]);
  assert.equal(REVEAL_INTERVAL_MS, 900);
  const h = harness({ total: 1 });
  assert.equal(h.loop.state, "idle");
  h.loop.start();
  assert.equal(h.loop.state, "running");
});

// Run the actual application wiring with a minimal DOM and deferred responses.
// This catches lifecycle races that the DOM-free scheduler cannot see.
import { readFileSync } from "node:fs";
import vm from "node:vm";
const appSource = readFileSync(
  new URL("./web/auction/assets/app.js", import.meta.url),
  "utf8",
)
  .replace(/^import .*;\n/gm, "")
  .replace(/boot\(\);\s*$/, "");
function appHarness() {
  const listeners = new Map();
  const modal = {
    addEventListener() {},
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  const node = {
    addEventListener() {},
    setAttribute() {},
    classList: { toggle() {} },
  };
  const doc = {
    hidden: false,
    body: node,
    querySelector: (s) => (s === "#detail-dialog" ? modal : node),
    querySelectorAll: () => [],
    addEventListener: (event, fn) => listeners.set(event, fn),
  };
  const context = vm.createContext({
    createRevealLoop,
    buildSeatStage: () => ({}),
    document: doc,
    location: { hash: "#play", origin: "https://auction.alicenekoqqq.cc.cd" },
    window: { addEventListener() {}, scrollTo() {} },
    setInterval() {},
    setTimeout,
    clearTimeout,
    URLSearchParams,
    console,
  });
  vm.runInContext(
    appSource +
      `
    renderPlay = () => {};
    toast = () => {};
    globalThis.h = {
      init() { guild = "3"; game = { session: { token: "one", status: "settled", reveal: { count: 0, total: 3, complete: false } } }; },
      setApi(fn) { api = fn; },
      setGuild(g) { guild = g; epoch++; },
      get game() { return game; },
      get wallet() { return wallet; },
      loop() { return ensureRevealLoop(); },
      dialog, closeDialog, pauseReveal, unlockAfterReveal, revealControls, route,
    };`,
    context,
  );
  context.h.init();
  return {
    h: context.h,
    doc,
    modal,
    context,
    visibility: () => listeners.get("visibilitychange")(),
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test("opening collectible details pauses the real app loop immediately", async (t) => {
  const { h, modal } = appHarness();
  h.setApi(async () => ({
    kind: "game",
    data: {
      session: {
        token: "one",
        status: "settled",
        reveal: { count: 1, total: 3, complete: false },
      },
    },
  }));
  const loop = h.loop();
  t.after(() => loop.dispose());
  loop.start();
  await settle();
  h.dialog("details");
  assert.equal(modal.open, true);
  assert.equal(loop.state, "paused");
  h.closeDialog();
  assert.equal(loop.state, "paused");
  modal.open = true;
  loop.start();
  await settle();
  assert.equal(loop.state, "paused");
  assert.equal(h.game.session.reveal.count, 1);
});
test("leaving play pauses immediately during an outstanding reveal", () => {
  const { h, context } = appHarness();
  const loop = h.loop();
  // Pause an already running request: its response may finish, but no next item.
  h.setApi(() => new Promise(() => {}));
  loop.start();
  context.location.hash = "#catalog";
  h.route();
  assert.equal(loop.state, "paused");
  loop.dispose();
});
test("an old guild reveal loop cannot start a request in a new guild", async () => {
  const { h } = appHarness();
  let calls = 0;
  h.setApi(async () => {
    calls++;
  });
  const loop = h.loop();
  h.setGuild("4");
  loop.start();
  await settle();
  assert.equal(calls, 0);
  assert.equal(loop.state, "paused");
  assert.notEqual(h.loop(), loop);
  loop.dispose();
  h.loop().dispose();
});
test("wallet unlock responses are discarded after switching guild", async () => {
  const { h } = appHarness();
  const responses = [];
  h.setApi(() => new Promise((resolve) => responses.push(resolve)));
  const pending = h.unlockAfterReveal();
  h.setGuild("4");
  responses.forEach((resolve) => resolve({ data: { from: "old guild" } }));
  await pending;
  assert.equal(h.wallet, null);
});
test("returning from a hidden tab cannot overwrite a newer guild session", async () => {
  const { h, doc, visibility } = appHarness();
  const old = h.game;
  h.setApi(async () => ({
    kind: "game",
    data: {
      session: {
        ...old.session,
        reveal: { count: 1, total: 3, complete: false },
      },
    },
  }));
  const loop = h.loop();
  loop.start();
  await settle();
  doc.hidden = true;
  visibility();
  let resolve;
  h.setApi(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  doc.hidden = false;
  visibility();
  h.setGuild("4");
  resolve({ data: { session: { token: "stale" } } });
  await settle();
  assert.equal(h.game.session.token, "one");
  assert.equal(loop.state, "paused");
  loop.dispose();
});
test("progress uses native progress values under the production CSP", () => {
  const { h } = appHarness();
  const html = h.revealControls(h.game.session);
  assert.match(html, /<progress[^>]+max="3" value="0"/);
  assert.doesNotMatch(html, /style=/);
  h.loop().dispose();
});

test("resuming during a slow request queues one continuation without duplicate steps", async () => {
  let count = 0,
    finish;
  const steps = [],
    timers = [];
  const loop = createRevealLoop({
    getStep: () => count,
    isComplete: () => count === 2,
    reveal: (step) => {
      steps.push(step);
      return new Promise((resolve) => {
        finish = () => {
          count++;
          resolve();
        };
      });
    },
    schedule: (fn) => {
      timers.push(fn);
      return 1;
    },
    cancel() {},
  });
  loop.start();
  loop.pause();
  loop.start();
  loop.start();
  assert.deepEqual(steps, [0]);
  finish();
  await settle();
  assert.equal(timers.length, 1);
  timers.shift()();
  assert.deepEqual(steps, [0, 1]);
  finish();
  await settle();
  assert.equal(loop.state, "done");
  loop.dispose();
});
test("a deliberate pause cancels a pending visibility resume", async () => {
  const { h, doc, visibility } = appHarness();
  h.setApi(async () => ({
    kind: "game",
    data: {
      session: {
        ...h.game.session,
        reveal: { count: 1, total: 3, complete: false },
      },
    },
  }));
  const loop = h.loop();
  loop.start();
  await settle();
  doc.hidden = true;
  visibility();
  let resolve;
  h.setApi(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  doc.hidden = false;
  visibility();
  h.pauseReveal();
  resolve({ data: h.game });
  await settle();
  assert.equal(loop.state, "paused");
  loop.dispose();
});


test("finishing a paused request republishes idle controls without another reveal", async () => {
  let count = 0, finish;
  const states = [];
  const loop = createRevealLoop({
    getStep: () => count, isComplete: () => false,
    reveal: () => new Promise((resolve) => { finish = () => { count++; resolve(); }; }),
    onChange: (state) => states.push({ state, busy: loop.busy }),
    schedule: () => { throw Error("paused request scheduled another step"); },
  });
  loop.start(); loop.pause(); finish(); await settle();
  assert.equal(loop.state, "paused"); assert.equal(loop.busy, false);
  assert.deepEqual(states.at(-1), { state: "paused", busy: false }); loop.dispose();
});
