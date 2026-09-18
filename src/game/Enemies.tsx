import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { MODELS } from "./assets";
import { useGame } from "./store";
import {
  enemyApi,
  playerPos,
  isSpawnClear,
  avoidObstacles,
  ARENA_HALF,
  SPAWN,
} from "./refs";
import { sfx } from "./audio";

/* ------------------------------------------------------------------ */
/* Types & Zombie Archetype Profiles                                  */
/* ------------------------------------------------------------------ */

export type ZombieType = "walker" | "runner" | "tank";

export const ZOMBIE_PROFILES: Record<
  ZombieType,
  {
    baseSpeed: number;
    hp: number;
    scale: number;
    tint: string;
    shirtColor: string;
    damage: number;
  }
> = {
  walker: {
    baseSpeed: 1.6,
    hp: 1,
    scale: 1.0,
    tint: "#506346", // decaying greenish-grey corpse
    shirtColor: "#4a5b6c",
    damage: 14,
  },
  runner: {
    baseSpeed: 3.2,
    hp: 1,
    scale: 0.88,
    tint: "#6b493e", // rabid bloodstained infected
    shirtColor: "#802828",
    damage: 10,
  },
  tank: {
    baseSpeed: 1.1,
    hp: 3,
    scale: 1.35,
    tint: "#3d473a", // bruised necrotic monstrosity
    shirtColor: "#5a3d31",
    damage: 25,
  },
};

const ENEMY_Y = 0.0;
const CONTACT_DIST = 1.35;
const MAX_POOL_SIZE = 14;

export interface EnemyData {
  id: number;
  x: number;
  z: number;
  type: ZombieType;
  speed: number;
  hp: number;
  color: string;
}

/** Per-enemy mutable runtime state (never touches React state during frames). */
interface Rt {
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  speed: number;
  type: ZombieType;
  flashUntil: number;
  color: string;
  active: boolean;
}

interface Burst {
  pos: THREE.Vector3;
  color: string;
  isHeadshot?: boolean;
}

let nextId = 1;

function generateWaveSpawns(wave: number): EnemyData[] {
  const count = Math.min(4 + wave, 12); // 5 – 12 zombies per wave
  const list: EnemyData[] = [];
  let guard = 0;

  while (list.length < count && guard++ < 600) {
    const angle = (Math.PI * 2 * list.length) / count + (Math.random() - 0.5) * 0.5;
    const dist = 15 + Math.random() * 11;
    const x = THREE.MathUtils.clamp(playerPos.x + Math.cos(angle) * dist, -ARENA_HALF + 4, ARENA_HALF - 4);
    const z = THREE.MathUtils.clamp(playerPos.z + Math.sin(angle) * dist, -ARENA_HALF + 4, ARENA_HALF - 4);
    if (!isSpawnClear(x, z)) continue;

    const id = nextId++;
    let type: ZombieType = "walker";
    const roll = Math.random();
    if (wave >= 3 && roll < 0.25) {
      type = "tank";
    } else if (wave >= 2 && roll < 0.55) {
      type = "runner";
    }

    const profile = ZOMBIE_PROFILES[type];
    const speed = profile.baseSpeed + Math.min(wave * 0.1, 0.6) + Math.random() * 0.25;

    list.push({
      id,
      x,
      z,
      type,
      speed,
      hp: profile.hp,
      color: profile.shirtColor,
    });
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* High-Performance Pooled Enemy Manager                               */
/* Pre-allocates zombie meshes so wave transitions are instantaneous!  */
/* ------------------------------------------------------------------ */

export function Enemies() {
  const wave = useGame((s) => s.wave);
  const meshes = useRef(new Map<number, THREE.Object3D>()).current;
  const rts = useRef(new Map<number, Rt>()).current;
  const bursts = useRef<Burst[]>([]);
  const nextWaveTimer = useRef<number | null>(null);

  // Active enemies slot allocation: map slot index -> active EnemyData or null
  const [activeSlots, setActiveSlots] = useState<(EnemyData | null)[]>(() =>
    Array(MAX_POOL_SIZE).fill(null)
  );

  const removeEnemy = (id: number, byPlayer: boolean, isHeadshot = false) => {
    const rt = rts.get(id);
    if (!rt || !rt.active) return;
    rt.active = false;

    // Trigger positional death groan / throat rattle
    sfx.zombieDeath({ x: rt.pos.x, z: rt.pos.z }, rt.type);

    const burstPos = isHeadshot
      ? rt.pos.clone().add(new THREE.Vector3(0, 1.35, 0))
      : rt.pos.clone().add(new THREE.Vector3(0, 0.9, 0));

    bursts.current.push({
      pos: burstPos,
      color: isHeadshot ? "#ff1a2b" : rt.color,
      isHeadshot,
    });

    meshes.delete(id);
    // Deactivate in runtime state; useFrame hides it immediately with zero React re-render overhead
    rt.active = false;

    if (byPlayer) useGame.getState().addKill(isHeadshot);

    // Count alive
    let alive = 0;
    rts.forEach((r) => {
      if (r.active) alive++;
    });
    useGame.getState().setEnemiesLeft(alive);

    if (alive === 0) {
      const st = useGame.getState();
      if (st.phase !== "playing" && st.phase !== "paused") return;
      st.showBanner("WAVE CLEARED  ·  +250");
      st.addScore(250);
      sfx.ui();

      if (nextWaveTimer.current) window.clearTimeout(nextWaveTimer.current);
      nextWaveTimer.current = window.setTimeout(() => {
        const s2 = useGame.getState();
        if (s2.phase !== "playing" && s2.phase !== "paused") return;
        const nw = s2.wave + 1;
        s2.setWave(nw);
        s2.setReserve(Math.min(999, s2.reserve + 45));
        s2.showBanner(`WAVE ${nw}`);
        sfx.wave();
      }, 1200);
    }
  };

  const onContact = (id: number, type: ZombieType) => {
    const st = useGame.getState();
    if (st.phase !== "playing") return;
    const rt = rts.get(id);
    const angle = rt ? Math.atan2(rt.pos.x - playerPos.x, rt.pos.z - playerPos.z) : 0;
    if (rt) sfx.zombieAttack({ x: rt.pos.x, z: rt.pos.z }, type);
    removeEnemy(id, false);
    const dmg = ZOMBIE_PROFILES[type].damage;
    st.damage(dmg, angle);
    sfx.hurt();
    sfx.kill();
  };

  /* Imperative bridge used by the player's hitscan raycaster */
  useEffect(() => {
    enemyApi.current = {
      meshes,
      hit: (id, isHeadshot = false) => {
        const rt = rts.get(id);
        if (!rt || !rt.active) return "none";
        const damage = isHeadshot ? 3 : 1;
        rt.hp -= damage;
        if (rt.hp <= 0) {
          removeEnemy(id, true, isHeadshot);
          return isHeadshot ? "headshot" : "kill";
        }
        rt.flashUntil = performance.now() + 140;
        sfx.zombieHurt({ x: rt.pos.x, z: rt.pos.z });
        return isHeadshot ? "headshot" : "hit";
      },
    };
    return () => {
      enemyApi.current = null;
      if (nextWaveTimer.current) window.clearTimeout(nextWaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Fresh run: make sure spawn validation measures from the spawn pad. */
  useEffect(() => {
    if (useGame.getState().phase === "menu") playerPos.copy(SPAWN);
  }, []);

  /* Spawn wave into pre-allocated slots instantly without re-mounting! */
  useEffect(() => {
    const list = generateWaveSpawns(wave);
    rts.clear();
    meshes.clear();

    const newSlots: (EnemyData | null)[] = Array(MAX_POOL_SIZE).fill(null);
    for (let i = 0; i < list.length && i < MAX_POOL_SIZE; i++) {
      const e = list[i];
      newSlots[i] = e;
      rts.set(e.id, {
        pos: new THREE.Vector3(e.x, ENEMY_Y, e.z),
        hp: e.hp,
        maxHp: e.hp,
        speed: e.speed,
        type: e.type,
        flashUntil: 0,
        color: e.color,
        active: true,
      });
    }

    setActiveSlots(newSlots);
    useGame.getState().setEnemiesLeft(list.length);
    if (useGame.getState().phase === "playing") {
      sfx.zombieHordeRoar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave]);

  return (
    <group>
      {/* Pool of 14 persistently mounted zombie components */}
      {Array.from({ length: MAX_POOL_SIZE }).map((_, index) => (
        <PooledZombie
          key={`pool-${index}`}
          slotIndex={index}
          slotData={activeSlots[index]}
          meshes={meshes}
          rtGet={(id) => rts.get(id)}
          onContact={onContact}
        />
      ))}
      <Bursts bursts={bursts} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Pooled Zombie Component with In-Place Kinematic Locomotion         */
/* ------------------------------------------------------------------ */

interface PooledZombieProps {
  slotIndex: number;
  slotData: EnemyData | null;
  meshes: Map<number, THREE.Object3D>;
  rtGet: (id: number) => Rt | undefined;
  onContact: (id: number, type: ZombieType) => void;
}

function PooledZombie({
  slotData,
  meshes,
  rtGet,
  onContact,
}: PooledZombieProps) {
  const group = useRef<THREE.Group>(null);
  const meshAnchorRef = useRef<THREE.Mesh>(null);
  const lastGroan = useRef(performance.now() + Math.random() * 3000);
  const hasAgroedRef = useRef(false);
  const lastAttackGroan = useRef(0);
  const isFlashingRef = useRef(false);

  const { scene, animations } = useGLTF(MODELS.zombie);

  // Convert animation clip once into a true in-place locomotion cycle
  // (neutralizing root motion on hips X & Z so feet step cleanly without sliding)
  const inPlaceClip = useMemo(() => {
    const base = animations[0];
    if (!base) return null;
    const clip = base.clone();
    const track = clip.tracks.find((t) => t.name === "mixamorigHips_01.position");
    if (track) {
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = 0;     // Center X
        track.values[i + 2] = 0; // Lock Z root forward translation to 0
      }
    }
    return clip;
  }, [animations]);

  // Clone scene once on mount
  const { clonedScene, materials } = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: THREE.MeshStandardMaterial[] = [];
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        if (mesh.material) {
          const setupMaterial = (m: THREE.Material) => {
            const std = m.clone() as THREE.MeshStandardMaterial;
            std.roughness = 0.92;
            std.metalness = 0.04;
            std.envMapIntensity = 0.3;
            mats.push(std);
            return std;
          };
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(setupMaterial);
          } else {
            mesh.material = setupMaterial(mesh.material);
          }
        }
      }
    });
    return { clonedScene: clone, materials: mats };
  }, [scene]);

  // Use the in-place locomotion clip
  const clips = useMemo(() => (inPlaceClip ? [inPlaceClip] : []), [inPlaceClip]);
  const { actions } = useAnimations(clips, clonedScene);

  // When slot data changes, update archetype appearance & speed
  useEffect(() => {
    if (!slotData) return;
    hasAgroedRef.current = false;
    lastGroan.current = performance.now() + 1000 + Math.random() * 3000;
    const profile = ZOMBIE_PROFILES[slotData.type];
    const tintColor = new THREE.Color(profile.tint);

    // Update material colors
    for (const mat of materials) {
      mat.color.copy(tintColor);
      mat.emissive.set("#000000");
      mat.emissiveIntensity = 0;
    }
    isFlashingRef.current = false;

    // Register mesh anchor with current enemy ID
    if (meshAnchorRef.current) {
      meshes.set(slotData.id, meshAnchorRef.current);
    }

    // Play animation with speed-synchronized timeScale to prevent sliding!
    const clipName = Object.keys(actions)[0];
    const act = actions[clipName];
    if (act) {
      act.reset().fadeIn(0.15).play();
      if (slotData.type === "runner") {
        // High-cadence sprint cycle: ~3 strides/sec matching ~3.2m/s forward travel
        act.timeScale = Math.max(2.8, slotData.speed * 0.88);
      } else if (slotData.type === "tank") {
        act.timeScale = 0.82;
      } else {
        act.timeScale = 1.15;
      }
    }

    return () => {
      meshes.delete(slotData.id);
    };
  }, [slotData, actions, materials, meshes]);

  useFrame((_, dtRaw) => {
    const g = group.current;
    if (!g) return;

    if (!slotData) {
      g.visible = false;
      g.position.set(0, -999, 0);
      return;
    }

    const r = rtGet(slotData.id);
    if (!r || !r.active) {
      g.visible = false;
      g.position.set(0, -999, 0);
      return;
    }

    g.visible = true;
    const dt = Math.min(dtRaw, 0.05);
    const st = useGame.getState();
    const now = performance.now();

    if (st.phase === "playing") {
      const dx = playerPos.x - r.pos.x;
      const dz = playerPos.z - r.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist < CONTACT_DIST) {
        onContact(slotData.id, slotData.type);
        return;
      }

      // 1. Sudden aggressive roar/snarl when locking on and closing in
      if (dist < 12 && !hasAgroedRef.current) {
        hasAgroedRef.current = true;
        sfx.zombieAgro({ x: r.pos.x, z: r.pos.z }, slotData.type);
      }

      // 2. Snapping lunge growl right before striking
      if (dist < 3.2 && now - lastAttackGroan.current > 3400) {
        lastAttackGroan.current = now;
        sfx.zombieAttack({ x: r.pos.x, z: r.pos.z }, slotData.type);
      }

      // 3. Positional guttural growls & raspy moans (frequency ramps up closer to player)
      const interval = dist < 6 ? 2600 : dist < 12 ? 4000 : 6200;
      if (dist < 22 && now - lastGroan.current > interval + Math.random() * 2800) {
        lastGroan.current = now;
        sfx.zombieGroan({ x: r.pos.x, z: r.pos.z }, slotData.type);
      }

      if (dist > 0.001) {
        const step = slotData.speed * dt;
        const nx = r.pos.x + (dx / dist) * step;
        const nz = r.pos.z + (dz / dist) * step;
        const [sx, sz] = avoidObstacles(r.pos.x, r.pos.z, nx, nz);
        r.pos.x = THREE.MathUtils.clamp(sx, -ARENA_HALF + 1, ARENA_HALF - 1);
        r.pos.z = THREE.MathUtils.clamp(sz, -ARENA_HALF + 1, ARENA_HALF - 1);
      }
    }

    g.position.set(r.pos.x, 0.0, r.pos.z);

    // Rotate towards player directly
    const angleToPlayer = Math.atan2(playerPos.x - r.pos.x, playerPos.z - r.pos.z);
    g.rotation.y = angleToPlayer;

    // Runners lean aggressively forward into the sprint
    if (slotData.type === "runner") {
      g.rotation.x = 0.22;
    } else {
      g.rotation.x = 0.0;
    }

    // High-performance hit flash (only triggers material uniform update on transition)
    const shouldFlash = r.flashUntil - now > 0;
    if (shouldFlash !== isFlashingRef.current) {
      isFlashingRef.current = shouldFlash;
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i];
        if (shouldFlash) {
          mat.emissive.set("#ff2222");
          mat.emissiveIntensity = 2.5;
        } else {
          mat.emissive.set("#000000");
          mat.emissiveIntensity = 0;
        }
      }
    }
  });

  const profile = slotData ? ZOMBIE_PROFILES[slotData.type] : ZOMBIE_PROFILES.walker;
  const isTank = slotData?.type === "tank";
  const isRunner = slotData?.type === "runner";
  const modelScale = (isTank ? 0.95 : isRunner ? 0.60 : 0.68) * profile.scale;
  const colliderHeight = 1.95 * profile.scale;

  return (
    <group ref={group} position={[0, -999, 0]} visible={false}>
      {/* Raycast hit-target capsule anchor */}
      <mesh
        ref={meshAnchorRef}
        userData={{ enemyId: slotData?.id ?? -1 }}
        position={[0, colliderHeight * 0.5, 0]}
      >
        <capsuleGeometry args={[0.42 * profile.scale, 1.1 * profile.scale, 8, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Photorealistic 3D Animated Zombie Skeletal Mesh */}
      <primitive
        object={clonedScene}
        scale={[modelScale, modelScale, modelScale]}
        position={[0, 0, 0]}
      />

      {/* Distinctive archetype visual aura/eyes (Zero point-light churn = zero shader recompilation lag) */}
      {isTank && (
        <mesh position={[0, 1.82, 0.22]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshBasicMaterial color="#ff4400" toneMapped={false} />
        </mesh>
      )}
      {isRunner && (
        <mesh position={[0, 1.48, 0.18]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshBasicMaterial color="#ffea00" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Death bursts — one instanced mesh for all shrapnel particles.       */
/* ------------------------------------------------------------------ */

const MAX_PARTICLES = 96;
const tmpObj = new THREE.Object3D();

function Bursts({ bursts }: { bursts: React.RefObject<Burst[]> }) {
  const im = useRef<THREE.InstancedMesh>(null);
  const parts = useRef<
    { p: THREE.Vector3; v: THREE.Vector3; life: number; color: THREE.Color }[]
  >([]);

  useFrame((_, dtRaw) => {
    const mesh = im.current;
    if (!mesh) return;
    const dt = Math.min(dtRaw, 0.05);

    while (bursts.current.length > 0) {
      const b = bursts.current.pop()!;
      const count = b.isHeadshot ? 24 : 14;
      for (let i = 0; i < count && parts.current.length < MAX_PARTICLES; i++) {
        const v = new THREE.Vector3(
          Math.random() * 2 - 1,
          b.isHeadshot ? Math.random() * 2.2 + 0.5 : Math.random() * 1.3 + 0.15,
          Math.random() * 2 - 1,
        )
          .normalize()
          .multiplyScalar((b.isHeadshot ? 3.5 : 2.2) + Math.random() * 3.4);

        const colorStr = b.isHeadshot
          ? i % 4 === 0
            ? "#f0f0f0" // bone shard
            : i % 2 === 0
              ? "#ff1122" // bright arterial blood
              : "#8a0303" // dark visceral blood
          : b.color;

        const c = new THREE.Color(colorStr).multiplyScalar(2.6);
        parts.current.push({ p: b.pos.clone(), v, life: 0, color: c });
      }
    }

    const list = parts.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const pt = list[i];
      pt.life += dt;
      if (pt.life > 0.55) {
        list.splice(i, 1);
        continue;
      }
      pt.v.y -= 11 * dt;
      pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.06) {
        pt.p.y = 0.06;
        pt.v.y *= -0.45;
      }
    }

    for (let i = 0; i < list.length; i++) {
      const pt = list[i];
      tmpObj.position.copy(pt.p);
      tmpObj.scale.setScalar(Math.max((1 - pt.life / 0.55) * 0.16, 0.0001));
      tmpObj.rotation.set(pt.life * 7, pt.life * 9, 0);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      mesh.setColorAt(i, pt.color);
    }
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={im}
      args={[undefined, undefined, MAX_PARTICLES]}
      frustumCulled={false}
    >
      <tetrahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

useGLTF.preload(MODELS.zombie);
