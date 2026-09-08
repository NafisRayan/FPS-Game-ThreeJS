import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Line } from "@react-three/drei";
import { useGame, MAG_SIZE } from "./store";
import { SPAWN, playerPos, enemyApi, controlsApi } from "./refs";
import { sfx } from "./audio";
import { input, lookState, playerApi } from "./input";
import { Rifle, RightHand, LeftHand } from "./Viewmodel";

/* ------------------------------------------------------------------ */
/* Rapier structural types derived from the live world instance        */
/* ------------------------------------------------------------------ */
type World = ReturnType<typeof useRapier>["world"];
type RigidBodyT = ReturnType<World["createRigidBody"]>;
type ColliderT = ReturnType<World["createCollider"]>;
type CharCtrlT = ReturnType<World["createCharacterController"]>;

/* ------------------------------------------------------------------ */
/* Tuning constants                                                    */
/* ------------------------------------------------------------------ */
const SPEED = 5.4;
const SPRINT = 8.6;
const JUMP = 8.6;
const GRAVITY = 22;
const EYE = 0.67; // capsule centre -> eye offset  (≈1.7 m eye height)
const FIRE_MS = 115; // ~8.7 rounds / second
const RELOAD_MS = 1100;
const CAP_HALF = 0.55;
const CAP_RADIUS = 0.4;

/* scratch vectors (module-level, single player => no sharing issues) */
const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");

/** Radians of rotation per pixel dragged on a touch screen. */
const TOUCH_LOOK_SPEED = 0.0034;

function makeFlashTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,224,150,0.95)");
  grad.addColorStop(0.55, "rgba(255,160,60,0.45)");
  grad.addColorStop(1, "rgba(255,120,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Tracer {
  id: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
}

export function Player() {
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const rb = useRef<RigidBodyT | null>(null);
  const col = useRef<ColliderT | null>(null);
  const ctrl = useRef<CharCtrlT | null>(null);

  const keys = useRef<Record<string, boolean>>({});
  const firing = useRef(false);
  const velY = useRef(0);
  const wasGrounded = useRef(false);
  const bobPhase = useRef(0);
  const lastShot = useRef(0);
  const recoil = useRef(0);
  const flashUntil = useRef(0);
  const reloadTimeout = useRef<number | null>(null);

  const gun = useRef<THREE.Group>(null);
  const muzzle = useRef<THREE.Object3D>(null);
  const flashSprite = useRef<THREE.Sprite>(null);
  const flashLight = useRef<THREE.PointLight>(null);

  const raycaster = useRef(new THREE.Raycaster());
  const [tracers, setTracers] = useState<Tracer[]>([]);
  const tracerId = useRef(0);

  const flashTex = useMemo(() => makeFlashTexture(), []);

  /* ------------------------- physics rig ------------------------- */
  useEffect(() => {
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
        SPAWN.x,
        SPAWN.y,
        SPAWN.z,
      ),
    );
    const collider = world.createCollider(
      rapier.ColliderDesc.capsule(CAP_HALF, CAP_RADIUS),
      body,
    );
    const controller = world.createCharacterController(0.08);
    controller.enableAutostep(0.55, 0.2, true);
    controller.enableSnapToGround(0.5);
    controller.setApplyImpulsesToDynamicBodies(false);
    rb.current = body;
    col.current = collider;
    ctrl.current = controller;
    playerPos.copy(SPAWN);
    velY.current = 0;
    return () => {
      rb.current = null;
      col.current = null;
      ctrl.current = null;
      try {
        if (world.characterControllers?.has(controller)) {
          world.removeCharacterController(controller);
        }
      } catch {
        // ignore already freed controller
      }
      try {
        if (world.getRigidBody(body.handle)) {
          world.removeRigidBody(body);
        }
      } catch {
        // ignore already freed body
      }
    };
  }, [world, rapier]);

  /* --------------------------- reload ---------------------------- */
  const reload = useCallback(() => {
    const st = useGame.getState();
    if (st.phase !== "playing" || st.reloading) return;
    if (st.ammo >= MAG_SIZE || st.reserve <= 0) return;
    st.setReloading(true);
    sfx.reload();
    reloadTimeout.current = window.setTimeout(() => {
      const s2 = useGame.getState();
      if (s2.phase === "dead") return;
      const take = Math.min(MAG_SIZE - s2.ammo, s2.reserve);
      s2.setAmmo(s2.ammo + take);
      s2.setReserve(s2.reserve - take);
      s2.setReloading(false);
    }, RELOAD_MS);
  }, []);

  /* expose reload to the on-screen touch button */
  useEffect(() => {
    playerApi.reload = reload;
    return () => {
      playerApi.reload = () => {};
    };
  }, [reload]);

  useEffect(
    () => () => {
      if (reloadTimeout.current) window.clearTimeout(reloadTimeout.current);
    },
    [],
  );

  /* --------------------------- shooting -------------------------- */
  const tryShoot = useCallback(() => {
    const st = useGame.getState();
    if (st.phase !== "playing" || st.reloading) return;
    const now = performance.now();
    if (now - lastShot.current < FIRE_MS) return;
    lastShot.current = now;

    if (st.ammo <= 0) {
      sfx.empty();
      reload();
      return;
    }
    st.setAmmo(st.ammo - 1);
    sfx.shoot();
    recoil.current = 1;
    flashUntil.current = now + 55;

    const origin = camera.position;
    camera.getWorldDirection(_aim);

    // 1) hit distance against static world (walls/crates/floor) via Rapier
    let maxDist = 120;
    if (col.current && world.getCollider(col.current.handle)) {
      const hit = world.castRay(
        new rapier.Ray(
          { x: origin.x, y: origin.y, z: origin.z },
          { x: _aim.x, y: _aim.y, z: _aim.z },
        ),
        120,
        true,
        undefined,
        undefined,
        col.current, // ignore the player capsule
      );
      if (hit) {
        const h = hit as unknown as { timeOfImpact?: number; toi?: number };
        const toi = h.timeOfImpact ?? h.toi ?? 120;
        maxDist = Math.max(0.1, toi - 0.02);
      }
    }

    // 2) enemies via three.js raycast against live meshes
    const rc = raycaster.current;
    rc.set(origin, _aim);
    rc.far = maxDist;
    const api = enemyApi.current;
    const targets = api ? Array.from(api.meshes.values()) : [];
    const hits = rc.intersectObjects(targets, false);

    const end = new THREE.Vector3()
      .copy(_aim)
      .multiplyScalar(maxDist)
      .add(origin);

    if (hits.length > 0 && api) {
      const h = hits[0];
      end.copy(h.point);
      const id = (h.object.userData as { enemyId?: number }).enemyId;
      if (id !== undefined) {
        const res = api.hit(id);
        if (res !== "none") {
          st.registerHit();
          sfx.hit();
          if (res === "kill") sfx.kill();
        }
      }
    }

    // tracer: muzzle -> impact point
    const from = new THREE.Vector3();
    if (muzzle.current) muzzle.current.getWorldPosition(from);
    else from.copy(origin);
    setTracers((t) => [
      ...t.slice(-7),
      { id: ++tracerId.current, from, to: end, born: now },
    ]);

    // randomise the flash a touch
    if (flashSprite.current) {
      flashSprite.current.scale.setScalar(0.38 + Math.random() * 0.3);
      flashSprite.current.material.rotation = Math.random() * Math.PI * 2;
    }
  }, [camera, world, rapier, reload]);

  /* ---------------------- input listeners ------------------------ */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))
        e.preventDefault();
      if (e.code === "KeyR") reload();
      if (e.code === "KeyM") useGame.getState().toggleSetting("muted");
      if (e.code === "KeyP") controlsApi.unlock();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const md = (e: MouseEvent) => {
      const st = useGame.getState();
      // ignore the mouse events browsers synthesize after a tap
      if (st.isTouch) return;
      if (e.button === 0 && st.phase === "playing") firing.current = true;
    };
    const mu = () => {
      firing.current = false;
    };
    const blur = () => {
      keys.current = {};
      firing.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("blur", blur);
    };
  }, [gl, reload]);

  /* ------------------------ per-frame logic ---------------------- */
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = useGame.getState();
    const body = rb.current;
    const controller = ctrl.current;
    const collider = col.current;

    // tracer purge
    if (tracers.length > 0) {
      const now = performance.now();
      if (now - tracers[0].born > 75)
        setTracers((ts) => ts.filter((t) => now - t.born < 75));
    }

    // muzzle flash + light decay (always runs so it cools off in menus too)
    const lit = performance.now() < flashUntil.current;
    if (flashSprite.current) flashSprite.current.visible = lit;
    if (flashLight.current)
      flashLight.current.intensity = lit ? 13 + Math.random() * 8 : 0;

    // recoil relaxation
    recoil.current = Math.max(0, recoil.current - dt * 6.5);
    const pc = camera as THREE.PerspectiveCamera;
    const reduce = st.settings.reduceMotion;
    const targetFov = 75 + (reduce ? 0 : recoil.current * 2.2);
    if (Math.abs(pc.fov - targetFov) > 0.01) {
      pc.fov = targetFov;
      pc.updateProjectionMatrix();
    }

    if (!body || !controller || !collider) return;
    if (!world.getRigidBody(body.handle) || !world.getCollider(collider.handle)) return;

    /* ----- menu backdrop: slow cinematic orbit ----- */
    if (st.phase === "menu") {
      const t = state.clock.elapsedTime * 0.07;
      camera.position.set(
        Math.sin(t) * 24,
        7.5 + Math.sin(t * 2.3) * 1.6,
        Math.cos(t) * 24,
      );
      camera.lookAt(0, 1, 0);
      return;
    }

    if (st.phase !== "playing") return;

    /* ---------------- touch look (no pointer lock) ---------------- */
    if (st.isTouch) {
      if (input.lookDx !== 0 || input.lookDy !== 0) {
        lookState.yaw -= input.lookDx * TOUCH_LOOK_SPEED;
        lookState.pitch -= input.lookDy * TOUCH_LOOK_SPEED;
        input.lookDx = 0;
        input.lookDy = 0;
      }
      lookState.pitch = THREE.MathUtils.clamp(
        lookState.pitch,
        -Math.PI / 2 + 0.02,
        Math.PI / 2 - 0.02,
      );
      _euler.set(lookState.pitch, lookState.yaw, 0, "YXZ");
      camera.quaternion.setFromEuler(_euler);
    }

    /* ------------------------ movement ------------------------ */
    const pos = body.translation();

    /* ---- merge keyboard and touch input (either may be active) ---- */
    const kf = (keys.current.KeyW ? 1 : 0) - (keys.current.KeyS ? 1 : 0);
    const kr = (keys.current.KeyD ? 1 : 0) - (keys.current.KeyA ? 1 : 0);
    const f = THREE.MathUtils.clamp(kf + input.moveZ, -1, 1);
    const r = THREE.MathUtils.clamp(kr + input.moveX, -1, 1);
    const wantJump = keys.current.Space || input.jump;
    const wantSprint =
      keys.current.ShiftLeft || keys.current.ShiftRight || input.sprint;

    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, UP).normalize();

    _move.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, r);
    const analog = Math.min(1, _move.length());
    const moving = analog > 0.001;
    if (moving) _move.normalize();

    const speed = (wantSprint ? SPRINT : SPEED) * (moving ? analog : 0);

    velY.current -= GRAVITY * dt;
    if (wasGrounded.current && wantJump) {
      velY.current = JUMP;
      wasGrounded.current = false;
    }

    controller.computeColliderMovement(collider, {
      x: _move.x * speed * dt,
      y: velY.current * dt,
      z: _move.z * speed * dt,
    });
    const mvm = controller.computedMovement();
    const grounded = controller.computedGrounded();
    if (grounded && velY.current < 0) velY.current = -0.5;
    wasGrounded.current = grounded;

    const nx = pos.x + mvm.x;
    const ny = pos.y + mvm.y;
    const nz = pos.z + mvm.z;
    body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    playerPos.set(nx, ny, nz);

    /* ---------------- camera glide + head-bob ---------------- */
    bobPhase.current += (moving && grounded ? speed : 0) * dt * 1.65;
    const active = moving && grounded && !reduce;
    const bobY = active ? Math.sin(bobPhase.current * 2) * 0.032 : 0;
    const bobX = active ? Math.cos(bobPhase.current) * 0.018 : 0;
    camera.position.set(
      nx + _right.x * bobX,
      ny + EYE + bobY,
      nz + _right.z * bobX,
    );

    /* ------------------------- firing ------------------------- */
    if (firing.current || input.fire) tryShoot();

    /* --------------------- gentle regen ----------------------- */
    if (st.health < 100 && Date.now() - st.damageAt > 5000)
      st.heal(9 * dt);

    /* ------------------- gun view-model pose ------------------- */
    const g = gun.current;
    if (g) {
      g.position.copy(camera.position);
      g.quaternion.copy(camera.quaternion);
      const sway = active ? Math.sin(bobPhase.current * 2) * 0.011 : 0;
      g.translateX(0.13);
      g.translateY(-0.17 + sway);
      g.translateZ(-0.3 + recoil.current * 0.06);
      g.rotateX(recoil.current * 0.06);
      g.rotateY(-0.03);
    }
  });

  /* ----------------------------- JSX --------------------------- */
  return (
    <group>
      {/* ---------- weapon view-model: real rifle + rigged hands ---------- */}
      <group ref={gun}>
        <Suspense fallback={null}>
          <Rifle />
          <RightHand />
          <LeftHand />
        </Suspense>

        {/* muzzle anchor, flash sprite & dynamic light */}
        <object3D ref={muzzle} position={[0, 0.012, -0.42]} />
        <sprite ref={flashSprite} position={[0, 0.012, -0.44]} visible={false}>
          <spriteMaterial
            map={flashTex}
            color="#ffdca8"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
        <pointLight
          ref={flashLight}
          position={[0, 0.05, -0.5]}
          color="#ffc37a"
          intensity={0}
          distance={9}
          decay={2}
        />
      </group>

      {/* ---------- tracers ---------- */}
      {tracers.map((t) => (
        <Line
          key={t.id}
          points={[t.from, t.to]}
          color="#aef2ff"
          lineWidth={1.6}
          transparent
          opacity={0.85}
        />
      ))}
    </group>
  );
}
