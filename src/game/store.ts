import { create } from "zustand";
import { controlsApi } from "./refs";
import { setMuted } from "./audio";
import { resetInput } from "./input";

export type GamePhase = "menu" | "playing" | "paused" | "dead";

export interface Settings {
  reduceMotion: boolean;
  reduceBloom: boolean;
  muted: boolean;
  lowDetail: boolean;
}

/** Runtime render-quality tier. "auto" reacts to measured FPS via
 *  <PerformanceMonitor/>; "high"/"low" pin the tier so a manual choice
 *  (or the "Low detail" toggle) always wins over the auto-downgrade. */
export type Quality = "high" | "low";

export const MAG_SIZE = 30;
export const START_RESERVE = 120;

interface GameStore {
  phase: GamePhase;
  /** True when the on-screen touch controls should drive the game. */
  isTouch: boolean;
  runId: number;
  health: number;
  score: number;
  kills: number;
  headshots: number;
  wave: number;
  enemiesLeft: number;
  ammo: number;
  reserve: number;
  reloading: boolean;
  aiming: boolean;
  bestScore: number;
  damageAt: number;
  damageAngle: number;
  hitAt: number;
  lastHitIsHeadshot: boolean;
  banner: string;
  bannerAt: number;
  settings: Settings;
  /** Quality tier picked automatically from measured FPS (see
   *  <PerformanceMonitor/> in App.tsx). Overridden by settings.lowDetail. */
  autoQuality: Quality;

  setPhase: (p: GamePhase) => void;
  setIsTouch: (b: boolean) => void;
  damage: (n: number, fromAngle?: number) => void;
  heal: (n: number) => void;
  addKill: (isHeadshot?: boolean) => void;
  addScore: (n: number) => void;
  setEnemiesLeft: (n: number) => void;
  setAmmo: (n: number) => void;
  setReserve: (n: number) => void;
  setReloading: (b: boolean) => void;
  setAiming: (b: boolean) => void;
  registerHit: (isHeadshot?: boolean) => void;
  showBanner: (t: string) => void;
  setWave: (n: number) => void;
  setAutoQuality: (q: Quality) => void;
  restart: () => void;
  toggleSetting: (k: keyof Settings) => void;
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem("nightfall-best") ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number) {
  try {
    localStorage.setItem("nightfall-best", String(n));
  } catch {
    /* storage unavailable */
  }
}

export const useGame = create<GameStore>()((set, get) => ({
  phase: "menu",
  // Defaults false — player picks keyboard/mouse or touch explicitly in the menu before playing
  isTouch: false,
  runId: 0,
  health: 100,
  score: 0,
  kills: 0,
  headshots: 0,
  wave: 1,
  enemiesLeft: 0,
  ammo: MAG_SIZE,
  reserve: START_RESERVE,
  reloading: false,
  aiming: false,
  bestScore: loadBest(),
  damageAt: 0,
  damageAngle: 0,
  hitAt: 0,
  lastHitIsHeadshot: false,
  banner: "",
  bannerAt: 0,
  settings: {
    reduceMotion: false,
    reduceBloom: false,
    muted: false,
    lowDetail: false,
  },
  autoQuality: "high",

  setPhase: (p) => set({ phase: p }),

  setIsTouch: (b) => {
    resetInput();
    set({ isTouch: b });
  },

  damage: (n, fromAngle = 0) => {
    const s = get();
    if (s.phase !== "playing") return;
    const health = Math.max(0, s.health - n);
    set({ health, damageAt: Date.now(), damageAngle: fromAngle });
    if (health <= 0) {
      set({ phase: "dead" });
      controlsApi.unlock();
    }
  },

  heal: (n) => {
    const s = get();
    if (s.phase !== "playing" || s.health >= 100) return;
    set({ health: Math.min(100, s.health + n) });
  },

  addKill: (isHeadshot = false) => {
    const s = get();
    const bonus = isHeadshot ? 250 : 100;
    const score = s.score + bonus;
    const bestScore = Math.max(s.bestScore, score);
    if (bestScore !== s.bestScore) saveBest(bestScore);
    set({
      kills: s.kills + 1,
      headshots: s.headshots + (isHeadshot ? 1 : 0),
      score,
      bestScore,
    });
  },

  addScore: (n) => {
    const s = get();
    const score = s.score + n;
    const bestScore = Math.max(s.bestScore, score);
    if (bestScore !== s.bestScore) saveBest(bestScore);
    set({ score, bestScore });
  },

  setEnemiesLeft: (n) => set({ enemiesLeft: n }),
  setAmmo: (n) => set({ ammo: Math.max(0, n) }),
  setReserve: (n) => set({ reserve: Math.max(0, n) }),
  setReloading: (b) => set({ reloading: b }),
  setAiming: (b) => set({ aiming: b }),
  registerHit: (isHeadshot = false) =>
    set({ hitAt: Date.now(), lastHitIsHeadshot: isHeadshot }),
  showBanner: (t) => set({ banner: t, bannerAt: Date.now() }),
  setWave: (n) => set({ wave: n }),
  setAutoQuality: (q) => set({ autoQuality: q }),

  restart: () => {
    resetInput();
    return set((s) => ({
      phase: "menu" as GamePhase,
      runId: s.runId + 1,
      health: 100,
      score: 0,
      kills: 0,
      headshots: 0,
      wave: 1,
      enemiesLeft: 0,
      ammo: MAG_SIZE,
      reserve: START_RESERVE,
      reloading: false,
      aiming: false,
      damageAt: 0,
      damageAngle: 0,
      hitAt: 0,
      lastHitIsHeadshot: false,
      banner: "",
      bannerAt: 0,
    }));
  },

  toggleSetting: (k) => {
    const s = get();
    const next = { ...s.settings, [k]: !s.settings[k] };
    if (k === "muted") setMuted(next.muted);
    set({ settings: next });
  },
}));
