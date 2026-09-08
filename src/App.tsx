import { Component, Suspense, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { PointerLockControls, Environment } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import { useGame } from "./game/store";
import { controlsApi, SPAWN, playerPos } from "./game/refs";
import { lookState, resetInput } from "./game/input";
import { Arena } from "./game/Arena";
import { HDRI_SKY } from "./game/assets";
import { Player } from "./game/Player";
import { Enemies } from "./game/Enemies";
import { Effects } from "./game/Effects";
import { HUD } from "./ui/HUD";
import { Screens } from "./ui/Screens";
import { Loader } from "./ui/Loader";
import { TouchControls, OrientationNotice } from "./ui/TouchControls";

/* ------------------------------------------------------------------ */
/* If the HDRI preset can't be fetched (offline CDN), the game still   */
/* runs on its authored lighting rig.                                   */
/* ------------------------------------------------------------------ */
class EnvBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Bridges DOM buttons -> PointerLockControls, tracks lock state.      */
/* ------------------------------------------------------------------ */
function LockController() {
  const ref = useRef<PointerLockControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const isTouch = useGame((s) => s.isTouch);

  /** Shared menu/pause -> playing transition for both control schemes. */
  const enterPlay = useCallback(() => {
    const st = useGame.getState();
    if (st.phase !== "menu" && st.phase !== "paused") return;
    if (st.phase === "menu") {
      // fresh run: face the arena centre from the spawn pad
      resetInput();
      lookState.yaw = 0;
      lookState.pitch = 0;
      camera.rotation.set(0, 0, 0);
      playerPos.copy(SPAWN);
      st.showBanner("WAVE 1 — ENGAGE");
    }
    st.setPhase("playing");
  }, [camera]);

  const leavePlay = useCallback(() => {
    const st = useGame.getState();
    if (st.phase === "playing") st.setPhase("paused");
  }, []);

  /* Bridge DOM buttons -> the active control scheme. */
  useEffect(() => {
    if (isTouch) {
      // No Pointer Lock API on phones: tapping "play" just starts the game
      // and the on-screen sticks take over.
      controlsApi.lock = enterPlay;
      controlsApi.unlock = leavePlay;
    } else {
      controlsApi.lock = () => ref.current?.lock();
      controlsApi.unlock = () => ref.current?.unlock();
    }
    return () => {
      controlsApi.lock = () => {};
      controlsApi.unlock = () => {};
    };
  }, [isTouch, enterPlay, leavePlay]);

  /* Keep manual yaw/pitch in sync so switching schemes never snaps. */
  useEffect(() => {
    if (!isTouch) return;
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    lookState.yaw = e.y;
    lookState.pitch = e.x;
  }, [isTouch, camera]);

  if (isTouch) return null;

  return (
    <PointerLockControls ref={ref} onLock={enterPlay} onUnlock={leavePlay} />
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
export default function App() {
  const phase = useGame((s) => s.phase);
  const runId = useGame((s) => s.runId);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#05070d]">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.75]}
        frameloop="always"
        gl={{
          antialias: false,
          powerPreference: "high-performance",
          stencil: false,
        }}
        camera={{
          fov: 75,
          near: 0.1,
          far: 240,
          position: [SPAWN.x, SPAWN.y + 0.67, SPAWN.z],
        }}
      >
        <color attach="background" args={["#9dc4e8"]} />
        {/* warm aerial haze that blends the tree line into the sky */}
        <fog attach="fog" args={["#bcd3e6", 70, 235]} />

        {/* ------------- daylight rig: sun + sky + bounce ------------- */}
        <ambientLight intensity={0.35} />
        <hemisphereLight args={["#bcd8ff", "#5c6b3a", 1.1]} />
        <directionalLight
          position={[52, 68, 34]}
          intensity={2.6}
          color="#fff3dc"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-camera-near={1}
          shadow-camera-far={200}
          shadow-normalBias={0.035}
          shadow-bias={-0.0002}
        />
        {/* cool sky-bounce fill from the opposite side */}
        <directionalLight
          position={[-40, 22, -30]}
          intensity={0.45}
          color="#9fc3ff"
        />

        <Suspense fallback={null}>
          <EnvBoundary>
            {/* Real photographic sky (Poly Haven CC0 HDRI) used for both
                the visible background and image-based lighting. */}
            <Environment files={HDRI_SKY} background backgroundBlurriness={0} />
          </EnvBoundary>

          {/* ---------------------- physics world ---------------------- */}
          <Physics gravity={[0, -22, 0]} paused={phase !== "playing"}>
            <Arena />
            <Player key={`player-${runId}`} />
            <Enemies key={`enemies-${runId}`} />
          </Physics>
        </Suspense>

        <Effects />
        <LockController />
      </Canvas>

      {/* ---------------- DOM overlay layer ---------------- */}
      <HUD />
      <TouchControls />
      <Screens />
      <Loader />
      <OrientationNotice />
    </div>
  );
}
