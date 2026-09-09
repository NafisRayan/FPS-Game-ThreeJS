import type { ReactNode } from "react";
import { useGame } from "../game/store";
import { controlsApi } from "../game/refs";
import { sfx } from "../game/audio";
import { CREDITS } from "../game/assets";
import {
  Crosshair,
  Play,
  RotateCcw,
  Skull,
  Trophy,
  Sparkles,
  Volume2,
  Wind,
  Trees,
  Smartphone,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="scanlines absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#05070d]/70 backdrop-blur-[3px]">
      <div className="grid-bg absolute inset-0 opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(3,5,10,0.85)_100%)]" />
      <div className="relative py-8">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accessibility / comfort settings                                    */
/* ------------------------------------------------------------------ */

function SettingRow({
  label,
  desc,
  icon,
  checked,
  onToggle,
}: {
  label: string;
  desc: string;
  icon: ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 rounded border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors hover:border-cyan-300/40">
      <span className="flex items-center gap-2.5">
        <span className="text-cyan-300/80">{icon}</span>
        <span>
          <span className="block text-sm font-semibold text-slate-200">{label}</span>
          <span className="block text-[11px] text-slate-500">{desc}</span>
        </span>
      </span>
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-cyan-400"
        checked={checked}
        onChange={onToggle}
        aria-label={label}
      />
    </label>
  );
}

/** Explicit control scheme selector shown on menu & pause screens. */
function ControlSchemeSelector() {
  const isTouch = useGame((s) => s.isTouch);
  const setIsTouch = useGame((s) => s.setIsTouch);

  return (
    <div className="mt-4 flex w-full max-w-sm flex-col gap-1.5 text-left">
      <span className="text-[10px] font-semibold tracking-[0.35em] text-slate-400">
        INPUT METHOD
      </span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setIsTouch(false)}
          className={`flex items-center justify-center gap-2 rounded border px-3 py-2.5 text-xs font-semibold tracking-wider transition-all ${
            !isTouch
              ? "border-cyan-400 bg-cyan-400/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
              : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-200"
          }`}
        >
          <Crosshair size={14} aria-hidden /> Mouse + Keys
        </button>
        <button
          type="button"
          onClick={() => setIsTouch(true)}
          className={`flex items-center justify-center gap-2 rounded border px-3 py-2.5 text-xs font-semibold tracking-wider transition-all ${
            isTouch
              ? "border-cyan-400 bg-cyan-400/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
              : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-200"
          }`}
        >
          <Smartphone size={14} aria-hidden /> Touch Screen
        </button>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const settings = useGame((s) => s.settings);
  const toggleSetting = useGame((s) => s.toggleSetting);
  return (
    <fieldset className="mt-6 w-full max-w-sm space-y-2" aria-label="Comfort settings">
      <legend className="mb-1 text-[10px] tracking-[0.4em] text-slate-500">
        COMFORT SETTINGS
      </legend>
      <SettingRow
        label="Reduce motion"
        desc="Disables recoil kick, head-bob and FOV punch"
        icon={<Wind size={15} />}
        checked={settings.reduceMotion}
        onToggle={() => toggleSetting("reduceMotion")}
      />
      <SettingRow
        label="Low bloom"
        desc="Softens glow effects for light sensitivity"
        icon={<Sparkles size={15} />}
        checked={settings.reduceBloom}
        onToggle={() => toggleSetting("reduceBloom")}
      />
      {/* Control scheme selector is placed prominently above */}
      <SettingRow
        label="Low detail"
        desc="Fewer grass blades — helps on weaker GPUs"
        icon={<Trees size={15} />}
        checked={settings.lowDetail}
        onToggle={() => toggleSetting("lowDetail")}
      />
      <SettingRow
        label="Mute audio"
        desc="Silences all synthesized sound effects"
        icon={<Volume2 size={15} />}
        checked={settings.muted}
        onToggle={() => toggleSetting("muted")}
      />
    </fieldset>
  );
}

/** Device-appropriate control cheat-sheet. */
function ControlLegend({ isTouch }: { isTouch: boolean }) {
  if (isTouch) {
    return (
      <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-300">
        <span>🕹️ Left thumb — move</span>
        <span>👆 Right drag — look</span>
        <span>🎯 Fire button — shoot</span>
        <span>👁️ Eye button — ADS aim</span>
        <span>⤴️ Arrows — jump</span>
        <span>🔄 Reload button</span>
      </div>
    );
  }
  return (
    <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-400 md:flex md:gap-6">
      <span><kbd>WASD</kbd> move</span>
      <span><kbd>SHIFT</kbd> sprint</span>
      <span><kbd>SPACE</kbd> jump</span>
      <span><kbd>LMB</kbd> fire</span>
      <span><kbd>RMB</kbd> aim (ADS)</span>
      <span><kbd>R</kbd> reload</span>
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* Start screen                                                        */
/* ------------------------------------------------------------------ */

function StartScreen() {
  const best = useGame((s) => s.bestScore);
  const isTouch = useGame((s) => s.isTouch);
  const start = () => {
    sfx.unlock();
    sfx.ui();
    controlsApi.lock();
  };

  return (
    <Shell>
      <div className="rise flex w-[min(92vw,600px)] flex-col items-center text-center font-hud">
        <div className="text-[10px] font-semibold tracking-[0.5em] text-emerald-300/80">
          FIELD STATION 12 // LIVE FIRE
        </div>
        <h1 className="title-glow mt-2 font-display text-4xl font-black tracking-wider text-slate-100 md:text-6xl">
          OVER<span className="text-emerald-300">GROWTH</span>
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
          A sunlit meadow ringed by forest. Rogue drones sweep in across the
          grass in waves — hold the clearing, wave after wave.
        </p>

        <button
          type="button"
          autoFocus
          onClick={start}
          className="btn-prime mt-7 flex items-center gap-3 rounded border border-cyan-300/40 px-10 py-4 font-display text-sm font-bold tracking-[0.35em] text-cyan-100 transition-all"
        >
          <Crosshair size={18} aria-hidden />
          {isTouch ? "TAP TO PLAY" : "CLICK TO PLAY"}
        </button>
        <ControlSchemeSelector />
        <ControlLegend isTouch={isTouch} />
        <SettingsPanel />

        {best > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs tracking-[0.2em] text-amber-300/90">
            <Trophy size={13} aria-hidden /> BEST SCORE {best}
          </div>
        )}
        <div className="mt-5 max-w-sm text-[9px] leading-relaxed tracking-[0.2em] text-slate-500">
          {CREDITS}
        </div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Pause screen                                                        */
/* ------------------------------------------------------------------ */

function PauseScreen() {
  const isTouch = useGame((s) => s.isTouch);
  const resume = () => {
    sfx.unlock();
    sfx.ui();
    controlsApi.lock();
  };
  const restart = () => {
    sfx.unlock();
    sfx.ui();
    useGame.getState().restart();
    controlsApi.lock();
  };

  return (
    <Shell>
      <div className="rise flex w-[min(92vw,520px)] flex-col items-center text-center font-hud">
        <div className="text-[10px] font-semibold tracking-[0.5em] text-cyan-300/70">
          TACTICAL HOLD
        </div>
        <h2 className="title-glow mt-2 font-display text-4xl font-black tracking-widest text-slate-100">
          PAUSED
        </h2>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            autoFocus
            onClick={resume}
            className="btn-prime flex items-center justify-center gap-3 rounded border border-cyan-300/40 px-8 py-3.5 font-display text-xs font-bold tracking-[0.3em] text-cyan-100 transition-all"
          >
            <Play size={15} aria-hidden /> {isTouch ? "TAP TO RESUME" : "RESUME"}
          </button>
          <button
            type="button"
            onClick={restart}
            className="flex items-center justify-center gap-3 rounded border border-white/15 bg-white/[0.04] px-8 py-3.5 font-display text-xs font-bold tracking-[0.3em] text-slate-300 transition-all hover:border-red-400/50 hover:text-red-200"
          >
            <RotateCcw size={15} aria-hidden /> RESTART
          </button>
        </div>

        <SettingsPanel />
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Death screen                                                        */
/* ------------------------------------------------------------------ */

function DeadScreen() {
  const score = useGame((s) => s.score);
  const wave = useGame((s) => s.wave);
  const kills = useGame((s) => s.kills);
  const best = useGame((s) => s.bestScore);

  const restart = () => {
    sfx.unlock();
    sfx.ui();
    useGame.getState().restart();
    controlsApi.lock();
  };
  const toMenu = () => {
    sfx.ui();
    useGame.getState().restart();
  };

  return (
    <Shell>
      <div className="rise flex w-[min(92vw,520px)] flex-col items-center text-center font-hud">
        <Skull size={40} className="text-red-500" aria-hidden />
        <div className="mt-3 text-[10px] font-semibold tracking-[0.5em] text-red-400/80">
          VITALS FLATLINED
        </div>
        <h2 className="red-glow mt-2 font-display text-4xl font-black tracking-widest text-red-100 md:text-5xl">
          SIGNAL LOST
        </h2>

        <div className="mt-7 grid w-full max-w-sm grid-cols-3 gap-2">
          {[
            ["SCORE", score],
            ["WAVE", wave],
            ["KILLS", kills],
          ].map(([label, value]) => (
            <div key={label as string} className="hud-panel rounded px-3 py-3">
              <div className="text-[9px] tracking-[0.3em] text-sky-300/70">{label}</div>
              <div className="font-display text-2xl font-bold text-slate-100">{value}</div>
            </div>
          ))}
        </div>
        {best > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs tracking-[0.2em] text-amber-300/90">
            <Trophy size={13} aria-hidden /> BEST {best}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            autoFocus
            onClick={restart}
            className="btn-prime flex items-center justify-center gap-3 rounded border border-cyan-300/40 px-8 py-3.5 font-display text-xs font-bold tracking-[0.3em] text-cyan-100 transition-all"
          >
            <RotateCcw size={15} aria-hidden /> REDEPLOY
          </button>
          <button
            type="button"
            onClick={toMenu}
            className="rounded border border-white/15 bg-white/[0.04] px-8 py-3.5 font-display text-xs font-bold tracking-[0.3em] text-slate-300 transition-all hover:border-slate-400/50"
          >
            STAND DOWN
          </button>
        </div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

export function Screens() {
  const phase = useGame((s) => s.phase);
  if (phase === "menu") return <StartScreen />;
  if (phase === "paused") return <PauseScreen />;
  if (phase === "dead") return <DeadScreen />;
  return null;
}
