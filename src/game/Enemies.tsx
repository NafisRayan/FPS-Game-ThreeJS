import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
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
/* Types & Zombie Archetype Wave Generation                           */
/* ------------------------------------------------------------------ */

export type ZombieType = "walker" | "runner" | "tank";

const ZOMBIE_PROFILES: Record<
  ZombieType,
  {
    baseSpeed: number;
    hp: number;
    scale: number;
    skinColor: string;
    shirtColor: string;
    pantsColor: string;
    eyeColor: string;
    damage: number;
  }
> = {
  walker: {
    baseSpeed: 1.8,
    hp: 1,
    scale: 1.0,
    skinColor: "#5e8255", // rotting greenish-grey
    shirtColor: "#4a5b6c", // tattered blue
    pantsColor: "#2d333b", // dark slate
    eyeColor: "#ff2222", // piercing red
    damage: 14,
  },
  runner: {
    baseSpeed: 3.2,
    hp: 1,
    scale: 0.9,
    skinColor: "#739462", // pale sickly green
    shirtColor: "#802828", // ripped bloody crimson
    pantsColor: "#3a342d", // brown
    eyeColor: "#ffee00", // feral yellow
    damage: 10,
  },
  tank: {
    baseSpeed: 1.2,
    hp: 3,
    scale: 1.35,
    skinColor: "#4d6948", // bruised dark green
    shirtColor: "#5a3d31", // dirty ragged brown
    pantsColor: "#1f2421", // black
    eyeColor: "#ff6600", // fiery amber
    damage: 25,
  },
};

const ENEMY_Y = 0.0; // Zombies walk on the ground (feet on Y=0)
const CONTACT_DIST = 1.35;

interface EnemyData {
  id: number;
  x: number;
  z: number;
  type: ZombieType;
  speed: number;
  phase: number;
  hp: number;
  color: string;
}

/** Per-enemy mutable runtime state (never touches React state). */
interface Rt {
  pos: THREE.Vector3;
  hp: number;
  flashUntil: number;
  color: string;
  type: ZombieType;
}

interface Burst {
  pos: THREE.Vector3;
  color: string;
}

let nextId = 1;

function spawnWave(wave: number): EnemyData[] {
  const count = Math.min(4 + wave, 12); // 5 – 12 zombies per wave
  const list: EnemyData[] = [];
  let guard = 0;

  while (list.length < count && guard++ < 600) {
    const x = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
    const z = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
    if (!isSpawnClear(x, z)) continue;

    const id = nextId++;
    // Wave composition:
    // Wave 1: Mostly Walkers
    // Wave 2+: Fast Runners appear
    // Wave 3+: Heavy Tanks appear (multi-HP behemoths)
    let type: ZombieType = "walker";
    const roll = Math.random();
    if (wave >= 3 && roll < 0.25) {
      type = "tank";
    } else if (wave >= 2 && roll < 0.55) {
      type = "runner";
    }

    const profile = ZOMBIE_PROFILES[type];
    const speed = profile.baseSpeed + wave * 0.12 + Math.random() * 0.35;

    list.push({
      id,
      x,
      z,
      type,
      speed,
      phase: Math.random() * Math.PI * 2,
      hp: profile.hp,
      color: profile.shirtColor,
    });
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* Enemy manager                                                       */
/* ------------------------------------------------------------------ */

export function Enemies() {
  const wave = useGame((s) => s.wave);
  const [enemies, setEnemies] = useState<EnemyData[]>([]);
  const meshes = useRef(new Map<number, THREE.Object3D>()).current;
  const rts = useRef(new Map<number, Rt>()).current;
  const bursts = useRef<Burst[]>([]);
  const nextWaveTimer = useRef<number | null>(null);

  const remove = (id: number, byPlayer: boolean) => {
    const rt = rts.get(id);
    if (!rt) return;
    bursts.current.push({ pos: rt.pos.clone(), color: rt.color });
    rts.delete(id);
    meshes.delete(id);
    setEnemies((prev) => prev.filter((e) => e.id !== id));
    if (byPlayer) useGame.getState().addKill();
  };

  const onContact = (id: number, type: ZombieType) => {
    const st = useGame.getState();
    if (st.phase !== "playing") return;
    remove(id, false);
    const dmg = ZOMBIE_PROFILES[type].damage;
    st.damage(dmg);
    sfx.hurt();
    sfx.kill();
  };

  /* Imperative bridge used by the player's hitscan raycaster. */
  useEffect(() => {
    enemyApi.current = {
      meshes,
      hit: (id) => {
        const rt = rts.get(id);
        if (!rt) return "none";
        rt.hp -= 1;
        if (rt.hp <= 0) {
          remove(id, true);
          return "kill";
        }
        rt.flashUntil = performance.now() + 140;
        return "hit";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* (Re)spawn whenever the wave counter changes. */
  useEffect(() => {
    const list = spawnWave(wave);
    rts.clear();
    meshes.clear();
    for (const e of list) {
      rts.set(e.id, {
        pos: new THREE.Vector3(e.x, ENEMY_Y, e.z),
        hp: e.hp,
        flashUntil: 0,
        color: e.color,
        type: e.type,
      });
    }
    setEnemies(list);
    useGame.getState().setEnemiesLeft(list.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave]);

  /* Wave-clear detection -> next wave transition. */
  useEffect(() => {
    useGame.getState().setEnemiesLeft(enemies.length);
    if (enemies.length !== 0) return;
    const st = useGame.getState();
    if (st.phase !== "playing" && st.phase !== "paused") return;
    st.showBanner("WAVE CLEARED  ·  +250");
    st.addScore(250);

    if (nextWaveTimer.current) window.clearTimeout(nextWaveTimer.current);
    nextWaveTimer.current = window.setTimeout(() => {
      const s2 = useGame.getState();
      if (s2.phase !== "playing" && s2.phase !== "paused") return;
      const nw = s2.wave + 1;
      s2.setWave(nw);
      s2.setReserve(Math.min(999, s2.reserve + 45));
      s2.showBanner(`WAVE ${nw}`);
      sfx.wave();
    }, 2100);

    return () => {
      if (nextWaveTimer.current) window.clearTimeout(nextWaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemies.length]);

  return (
    <group>
      {enemies.map((e) => (
        <ZombieEnemy
          key={e.id}
          data={e}
          meshes={meshes}
          rt={() => rts.get(e.id)}
          onContact={onContact}
        />
      ))}
      <Bursts bursts={bursts} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Walking 3D Zombie Enemy Component with Kinematic Locomotion        */
/* ------------------------------------------------------------------ */

const WHITE = new THREE.Color("#ffffff");

interface ZombieEnemyProps {
  data: EnemyData;
  meshes: Map<number, THREE.Object3D>;
  rt: () => Rt | undefined;
  onContact: (id: number, type: ZombieType) => void;
}

export function ZombieEnemy({ data, meshes, rt, onContact }: ZombieEnemyProps) {
  const group = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const hitMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const profile = ZOMBIE_PROFILES[data.type];
  const isTank = data.type === "tank";
  const isRunner = data.type === "runner";

  const skinMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: profile.skinColor,
        roughness: 0.75,
        metalness: 0.05,
      }),
    [profile.skinColor],
  );

  const shirtMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: profile.shirtColor,
        roughness: 0.85,
        metalness: 0.0,
      }),
    [profile.shirtColor],
  );

  const pantsMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: profile.pantsColor,
        roughness: 0.9,
        metalness: 0.0,
      }),
    [profile.pantsColor],
  );

  const eyeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: profile.eyeColor,
        toneMapped: false,
      }),
    [profile.eyeColor],
  );

  const darkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#0d0d0d" }), []);
  const bloodMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#540d0d", roughness: 0.5 }), []);
  const boneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#dedede", roughness: 0.6 }), []);

  const torsoWidth = isTank ? 0.6 : 0.44;
  const torsoDepth = isTank ? 0.38 : 0.24;

  useFrame((state, dtRaw) => {
    const g = group.current;
    const r = rt();
    if (!g || !r) return;
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    const st = useGame.getState();

    let isMoving = false;
    if (st.phase === "playing") {
      const dx = playerPos.x - r.pos.x;
      const dz = playerPos.z - r.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < CONTACT_DIST) {
        onContact(data.id, data.type); // Attack player on contact
        return;
      }
      if (dist > 0.001) {
        isMoving = true;
        const step = data.speed * dt;
        const nx = r.pos.x + (dx / dist) * step;
        const nz = r.pos.z + (dz / dist) * step;
        const [sx, sz] = avoidObstacles(r.pos.x, r.pos.z, nx, nz);
        r.pos.x = THREE.MathUtils.clamp(sx, -ARENA_HALF + 1, ARENA_HALF - 1);
        r.pos.z = THREE.MathUtils.clamp(sz, -ARENA_HALF + 1, ARENA_HALF - 1);
      }
    }

    g.position.set(r.pos.x, 0.0, r.pos.z);

    // Rotate to face the player directly
    const angleToPlayer = Math.atan2(playerPos.x - r.pos.x, playerPos.z - r.pos.z);
    g.rotation.y = angleToPlayer;

    // Kinematic Walking Animation
    const animSpeed = isRunner ? 12 : isTank ? 6 : 8.5;
    const animPhase = t * animSpeed + data.phase;

    if (leftLegRef.current && rightLegRef.current) {
      const legAngle = isMoving ? Math.sin(animPhase) * 0.65 : 0;
      leftLegRef.current.rotation.x = legAngle;
      rightLegRef.current.rotation.x = -legAngle;
    }

    if (leftArmRef.current && rightArmRef.current) {
      const armSway = isMoving ? Math.sin(animPhase) * 0.18 : 0;
      leftArmRef.current.rotation.x = -1.35 + armSway;
      rightArmRef.current.rotation.x = -1.45 - armSway;
    }

    if (bodyGroupRef.current) {
      // Natural zombie lurch and wobble
      bodyGroupRef.current.position.y = isMoving ? Math.abs(Math.sin(animPhase)) * 0.05 : 0;
      bodyGroupRef.current.rotation.y = isMoving ? Math.sin(animPhase) * 0.08 : 0;
    }

    // Hit Flash
    const m = hitMatRef.current;
    if (m) {
      if (r.flashUntil - performance.now() > 0) {
        m.emissive.copy(WHITE);
        m.emissiveIntensity = 4;
      } else {
        m.emissive.set("#000000");
        m.emissiveIntensity = 0;
      }
    }
  });

  return (
    <group ref={group} position={[data.x, 0.0, data.z]} scale={profile.scale}>
      {/* Raycast hit-target capsule anchor */}
      <mesh
        castShadow
        userData={{ enemyId: data.id }}
        position={[0, 0.95, 0]}
        ref={(m: THREE.Mesh | null) => {
          if (m) meshes.set(data.id, m);
          else meshes.delete(data.id);
        }}
      >
        <capsuleGeometry args={[0.32, 0.85, 8, 16]} />
        <meshStandardMaterial
          ref={hitMatRef}
          color={profile.shirtColor}
          roughness={0.8}
          transparent
          opacity={0.0}
        />
      </mesh>

      {/* 3D Animated Zombie Rig */}
      <group ref={bodyGroupRef}>
        {/* 1. Torso */}
        <mesh
          castShadow
          position={[0, 0.95, 0]}
          rotation={[isRunner ? 0.28 : 0.16, 0, 0]}
          material={shirtMat}
        >
          <boxGeometry args={[torsoWidth, 0.56, torsoDepth]} />
        </mesh>

        {/* Bite/Claw Wound showing ribs on chest */}
        <mesh position={[0.12, 0.92, torsoDepth * 0.5 + 0.01]} material={bloodMat}>
          <boxGeometry args={[0.12, 0.18, 0.04]} />
        </mesh>
        <mesh position={[0.12, 0.94, torsoDepth * 0.5 + 0.02]} material={boneMat}>
          <boxGeometry args={[0.08, 0.02, 0.03]} />
        </mesh>

        {/* 2. Head (Hunched, snarling jaw, glowing eyes) */}
        <group
          position={[0, 1.38, isRunner ? 0.12 : 0.06]}
          rotation={[isRunner ? 0.25 : 0.12, 0, isRunner ? -0.1 : 0.1]}
        >
          {/* Skull */}
          <mesh position={[0, 0.1, 0]} material={skinMat} castShadow>
            <boxGeometry args={[0.28, 0.32, 0.28]} />
          </mesh>

          {/* Sunken Eye Sockets + Glowing Pupils */}
          {[-0.07, 0.07].map((x, i) => (
            <group key={i}>
              <mesh position={[x, 0.12, 0.14]} material={darkMat}>
                <boxGeometry args={[0.065, 0.065, 0.04]} />
              </mesh>
              <mesh position={[x, 0.12, 0.155]} material={eyeMat}>
                <sphereGeometry args={[0.024, 8, 8]} />
              </mesh>
            </group>
          ))}

          {/* Agaped Open Snarling Jaw */}
          <mesh position={[0, -0.06, 0.04]} rotation={[0.22, 0, 0]} material={skinMat}>
            <boxGeometry args={[0.24, 0.1, 0.24]} />
          </mesh>
          <mesh position={[0, -0.02, 0.14]} material={darkMat}>
            <boxGeometry args={[0.18, 0.06, 0.06]} />
          </mesh>

          {/* Sharp Teeth */}
          {Array.from({ length: 4 }).map((_, i) => (
            <mesh
              key={i}
              position={[-0.06 + i * 0.04, -0.01, 0.16]}
              rotation={[Math.PI, 0, 0]}
              material={boneMat}
            >
              <coneGeometry args={[0.01, 0.025, 4]} />
            </mesh>
          ))}
        </group>

        {/* 3. Outstretched Reaching Right Arm */}
        <group
          ref={rightArmRef}
          position={[torsoWidth * 0.5 + 0.08, 1.18, 0]}
          rotation={[-1.45, 0, -0.15]}
        >
          <mesh position={[0, -0.16, 0]} material={shirtMat}>
            <cylinderGeometry args={[0.06, 0.055, 0.36, 8]} />
          </mesh>
          <mesh position={[0, -0.42, 0]} material={skinMat}>
            <cylinderGeometry args={[0.05, 0.045, 0.38, 8]} />
          </mesh>
          <mesh position={[0, -0.62, 0.02]} material={skinMat}>
            <boxGeometry args={[0.1, 0.05, 0.12]} />
          </mesh>
        </group>

        {/* 4. Outstretched Reaching Left Arm */}
        <group
          ref={leftArmRef}
          position={[-torsoWidth * 0.5 - 0.08, 1.18, 0]}
          rotation={[-1.35, 0, 0.2]}
        >
          <mesh position={[0, -0.16, 0]} material={shirtMat}>
            <cylinderGeometry args={[0.06, 0.055, 0.36, 8]} />
          </mesh>
          <mesh position={[0, -0.42, 0]} material={skinMat}>
            <cylinderGeometry args={[0.05, 0.045, 0.38, 8]} />
          </mesh>
          <mesh position={[0, -0.62, 0.02]} material={skinMat}>
            <boxGeometry args={[0.1, 0.05, 0.12]} />
          </mesh>
        </group>
      </group>

      {/* 5. Animated Left Leg */}
      <group ref={leftLegRef} position={[-0.14, 0.68, 0]}>
        <mesh position={[0, -0.18, 0]} material={pantsMat}>
          <cylinderGeometry args={[0.07, 0.06, 0.42, 8]} />
        </mesh>
        <mesh position={[0, -0.46, 0]} material={pantsMat}>
          <cylinderGeometry args={[0.055, 0.05, 0.38, 8]} />
        </mesh>
        <mesh position={[0, -0.66, 0.04]} material={darkMat}>
          <boxGeometry args={[0.1, 0.06, 0.16]} />
        </mesh>
      </group>

      {/* 6. Animated Right Leg */}
      <group ref={rightLegRef} position={[0.14, 0.68, 0]}>
        <mesh position={[0, -0.18, 0]} material={pantsMat}>
          <cylinderGeometry args={[0.07, 0.06, 0.42, 8]} />
        </mesh>
        <mesh position={[0, -0.46, 0]} material={pantsMat}>
          <cylinderGeometry args={[0.055, 0.05, 0.38, 8]} />
        </mesh>
        <mesh position={[0, -0.66, 0.04]} material={darkMat}>
          <boxGeometry args={[0.1, 0.06, 0.16]} />
        </mesh>
      </group>
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
      const c = new THREE.Color(b.color).multiplyScalar(2.4);
      for (let i = 0; i < 14 && parts.current.length < MAX_PARTICLES; i++) {
        const v = new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 1.3 + 0.15,
          Math.random() * 2 - 1,
        )
          .normalize()
          .multiplyScalar(2.2 + Math.random() * 3.4);
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
