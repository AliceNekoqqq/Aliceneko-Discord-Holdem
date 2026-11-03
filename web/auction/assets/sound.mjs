// Auction sound kit.
//
// Clips live in ./assets/sfx/ and are played through the Web Audio API. If a
// clip is missing (or the decode fails) the same event falls back to a small
// synthesised version, so the game never goes silent because of an asset.

const KEY = "auction-sound";
const REPO_CLIPS = ["click", "seal", "spin", "win", "lose", "coin"];
const clips = new Map();
let ctx = null;
let master = null;
let enabled = true;

function clipName(kind, detail) {
  if (kind === "reveal") {
    const q = Math.max(0, Math.min(5, detail?.quality ?? 0));
    return `reveal-${q}`;
  }
  return kind;
}

async function loadClip(name) {
  if (clips.has(name)) return clips.get(name);
  let buffer = null;
  try {
    const c = ensure();
    const res = await fetch(`./assets/sfx/${name}.wav`);
    if (res.ok && c) buffer = await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    buffer = null;
  }
  clips.set(name, buffer);
  return buffer;
}

function playClip(buffer, gain) {
  if (!buffer) return false;
  const c = ensure();
  if (!c || !enabled) return false;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
  return true;
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {}
  if (!enabled && master) master.gain.value = 0;
  if (enabled && master) master.gain.value = 0.22;
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.22 : 0;
  master.connect(ctx.destination);
  return ctx;
}

export function initSound() {
  try {
    enabled = localStorage.getItem(KEY) !== "0";
  } catch {}
  const unlock = () => {
    const c = ensure();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    // Warm the clips once the context is allowed to start.
    REPO_CLIPS.forEach((name) => loadClip(name));
    for (let q = 0; q < 6; q++) loadClip(`reveal-${q}`);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function tone({ freq, to, dur = 0.16, type = "sine", gain = 0.5, delay = 0 }) {
  const c = ensure();
  if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.18, gain = 0.35, cut = 1200, delay = 0 }) {
  const c = ensure();
  if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cut;
  const env = c.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(master);
  src.start(t);
}

// The chime climbs with quality: a white pull is a soft tick, a red one rings.
const REVEAL_NOTE = [392, 440, 494, 587, 698, 880];

export function play(kind, detail = {}) {
  if (!enabled) return;
  const name = clipName(kind, detail);
  if (clips.has(name)) {
    if (playClip(clips.get(name), 0.9)) return;
  } else {
    loadClip(name);
  }
  synthesise(kind, detail);
}

function synthesise(kind, detail = {}) {
  if (!enabled) return;
  switch (kind) {
    case "click":
      tone({ freq: 720, to: 620, dur: 0.05, type: "triangle", gain: 0.18 });
      break;
    case "seal":
      noise({ dur: 0.14, gain: 0.3, cut: 900 });
      tone({ freq: 150, to: 90, dur: 0.2, type: "sine", gain: 0.45 });
      break;
    case "spin":
      noise({ dur: 0.22, gain: 0.16, cut: 2600 });
      tone({ freq: 220, to: 520, dur: 0.22, type: "triangle", gain: 0.12 });
      break;
    case "reveal": {
      const q = Math.max(0, Math.min(5, detail.quality ?? 0));
      const base = REVEAL_NOTE[q];
      tone({ freq: base, dur: 0.18 + q * 0.03, type: "sine", gain: 0.35 });
      if (q >= 3) tone({ freq: base * 1.5, dur: 0.26, type: "sine", gain: 0.22, delay: 0.05 });
      if (q >= 4) tone({ freq: base * 2, dur: 0.3, type: "triangle", gain: 0.16, delay: 0.1 });
      if (q === 5) tone({ freq: base * 3, dur: 0.4, type: "sine", gain: 0.12, delay: 0.16 });
      break;
    }
    case "win":
      [523, 659, 784].forEach((f, i) =>
        tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.3, delay: i * 0.09 }),
      );
      break;
    case "lose":
      [392, 330].forEach((f, i) =>
        tone({ freq: f, dur: 0.26, type: "sine", gain: 0.24, delay: i * 0.12 }),
      );
      break;
    case "coin":
      tone({ freq: 990, dur: 0.08, type: "square", gain: 0.16 });
      tone({ freq: 1320, dur: 0.1, type: "square", gain: 0.14, delay: 0.07 });
      break;
    default:
      break;
  }
}
