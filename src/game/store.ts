import { create } from "zustand";
import { controlsApi } from "./refs";
import { setMuted } from "./audio";
import { detectTouchDevice, resetInput } from "./input";

export type GamePhase = "menu" | "playing" | "paused" | "dead";

export interface Settings {
  reduceMotion: boolean;
  reduceBloom: boolean;
  muted: boolean;
  lowDetail: boolean;
}

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
  wave: number;
  enemiesLeft: number;
  ammo: number;
  reserve: number;
  reloading: boolean;
  bestScore: number;
  damageAt: number;
  hitAt: number;
  banner: string;
  bannerAt: number;
  settings: Settings;

  setPhase: (p: GamePhase) => void;
  setIsTouch: (b: boolean) => void;
  damage: (n: number) => void;
  heal: (n: number) => void;
  addKill: () => void;
  addScore: (n: number) => void;
  setEnemiesLeft: (n: number) => void;
  setAmmo: (n: number) => void;
  setReserve: (n: number) => void;
  setReloading: (b: boolean) => void;
  registerHit: () => void;
  showBanner: (t: string) => void;
  setWave: (n: number) => void;
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
  isTouch: detectTouchDevice(),
  runId: 0,
  health: 100,
  score: 0,
  kills: 0,
  wave: 1,
  enemiesLeft: 0,
  ammo: MAG_SIZE,
  reserve: START_RESERVE,
  reloading: false,
  bestScore: loadBest(),
  damageAt: 0,
  hitAt: 0,
  banner: "",
  bannerAt: 0,
  settings: {
    reduceMotion: false,
    reduceBloom: false,
    muted: false,
    lowDetail: false,
  },

  setPhase: (p) => set({ phase: p }),

  setIsTouch: (b) => {
    resetInput();
    set({ isTouch: b });
  },

  damage: (n) => {
    const s = get();
    if (s.phase !== "playing") return;
    const health = Math.max(0, s.health - n);
    set({ health, damageAt: Date.now() });
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

  addKill: () => {
    const s = get();
    const score = s.score + 100;
    const bestScore = Math.max(s.bestScore, score);
    if (bestScore !== s.bestScore) saveBest(bestScore);
    set({ kills: s.kills + 1, score, bestScore });
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
  registerHit: () => set({ hitAt: Date.now() }),
  showBanner: (t) => set({ banner: t, bannerAt: Date.now() }),
  setWave: (n) => set({ wave: n }),

  restart: () => {
    resetInput();
    return set((s) => ({
      phase: "menu" as GamePhase,
      runId: s.runId + 1,
      health: 100,
      score: 0,
      kills: 0,
      wave: 1,
      enemiesLeft: 0,
      ammo: MAG_SIZE,
      reserve: START_RESERVE,
      reloading: false,
      damageAt: 0,
      hitAt: 0,
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
