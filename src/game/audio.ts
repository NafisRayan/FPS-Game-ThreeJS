/* ------------------------------------------------------------------ */
/* Tiny WebAudio synth — zero-asset SFX for the game.                  */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      // shared noise buffer
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function envelope(g: GainNode, t0: number, dur: number, peak: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  peak = 0.4,
) {
  if (muted) return;
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(f0, 1), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  envelope(g, t, dur, peak);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(
  dur: number,
  filterType: BiquadFilterType,
  f0: number,
  f1: number,
  peak = 0.4,
) {
  if (muted) return;
  const c = ac();
  if (!c || !master || !noiseBuf) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const g = c.createGain();
  envelope(g, t, dur, peak);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  /** Call from a user gesture to warm up the AudioContext. */
  unlock() {
    ac();
  },
  shoot() {
    noise(0.09, "lowpass", 2600, 320, 0.5);
    tone("square", 150, 55, 0.07, 0.16);
  },
  empty() {
    tone("square", 720, 640, 0.035, 0.1);
  },
  hit() {
    tone("triangle", 680, 1150, 0.06, 0.26);
  },
  kill() {
    tone("sawtooth", 320, 42, 0.3, 0.38);
    noise(0.26, "bandpass", 950, 140, 0.5);
  },
  hurt() {
    tone("sawtooth", 150, 55, 0.28, 0.5);
    noise(0.2, "lowpass", 700, 160, 0.32);
  },
  reload() {
    tone("square", 260, 260, 0.05, 0.14);
    window.setTimeout(() => tone("square", 380, 380, 0.05, 0.15), 320);
    window.setTimeout(() => tone("square", 520, 520, 0.07, 0.2), 800);
  },
  wave() {
    const c = ac();
    if (!c || !master || muted) return;
    const baseTime = c.currentTime;
    [392, 523, 659, 784].forEach((f, i) => {
      const t = baseTime + i * 0.085;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      envelope(g, t, 0.14, 0.18);
      o.connect(g);
      g.connect(master!);
      o.start(t);
      o.stop(t + 0.18);
    });
  },
  ui() {
    tone("triangle", 600, 600, 0.05, 0.12);
  },
};
