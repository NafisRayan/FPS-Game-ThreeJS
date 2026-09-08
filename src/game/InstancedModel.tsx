import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

export type Transform = [number, number, number, number, number]; // x,y,z,rotY,scale

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  local: THREE.Matrix4;
}

/**
 * Renders a downloaded glTF many times using one InstancedMesh per
 * sub-mesh, so a 340-tree forest still costs only a handful of draw calls.
 */
export function InstancedModel({
  url,
  transforms,
  castShadow = false,
  receiveShadow = false,
}: {
  url: string;
  transforms: Transform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const { scene } = useGLTF(url);

  const parts = useMemo<Part[]>(() => {
    scene.updateMatrixWorld(true);
    const out: Part[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      const mat = (src as THREE.MeshStandardMaterial).clone();
      // Quaternius exports use a flat FBX-ish shading model — nudge the
      // PBR values so foliage/stone reacts believably to the HDRI sun.
      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        mat.roughness = 0.88;
        mat.metalness = 0.02;
        mat.envMapIntensity = 0.9;
      }
      out.push({
        geometry: m.geometry,
        material: mat,
        local: m.matrixWorld.clone(),
      });
    });
    return out;
  }, [scene]);

  if (transforms.length === 0) return null;

  return (
    <group>
      {parts.map((p, i) => (
        <Instanced
          key={i}
          part={p}
          transforms={transforms}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </group>
  );
}

function Instanced({
  part,
  transforms,
  castShadow,
  receiveShadow,
}: {
  part: Part;
  transforms: Transform[];
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const world = new THREE.Matrix4();
    const outer = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    transforms.forEach(([x, y, z, rotY, s], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      pos.set(x, y, z);
      scl.setScalar(s);
      outer.compose(pos, q, scl);
      world.multiplyMatrices(outer, part.local);
      im.setMatrixAt(i, world);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [part, transforms]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, transforms.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
