import { useMemo } from "react";
import * as THREE from "three";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import { OBSTACLES, ARENA_HALF } from "./refs";
import { MODELS } from "./assets";
import { Terrain } from "./Terrain";

const WALL_H = 6;
const M = ARENA_HALF + 0.5;

/* ------------------------------------------------------------------ */
/* Procedural crate + sandbag textures (canvas, generated once)        */
/* ------------------------------------------------------------------ */

function makeCrateTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6b4d2c";
  g.fillRect(0, 0, 256, 256);
  // wood grain planks
  for (let p = 0; p < 5; p++) {
    const y = p * 51;
    g.fillStyle = `rgb(${100 + Math.random() * 26},${70 + Math.random() * 20},${
      38 + Math.random() * 14
    })`;
    g.fillRect(0, y + 2, 256, 47);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(60,40,20,${0.06 + Math.random() * 0.14})`;
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      g.moveTo(0, y + Math.random() * 47);
      g.bezierCurveTo(80, y + Math.random() * 47, 160, y + Math.random() * 47, 256, y + Math.random() * 47);
      g.stroke();
    }
  }
  // metal edge bands
  g.fillStyle = "#3b3f45";
  g.fillRect(0, 0, 256, 12);
  g.fillRect(0, 244, 256, 12);
  g.fillRect(0, 0, 12, 256);
  g.fillRect(244, 0, 12, 256);
  // stencil
  g.strokeStyle = "rgba(210,215,200,0.55)";
  g.lineWidth = 6;
  g.strokeRect(88, 96, 80, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeSandbagTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6d6a4e";
  g.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 3; row++) {
    const y = row * 42;
    const offset = row % 2 ? 32 : 0;
    for (let i = -1; i < 5; i++) {
      const x = i * 64 + offset;
      const grd = g.createLinearGradient(x, y, x, y + 40);
      const tone = 96 + Math.random() * 30;
      grd.addColorStop(0, `rgb(${tone + 22},${tone + 16},${tone - 24})`);
      grd.addColorStop(1, `rgb(${tone - 26},${tone - 30},${tone - 58})`);
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(x + 2, y + 2, 60, 38, 14);
      g.fill();
      g.strokeStyle = "rgba(40,38,26,0.5)";
      g.lineWidth = 2;
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------------------------------------------ */
/* A GLTF model squeezed to fill an obstacle's collider box            */
/* ------------------------------------------------------------------ */

function FittedModel({
  url,
  size,
  rot = 0,
  yOffset = 0,
  fitMode = "box",
}: {
  url: string;
  size: [number, number, number];
  rot?: number;
  yOffset?: number;
  fitMode?: "box" | "uniform";
}) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const src = (
        Array.isArray(m.material) ? m.material[0] : m.material
      ) as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.roughness = 0.92;
      mat.metalness = 0.02;
      mat.envMapIntensity = 0.95;
      m.material = mat;
    });

    const box = new THREE.Box3().setFromObject(clone);
    const s = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(s);
    box.getCenter(center);

    // sit the model on the ground, centred on the collider
    clone.position.set(-center.x, -box.min.y, -center.z);

    const inner = new THREE.Group();
    inner.add(clone);
    if (fitMode === "uniform") {
      const k = Math.min(size[0] / s.x, size[1] / s.y, size[2] / s.z);
      inner.scale.setScalar(k);
    } else {
      inner.scale.set(size[0] / s.x, size[1] / s.y, size[2] / s.z);
    }

    const outer = new THREE.Group();
    outer.rotation.y = rot;
    outer.position.y = yOffset;
    outer.add(inner);
    return outer;
  }, [scene, size, rot, yOffset, fitMode]);

  return <primitive object={object} />;
}

/* ------------------------------------------------------------------ */

export function Arena() {
  const crateTex = useMemo(() => makeCrateTexture(), []);
  const sandbagTex = useMemo(() => makeSandbagTexture(), []);

  const crateMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: crateTex,
        roughness: 0.88,
        metalness: 0.06,
      }),
    [crateTex],
  );

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  return (
    <group>
      {/* ---------------- ground, grass & forest ---------------- */}
      <Terrain />

      {/* --------- invisible perimeter (the tree line sells it) --------- */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[M, WALL_H / 2, 0.5]} position={[0, WALL_H / 2, -M]} />
        <CuboidCollider args={[M, WALL_H / 2, 0.5]} position={[0, WALL_H / 2, M]} />
        <CuboidCollider args={[0.5, WALL_H / 2, M]} position={[-M, WALL_H / 2, 0]} />
        <CuboidCollider args={[0.5, WALL_H / 2, M]} position={[M, WALL_H / 2, 0]} />
        {/* ground plane collider */}
        <CuboidCollider args={[220, 0.5, 220]} position={[0, -0.5, 0]} />
      </RigidBody>

      {/* ---------------------- cover objects ---------------------- */}
      {OBSTACLES.map((o, i) => {
        const half: [number, number, number] = [
          o.size[0] / 2,
          o.size[1] / 2,
          o.size[2] / 2,
        ];
        return (
          <group key={i} position={o.pos}>
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={half} />
            </RigidBody>

            {o.kind === "rock" && (
              <FittedModel
                url={MODELS.rock}
                size={o.size}
                rot={o.rot ?? 0}
                yOffset={-half[1]}
              />
            )}

            {o.kind === "tree" && (
              <FittedModel
                url={MODELS.treeA}
                size={[o.size[0] * 7, o.size[1] * 2.2, o.size[2] * 7]}
                rot={o.rot ?? 0}
                yOffset={-half[1]}
                fitMode="uniform"
              />
            )}

            {o.kind === "crate" && (
              <mesh
                geometry={boxGeo}
                material={crateMat}
                scale={o.size}
                rotation={[0, o.rot ?? 0, 0]}
                castShadow
                receiveShadow
              />
            )}

            {o.kind === "barrier" && <Sandbags size={o.size} tex={sandbagTex} />}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Sandbag barricade — stacked rounded rows, tiled with the canvas map */
/* ------------------------------------------------------------------ */

function Sandbags({
  size,
  tex,
}: {
  size: [number, number, number];
  tex: THREE.CanvasTexture;
}) {
  const [w, h, d] = size;
  const long = Math.max(w, d);
  const material = useMemo(() => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(long / 1.6)), 1);
    return new THREE.MeshStandardMaterial({
      map: t,
      roughness: 0.97,
      metalness: 0,
      color: "#cfcaa8",
    });
  }, [tex, long]);

  const rows = 3;
  return (
    <group>
      {Array.from({ length: rows }).map((_, r) => {
        const rh = h / rows;
        const inset = r * 0.06;
        return (
          <mesh
            key={r}
            position={[0, -h / 2 + rh * (r + 0.5), 0]}
            material={material}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[
                w - (w > d ? 0 : inset),
                rh * 0.94,
                d - (d > w ? 0 : inset),
              ]}
            />
          </mesh>
        );
      })}
    </group>
  );
}

useGLTF.preload(MODELS.rock);
useGLTF.preload(MODELS.treeA);
