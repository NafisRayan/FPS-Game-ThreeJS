import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Shared, mutable cross-component refs (no React re-renders involved) */
/* ------------------------------------------------------------------ */

/** Player spawn point (capsule centre). */
export const SPAWN = new THREE.Vector3(0, 1.35, 8);

/** Live player capsule-centre position, written by <Player/> each frame. */
export const playerPos = SPAWN.clone();

/** Bridge so DOM buttons can trigger pointer lock / unlock. */
export const controlsApi = {
  lock: () => {},
  unlock: () => {},
};

export type HitResult = "hit" | "kill" | "none";

export interface EnemyHandle {
  /** enemyId -> raycastable mesh */
  meshes: Map<number, THREE.Object3D>;
  /** Apply one bullet of damage. Returns what happened. */
  hit: (id: number) => HitResult;
}

/** Live handle to the enemy manager, set while <Enemies/> is mounted. */
export const enemyApi: { current: EnemyHandle | null } = { current: null };

/* ------------------------------------------------------------------ */
/* Arena layout — single source of truth, also used for spawn checks.  */
/* ------------------------------------------------------------------ */

export type ObstacleKind = "rock" | "crate" | "barrier" | "tree";

export interface Obstacle {
  pos: [number, number, number];
  size: [number, number, number];
  kind: ObstacleKind;
  /** Y rotation for the rendered model. */
  rot?: number;
}

export const OBSTACLES: Obstacle[] = [
  // Big rock outcrops — natural cover
  { pos: [0, 1.2, -8], size: [6, 2.4, 6], kind: "rock", rot: 0.4 },
  { pos: [-10, 0.9, 9], size: [4.4, 1.8, 4.4], kind: "rock", rot: 2.1 },
  { pos: [18, 1.1, -12], size: [5, 2.2, 4.6], kind: "rock", rot: 1.2 },
  { pos: [-24, 1.0, -16], size: [4.6, 2.0, 4.2], kind: "rock", rot: 3.4 },
  { pos: [26, 0.9, -2], size: [3.8, 1.8, 3.8], kind: "rock", rot: 0.9 },
  { pos: [-22, 0.85, 13], size: [3.6, 1.7, 3.4], kind: "rock", rot: 5.1 },

  // Sandbag / concrete barriers
  { pos: [14, 0.75, 0], size: [6, 1.5, 1.1], kind: "barrier" },
  { pos: [-15, 0.75, -6], size: [1.1, 1.5, 6], kind: "barrier" },
  { pos: [-2, 0.75, -20], size: [10, 1.5, 1.1], kind: "barrier" },
  { pos: [20, 0.75, 12], size: [1.1, 1.5, 8], kind: "barrier" },
  { pos: [5, 0.75, 15], size: [8, 1.5, 1.1], kind: "barrier" },

  // Wooden supply crates
  { pos: [8, 0.6, 4], size: [1.2, 1.2, 1.2], kind: "crate", rot: 0.2 },
  { pos: [8, 1.8, 4], size: [1.2, 1.2, 1.2], kind: "crate", rot: 0.9 },
  { pos: [-14, 0.6, -2], size: [1.2, 1.2, 1.2], kind: "crate", rot: 0.5 },
  { pos: [12, 0.6, -18], size: [1.2, 1.2, 1.2], kind: "crate", rot: 1.9 },
  { pos: [9.4, 0.6, 5.1], size: [1.2, 1.2, 1.2], kind: "crate", rot: 2.6 },
  { pos: [-9, 0.6, -14], size: [1.2, 1.2, 1.2], kind: "crate", rot: 0.1 },

  // Large trees inside the field (trunk colliders)
  { pos: [22, 3, 22], size: [1.4, 6, 1.4], kind: "tree", rot: 0.7 },
  { pos: [-22, 3, -22], size: [1.4, 6, 1.4], kind: "tree", rot: 2.4 },
  { pos: [-6, 3, 24], size: [1.4, 6, 1.4], kind: "tree", rot: 4.2 },
  { pos: [30, 3, -25], size: [1.4, 6, 1.4], kind: "tree", rot: 1.1 },
];

/** Half-extent of the playable square. */
export const ARENA_HALF = 43;

/**
 * True when (x, z) is far enough from the player and outside every
 * obstacle's footprint (with padding), so enemies never spawn inside cover.
 */
export function isSpawnClear(x: number, z: number): boolean {
  const dx = x - playerPos.x;
  const dz = z - playerPos.z;
  if (Math.hypot(dx, dz) < 13) return false;
  for (const o of OBSTACLES) {
    if (
      Math.abs(x - o.pos[0]) < o.size[0] / 2 + 1.7 &&
      Math.abs(z - o.pos[2]) < o.size[2] / 2 + 1.7
    ) {
      return false;
    }
  }
  return true;
}

/** Slide an enemy step so it doesn't clip through obstacle footprints. */
export function avoidObstacles(
  cx: number,
  cz: number,
  nx: number,
  nz: number,
): [number, number] {
  const clear = (x: number, z: number) => {
    for (const o of OBSTACLES) {
      if (
        Math.abs(x - o.pos[0]) < o.size[0] / 2 + 0.7 &&
        Math.abs(z - o.pos[2]) < o.size[2] / 2 + 0.7
      )
        return false;
    }
    return true;
  };
  if (clear(nx, nz)) return [nx, nz];
  if (clear(nx, cz)) return [nx, cz];
  if (clear(cx, nz)) return [cx, nz];
  return [cx, cz];
}
