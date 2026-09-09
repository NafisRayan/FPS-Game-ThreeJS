/* ------------------------------------------------------------------ */
/* Unified input layer.                                                */
/*                                                                     */
/* Keyboard/mouse AND touch controls both write into this single       */
/* mutable object; <Player/> reads it every frame. Because the two     */
/* schemes are additive, a device with both (e.g. a Surface or an      */
/* Android tablet with a keyboard) can use either at any moment.       */
/* ------------------------------------------------------------------ */

export interface InputState {
  /** -1 (left) … +1 (right) */
  moveX: number;
  /** -1 (back) … +1 (forward) */
  moveZ: number;
  /** Look deltas in pixels, consumed & zeroed each frame. */
  lookDx: number;
  lookDy: number;
  jump: boolean;
  sprint: boolean;
  fire: boolean;
  aim: boolean;
}

/** Touch-driven state (merged with keyboard state inside <Player/>). */
export const input: InputState = {
  moveX: 0,
  moveZ: 0,
  lookDx: 0,
  lookDy: 0,
  jump: false,
  sprint: false,
  fire: false,
  aim: false,
};

export function resetInput() {
  input.moveX = 0;
  input.moveZ = 0;
  input.lookDx = 0;
  input.lookDy = 0;
  input.jump = false;
  input.sprint = false;
  input.fire = false;
  input.aim = false;
}

/**
 * Manual yaw/pitch used when PointerLockControls is unavailable
 * (i.e. touch devices). Kept in sync so switching schemes is seamless.
 */
export const lookState = { yaw: 0, pitch: 0 };

/** Imperative hooks into the player, registered by <Player/>. */
export const playerApi = {
  reload: () => {},
};

/* ------------------------------------------------------------------ */
/* Device detection                                                    */
/* ------------------------------------------------------------------ */

/**
 * True for phones/tablets: a coarse primary pointer *and* real touch
 * points. This deliberately ignores the user-agent string (unreliable,
 * and iPadOS lies), and won't misfire on touch-capable laptops that
 * still have a mouse as the primary pointer.
 */
export function detectTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const points = navigator.maxTouchPoints ?? 0;
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const noHover =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none)").matches;
  return points > 0 && (coarse || noHover);
}

/** Short buzz for touch feedback, where supported. */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
