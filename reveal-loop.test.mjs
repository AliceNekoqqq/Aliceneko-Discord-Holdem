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
