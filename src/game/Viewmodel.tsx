import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MODELS } from "./assets";
import { weaponAnimApi } from "./refs";

/* ================================================================== */
/* AAA Photorealistic Rigged AK-47 Viewmodel                          */
/*                                                                     */
/* Features full high-poly AK-47 assault rifle with textured tactical  */
/* arms & hands, PBR materials (normal maps, roughness, metalness),   */
/* and genuine skeletal animations: fire recoil, idle sway, and        */
/* full magazine swap + bolt racking reload cycle.                    */
/* ================================================================== */

export const RIFLE_LENGTH = 0.88;

export const RIFLE_ANCHORS = {
  // True skinned muzzle tip under the Y=π · s=0.114 transform, measured from
  // the model's actual vertex geometry (gun-group space).
  muzzle: new THREE.Vector3(0.034, -0.059, -0.893),
  grip: new THREE.Vector3(0.03, -0.12, -0.38),
  handguard: new THREE.Vector3(0.03, -0.06, -0.5),
  mag: new THREE.Vector3(0.02, -0.12, -0.42),
};

export function AK47(props: {
  magRef?: React.RefObject<THREE.Group | null>;
  aimProgressRef?: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODELS.rifle);
  const { actions } = useAnimations(animations, group);

  // Set accurate orientation, scale, shadows, PBR materials, and camera-clipping prevention
  useMemo(() => {
    // Measured alignments (from the model's real skinned vertex geometry):
    //  · Rotate Y by π so the barrel (native +Z) points down-range (-Z).
    //  · Scale 0.114 → ~0.9 m rifle (matches RIFLE_LENGTH).
    //  · Shift x by -0.0372 so the ADS iron-sight line is dead-centre.
    scene.quaternion.set(0, 1, 0, 0); // Y = π
    scene.position.set(-0.0372, 0, 0);
    scene.scale.set(0.114, 0.114, 0.114);

    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        // Prune pure upper-arm/shoulder triangles from arm sleeve geometry once
        if (mesh.name === "SkeletalMeshComponent0_1" && mesh.geometry && mesh.geometry.index) {
          const geom = mesh.geometry;
          if (!(geom as unknown as { _shoulderCleaned?: boolean })._shoulderCleaned) {
            (geom as unknown as { _shoulderCleaned?: boolean })._shoulderCleaned = true;
            const pos = geom.attributes.position;
            const skinIndex = geom.attributes.skinIndex;
            const skinWeight = geom.attributes.skinWeight;
            const skeleton = (mesh as THREE.SkinnedMesh).skeleton;
            if (pos && skinIndex && skinWeight && skeleton) {
              const isExcluded = new Uint8Array(pos.count);
              for (let i = 0; i < pos.count; i++) {
                for (let j = 0; j < 4; j++) {
                  const bIdx = skinIndex.getComponent(i, j);
                  const w = skinWeight.getComponent(i, j);
                  if (w > 0.1) {
                    const bName = skeleton.bones[bIdx]?.name || "";
                    if (bName.includes("upper_arm") || bName.includes("pole")) {
                      isExcluded[i] = 1;
                    }
                  }
                }
              }

              const oldIndex = geom.index;
              if (oldIndex) {
                const newIndices: number[] = [];
                for (let i = 0; i < oldIndex.count; i += 3) {
                  const a = oldIndex.getX(i);
                  const b = oldIndex.getX(i + 1);
                  const c = oldIndex.getX(i + 2);
                  if (isExcluded[a] && isExcluded[b] && isExcluded[c]) continue;
                  newIndices.push(a, b, c);
                }
                geom.setIndex(newIndices);
              }
            }
          }
        }

        if (mesh.material) {
          const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          if (mat && mat.isMeshStandardMaterial) {
            mat.envMapIntensity = 1.25;

            // Prevent elbow or upper sleeve polygons from clipping into the top-right camera view
            if (mesh.name === "SkeletalMeshComponent0_1") {
              mat.onBeforeCompile = (shader) => {
                shader.fragmentShader = shader.fragmentShader.replace(
                  "#include <clipping_planes_fragment>",
                  `
                  #include <clipping_planes_fragment>
                  // Eliminate polygons sticking up or extending behind near-plane
                  if (vViewPosition.y > 0.035 && vViewPosition.x > 0.07) discard;
                  if (vViewPosition.z > -0.035) discard;
                  `
                );
              };
            }
            mat.needsUpdate = true;
          }
        }
      }
    });
  }, [scene]);

  // Connect weaponAnimApi to trigger fire and reload skeletal animations
  useEffect(() => {
    // Start with idle animation
    const idleAction = actions["idle"] || actions[Object.keys(actions)[1]];
    if (idleAction) {
      idleAction.reset().fadeIn(0.2).play();
    }

    weaponAnimApi.fire = () => {
      const fireAction = actions["fire"] || actions[Object.keys(actions)[0]];
      if (fireAction) {
        fireAction.reset();
        fireAction.setLoop(THREE.LoopOnce, 1);
        fireAction.clampWhenFinished = false;
        fireAction.timeScale = 1.35;
        fireAction.play();
      }
    };

    weaponAnimApi.reload = () => {
      const reloadAction = actions["reload_empty"] || actions[Object.keys(actions)[2]];
      if (reloadAction) {
        reloadAction.reset();
        reloadAction.setLoop(THREE.LoopOnce, 1);
        reloadAction.clampWhenFinished = false;
        reloadAction.timeScale = 3.3; // 6.87s / 3.3 ≈ 2.08s (matches 2.1s game reload cycle!)
        reloadAction.play();
      }
    };

    return () => {
      weaponAnimApi.fire = () => {};
      weaponAnimApi.reload = () => {};
      idleAction?.stop();
    };
  }, [actions]);

  // Fade idle skeletal sway when aiming down sights so iron sights remain laser-straight
  useFrame(() => {
    const idleAction = actions["idle"] || actions[Object.keys(actions)[1]];
    if (idleAction) {
      const p = props.aimProgressRef ? props.aimProgressRef.current : 0;
      idleAction.weight = THREE.MathUtils.lerp(1.0, 0.0, p);
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

/* Backwards compatibility stubs: the AK-47 model includes both rigged arms/hands */
export function RightArm() {
  return null;
}

export const LeftArm = forwardRef<THREE.Group>(() => {
  return null;
});

useGLTF.preload(MODELS.rifle);
