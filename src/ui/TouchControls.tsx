import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../game/store";
import { input, playerApi, haptic } from "../game/input";
import { controlsApi } from "../game/refs";
import {
  Crosshair,
  ChevronsUp,
  RotateCw,
  Rabbit,
  Pause,
  RotateCcwSquare,
} from "lucide-react";

const JOY_RADIUS = 52;
const DEAD_ZONE = 0.14;
const LOOK_SENS = 1; // multiplier on top of the base radians-per-pixel

/**
 * Full-screen touch input layer.
 *
 * · Left ~45% of the screen (below the HUD strip) = dynamic movement stick
 *   — the base spawns wherever the thumb lands, so there's nothing to aim for.
 * · Everywhere else = drag to look.
 * · Action buttons sit on top and swallow their own pointers.
 *
 * All pointers are tracked by `pointerId`, so moving + looking + firing
 * simultaneously with three thumbs works correctly.
 */
export function TouchControls() {
  const phase = useGame((s) => s.phase);
  const reloading = useGame((s) => s.reloading);
  const ammo = useGame((s) => s.ammo);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const joyId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const lastLook = useRef({ x: 0, y: 0 });

  const [sprintOn, setSprintOn] = useState(false);
  const [firing, setFiring] = useState(false);

  /* ------------------------- joystick visuals ------------------------- */
  const showStick = useCallback((x: number, y: number) => {
    const base = baseRef.current;
    if (!base) return;
    base.style.left = `${x}px`;
    base.style.top = `${y}px`;
    base.style.opacity = "1";
  }, []);

  const moveKnob = useCallback((dx: number, dy: number) => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const hideStick = useCallback(() => {
    const base = baseRef.current;
    if (base) base.style.opacity = "0";
    moveKnob(0, 0);
  }, [moveKnob]);

  /* --------------------------- pointer flow --------------------------- */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = surfaceRef.current;
      if (!el) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isLeftZone = e.clientX < w * 0.45 && e.clientY > h * 0.22;

      if (isLeftZone && joyId.current === null) {
        joyId.current = e.pointerId;
        joyOrigin.current = { x: e.clientX, y: e.clientY };
        showStick(e.clientX, e.clientY);
        moveKnob(0, 0);
      } else if (lookId.current === null) {
        lookId.current = e.pointerId;
        lastLook.current = { x: e.clientX, y: e.clientY };
      }
      el.setPointerCapture?.(e.pointerId);
    },
    [showStick, moveKnob],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId === joyId.current) {
        let dx = e.clientX - joyOrigin.current.x;
        let dy = e.clientY - joyOrigin.current.y;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) {
          dx = (dx / len) * JOY_RADIUS;
          dy = (dy / len) * JOY_RADIUS;
        }
        moveKnob(dx, dy);

        let nx = dx / JOY_RADIUS;
        let ny = dy / JOY_RADIUS;
        const mag = Math.hypot(nx, ny);
        if (mag < DEAD_ZONE) {
          nx = 0;
          ny = 0;
        } else {
          // rescale past the dead zone so control feels linear
          const k = (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / mag;
          nx *= k;
          ny *= k;
        }
        input.moveX = nx;
        input.moveZ = -ny; // screen-up = forward
      } else if (e.pointerId === lookId.current) {
        input.lookDx += (e.clientX - lastLook.current.x) * LOOK_SENS;
        input.lookDy += (e.clientY - lastLook.current.y) * LOOK_SENS;
        lastLook.current = { x: e.clientX, y: e.clientY };
      }
    },
    [moveKnob],
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId === joyId.current) {
        joyId.current = null;
        input.moveX = 0;
        input.moveZ = 0;
        hideStick();
      } else if (e.pointerId === lookId.current) {
        lookId.current = null;
      }
    },
    [hideStick],
  );

  /* Release everything if the game leaves the playing phase. */
  useEffect(() => {
    if (phase === "playing") return;
    joyId.current = null;
    lookId.current = null;
    input.moveX = 0;
    input.moveZ = 0;
    input.fire = false;
    input.jump = false;
    setFiring(false);
    hideStick();
  }, [phase, hideStick]);

  if (phase !== "playing") return null;

  /* ----------------------------- buttons ----------------------------- */
  const btn =
    "pointer-events-auto flex select-none items-center justify-center rounded-full border backdrop-blur-md active:scale-95 transition-transform touch-none";

  const hold = (set: (v: boolean) => void, key: "fire" | "jump") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      input[key] = true;
      set(true);
      haptic(key === "jump" ? 14 : 8);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      input[key] = false;
      set(false);
    },
    onPointerCancel: () => {
      input[key] = false;
      set(false);
    },
    onLostPointerCapture: () => {
      input[key] = false;
      set(false);
    },
  });

  const empty = ammo <= 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-hud">
      {/* ---------------- look / move capture surface ---------------- */}
      <div
        ref={surfaceRef}
        className="pointer-events-auto absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(e) => e.preventDefault()}
        aria-hidden
      />

      {/* -------------------- dynamic movement stick -------------------- */}
      <div
        ref={baseRef}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150"
        style={{ left: 0, top: 0 }}
      >
        <div
          className="rounded-full border-2 border-white/35 bg-black/25 backdrop-blur-sm"
          style={{ width: JOY_RADIUS * 2, height: JOY_RADIUS * 2 }}
        />
        <div
          ref={knobRef}
          className="absolute left-1/2 top-1/2 rounded-full border border-white/60 bg-white/35 shadow-lg"
          style={{
            width: 46,
            height: 46,
            marginLeft: -23,
            marginTop: -23,
            willChange: "transform",
          }}
        />
      </div>

      {/* ------------------------ action buttons ------------------------ */}
      {/* Fire */}
      <button
        type="button"
        aria-label="Fire"
        {...hold(setFiring, "fire")}
        className={`${btn} absolute h-[92px] w-[92px] ${
          firing
            ? "border-red-300/90 bg-red-500/45"
            : "border-white/40 bg-white/15"
        }`}
        style={{
          right: "calc(env(safe-area-inset-right, 0px) + 22px)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)",
        }}
      >
        <Crosshair size={38} className="text-white drop-shadow" aria-hidden />
      </button>

      {/* Jump */}
      <button
        type="button"
        aria-label="Jump"
        {...hold(() => {}, "jump")}
        className={`${btn} absolute h-[66px] w-[66px] border-white/35 bg-white/12`}
        style={{
          right: "calc(env(safe-area-inset-right, 0px) + 128px)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 122px)",
        }}
      >
        <ChevronsUp size={28} className="text-white" aria-hidden />
      </button>

      {/* Reload */}
      <button
        type="button"
        aria-label="Reload weapon"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          playerApi.reload();
          haptic(16);
        }}
        className={`${btn} absolute h-[62px] w-[62px] ${
          empty && !reloading
            ? "border-amber-300 bg-amber-400/35 reload-blink"
            : "border-white/35 bg-white/12"
        }`}
        style={{
          right: "calc(env(safe-area-inset-right, 0px) + 34px)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 218px)",
        }}
      >
        <RotateCw size={25} className="text-white" aria-hidden />
      </button>

      {/* Sprint (toggle) */}
      <button
        type="button"
        aria-label="Toggle sprint"
        aria-pressed={sprintOn}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const next = !sprintOn;
          setSprintOn(next);
          input.sprint = next;
          haptic(10);
        }}
        className={`${btn} absolute h-[58px] w-[58px] ${
          sprintOn
            ? "border-emerald-300/90 bg-emerald-400/35"
            : "border-white/35 bg-white/12"
        }`}
        style={{
          left: "calc(env(safe-area-inset-left, 0px) + 24px)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 116px)",
        }}
      >
        <Rabbit size={24} className="text-white" aria-hidden />
      </button>

      {/* Pause — replaces the ESC key */}
      <button
        type="button"
        aria-label="Pause game"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          haptic(10);
          controlsApi.unlock();
        }}
        className={`${btn} absolute h-[42px] w-[42px] border-white/30 bg-black/35`}
        style={{
          left: "50%",
          marginLeft: -21,
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
        }}
      >
        <Pause size={19} className="text-white" aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portrait nudge — the HUD and thumb zones assume a landscape screen. */
/* ------------------------------------------------------------------ */

export function OrientationNotice() {
  const isTouch = useGame((s) => s.isTouch);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!isTouch || !portrait) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#070b12]/95 px-8 text-center font-hud"
      role="alert"
    >
      <RotateCcwSquare
        size={54}
        className="animate-pulse text-emerald-300"
        aria-hidden
      />
      <h2 className="mt-5 font-display text-lg font-bold tracking-[0.3em] text-slate-100">
        ROTATE YOUR DEVICE
      </h2>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
        OVERGROWTH is built for landscape — turn your phone sideways for the
        full field of view and comfortable thumb controls.
      </p>
    </div>
  );
}
