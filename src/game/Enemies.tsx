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
/* Types & wave generation                                             */
/* ------------------------------------------------------------------ */

const COLORS = ["#ff3b5c", "#39ff8e", "#38b6ff"]; // red / green / blue
const ENEMY_Y = 0.95;
const CONTACT_DIST = 1.45;
const CONTACT_DAMAGE = 14;

interface EnemyData {
  id: number;
  x: number;
  z: number;
  color: string;
  speed: number;
  phase: number;
  hp: number;
}

/** Per-enemy mutable runtime state (never touches React state). */
interface Rt {
  pos: THREE.Vector3;
  hp: number;
  flashUntil: number;
  color: string;
}

interface Burst {
  pos: THREE.Vector3;
  color: string;
}

let nextId = 1;

function spawnWave(wave: number): EnemyData[] {
  const count = Math.min(4 + wave, 10); // 5 – 10 enemies
  const list: EnemyData[] = [];
  let guard = 0;
  while (list.length < count && guard++ < 600) {
    const x = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
    const z = (Math.random() * 2 - 1) * (ARENA_HALF - 4);
    if (!isSpawnClear(x, z)) continue;
    const id = nextId++;
    list.push({
      id,
      x,
      z,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      speed: 1.5 + wave * 0.18 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      // from wave 3, every third hostile is armoured (2 hp)
      hp: wave >= 3 && id % 3 === 0 ? 2 : 1,
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

  const onContact = (id: number) => {
    const st = useGame.getState();
    if (st.phase !== "playing") return;
    remove(id, false);
    st.damage(CONTACT_DAMAGE);
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
        <Enemy
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
/* Single enemy — Scary Winston Churchill Balloon with TNT Bomb        */
/* ------------------------------------------------------------------ */

const WHITE = new THREE.Color("#ffffff");

interface EnemyProps {
  data: EnemyData;
  meshes: Map<number, THREE.Object3D>;
  rt: () => Rt | undefined;
  onContact: (id: number) => void;
}

export function Enemy({ data, meshes, rt, onContact }: EnemyProps) {
  const group = useRef<THREE.Group>(null);
  const balloonMat = useRef<THREE.MeshStandardMaterial>(null);
  const baseColor = useRef(new THREE.Color("#e8a382"));

  const skinMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e8a382",
        roughness: 0.65,
        metalness: 0.05,
      }),
    [],
  );
  const hatMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#16181c",
        roughness: 0.85,
        metalness: 0.1,
      }),
    [],
  );

  const hatBandMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#5e141a",
        roughness: 0.6,
        metalness: 0.2,
      }),
    [],
  );

  const darkWood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2e180e",
        roughness: 0.8,
      }),
    [],
  );

  const redEyeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ff0022",
        toneMapped: false,
      }),
    [],
  );

  const eyeSocket = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#0a0202",
      }),
    [],
  );

  const cigarBrown = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#4a2b16",
        roughness: 0.75,
      }),
    [],
  );

  const cigarBand = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d4af37",
        roughness: 0.3,
        metalness: 0.8,
      }),
    [],
  );

  const cigarEmber = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ff3300",
        toneMapped: false,
      }),
    [],
  );

  const tntRed = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e62222",
        roughness: 0.42,
        metalness: 0.08,
      }),
    [],
  );

  const tntBandMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1a1815",
        roughness: 0.8,
        metalness: 0.2,
      }),
    [],
  );

  const fuseMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e8c547",
        roughness: 0.9,
      }),
    [],
  );

  const sparkMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffee00",
        toneMapped: false,
      }),
    [],
  );

  const sparkGlow = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ff4400",
        toneMapped: false,
      }),
    [],
  );

  const ropeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8b6914",
        roughness: 0.95,
      }),
    [],
  );

  const tntTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#111111";
    ctx.font = "900 84px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TNT", 128, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  useFrame((state, dtRaw) => {
    const g = group.current;
    const r = rt();
    if (!g || !r) return;
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    const st = useGame.getState();

    if (st.phase === "playing") {
      const dx = playerPos.x - r.pos.x;
      const dz = playerPos.z - r.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < CONTACT_DIST) {
        onContact(data.id); // kamikaze TNT detonation against the player
        return;
      }
      if (dist > 0.001) {
        const step = data.speed * dt;
        const nx = r.pos.x + (dx / dist) * step;
        const nz = r.pos.z + (dz / dist) * step;
        const [sx, sz] = avoidObstacles(r.pos.x, r.pos.z, nx, nz);
        r.pos.x = THREE.MathUtils.clamp(sx, -ARENA_HALF + 1, ARENA_HALF - 1);
        r.pos.z = THREE.MathUtils.clamp(sz, -ARENA_HALF + 1, ARENA_HALF - 1);
      }
    }

    // Floating balloon hover bob + tilt toward movement direction
    const bob = Math.sin(t * 2.4 + data.phase) * 0.18;
    g.position.set(r.pos.x, ENEMY_Y + 0.35 + bob, r.pos.z);

    // Face the player directly with Churchill's scary scowl
    const angleToPlayer = Math.atan2(playerPos.x - r.pos.x, playerPos.z - r.pos.z);
    g.rotation.y = angleToPlayer;
    // Subtle swaying tilt
    g.rotation.z = Math.sin(t * 1.8 + data.phase) * 0.06;
    g.rotation.x = Math.cos(t * 1.5 + data.phase) * 0.04;

    // Hit flash
    const m = balloonMat.current;
    if (m) {
      if (r.flashUntil - performance.now() > 0) {
        m.emissive.copy(WHITE);
        m.emissiveIntensity = 4;
      } else {
        m.emissive.copy(baseColor.current);
        m.emissiveIntensity = 0.12;
      }
    }
  });

  return (
    <group ref={group} position={[data.x, ENEMY_Y + 0.6, data.z]}>
      {/* 1. Churchill Egg Balloon Head */}
      <mesh
        castShadow
        userData={{ enemyId: data.id }}
        ref={(m: THREE.Mesh | null) => {
          if (m) meshes.set(data.id, m);
          else meshes.delete(data.id);
        }}
      >
        <sphereGeometry args={[0.58, 32, 32]} />
        <meshStandardMaterial
          ref={balloonMat}
          color="#e8a382"
          emissive="#331105"
          emissiveIntensity={0.15}
          roughness={0.65}
          metalness={0.05}
        />
      </mesh>
      {/* 3D Churchill Facial Features */}
      {/* Prominent Churchill Jowls */}
      <mesh position={[-0.24, -0.22, 0.38]} material={skinMat}>
        <sphereGeometry args={[0.18, 16, 16]} />
      </mesh>
      <mesh position={[0.24, -0.22, 0.38]} material={skinMat}>
        <sphereGeometry args={[0.18, 16, 16]} />
      </mesh>
      {/* Double Chin */}
      <mesh position={[0, -0.32, 0.36]} material={skinMat}>
        <sphereGeometry args={[0.16, 16, 16]} />
      </mesh>

      {/* Bulbous Nose */}
      <mesh position={[0, -0.05, 0.52]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color="#d97d57" roughness={0.7} />
      </mesh>

      {/* Scowling Eyebrows */}
      <mesh position={[-0.16, 0.12, 0.48]} rotation={[0, 0, -0.28]} material={darkWood}>
        <boxGeometry args={[0.2, 0.04, 0.04]} />
      </mesh>
      <mesh position={[0.16, 0.12, 0.48]} rotation={[0, 0, 0.28]} material={darkWood}>
        <boxGeometry args={[0.2, 0.04, 0.04]} />
      </mesh>

      {/* Glowing Menacing Red Eyes */}
      {[-0.15, 0.15].map((x, i) => (
        <group key={i} position={[x, 0.04, 0.46]}>
          <mesh material={eyeSocket}>
            <sphereGeometry args={[0.052, 12, 12]} />
          </mesh>
          <mesh position={[0, 0, 0.02]} material={redEyeMat}>
            <sphereGeometry args={[0.038, 12, 12]} />
          </mesh>
        </group>
      ))}

      {/* Forehead Furrow Wrinkles */}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh
          key={i}
          position={[0, 0.22 + i * 0.06, 0.42 - i * 0.03]}
          rotation={[-0.35, 0, 0]}
          material={darkWood}
        >
          <torusGeometry args={[0.28 - i * 0.02, 0.008, 6, 16, Math.PI * 0.7]} />
        </mesh>
      ))}

      {/* Balloon Knot at bottom */}
      <mesh position={[0, -0.65, 0]} material={skinMat}>
        <coneGeometry args={[0.07, 0.09, 12]} />
      </mesh>

      {/* 2. Winston Churchill Homburg Top Hat */}
      <group position={[0, 0.58, 0.02]} rotation={[-0.15, 0, 0]}>
        {/* Brim */}
        <mesh material={hatMat}>
          <cylinderGeometry args={[0.58, 0.58, 0.03, 32]} />
        </mesh>
        {/* Crown */}
        <mesh position={[0, 0.17, 0]} material={hatMat}>
          <cylinderGeometry args={[0.38, 0.42, 0.34, 32]} />
        </mesh>
        {/* Hat Band */}
        <mesh position={[0, 0.05, 0]} material={hatBandMat}>
          <cylinderGeometry args={[0.425, 0.425, 0.06, 32]} />
        </mesh>
      </group>

      {/* 3. Thick Churchill Cigar in Mouth with Glowing Ember */}
      <group position={[0.16, -0.22, 0.48]} rotation={[-0.15, 0.55, -0.2]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={cigarBrown}>
          <cylinderGeometry args={[0.032, 0.028, 0.28, 16]} />
        </mesh>
        <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={cigarBand}>
          <cylinderGeometry args={[0.0325, 0.0325, 0.04, 16]} />
        </mesh>
        <mesh position={[0, 0, 0.14]} material={cigarEmber}>
          <sphereGeometry args={[0.032, 12, 12]} />
        </mesh>
      </group>
      {/* 4. Large Strapped Red TNT Bomb Payload */}
      <group position={[0, -0.92, 0]}>
        {/* 4 Heavy Red Dynamite Sticks */}
        {[
          [-0.07, 0, -0.05],
          [0.07, 0, -0.05],
          [-0.07, 0, 0.05],
          [0.07, 0, 0.05],
        ].map(([x, y, z], i) => (
          <group key={i} position={[x, y, z]}>
            <mesh material={tntRed} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 0.46, 16]} />
            </mesh>
            <mesh position={[0, 0.28, 0]} material={fuseMat}>
              <cylinderGeometry args={[0.008, 0.008, 0.14, 8]} />
            </mesh>
          </group>
        ))}

        {/* Dark Binding Straps */}
        <mesh position={[0, 0.12, 0]} material={tntBandMat}>
          <boxGeometry args={[0.32, 0.06, 0.26]} />
        </mesh>
        <mesh position={[0, -0.12, 0]} material={tntBandMat}>
          <boxGeometry args={[0.32, 0.06, 0.26]} />
        </mesh>

        {/* White Stenciled TNT Plate on Front */}
        <mesh position={[0, 0, 0.14]}>
          <boxGeometry args={[0.26, 0.16, 0.025]} />
          <meshStandardMaterial map={tntTex} roughness={0.6} />
        </mesh>

        {/* Glowing Burning Spark on Fuse */}
        <mesh position={[0, 0.38, 0]} material={sparkMat}>
          <sphereGeometry args={[0.04, 12, 12]} />
        </mesh>
        <mesh position={[0, 0.38, 0]} material={sparkGlow}>
          <sphereGeometry args={[0.08, 12, 12]} />
        </mesh>
      </group>
      {/* 5. Suspension Ropes connecting knot to TNT */}
      <mesh position={[-0.06, -0.81, 0]} rotation={[0, 0, 0.16]} material={ropeMat}>
        <cylinderGeometry args={[0.006, 0.006, 0.36, 8]} />
      </mesh>
      <mesh position={[0.06, -0.81, 0]} rotation={[0, 0, -0.16]} material={ropeMat}>
        <cylinderGeometry args={[0.006, 0.006, 0.36, 8]} />
      </mesh>
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
