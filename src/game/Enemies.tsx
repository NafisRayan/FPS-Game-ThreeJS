import { useEffect, useRef, useState } from "react";
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
/* Single enemy — a bobbing spectral orb with a glowing halo.          */
/* ------------------------------------------------------------------ */

const WHITE = new THREE.Color("#ffffff");

interface EnemyProps {
  data: EnemyData;
  meshes: Map<number, THREE.Object3D>;
  rt: () => Rt | undefined;
  onContact: (id: number) => void;
}

function Enemy({ data, meshes, rt, onContact }: EnemyProps) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const baseColor = useRef(new THREE.Color(data.color));

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
        onContact(data.id); // kamikaze burst against the player
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

    // hover bob + slow spin
    const bob = Math.sin(t * 2.2 + data.phase) * 0.16;
    g.position.set(r.pos.x, ENEMY_Y + bob, r.pos.z);
    g.rotation.y += dt * 0.9;

    // hit flash
    const m = mat.current;
    if (m) {
      if (r.flashUntil - performance.now() > 0) {
        m.emissive.copy(WHITE);
        m.emissiveIntensity = 6;
      } else {
        m.emissive.copy(baseColor.current);
        m.emissiveIntensity = 1.9;
      }
    }
  });

  return (
    <group ref={group} position={[data.x, ENEMY_Y, data.z]}>
      <mesh
        castShadow
        userData={{ enemyId: data.id }}
        ref={(m: THREE.Mesh | null) => {
          if (m) meshes.set(data.id, m);
          else meshes.delete(data.id);
        }}
      >
        <sphereGeometry args={[0.55, 28, 28]} />
        <meshStandardMaterial
          ref={mat}
          color={data.color}
          emissive={data.color}
          emissiveIntensity={1.9}
          roughness={0.3}
          metalness={0.15}
        />
      </mesh>
      {/* rotating halo ring — catches the bloom pass */}
      <mesh rotation={[Math.PI / 2 - 0.35, 0, 0]}>
        <torusGeometry args={[0.82, 0.025, 10, 44]} />
        <meshStandardMaterial
          color={data.color}
          emissive={data.color}
          emissiveIntensity={3.4}
          roughness={0.4}
          toneMapped={false}
        />
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
