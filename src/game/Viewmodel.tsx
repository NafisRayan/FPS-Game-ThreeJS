import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MODELS } from "./assets";

/* ================================================================== */
/* Rifle — Quaternius "Modular Sci-Fi Guns" AR_4 (CC0)                */
/*                                                                     */
/* The raw export is ~1.8 units long, lying along +X with the muzzle   */
/* at +X. We normalise it at runtime: centre it, scale it to a         */
/* view-model length, and rotate so the barrel points down -Z.         */
/* ================================================================== */

export const RIFLE_LENGTH = 0.88;

/** Local-space landmarks on the normalised rifle (metres). */
export const RIFLE_ANCHORS = {
  muzzle: new THREE.Vector3(0, 0.046, -0.62),
  grip: new THREE.Vector3(0.008, -0.062, 0.04),
  handguard: new THREE.Vector3(-0.025, 0.005, -0.28),
  mag: new THREE.Vector3(0, -0.08, -0.06),
};

/**
 * Procedural rifle attachments: extends the base AR_4 with an elongated
 * tactical barrel, muzzle brake, red-dot optic/sight with glowing reticle,
 * and forward handguard barrel shroud.
 */
function GunAttachments() {
  const sightGlowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#39ff8e",
        toneMapped: false,
      }),
    [],
  );

  const gunMetalMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1f2429",
        roughness: 0.38,
        metalness: 0.9,
      }),
    [],
  );

  const polymerMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#121518",
        roughness: 0.75,
        metalness: 0.2,
      }),
    [],
  );

  return (
    <group position={[0, 0, 0]}>
      {/* Extended Heavy Fluted Tactical Barrel */}
      <mesh position={[0, 0.046, -0.44]} rotation={[Math.PI / 2, 0, 0]} material={gunMetalMat} castShadow>
        <cylinderGeometry args={[0.016, 0.018, 0.32, 16]} />
      </mesh>

      {/* Tactical Ported Muzzle Brake */}
      <group position={[0, 0.046, -0.61]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={gunMetalMat} castShadow>
          <cylinderGeometry args={[0.022, 0.02, 0.065, 12]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} material={polymerMat}>
          <boxGeometry args={[0.01, 0.008, 0.04]} />
        </mesh>
      </group>

      {/* Extended Octagonal Handguard Rail */}
      <mesh position={[0, 0.042, -0.31]} rotation={[Math.PI / 2, 0, 0]} material={polymerMat} castShadow>
        <cylinderGeometry args={[0.034, 0.036, 0.26, 8]} />
      </mesh>

      {/* Tactical Reflex / Holographic Optic Sight */}
      <group position={[0, 0.108, -0.14]}>
        {/* Mount base on rail */}
        <mesh position={[0, -0.016, 0]} material={polymerMat} castShadow>
          <boxGeometry args={[0.034, 0.014, 0.1]} />
        </mesh>
        {/* Left post */}
        <mesh position={[-0.018, 0.016, 0]} material={gunMetalMat}>
          <boxGeometry args={[0.005, 0.038, 0.07]} />
        </mesh>
        {/* Right post */}
        <mesh position={[0.018, 0.016, 0]} material={gunMetalMat}>
          <boxGeometry args={[0.005, 0.038, 0.07]} />
        </mesh>
        {/* Top bar */}
        <mesh position={[0, 0.034, 0]} material={gunMetalMat}>
          <boxGeometry args={[0.038, 0.005, 0.07]} />
        </mesh>
        {/* Glowing Holographic Dot / Reticle - visible through the hollow frame */}
        <mesh position={[0, 0.016, 0]}>
          <sphereGeometry args={[0.004, 16, 16]} />
          <primitive object={sightGlowMat} attach="material" />
        </mesh>
        <mesh position={[0, 0.016, 0]}>
          <ringGeometry args={[0.009, 0.012, 24]} />
          <primitive object={sightGlowMat} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

export function Rifle() {
  const { scene } = useGLTF(MODELS.rifle);

  const model = useMemo(() => {
    const root = scene.clone(true);

    // Realistic gunmetal / polymer finish over the flat FBX colours.
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const src = (
        Array.isArray(m.material) ? m.material[0] : m.material
      ) as THREE.MeshStandardMaterial;
      const mat = src.clone();
      const name = src.name || "";
      if (name === "Main") {
        mat.color.set("#2c333a"); // receiver / body
        mat.metalness = 0.85;
        mat.roughness = 0.38;
      } else if (name === "Black") {
        mat.color.set("#121518"); // polymer furniture
        mat.metalness = 0.25;
        mat.roughness = 0.7;
      } else if (name === "White") {
        mat.color.set("#7d848c"); // steel accents
        mat.metalness = 0.95;
        mat.roughness = 0.28;
      } else {
        mat.color.set("#1c2024");
        mat.metalness = 0.8;
        mat.roughness = 0.45;
      }
      mat.envMapIntensity = 1.1;
      m.material = mat;
    });

    // Re-anchor rifle at its grip point so the whole barrel & receiver
    // project forward cleanly in front of the camera near plane.
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = (RIFLE_LENGTH * 0.72) / Math.max(size.x, 0.0001);

    const gripPivotX = box.min.x + size.x * 0.38;

    const inner = new THREE.Group();
    root.position.set(-gripPivotX, -center.y - 0.02, -center.z);
    inner.add(root);
    inner.scale.setScalar(scale);

    const outer = new THREE.Group();
    outer.rotation.y = Math.PI / 2;
    outer.add(inner);

    const holder = new THREE.Group();
    holder.add(outer);
    return holder;
  }, [scene]);

  return (
    <group>
      <primitive object={model} />
      <GunAttachments />
    </group>
  );
}

/* ================================================================== */
/* Hands — Babylon.js rigged WebXR hand meshes                        */
/*                                                                     */
/* The rig is "flat": all 25 joints are siblings under root_*.         */
/* We rebuild the real finger hierarchy with Object3D.attach() (which  */
/* preserves world transforms, so the skin bind pose is untouched),    */
/* then curl each joint around an axis derived from its world frame.   */
/* ================================================================== */

const FINGERS = ["thumb", "index", "middle", "ring", "little"] as const;
const CHAIN = [
  "metacarpal",
  "proxPhalanx",
  "intPhalanx",
  "distPhalanx",
  "tip",
] as const;

/** How tightly each joint closes, per finger, base → tip. */
const CURL: Record<string, number[]> = {
  thumb: [0.1, 0.44, 0.48],
  index: [0.09, 0.88, 1.0, 0.7],
  middle: [0.07, 1.0, 1.1, 0.75],
  ring: [0.09, 1.06, 1.14, 0.8],
  little: [0.12, 1.1, 1.18, 0.84],
};

/** Skin so the hands read as real flesh under the HDRI sun. */
function skinMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#b9825f",
    roughness: 0.72,
    metalness: 0.0,
    envMapIntensity: 0.85,
  });
}

function buildHand(
  source: THREE.Object3D,
  side: "R" | "L",
  triggerFinger: boolean,
) {
  // SkeletonUtils.clone() rebinds the skeleton to the *cloned* bones —
  // a plain Object3D.clone() would leave the SkinnedMesh pointing at the
  // cached original bones, so our finger pose would never show up.
  const root = cloneSkinned(source);
  root.updateMatrixWorld(true);

  const bones = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    bones.set(o.name, o);
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      sm.material = skinMaterial();
      sm.castShadow = false;
      sm.frustumCulled = false;
    }
  });

  const wrist = bones.get(`wrist_${side}`);

  // 1) rebuild the true finger hierarchy (world transforms preserved)
  for (const f of FINGERS) {
    let prev: THREE.Object3D | undefined = wrist;
    for (const c of CHAIN) {
      const b = bones.get(`${f}_${c}_${side}`);
      if (!b) continue;
      if (prev) prev.attach(b);
      prev = b;
    }
  }
  root.updateMatrixWorld(true);

  // 2) curl each joint about an axis expressed in *model* space, then
  //    converted into that bone's local frame — robust to any rig
  //    orientation convention.
  const sign = side === "R" ? 1 : -1;
  const modelAxis = new THREE.Vector3(sign, 0, 0); // fingers +Y, palm +Z
  const thumbAxis = new THREE.Vector3(0.35 * sign, 0, -0.94 * sign).normalize();
  const worldQ = new THREE.Quaternion();
  const localAxis = new THREE.Vector3();
  const q = new THREE.Quaternion();

  for (const f of FINGERS) {
    const amounts = CURL[f];
    const axis = f === "thumb" ? thumbAxis : modelAxis;
    let i = 0;
    for (const c of CHAIN) {
      if (c === "tip") continue;
      const b = bones.get(`${f}_${c}_${side}`);
      if (!b) continue;
      let amount = amounts[Math.min(i, amounts.length - 1)] ?? 0;
      // index finger stays extended on the trigger
      if (triggerFinger && f === "index") amount *= i <= 1 ? 0.45 : 0.3;
      i++;
      if (amount === 0) continue;

      b.getWorldQuaternion(worldQ);
      localAxis.copy(axis).applyQuaternion(worldQ.invert()).normalize();
      q.setFromAxisAngle(localAxis, amount);
      b.quaternion.multiply(q);
      b.updateMatrixWorld(true);
    }
  }

  root.updateMatrixWorld(true);
  return root;
}

/** A fabric sleeve that hides the wrist cut-off. */
function Sleeve({ length = 0.26 }: { length?: number }) {
  return (
    <mesh position={[0, -length / 2 + 0.01, 0]} castShadow>
      <cylinderGeometry args={[0.045, 0.058, length, 16, 1, true]} />
      <meshStandardMaterial
        color="#3f4634"
        roughness={0.95}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Right hand wrapped around the pistol grip.
 * Rest pose: fingers +Y, palm +Z, thumb +X.
 * Aligned precisely with the grip anchor at the new pivot.
 */
export function RightHand({ offset = [0, 0, 0] }: { offset?: [number, number, number] }) {
  const { scene } = useGLTF(MODELS.handR);
  const hand = useMemo(() => buildHand(scene, "R", true), [scene]);

  const quat = useMemo(() => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -Math.PI / 2 + 0.08,
    );
    q.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -1.32,
      ),
    );
    return q;
  }, []);

  return (
    <group
      position={[
        RIFLE_ANCHORS.grip.x + offset[0],
        RIFLE_ANCHORS.grip.y + offset[1],
        RIFLE_ANCHORS.grip.z + offset[2],
      ]}
      quaternion={quat}
      scale={0.92}
    >
      <primitive object={hand} />
      <Sleeve length={0.32} />
    </group>
  );
}

/**
 * Left hand supporting the extended handguard from below-left.
 */
export function LeftHand({ offset = [0, 0, 0] }: { offset?: [number, number, number] }) {
  const { scene } = useGLTF(MODELS.handL);
  const hand = useMemo(() => buildHand(scene, "L", false), [scene]);

  const quat = useMemo(() => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -0.45,
    );
    q.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -Math.PI / 2 + 0.35,
      ),
    );
    q.premultiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.38),
    );
    return q;
  }, []);

  return (
    <group
      position={[
        RIFLE_ANCHORS.handguard.x + offset[0],
        RIFLE_ANCHORS.handguard.y + offset[1],
        RIFLE_ANCHORS.handguard.z + offset[2],
      ]}
      quaternion={quat}
      scale={0.92}
    >
      <primitive object={hand} />
      <Sleeve length={0.28} />
    </group>
  );
}

useGLTF.preload(MODELS.rifle);
useGLTF.preload(MODELS.handR);
useGLTF.preload(MODELS.handL);
