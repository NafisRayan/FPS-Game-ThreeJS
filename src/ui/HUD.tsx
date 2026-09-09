import { useGame, MAG_SIZE } from "../game/store";
import { Heart, Skull, Trophy, VolumeX, Radiation } from "lucide-react";

export function HUD() {
  const phase = useGame((s) => s.phase);
  const runId = useGame((s) => s.runId);
  const health = Math.round(useGame((s) => s.health));
  const score = useGame((s) => s.score);
  const kills = useGame((s) => s.kills);
  const wave = useGame((s) => s.wave);
  const enemiesLeft = useGame((s) => s.enemiesLeft);
  const ammo = useGame((s) => s.ammo);
  const reserve = useGame((s) => s.reserve);
  const reloading = useGame((s) => s.reloading);
  const bestScore = useGame((s) => s.bestScore);
  const damageAt = useGame((s) => s.damageAt);
  const hitAt = useGame((s) => s.hitAt);
  const banner = useGame((s) => s.banner);
  const bannerAt = useGame((s) => s.bannerAt);
  const muted = useGame((s) => s.settings.muted);
  const isTouch = useGame((s) => s.isTouch);
  const aiming = useGame((s) => s.aiming);
  if (phase !== "playing") return null;

  const hpColor = health > 50 ? "#39ff8e" : health > 25 ? "#ffb347" : "#ff3355";
  const recentHit = hitAt > 0 && Date.now() - hitAt < 320;
  const recentDmg = damageAt > 0 && Date.now() - damageAt < 700;
  const showBanner = bannerAt > 0 && Date.now() - bannerAt < 2600;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-hud">
      {/* ------- damage vignette ------- */}
      {recentDmg && <div key={damageAt} className="dmg-flash absolute inset-0" />}

      {/* ------- wave banner ------- */}
      {showBanner && (
        <div
          key={bannerAt}
          className="banner-anim absolute left-0 right-0 top-[24%] text-center font-display text-xl md:text-2xl font-bold tracking-[0.4em] text-white title-glow"
        >
          {banner}
        </div>
      )}

      {/* ------- crosshair + hit marker ------- */}
      {/* ------- crosshair + hit marker (hidden while aiming down optical sight) ------- */}
      <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-150 ${aiming ? "opacity-0" : "opacity-100"}`}>
        <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 shadow-[0_0_6px_rgba(120,230,255,0.9)]" />
        <div className="absolute left-1/2 top-1/2 h-[10px] w-[2px] -translate-x-1/2 bg-white" style={{ transform: "translate(-50%, -15px)" }} />
        <div className="absolute left-1/2 top-1/2 h-[10px] w-[2px] -translate-x-1/2 bg-white" style={{ transform: "translate(-50%, 5px)" }} />
        <div className="absolute left-1/2 top-1/2 h-[2px] w-[10px] -translate-y-1/2 bg-white" style={{ transform: "translate(-15px, -50%)" }} />
        <div className="absolute left-1/2 top-1/2 h-[2px] w-[10px] -translate-y-1/2 bg-white" style={{ transform: "translate(5px, -50%)" }} />
        {recentHit && (
          <div key={hitAt} className="hit-marker absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-1/2 h-[2px] w-[26px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-400 shadow-[0_0_8px_rgba(255,60,90,0.9)]" />
            <div className="absolute left-1/2 top-1/2 h-[2px] w-[26px] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-400 shadow-[0_0_8px_rgba(255,60,90,0.9)]" />
          </div>
        )}
      </div>

      {/* ------- health (top-left) ------- */}
      <div className="hud-panel absolute left-3 top-3 w-[150px] rounded-md px-3 py-2 sm:left-5 sm:top-5 sm:w-[230px] sm:px-4 sm:py-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.3em] text-emerald-200/90">
            <Heart size={12} aria-hidden /> VITALS
          </span>
          <span className="font-display text-xl font-bold" style={{ color: hpColor }}>
            {health}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
          <div
            className={`h-full rounded transition-all duration-200 ${health <= 25 ? "low-hp" : ""}`}
            style={{ width: `${health}%`, background: hpColor, boxShadow: `0 0 10px ${hpColor}` }}
          />
        </div>
      </div>

      {/* ------- score (top-right) ------- */}
      <div className="hud-panel absolute right-3 top-3 rounded-md px-3 py-2 text-right sm:right-5 sm:top-5 sm:px-4 sm:py-3">
        <div className="text-[10px] font-semibold tracking-[0.3em] text-emerald-200/90">SCORE</div>
        <div className="font-display text-2xl font-bold text-slate-100">
          {String(score).padStart(6, "0")}
        </div>
        <div className="mt-1 flex items-center justify-end gap-4 text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            <Skull size={12} className="text-red-400" aria-hidden /> {kills}
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy size={12} className="text-amber-300" aria-hidden /> {Math.max(bestScore, score)}
          </span>
        </div>
      </div>

      {/* ------- wave + hostiles (bottom-left) ------- */}
      <div className="hud-panel absolute bottom-3 left-3 rounded-md px-3 py-2 sm:bottom-5 sm:left-5 sm:px-4 sm:py-3">
        <div className="text-[10px] font-semibold tracking-[0.3em] text-emerald-200/90">WAVE</div>
        <div className="font-display text-2xl font-bold text-slate-100">{String(wave).padStart(2, "0")}</div>
        <div className="mt-1.5 flex items-center gap-1" aria-label={`${enemiesLeft} hostiles remaining`}>
          <Radiation size={12} className="text-red-400" aria-hidden />
          {Array.from({ length: enemiesLeft }).map((_, i) => (
            <span key={i} className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(255,60,90,0.9)]" />
          ))}
        </div>
      </div>

      {/* ------- ammo (bottom-right) ------- */}
      <div className="hud-panel absolute right-3 top-[76px] rounded-md px-3 py-2 text-right sm:bottom-5 sm:right-5 sm:top-auto sm:px-4 sm:py-3">
        <div className="text-[10px] font-semibold tracking-[0.3em] text-emerald-200/90">
          {reloading ? <span className="reload-blink text-amber-300">RELOADING</span> : "AMMO"}
        </div>
        <div className="font-display text-3xl font-bold text-slate-100">
          {ammo}
          <span className="ml-1 text-base font-medium text-slate-500">/ {MAG_SIZE}</span>
        </div>
        <div className="mt-0.5 text-xs tracking-[0.2em] text-slate-400">
          RESERVE {String(reserve).padStart(3, "0")}
        </div>
      </div>

      {/* ------- controls hint (fades away) ------- */}
      {!isTouch && (
        <div
          key={runId}
          className="hint-fade absolute left-1/2 top-5 -translate-x-1/2 rounded border border-white/10 bg-black/30 px-4 py-1.5 text-[10px] tracking-[0.25em] text-slate-300"
        >
          <kbd>WASD</kbd> MOVE · <kbd>SHIFT</kbd> SPRINT · <kbd>SPACE</kbd> JUMP ·{" "}
          <kbd>R</kbd> RELOAD · <kbd>M</kbd> MUTE · <kbd>ESC</kbd> PAUSE
        </div>
      )}
      {isTouch && (
        <div
          key={`t${runId}`}
          className="hint-fade absolute left-1/2 top-14 -translate-x-1/2 rounded border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] tracking-[0.2em] text-slate-200"
        >
          LEFT THUMB MOVE · DRAG RIGHT TO LOOK
        </div>
      )}

      {/* ------- muted indicator ------- */}
      {muted && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-slate-500">
          <VolumeX size={16} aria-label="Audio muted" />
        </div>
      )}
    </div>
  );
}
