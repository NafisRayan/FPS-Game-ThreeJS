import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
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
    muzzle: new THREE.Vector3(0.0, -0.046, -0.86),
    grip: new THREE.Vector3(0.0, -0.17, -0.14),
    handguard: new THREE.Vector3(0.0, -0.16, -0.44),
    mag: new THREE.Vector3(0.0, -0.15, -0.28),
};

export function AK47(_props: { magRef?: React.RefObject<THREE.Group | null> }) {
    const group = useRef<THREE.Group>(null);
    const { scene, animations } = useGLTF(MODELS.rifle);
    const { actions } = useAnimations(animations, group);

    // Set proper shadows and PBR material enhancements
    useMemo(() => {
        scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.frustumCulled = false;
                if (mesh.material) {
                    const mat = (
                        Array.isArray(mesh.material)
                            ? mesh.material[0]
                            : mesh.material
                    ) as THREE.MeshStandardMaterial;
                    if (mat && mat.isMeshStandardMaterial) {
                        mat.envMapIntensity = 1.25;
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
            const fireAction =
                actions["fire"] || actions[Object.keys(actions)[0]];
            if (fireAction) {
                fireAction.reset();
                fireAction.setLoop(THREE.LoopOnce, 1);
                fireAction.clampWhenFinished = false;
                fireAction.timeScale = 1.35;
                fireAction.play();
            }
        };

        weaponAnimApi.reload = () => {
            const reloadAction =
                actions["reload_empty"] || actions[Object.keys(actions)[2]];
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

    return (
        <group ref={group}>
            <primitive
                object={scene}
                scale={[0.108, 0.108, 0.108]}
                position={[0.1, 0.0241, 0.0]}
                rotation={[
                    THREE.MathUtils.degToRad(1.1),
                    THREE.MathUtils.degToRad(150),
                    0,
                ]}
            />
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
