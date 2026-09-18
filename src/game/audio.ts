/* ------------------------------------------------------------------ */
/* Cinematic WebAudio procedural sound engine — AAA studio quality    */
/* ------------------------------------------------------------------ */

import { playerPos, playerForward } from "./refs";

export type ZombieSoundType = "walker" | "runner" | "tank";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbNode: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let footStepSide = 1;

let softClipCurve: Float32Array | null = null;
let heavyClipCurve: Float32Array | null = null;

export function setMuted(m: boolean) {
  muted = m;
}

function makeSoftClipCurve(drive = 2.4, samples = 512): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * drive);
  }
  return curve;
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
      master.gain.value = 0.65;

      // Pre-compute saturation curves for authentic acoustic dynamics
      softClipCurve = makeSoftClipCurve(2.4, 512);
      heavyClipCurve = makeSoftClipCurve(4.8, 512);

      // Studio dynamic mastering compressor: fast punchy attack, clean dynamic glue
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-14, ctx.currentTime);
      comp.knee.setValueAtTime(8, ctx.currentTime);
      comp.ratio.setValueAtTime(7, ctx.currentTime);
      comp.attack.setValueAtTime(0.002, ctx.currentTime);
      comp.release.setValueAtTime(0.14, ctx.currentTime);

      // Outdoor environmental reverb convolution
      reverbNode = ctx.createConvolver();
      reverbNode.buffer = createImpulseResponse(ctx, 1.5, 2.6);

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.35;
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

/* ------------------------------------------------------------------ */
/* 3D Spatial Audio & Positional Attenuation Calculation               */
/* ------------------------------------------------------------------ */

interface SpatialSoundInfo {
  pan: number;
  vol: number;
  lowpassCutoff: number;
  sendReverb: boolean;
}

function computeSpatialSound(pos?: { x: number; z: number }): SpatialSoundInfo {
  if (!pos) {
    return { pan: 0, vol: 1, lowpassCutoff: 18000, sendReverb: true };
  }
  const dx = pos.x - playerPos.x;
  const dz = pos.z - playerPos.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 0.001) {
    return { pan: 0, vol: 1, lowpassCutoff: 18000, sendReverb: true };
  }

  const nx = dx / dist;
  const nz = dz / dist;

  // Player right vector: forward = (fx, 0, fz), right = (-fz, 0, fx)
  const fx = playerForward.x;
  const fz = playerForward.z;
  const rx = -fz;
  const rz = fx;

  const pan = THREE_clamp(nx * rx + nz * rz, -1, 1);
  const dotFwd = nx * fx + nz * fz; // +1 if in front, -1 if behind

  // Realistic distance falloff: close is intense & loud, decays over distance
  const vol = THREE_clamp(1 / (1 + Math.pow(dist / 4.2, 1.25)), 0.02, 1.0);

  // Atmospheric air absorption over distance + pinna head shadow if behind player
  const baseCutoff = Math.max(1400, 14000 - dist * 380);
  const lowpassCutoff = dotFwd < -0.15 ? baseCutoff * 0.65 : baseCutoff;

  return { pan, vol, lowpassCutoff, sendReverb: dist > 2.0 };
}

/* ------------------------------------------------------------------ */
/* Procedural Undead Zombie Vocal Synthesizer (Vocal Tract + LFO Fry) */
/* ------------------------------------------------------------------ */

function playZombieVocal(
  pos: { x: number; z: number } | undefined,
  type: ZombieSoundType = "walker",
  action: "groan" | "agro" | "attack" | "hurt" | "death" = "groan",
) {
  if (muted) return;
  const c = ac();
  if (!c || !master || !noiseBuf) return;
  const t = c.currentTime;

  const spatial = computeSpatialSound(pos);
  if (spatial.vol < 0.03) return; // Inaudible due to distance, save CPU

  // Determine base vocal characteristics based on zombie archetype & action
  let basePitch = 68;
  let endPitch = 50;
  let dur = 0.95;
  let flutterRate = 24; // LFO Hz (shredded vocal cords vibrating against necrotic tissue)
  let flutterDepth = 18; // Hz FM
  let baseGain = 0.68;
  let noiseAmt = 0.45;

  if (type === "tank") {
    // Earth-shaking, subterranean demon roar / bellow
    basePitch = 44;
    endPitch = 30;
    dur = 1.45;
    flutterRate = 18;
    flutterDepth = 22;
    baseGain = 0.92;
    noiseAmt = 0.58;
  } else if (type === "runner") {
    // High-cadence, rabid, aggressive screech / snarl
    basePitch = 145;
    endPitch = 118;
    dur = 0.58;
    flutterRate = 32;
    flutterDepth = 26;
    baseGain = 0.72;
    noiseAmt = 0.48;
  }

  // Adjust for action context
  if (action === "agro") {
    basePitch *= 1.22;
    endPitch *= 1.12;
    dur *= 0.85;
    baseGain *= 1.25;
    flutterRate *= 1.15;
  } else if (action === "attack") {
    basePitch *= 1.18;
    dur = 0.44;
    baseGain *= 1.30;
    flutterRate = 36;
  } else if (action === "hurt") {
    basePitch *= 1.12;
    dur = 0.22;
    baseGain *= 0.92;
  } else if (action === "death") {
    endPitch = Math.max(20, basePitch * 0.38);
    dur = 1.15;
    baseGain *= 0.95;
    flutterRate = 16;
  }

  // Micro-variation per vocalization
  const variation = 0.94 + Math.random() * 0.12;
  basePitch *= variation;
  endPitch *= variation;

  // Spatial output bus: connects to panner and lowpass air-absorption filter
  const outGain = c.createGain();
  outGain.gain.setValueAtTime(spatial.vol * baseGain, t);

  const airFilter = c.createBiquadFilter();
  airFilter.type = "lowpass";
  airFilter.frequency.setValueAtTime(spatial.lowpassCutoff, t);

  outGain.connect(airFilter);

  if (spatial.pan !== 0 && c.createStereoPanner) {
    const panner = c.createStereoPanner();
    panner.pan.setValueAtTime(spatial.pan, t);
    airFilter.connect(panner);
    panner.connect(master);
    if (spatial.sendReverb && reverbNode) panner.connect(reverbNode);
  } else {
    airFilter.connect(master);
    if (spatial.sendReverb && reverbNode) airFilter.connect(reverbNode);
  }

  // 1. Vocal cord oscillator with throat flutter LFO
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(basePitch, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(15, endPitch), t + dur);

  // Throat flutter LFO (simulates flapping necrotic vocal cords)
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(flutterRate, t);
  lfoGain.gain.setValueAtTime(flutterDepth, t);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);

  // Master vocal envelope
  const vocalGain = c.createGain();
  vocalGain.gain.setValueAtTime(0.0001, t);
  vocalGain.gain.exponentialRampToValueAtTime(0.78, t + Math.min(0.06, dur * 0.15));
  vocalGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  // Vocal tract formant filtering (3 parallel bandpass resonance filters)
  const f1 = c.createBiquadFilter();
  f1.type = "bandpass";
  f1.frequency.setValueAtTime(380 * (type === "tank" ? 0.75 : type === "runner" ? 1.3 : 1.0), t);
  f1.Q.setValueAtTime(3.2, t);

  const f2 = c.createBiquadFilter();
  f2.type = "bandpass";
  f2.frequency.setValueAtTime(950 * (type === "tank" ? 0.8 : type === "runner" ? 1.25 : 1.0), t);
  f2.Q.setValueAtTime(3.6, t);

  const f3 = c.createBiquadFilter();
  f3.type = "bandpass";
  f3.frequency.setValueAtTime(2200 * (type === "tank" ? 0.8 : type === "runner" ? 1.2 : 1.0), t);
  f3.Q.setValueAtTime(2.6, t);

  osc.connect(vocalGain);
  vocalGain.connect(f1);
  vocalGain.connect(f2);
  vocalGain.connect(f3);

  f1.connect(outGain);
  f2.connect(outGain);
  f3.connect(outGain);

  osc.start(t);
  osc.stop(t + dur + 0.05);

  // 2. Visceral rotting breath / phlegm noise
  const breath = c.createBufferSource();
  breath.buffer = noiseBuf;
  breath.loop = true;

  const breathFilter = c.createBiquadFilter();
  breathFilter.type = "bandpass";
  breathFilter.frequency.setValueAtTime(1200, t);
  breathFilter.frequency.exponentialRampToValueAtTime(380, t + dur);
  breathFilter.Q.setValueAtTime(2.0, t);

  const breathGain = c.createGain();
  breathGain.gain.setValueAtTime(0.0001, t);
  breathGain.gain.exponentialRampToValueAtTime(noiseAmt, t + 0.04);
  breathGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  breath.connect(breathFilter);
  breathFilter.connect(breathGain);
  breathGain.connect(outGain);

  breath.start(t, Math.random());
  breath.stop(t + dur + 0.05);

  // 3. Sub-rumble presence (Tanks and close-range growls)
  if (type === "tank" || (spatial.vol > 0.45 && action !== "hurt")) {
    const sub = c.createOscillator();
    const subG = c.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(type === "tank" ? 42 : 55, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + dur);
    subG.gain.setValueAtTime(0.0001, t);
    subG.gain.exponentialRampToValueAtTime(0.48, t + 0.05);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    sub.connect(subG);
    subG.connect(outGain);
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }
}

/* ------------------------------------------------------------------ */
/* Public SFX Interface                                               */
/* ------------------------------------------------------------------ */

export const sfx = {
  unlock() {
    ac();
  },

  /** Heavy, thunderous, multi-layered military AK-47 7.62x39mm assault rifle gunshot */
  shoot() {
    if (muted) return;
    const c = ac();
    if (!c || !master || !noiseBuf) return;
    const t = c.currentTime;

    // Organic micro-variation per shot (full-auto fire sounds dynamic & non-repetitive)
    const jitter = 0.96 + Math.random() * 0.08;
    const crackPitch = (1080 + Math.random() * 120) * jitter;
    const bassFreq = (162 + Math.random() * 14) * jitter;

    // -------------------------------------------------------------
    // Layer 1: Supersonic Muzzle Shockwave Crack (Sharp initial transient)
    // -------------------------------------------------------------
    const crackNoise = c.createBufferSource();
    crackNoise.buffer = noiseBuf;
    crackNoise.loop = true;

    const crackFilter = c.createBiquadFilter();
    crackFilter.type = "bandpass";
    crackFilter.frequency.setValueAtTime(3700 * jitter, t);
    crackFilter.Q.setValueAtTime(2.1, t);

    const crackGain = c.createGain();
    crackGain.gain.setValueAtTime(0.0001, t);
    crackGain.gain.exponentialRampToValueAtTime(0.96, t + 0.0008);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.036);

    const crackShaper = c.createWaveShaper();
    if (heavyClipCurve) (crackShaper.curve as unknown as Float32Array) = heavyClipCurve;
    crackShaper.oversample = "2x";

    crackNoise.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(crackShaper);
    crackShaper.connect(master);

    // Violent supersonic projectile breach spike (1100Hz -> 50Hz in 15ms)
    const transientOsc = c.createOscillator();
    const transientGain = c.createGain();
    transientOsc.type = "sawtooth";
    transientOsc.frequency.setValueAtTime(crackPitch, t);
    transientOsc.frequency.exponentialRampToValueAtTime(48, t + 0.015);
    transientGain.gain.setValueAtTime(0.88, t);
    transientGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.024);

    transientOsc.connect(transientGain);
    transientGain.connect(master);
    transientOsc.start(t);
    transientOsc.stop(t + 0.03);

    crackNoise.start(t, Math.random());
    crackNoise.stop(t + 0.04);

    // -------------------------------------------------------------
    // Layer 2: 7.62x39mm Combustion & Chest-Thumping Sub-Bass Detonation
    // -------------------------------------------------------------
    const subOsc = c.createOscillator();
    const subGain = c.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(bassFreq, t);
    subOsc.frequency.exponentialRampToValueAtTime(32, t + 0.22);
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.98, t + 0.0015);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

    subOsc.connect(subGain);
    subGain.connect(master);
    subOsc.start(t);
    subOsc.stop(t + 0.25);

    // Saturated mid-bass acoustic body (warmth and punch)
    const midOsc = c.createOscillator();
    const midGain = c.createGain();
    midOsc.type = "triangle";
    midOsc.frequency.setValueAtTime(bassFreq * 1.35, t);
    midOsc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    midGain.gain.setValueAtTime(0.0001, t);
    midGain.gain.exponentialRampToValueAtTime(0.68, t + 0.002);
    midGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    const midShaper = c.createWaveShaper();
    if (softClipCurve) (midShaper.curve as unknown as Float32Array) = softClipCurve;
    midOsc.connect(midGain);
    midGain.connect(midShaper);
    midShaper.connect(master);
    midOsc.start(t);
    midOsc.stop(t + 0.16);

    // -------------------------------------------------------------
    // Layer 3: Expanding Muzzle Gas Jet & Fiery Fireball Roar
    // -------------------------------------------------------------
    const gasNoise = c.createBufferSource();
    gasNoise.buffer = noiseBuf;
    gasNoise.loop = true;

    const gasFilter = c.createBiquadFilter();
    gasFilter.type = "lowpass";
    gasFilter.frequency.setValueAtTime(5600 * jitter, t);
    gasFilter.frequency.exponentialRampToValueAtTime(280, t + 0.17);
    gasFilter.Q.setValueAtTime(1.8, t);

    const gasGain = c.createGain();
    gasGain.gain.setValueAtTime(0.0001, t);
    gasGain.gain.exponentialRampToValueAtTime(0.85, t + 0.002);
    gasGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);

    gasNoise.connect(gasFilter);
    gasFilter.connect(gasGain);
    gasGain.connect(master);
    if (reverbNode) {
      const wetGain = c.createGain();
      wetGain.gain.value = 0.40;
      gasGain.connect(wetGain);
      wetGain.connect(reverbNode);
    }

    gasNoise.start(t, Math.random());
    gasNoise.stop(t + 0.20);

    // -------------------------------------------------------------
    // Layer 4: Tactical Bolt Carrier Cycle & Gas Piston Vent
    // -------------------------------------------------------------
    window.setTimeout(() => {
      if (muted) return;
      const c2 = ac();
      if (!c2 || !master || !noiseBuf) return;
      const t2 = c2.currentTime;

      // Bolt carrier rearward travel & metal receiver snap
      const boltNoise = c2.createBufferSource();
      boltNoise.buffer = noiseBuf;
      const boltFilter = c2.createBiquadFilter();
      boltFilter.type = "bandpass";
      boltFilter.frequency.setValueAtTime(3400, t2);
      boltFilter.Q.setValueAtTime(3.2, t2);
      const boltGain = c2.createGain();
      boltGain.gain.setValueAtTime(0.0001, t2);
      boltGain.gain.exponentialRampToValueAtTime(0.24, t2 + 0.001);
      boltGain.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.035);

      boltNoise.connect(boltFilter);
      boltFilter.connect(boltGain);
      boltGain.connect(master);
      boltNoise.start(t2, Math.random());
      boltNoise.stop(t2 + 0.04);
    }, 24);

    // -------------------------------------------------------------
    // Layer 5: Outdoor Terrain Slapback Echo (Canyon / Outcrop Bounce)
    // -------------------------------------------------------------
    window.setTimeout(() => {
      if (muted) return;
      const c3 = ac();
      if (!c3 || !master || !noiseBuf) return;
      const t3 = c3.currentTime;

      const slapNoise = c3.createBufferSource();
      slapNoise.buffer = noiseBuf;
      const slapFilter = c3.createBiquadFilter();
      slapFilter.type = "lowpass";
      slapFilter.frequency.setValueAtTime(1400, t3);
      const slapGain = c3.createGain();
      slapGain.gain.setValueAtTime(0.0001, t3);
      slapGain.gain.exponentialRampToValueAtTime(0.26, t3 + 0.003);
      slapGain.gain.exponentialRampToValueAtTime(0.0001, t3 + 0.18);

      slapNoise.connect(slapFilter);
      slapFilter.connect(slapGain);
      slapGain.connect(master);
      if (reverbNode) slapGain.connect(reverbNode);
      slapNoise.start(t3, Math.random());
      slapNoise.stop(t3 + 0.2);
    }, 45);

    // -------------------------------------------------------------
    // Layer 6: Spent 7.62x39mm golden brass casing bouncing
    // -------------------------------------------------------------
    window.setTimeout(() => {
      if (muted) return;
      const pan1 = 0.22 + Math.random() * 0.22;
      tone("sine", 3450 + Math.random() * 250, 3150, 0.05, 0.12, false, pan1);
      window.setTimeout(() => {
        if (muted) return;
        tone("sine", 3650 + Math.random() * 250, 3350, 0.035, 0.08, false, pan1 + 0.04);
      }, 70 + Math.random() * 30);
    }, 260 + Math.random() * 50);
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
    const pan = footStepSide * 0.22;
    noise(0.065, "bandpass", 650 + Math.random() * 220, 160, p, false, 1.2);
    tone("sine", 95 + Math.random() * 25, 42, 0.055, p * 0.85, false, pan);
  },

  /** Visceral undead zombie growl, snarl & throat rasp with 3D spatial audio */
  zombieGroan(posOrPitch?: { x: number; z: number } | number, type: ZombieSoundType = "walker") {
    if (typeof posOrPitch === "number") {
      playZombieVocal(undefined, type, "groan");
    } else {
      playZombieVocal(posOrPitch, type, "groan");
    }
  },

  /** Aggressive detection / charging snarl */
  zombieAgro(pos?: { x: number; z: number }, type: ZombieSoundType = "walker") {
    playZombieVocal(pos, type, "agro");
  },

  /** Snapping bite / lunge attack growl */
  zombieAttack(pos?: { x: number; z: number }, type: ZombieSoundType = "walker") {
    playZombieVocal(pos, type, "attack");
  },

  /** Bullet impact pain flinch / guttural grunt */
  zombieHurt(pos?: { x: number; z: number }) {
    playZombieVocal(pos, "walker", "hurt");
  },

  /** Dying throat collapse / death gargle */
  zombieDeath(pos?: { x: number; z: number }, type: ZombieSoundType = "walker") {
    playZombieVocal(pos, type, "death");
  },

  /** Wave spawn atmospheric collective horde roar across the arena */
  zombieHordeRoar() {
    if (muted) return;
    const c = ac();
    if (!c || !master) return;

    // Distant subterranean sub rumble
    tone("sine", 65, 28, 1.8, 0.45, true);
    tone("sawtooth", 52, 34, 1.6, 0.35, true);

    // Multi-staged distant howling roars across left & right channels
    [-0.55, 0.48, -0.15].forEach((pan, idx) => {
      const delay = idx * 0.16;
      window.setTimeout(() => {
        if (muted) return;
        const c2 = ac();
        if (!c2 || !master) return;
        const t2 = c2.currentTime;
        const o = c2.createOscillator();
        const g = c2.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(58 + idx * 12, t2);
        o.frequency.exponentialRampToValueAtTime(36 + idx * 8, t2 + 1.2);
        envelope(g, t2, 1.2, 0.28);

        const f = c2.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.setValueAtTime(520, t2);
        f.Q.setValueAtTime(2.2, t2);

        o.connect(g);
        g.connect(f);

        if (c2.createStereoPanner) {
          const p = c2.createStereoPanner();
          p.pan.setValueAtTime(pan, t2);
          f.connect(p);
          p.connect(master);
          if (reverbNode) p.connect(reverbNode);
        } else {
          f.connect(master);
          if (reverbNode) f.connect(reverbNode);
        }

        o.start(t2);
        o.stop(t2 + 1.3);
      }, delay * 1000);
    });
  },

  /** Wave completion triumphant fan-fare & brass swell */
  wave() {
    const c = ac();
    if (!c || !master || muted) return;
    const baseTime = c.currentTime;
    tone("sine", 120, 38, 0.6, 0.45, true);
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
