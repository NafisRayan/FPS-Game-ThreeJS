import React, { forwardRef, useMemo } from "react";
import * as THREE from "three";

/* ================================================================== */
/* Authentic AK-47 Viewmodel & Anatomical FPS Rig                     */
/*                                                                     */
/* Features iconic AK-47 components: stamped receiver, dust cover,    */
/* classic wooden lower/upper handguards, curved orange/bakelite       */
/* banana magazine (detachable for reload animation), tangent rear     */
/* sight, gas tube, barrel, hooded front sight post, and wooden stock. */
/* ================================================================== */

export const RIFLE_LENGTH = 0.88;

export const RIFLE_ANCHORS = {
  muzzle: new THREE.Vector3(0, 0.009, -0.6),
  grip: new THREE.Vector3(0.012, -0.075, 0.08),
  handguard: new THREE.Vector3(0, -0.032, -0.22),
  mag: new THREE.Vector3(0, -0.045, -0.04),
};

export function AK47({ magRef }: { magRef?: React.RefObject<THREE.Group | null> }) {
  const steel = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#282c32",
        metalness: 0.88,
        roughness: 0.35,
      }),
    [],
  );

  const darkSteel = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#16181b",
        metalness: 0.92,
        roughness: 0.28,
      }),
    [],
  );

  const wood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8b4513",
        roughness: 0.52,
        metalness: 0.05,
      }),
    [],
  );

  const darkWood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#5a2d12",
        roughness: 0.58,
        metalness: 0.05,
      }),
    [],
  );

  const bakelite = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#b54d1f",
        roughness: 0.42,
        metalness: 0.1,
      }),
    [],
  );

  return (
    <group>
      {/* 1. Receiver */}
      <mesh position={[0, 0, 0]} material={steel} castShadow>
        <boxGeometry args={[0.044, 0.07, 0.28]} />
      </mesh>

      {/* Ribbed Dust Cover (curved stamped metal top) */}
      <mesh
        position={[0, 0.035, -0.01]}
        rotation={[0, Math.PI / 2, Math.PI / 2]}
        material={darkSteel}
        castShadow
      >
        <cylinderGeometry args={[0.022, 0.022, 0.26, 16, 1, false, 0, Math.PI]} />
      </mesh>

      {/* 2. Wooden Handguards */}
      <mesh position={[0, -0.005, -0.22]} material={wood} castShadow>
        <boxGeometry args={[0.044, 0.05, 0.17]} />
      </mesh>

      <mesh
        position={[0, 0.03, -0.22]}
        rotation={[0, Math.PI / 2, Math.PI / 2]}
        material={darkWood}
        castShadow
      >
        <cylinderGeometry args={[0.019, 0.019, 0.15, 12, 1, false, 0, Math.PI]} />
      </mesh>

      {/* 3. Gas Tube, Gas Block & Barrel */}
      <mesh position={[0, 0.028, -0.26]} rotation={[Math.PI / 2, 0, 0]} material={darkSteel} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.23, 12]} />
      </mesh>

      <mesh position={[0, 0.026, -0.36]} material={darkSteel} castShadow>
        <boxGeometry args={[0.026, 0.042, 0.032]} />
      </mesh>

      <mesh position={[0, 0.009, -0.36]} rotation={[Math.PI / 2, 0, 0]} material={darkSteel} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.44, 14]} />
      </mesh>

      {/* 4. Front Sight Post with AK Round Hood */}
      <mesh position={[0, 0.034, -0.53]} material={darkSteel} castShadow>
        <boxGeometry args={[0.02, 0.05, 0.026]} />
      </mesh>
      <mesh position={[0, 0.06, -0.53]} material={steel}>
        <cylinderGeometry args={[0.002, 0.002, 0.016, 8]} />
      </mesh>
      <mesh position={[0, 0.06, -0.53]} material={darkSteel}>
        <torusGeometry args={[0.011, 0.0025, 8, 16, Math.PI]} />
      </mesh>

      {/* Slanted AK Muzzle Brake */}
      <mesh position={[0, 0.009, -0.6]} rotation={[Math.PI / 2, 0, 0]} material={darkSteel} castShadow>
        <cylinderGeometry args={[0.013, 0.012, 0.04, 12]} />
      </mesh>

      {/* 5. Tangent Rear Sight */}
      <mesh position={[0, 0.044, -0.13]} material={steel} castShadow>
        <boxGeometry args={[0.026, 0.022, 0.042]} />
      </mesh>
      <mesh position={[0, 0.052, -0.125]} rotation={[-0.08, 0, 0]} material={darkSteel}>
        <boxGeometry args={[0.018, 0.006, 0.048]} />
      </mesh>

      {/* 6. Iconic Curved 30-round AK Banana Magazine */}
      <group ref={magRef}>
        {Array.from({ length: 6 }).map((_, i) => {
          const t = i / 5;
          const angle = -0.22 + t * 0.52;
          return (
            <mesh
              key={i}
              position={[0, -0.045 - t * 0.17, -0.04 - t * 0.065]}
              rotation={[angle, 0, 0]}
              material={bakelite}
              castShadow
            >
              <boxGeometry args={[0.032, 0.05, 0.058]} />
            </mesh>
          );
        })}
      </group>

      {/* 7. Pistol Grip & Trigger Assembly */}
      <mesh position={[0, -0.08, 0.08]} rotation={[-0.32, 0, 0]} material={bakelite} castShadow>
        <boxGeometry args={[0.032, 0.115, 0.046]} />
      </mesh>

      <mesh
        position={[0, -0.044, 0.038]}
        rotation={[0, Math.PI / 2, Math.PI]}
        material={darkSteel}
      >
        <torusGeometry args={[0.024, 0.003, 8, 16, Math.PI]} />
      </mesh>

      <mesh position={[0, -0.044, 0.038]} rotation={[0.25, 0, 0]} material={steel}>
        <boxGeometry args={[0.004, 0.018, 0.008]} />
      </mesh>

      {/* 8. Classic Solid Wooden Stock */}
      <mesh position={[0, -0.02, 0.28]} rotation={[-0.08, 0, 0]} material={wood} castShadow>
        <boxGeometry args={[0.04, 0.09, 0.3]} />
      </mesh>

      <mesh position={[0, -0.03, 0.43]} material={darkSteel} castShadow>
        <boxGeometry args={[0.042, 0.095, 0.014]} />
      </mesh>

      {/* 9. Right-side Bolt Carrier / Charging Handle */}
      <mesh position={[0.034, 0.018, -0.03]} rotation={[0, 0, Math.PI / 2]} material={steel}>
        <cylinderGeometry args={[0.005, 0.006, 0.03, 8]} />
      </mesh>
    </group>
  );
}

/* ================================================================== */
/* Anatomical FPS Arms Rigging                                        */
/* ================================================================== */

export function RightArm() {
  const skin = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c48e6c",
        roughness: 0.72,
        metalness: 0.0,
      }),
    [],
  );

  const sleeve = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3f4634",
        roughness: 0.92,
        metalness: 0.0,
      }),
    [],
  );

  return (
    <group>
      {/* Forearm Sleeve entering from bottom right */}
      <mesh
        position={[0.16, -0.18, 0.22]}
        quaternion={new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0.33, -0.25, 0.27).normalize(),
        )}
        material={sleeve}
        castShadow
      >
        <cylinderGeometry args={[0.046, 0.065, 0.55, 16]} />
      </mesh>

      {/* Hand Palm wrapped firmly around pistol grip */}
      <group position={[0.012, -0.075, 0.08]}>
        <mesh position={[0, 0, 0]} rotation={[-0.32, 0, 0]} material={skin}>
          <boxGeometry args={[0.044, 0.075, 0.048]} />
        </mesh>

        {/* 4 Gripping Fingers */}
        {Array.from({ length: 4 }).map((_, i) => (
          <mesh
            key={i}
            position={[-0.028, 0.02 - i * 0.014, -0.008 - i * 0.004]}
            rotation={[0, 0.3, Math.PI / 2]}
            material={skin}
          >
            <cylinderGeometry args={[0.006, 0.0065, 0.044, 8]} />
          </mesh>
        ))}

        {/* Trigger Index Finger */}
        <mesh
          position={[0.004, 0.032, -0.038]}
          rotation={[1.3, -0.22, 0]}
          material={skin}
        >
          <cylinderGeometry args={[0.006, 0.0065, 0.042, 8]} />
        </mesh>
      </group>
    </group>
  );
}

export const LeftArm = forwardRef<THREE.Group, { offset?: [number, number, number] }>(
  function LeftArm({ offset = [0, 0, 0] }, ref) {
    const skin = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#c48e6c",
          roughness: 0.72,
          metalness: 0.0,
        }),
      [],
    );

    const sleeve = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#3f4634",
          roughness: 0.92,
          metalness: 0.0,
        }),
      [],
    );

    return (
      <group ref={ref} position={[offset[0], offset[1], offset[2]]}>
        {/* Forearm Sleeve entering from bottom left */}
        <mesh
          position={[-0.16, -0.16, 0.01]}
          quaternion={new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(-0.38, -0.29, 0.47).normalize(),
          )}
          material={sleeve}
          castShadow
        >
          <cylinderGeometry args={[0.046, 0.065, 0.62, 16]} />
        </mesh>

        {/* Hand Palm cupping bottom of wooden handguard */}
        <group position={[0, -0.032, -0.22]}>
          <mesh material={skin}>
            <boxGeometry args={[0.054, 0.028, 0.09]} />
          </mesh>

          {/* 4 Fingers wrapping around right side */}
          {Array.from({ length: 4 }).map((_, i) => (
            <mesh
              key={i}
              position={[0.025, 0.018, -0.025 + i * 0.016]}
              rotation={[0, 0, -0.35]}
              material={skin}
            >
              <cylinderGeometry args={[0.006, 0.0065, 0.038, 8]} />
            </mesh>
          ))}

          {/* Thumb resting over top-left */}
          <mesh
            position={[-0.024, 0.044, 0]}
            rotation={[Math.PI / 2, 0, 0.25]}
            material={skin}
          >
            <cylinderGeometry args={[0.0075, 0.008, 0.042, 8]} />
          </mesh>
        </group>
      </group>
    );
  },
);

// Backward-compatibility aliases for any consumer importing Rifle/Hands
export const Rifle = AK47;
export const RightHand = RightArm;
export const LeftHand = LeftArm;
