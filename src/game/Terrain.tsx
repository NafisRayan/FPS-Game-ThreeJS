import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { GROUND, MODELS } from "./assets";
import { ARENA_HALF, OBSTACLES } from "./refs";
import { useGame } from "./store";
import { InstancedModel } from "./InstancedModel";

/* ================================================================== */
/* Deterministic RNG so the world is identical every load             */
/* ================================================================== */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keeps foliage from growing inside cover or on the spawn pad. */
function blocked(x: number, z: number, pad = 1.2) {
  if (Math.hypot(x, z - 8) < 3) return true;
  for (const o of OBSTACLES) {
    if (
      Math.abs(x - o.pos[0]) < o.size[0] / 2 + pad &&
      Math.abs(z - o.pos[2]) < o.size[2] / 2 + pad
    )
      return true;
  }
  return false;
}

/* ================================================================== */
/* Photographic PBR ground                                            */
/* ================================================================== */

const GROUND_SIZE = 420;

function Ground() {
  const [diff, norm, rough, ao] = useTexture([
    GROUND.diff,
    GROUND.norm,
    GROUND.rough,
    GROUND.ao,
  ]);

  useMemo(() => {
    for (const t of [diff, norm, rough, ao]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(110, 110);
      t.anisotropy = 8;
    }
    diff.colorSpace = THREE.SRGBColorSpace;
  }, [diff, norm, rough, ao]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial
        map={diff}
        normalMap={norm}
        roughnessMap={rough}
        aoMap={ao}
        color="#9fb877"
        roughness={0.95}
        metalness={0}
        normalScale={new THREE.Vector2(1.2, 1.2)}
        dithering
      />
    </mesh>
  );
}

/* ================================================================== */
/* Instanced grass blades with a GPU wind shader                      */
/* ================================================================== */

/** A tapered, slightly bent blade — 12 triangles, built once. */
function makeBladeGeometry(): THREE.BufferGeometry {
  const H = 0.42;
  const levels = [0, 0.3, 0.58, 0.82, 1];
  const widths = [0.026, 0.022, 0.016, 0.009, 0];
  const bend = [0, 0.01, 0.035, 0.075, 0.125];

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i < levels.length; i++) {
    const y = levels[i] * H;
    const w = widths[i];
    const z = bend[i];
    pos.push(-w, y, z, w, y, z);
    uv.push(0, levels[i], 1, levels[i]);
  }
  for (let i = 0; i < levels.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  // Soften normals toward "up" so blades catch the sky light instead of
  // going black when they face away from the sun.
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
    v.lerp(new THREE.Vector3(0, 1, 0), 0.55).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return g;
}

const GRASS_TIP = new THREE.Color("#b9d16a");
const GRASS_BASE = new THREE.Color("#3f6326");

function GrassField({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const uniforms = useRef<{ uTime: { value: number } }>({ uTime: { value: 0 } });

  const geometry = useMemo(() => makeBladeGeometry(), []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.current.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uTime;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vec3 iOrigin = instanceMatrix[3].xyz;
           #else
             vec3 iOrigin = vec3(0.0);
           #endif
           float bladeH = clamp(position.y / 0.42, 0.0, 1.0);
           float stiff = bladeH * bladeH;
           float gust = sin(uTime * 0.55 + iOrigin.x * 0.06 + iOrigin.z * 0.05);
           float wave = sin(uTime * 1.9 + iOrigin.x * 0.55 + iOrigin.z * 0.4)
                      + 0.45 * sin(uTime * 3.4 + iOrigin.z * 0.9);
           float amp = (0.055 + 0.045 * gust);
           transformed.x += wave * stiff * amp;
           transformed.z += wave * stiff * amp * 0.55;
           transformed.y -= stiff * abs(wave) * amp * 0.25;`,
        );
    };
    return m;
  }, []);

  /* Scatter blades once, with density falling off away from the arena. */
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const rnd = mulberry32(1337);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    let guard = 0;

    while (i < count && guard++ < count * 8) {
      const x = (rnd() * 2 - 1) * (ARENA_HALF + 14);
      const z = (rnd() * 2 - 1) * (ARENA_HALF + 14);
      // thin out toward the edges for a natural falloff
      const d = Math.max(Math.abs(x), Math.abs(z)) / (ARENA_HALF + 14);
      if (rnd() < d * d * 0.75) continue;
      if (blocked(x, z, 0.4)) continue;

      dummy.position.set(x, 0, z);
      dummy.rotation.set(
        (rnd() - 0.5) * 0.22,
        rnd() * Math.PI * 2,
        (rnd() - 0.5) * 0.22,
      );
      const s = 0.7 + rnd() * 0.85;
      dummy.scale.set(0.9 + rnd() * 0.4, s, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);

      color.copy(GRASS_BASE).lerp(GRASS_TIP, rnd() * 0.85);
      color.offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06);
      m.setColorAt(i, color);
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      (ARENA_HALF + 20) * 1.5,
    );
    m.frustumCulled = false;
  }, [count]);

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, count]}
      receiveShadow
      frustumCulled={false}
    />
  );
}

/* ================================================================== */
/* Scenery: perimeter forest, bushes, rocks, grass tufts              */
/* ================================================================== */

type T = [number, number, number, number, number]; // x, y, z, rotY, scale

function useScatter() {
  return useMemo(() => {
    const rnd = mulberry32(90210);
    const forestA: T[] = [];
    const forestB: T[] = [];
    const forestC: T[] = [];
    const bushes: T[] = [];
    const berries: T[] = [];
    const rocks: T[] = [];
    const mossRocks: T[] = [];
    const tufts: T[] = [];

    /* --- dense tree line just beyond the play boundary --- */
    const inner = ARENA_HALF + 3;
    const outer = ARENA_HALF + 46;
    for (let i = 0; i < 340; i++) {
      const side = (i % 4) as 0 | 1 | 2 | 3;
      const along = (rnd() * 2 - 1) * outer;
      const depth = inner + rnd() * (outer - inner);
      let x: number, z: number;
      if (side === 0) [x, z] = [along, -depth];
      else if (side === 1) [x, z] = [along, depth];
      else if (side === 2) [x, z] = [-depth, along];
      else [x, z] = [depth, along];
      const t: T = [x, 0, z, rnd() * Math.PI * 2, 1.1 + rnd() * 1.5];
      const pick = rnd();
      if (pick < 0.45) forestA.push(t);
      else if (pick < 0.8) forestB.push(t);
      else forestC.push(t);
    }

    /* --- foliage & stones inside the arena --- */
    const place = (list: T[], n: number, sMin: number, sMax: number) => {
      let guard = 0;
      while (list.length < n && guard++ < n * 12) {
        const x = (rnd() * 2 - 1) * (ARENA_HALF - 2);
        const z = (rnd() * 2 - 1) * (ARENA_HALF - 2);
        if (blocked(x, z, 1.6)) continue;
        list.push([x, 0, z, rnd() * Math.PI * 2, sMin + rnd() * (sMax - sMin)]);
      }
    };
    place(bushes, 34, 0.7, 1.4);
    place(berries, 16, 0.6, 1.1);
    place(rocks, 26, 0.4, 1.0);
    place(mossRocks, 20, 0.35, 0.9);
    place(tufts, 150, 0.7, 1.6);

    return { forestA, forestB, forestC, bushes, berries, rocks, mossRocks, tufts };
  }, []);
}

function Scenery() {
  const s = useScatter();
  return (
    <group>
      <InstancedModel url={MODELS.treeA} transforms={s.forestA} castShadow />
      <InstancedModel url={MODELS.treeB} transforms={s.forestB} castShadow />
      <InstancedModel url={MODELS.treeC} transforms={s.forestC} castShadow />
      <InstancedModel url={MODELS.bush} transforms={s.bushes} castShadow receiveShadow />
      <InstancedModel url={MODELS.bushBerry} transforms={s.berries} castShadow receiveShadow />
      <InstancedModel url={MODELS.rock} transforms={s.rocks} castShadow receiveShadow />
      <InstancedModel url={MODELS.rockMoss} transforms={s.mossRocks} castShadow receiveShadow />
      <InstancedModel url={MODELS.grassTuft} transforms={s.tufts} receiveShadow />
    </group>
  );
}

/* ================================================================== */

export function Terrain() {
  const lowDetail = useGame((st) => st.settings.lowDetail);
  return (
    <group>
      <Ground />
      <GrassField count={lowDetail ? 9000 : 26000} />
      <Scenery />
    </group>
  );
}
