import { useProgress } from "@react-three/drei";
import { CREDITS } from "../game/assets";

/**
 * Full-screen boot overlay shown while the real HDRI sky, PBR ground
 * textures, rifle and hand meshes stream in from their CDNs.
 */
export function Loader() {
  const { active, progress, item } = useProgress();
  if (!active && progress >= 100) return null;

  const pct = Math.min(100, Math.round(progress));
  const file = (item || "").split("/").pop()?.slice(0, 42) ?? "";

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#070b12] font-hud">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="relative flex w-[min(90vw,420px)] flex-col items-center">
        <div className="font-display text-[11px] font-bold tracking-[0.55em] text-emerald-300/80">
          LOADING ASSETS
        </div>
        <h1 className="title-glow mt-3 font-display text-3xl font-black tracking-wider text-slate-100">
          OVERGROWTH
        </h1>

        <div
          className="mt-6 h-1.5 w-full overflow-hidden rounded bg-white/10"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading game assets"
        >
          <div
            className="h-full rounded bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)] transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex w-full justify-between text-[10px] tracking-[0.2em] text-slate-500">
          <span className="truncate pr-3">{file}</span>
          <span className="shrink-0 text-emerald-300">{pct}%</span>
        </div>

        <p className="mt-8 max-w-xs text-center text-[9px] leading-relaxed tracking-[0.15em] text-slate-600">
          {CREDITS}
        </p>
      </div>
    </div>
  );
}
