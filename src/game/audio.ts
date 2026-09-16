/* ------------------------------------------------------------------ */
/* Cinematic WebAudio procedural sound engine — AAA studio quality    */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbNode: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let footStepSide = 1;

export function setMuted(m: boolean) {
  muted = m;
}

/** Rich outdoor convolution impulse with realistic atmospheric HF damping */
function createImpulseResponse(context: AudioContext, duration = 1.6, decay = 2.4): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = context.createBuffer(2, length, rate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / rate;
    // Exponential decay with natural high-frequency air dampening
    const damping = Math.exp(-t * decay);
    left[i] = (Math.random() * 2 - 1) * damping;
    right[i] = (Math.random() * 2 - 1) * damping;
  }
  return impulse;
}

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.62;

      // Studio dynamic mastering compressor: fast punchy attack, clean dynamic glue
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-16, ctx.currentTime);
      comp.knee.setValueAtTime(8, ctx.currentTime);
      comp.ratio.setValueAtTime(7, ctx.currentTime);
      comp.attack.setValueAtTime(0.002, ctx.currentTime);
      comp.release.setValueAtTime(0.14, ctx.currentTime);

      // Outdoor environmental reverb convolution
      reverbNode = ctx.createConvolver();
      reverbNode.buffer = createImpulseResponse(ctx, 1.5, 2.6);

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.32;
      reverbNode.connect(reverbGain);
      reverbGain.connect(master);

      master.connect(comp);
      comp.connect(ctx.destination);

      // Pre-baked white & pink noise buffer
      const len = ctx.sampleRate * 2;
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

function envelope(g: GainNode, t0: number, dur: number, peak: number, attack = 0.003) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + Math.max(attack, 0.001));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  peak = 0.4,
  sendReverb = false,
  pan = 0,
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

  if (pan !== 0 && c.createStereoPanner) {
    const panner = c.createStereoPanner();
    panner.pan.setValueAtTime(THREE_clamp(pan, -1, 1), t);
    o.connect(g);
    g.connect(panner);
    panner.connect(master);
    if (sendReverb && reverbNode) panner.connect(reverbNode);
  } else {
    o.connect(g);
    g.connect(master);
    if (sendReverb && reverbNode) g.connect(reverbNode);
  }

  o.start(t);
  o.stop(t + dur + 0.05);
}

function THREE_clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function noise(
  dur: number,
  filterType: BiquadFilterType,
  f0: number,
  f1: number,
  peak = 0.4,
  sendReverb = false,
  q = 1,
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
  filter.Q.value = q;
  filter.frequency.setValueAtTime(Math.max(f0, 10), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const g = c.createGain();
  envelope(g, t, dur, peak, 0.001);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  if (sendReverb && reverbNode) g.connect(reverbNode);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() {
    ac();
  },

  /** Heavy, thunderous, multi-layered AK-47 assault rifle gunshot */
  shoot() {
    // 1. Deep sub-bass punch (chest-thumping explosion)
    tone("sine", 185, 34, 0.22, 0.78, true);
    tone("sawtooth", 95, 38, 0.14, 0.38, false);

    // 2. High-velocity supersonic gunpowder crack / muzzle shockwave
    noise(0.18, "lowpass", 5200, 500, 0.85, true, 1.2);
    noise(0.09, "bandpass", 2400, 750, 0.62, false, 2.0);

    // 3. Crisp mechanical bolt cycle & receiver snap
    window.setTimeout(() => {
      if (muted) return;
      noise(0.04, "highpass", 2900, 3400, 0.26);
      tone("square", 520, 260, 0.045, 0.16);
    }, 40);

    // 4. Spent 7.62x39mm golden brass casing clinking and bouncing on terrain
    window.setTimeout(() => {
      if (muted) return;
      const pan1 = 0.25 + Math.random() * 0.2;
      tone("sine", 3350 + Math.random() * 300, 3100, 0.055, 0.10, false, pan1);
      window.setTimeout(() => {
        if (muted) return;
        tone("sine", 3550 + Math.random() * 300, 3250, 0.04, 0.07, false, pan1 + 0.05);
      }, 75);
    }, 270 + Math.random() * 60);
  },

  empty() {
    // Sharp hollow metallic firing pin strike on empty chamber
    tone("square", 820, 680, 0.035, 0.22);
    tone("sine", 1450, 1100, 0.04, 0.15);
    noise(0.03, "highpass", 3400, 2200, 0.2);
  },

  /** Tactical body hit tick + flesh impact */
  hit() {
    // Crisp tick marker
    tone("triangle", 980, 1450, 0.045, 0.42);
    // Flesh thud
    tone("sine", 240, 70, 0.08, 0.35);
    noise(0.05, "bandpass", 1400, 500, 0.3);
  },

  /** High-satisfaction headshot: crisp crystalline metallic chime + visceral crunch + sub drop */
  headshot() {
    // Iconic ringing harmonic bell tones (E7 & B7 high fidelity rings)
    tone("sine", 2637, 2600, 0.26, 0.55, true);
    tone("sine", 3951, 3900, 0.20, 0.38, true);
    tone("triangle", 1760, 1720, 0.16, 0.32, true);

    // Visceral skull shatter / crunch
    noise(0.14, "bandpass", 1800, 260, 0.65, false, 1.8);
    tone("sawtooth", 280, 55, 0.18, 0.48, true);
  },

  /** Kill confirmation deep sub drop + wet gore splat */
  kill() {
    tone("sawtooth", 360, 38, 0.36, 0.48, true);
    tone("sine", 110, 30, 0.28, 0.55, true);
    noise(0.22, "lowpass", 1400, 140, 0.52);
  },

  /** Player damage / pain grunt + visceral impact */
  hurt() {
    // Visceral punch
    tone("sawtooth", 160, 40, 0.38, 0.72);
    tone("sine", 90, 35, 0.25, 0.6);
    noise(0.24, "lowpass", 750, 100, 0.5);
  },

  /** Multi-phase authentic AK-47 tactical reload */
  reload() {
    // 1. Mag release paddle click
    tone("square", 420, 320, 0.05, 0.25);
    noise(0.06, "highpass", 2600, 1900, 0.22);

    // 2. Banana magazine rocking out with metal slide friction
    window.setTimeout(() => {
      if (muted) return;
      tone("triangle", 240, 170, 0.07, 0.2);
      noise(0.09, "bandpass", 1100, 420, 0.18);
    }, 260);

    // 3. Fresh curved steel mag slapped home into receiver ("KA-CHUNK!")
    window.setTimeout(() => {
      if (muted) return;
      tone("square", 480, 580, 0.08, 0.38);
      tone("sine", 135, 75, 0.14, 0.48);
      noise(0.10, "lowpass", 2100, 550, 0.42);
    }, 600);

    // 4. Steel charging handle pulled back
    window.setTimeout(() => {
      if (muted) return;
      tone("square", 680, 360, 0.07, 0.32);
      noise(0.08, "bandpass", 2400, 1300, 0.32);
    }, 840);

    // 5. Heavy bolt carrier slammed forward into battery with sharp metallic snap!
    window.setTimeout(() => {
      if (muted) return;
      tone("sine", 220, 80, 0.11, 0.42);
      tone("triangle", 1100, 850, 0.06, 0.28);
      noise(0.09, "lowpass", 3600, 900, 0.44);
    }, 970);
  },

  /** Aim down sights / weapon lift rustle */
  ads(inAim: boolean) {
    if (muted) return;
    noise(0.07, "bandpass", inAim ? 1500 : 950, inAim ? 850 : 1400, 0.14);
  },

  /** Player footsteps with alternating stereo pan and terrain crunch */
  footstep(isSprint: boolean) {
    if (muted) return;
    footStepSide = -footStepSide;
    const p = 0.14 + (isSprint ? 0.06 : 0);
    // Left/right footstep stereo pan
    const pan = footStepSide * 0.22;
    noise(0.065, "bandpass", 650 + Math.random() * 220, 160, p, false, 1.2);
    tone("sine", 95 + Math.random() * 25, 42, 0.055, p * 0.85, false, pan);
  },

  /** Visceral undead zombie growl, snarl & throat rasp */
  zombieGroan(pitch = 1.0) {
    if (muted) return;
    // Throat formant rasp
    tone("sawtooth", 110 * pitch, 68 * pitch, 0.52, 0.30, true);
    tone("sawtooth", 82 * pitch, 52 * pitch, 0.45, 0.24, true);
    // Guttural breath noise
    noise(0.42, "bandpass", 520 * pitch, 190 * pitch, 0.32, true, 2.2);
  },

  /** Wave completion triumphant fan-fare & brass swell */
  wave() {
    const c = ac();
    if (!c || !master || muted) return;
    const baseTime = c.currentTime;
    // Sub rumble impact
    tone("sine", 120, 38, 0.6, 0.45, true);
    // Heroic brass intervals
    [329.63, 440, 554.37, 659.25, 880].forEach((f, i) => {
      const t = baseTime + i * 0.085;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      envelope(g, t, 0.38, 0.26);
      o.connect(g);
      g.connect(master!);
      if (reverbNode) g.connect(reverbNode);
      o.start(t);
      o.stop(t + 0.44);
    });
  },

  ui() {
    tone("sine", 940, 1120, 0.035, 0.16);
  },
};


