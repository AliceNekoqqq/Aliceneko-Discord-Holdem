// Auto-reveal scheduler for the warehouse auction.
//
// Progress is never invented locally: every step value handed to `reveal` is
// read from `getStep()`, i.e. the last server answer (`session.reveal.count`).
// A lost, superseded or replayed response can therefore only stall the loop —
// it can never skip an item or unlock one twice.
//
// The module is deliberately DOM-free and timer-agnostic so it can be driven by
// tests with an injected scheduler.

export const REVEAL_INTERVAL_MS = 900;
export const REVEAL_STATES = Object.freeze(["idle", "running", "paused", "done"]);

export function createRevealLoop(options = {}) {
  const {
    getStep,
    isComplete,
    reveal,
    canRun = () => true,
    interval = REVEAL_INTERVAL_MS,
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (handle) => clearTimeout(handle),
    onChange = () => {},
    onStall = () => {},
    onError = () => {},
  } = options;
  if (typeof getStep !== "function")
    throw new TypeError("createRevealLoop requires getStep");
  if (typeof isComplete !== "function")
    throw new TypeError("createRevealLoop requires isComplete");
  if (typeof reveal !== "function")
    throw new TypeError("createRevealLoop requires reveal");

  let state = "idle";
  let handle = null;
  let inFlight = false;
  let disposed = false;

  function enter(next) {
    if (state === next) return;
    state = next;
    onChange(state);
  }
  function clearTimer() {
    if (handle !== null) {
      cancel(handle);
      handle = null;
    }
  }
  function finish() {
    clearTimer();
    enter("done");
  }
  function pause() {
    clearTimer();
    enter("paused");
  }

  async function step() {
    if (disposed || inFlight) return;
    if (state !== "running") return;
    if (isComplete()) return finish();
    if (!canRun()) return pause();
    const before = getStep();
    if (!Number.isInteger(before) || before < 0) return pause();
    inFlight = true;
    try {
      await reveal(before);
    } catch (error) {
      inFlight = false;
      if (disposed) return;
      clearTimer();
      enter("paused");
      onError(error);
      return;
    }
    inFlight = false;
    if (disposed) return;
    if (isComplete()) return finish();
    // No server-side progress: stop instead of replaying the same step forever.
    if (getStep() <= before) {
      clearTimer();
      enter("paused");
      onStall(before);
      return;
    }
    if (state !== "running") return;
    handle = schedule(() => {
      handle = null;
      step();
    }, interval);
  }

  return {
    get state() {
      return state;
    },
    get busy() {
      return inFlight;
    },
    start() {
      if (disposed || state === "done" || state === "running") return;
      clearTimer();
      // An outstanding step owns the request; its completion schedules the next.
      enter("running");
      step();
    },
    pause() {
      if (disposed || state !== "running") return;
      clearTimer();
      enter("paused");
    },
    dispose() {
      disposed = true;
      clearTimer();
      state = "idle";
    },
  };
}
