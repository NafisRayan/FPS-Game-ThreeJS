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
import { SPAWN, playerPos, enemyApi, controlsApi, weaponAnimApi } from "./refs";
import { sfx } from "./audio";
import { input, lookState, playerApi } from "./input";
import { AK47, RightArm, LeftArm } from "./Viewmodel";

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

interface Casing {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
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
  const aimingDownSights = useRef(false);
  const aimProgress = useRef(0); // 0 (hip) -> 1 (ADS)
  const reloadStart = useRef(0);
  const velY = useRef(0);
  const wasGrounded = useRef(false);
  const bobPhase = useRef(0);
  const lastShot = useRef(0);
  const lastStep = useRef(0);
  const prevAiming = useRef(false);
  const recoil = useRef(0);
  const flashUntil = useRef(0);
  const reloadTimeout = useRef<number | null>(null);

  const gun = useRef<THREE.Group>(null);
  const leftArmGroup = useRef<THREE.Group>(null);
  const magGroup = useRef<THREE.Group>(null);
  const muzzle = useRef<THREE.Object3D>(null);
  const flashSprite = useRef<THREE.Sprite>(null);
  const flashLight = useRef<THREE.PointLight>(null);

  const raycaster = useRef(new THREE.Raycaster());
  const [tracers, setTracers] = useState<Tracer[]>([]);
  const tracerId = useRef(0);
  const casings = useRef<Casing[]>([]);
  const casingId = useRef(0);

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
    reloadStart.current = performance.now();
    sfx.reload();
    weaponAnimApi.reload();
    reloadTimeout.current = window.setTimeout(() => {
      const s2 = useGame.getState();
      if (s2.phase === "dead") return;
      const take = Math.min(MAG_SIZE - s2.ammo, s2.reserve);
      s2.setAmmo(s2.ammo + take);
      s2.setReserve(s2.reserve - take);
      s2.setReloading(false);
      reloadStart.current = 0;
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
    weaponAnimApi.fire();

    const origin = camera.position;
    camera.getWorldDirection(_aim);

    // Eject spent 7.62x39mm golden brass casing to the right
    const rightDir = new THREE.Vector3().crossVectors(_aim, UP).normalize();
    const casingPos = new THREE.Vector3()
      .copy(origin)
      .addScaledVector(_aim, 0.35)
      .addScaledVector(rightDir, 0.16)
      .addScaledVector(UP, -0.08);

    const casingVel = new THREE.Vector3()
      .copy(rightDir)
      .multiplyScalar(2.4 + Math.random() * 0.8)
      .addScaledVector(UP, 1.6 + Math.random() * 0.5)
      .addScaledVector(_aim, -0.5 + (Math.random() - 0.5) * 0.3);

    casings.current.push({
      id: ++casingId.current,
      pos: casingPos,
      vel: casingVel,
      rot: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0),
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 30,
      ),
      born: now,
    });

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
      const ud = h.object.userData as { enemyId?: number; isHead?: boolean };
      const id = ud.enemyId;
      if (id !== undefined) {
        const objY = h.object.parent?.position.y ?? 0;
        const isHeadshot = ud.isHead === true || (h.point.y - objY >= 1.2);
        const res = api.hit(id, isHeadshot);
        if (res !== "none") {
          const isCrit = res === "headshot";
          st.registerHit(isCrit);
          if (isCrit) {
            sfx.headshot();
          } else {
            sfx.hit();
          }
          if (res === "kill" || (isCrit && res === "headshot")) {
            sfx.kill();
          }
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
      if (st.isTouch) return;
      if (st.phase !== "playing") return;
      if (e.button === 0) firing.current = true;
      if (e.button === 2) {
        aimingDownSights.current = true;
        st.setAiming(true);
      }
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) firing.current = false;
      if (e.button === 2) {
        aimingDownSights.current = false;
        useGame.getState().setAiming(false);
      }
    };
    const contextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    const blur = () => {
      keys.current = {};
      firing.current = false;
      aimingDownSights.current = false;
      useGame.getState().setAiming(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("contextmenu", contextMenu);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("blur", blur);
    };
  }, [gl, reload]);

  /* ------------------------ per-frame logic ---------------------- */
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const now = performance.now();
    const st = useGame.getState();
    const body = rb.current;
    const controller = ctrl.current;
    const collider = col.current;

    // tracer purge
    if (tracers.length > 0) {
      if (now - tracers[0].born > 75)
        setTracers((ts) => ts.filter((t) => now - t.born < 75));
    }

    // muzzle flash + light decay (always runs so it cools off in menus too)
    const lit = now < flashUntil.current;
    if (flashSprite.current) flashSprite.current.visible = lit;
    if (flashLight.current)
      flashLight.current.intensity = lit ? 13 + Math.random() * 8 : 0;

    // recoil relaxation
    // Aim-down-sights blending: smoothly transition between 0 (hip) and 1 (ADS)
    const isAiming = (aimingDownSights.current || input.aim) && !st.reloading;
    if (isAiming !== prevAiming.current) {
      prevAiming.current = isAiming;
      sfx.ads(isAiming);
    }
    aimProgress.current = THREE.MathUtils.lerp(
      aimProgress.current,
      isAiming ? 1 : 0,
      1 - Math.exp(-dt * 18),
    );

    // Recoil relaxation
    recoil.current = Math.max(0, recoil.current - dt * 6.5);
    const pc = camera as THREE.PerspectiveCamera;
    const reduce = st.settings.reduceMotion;
    // ADS zooms FOV in (75 -> 48), tight recoil punch
    const hipFov = 75 + (reduce ? 0 : recoil.current * 2.2);
    const adsFov = 48 + (reduce ? 0 : recoil.current * 1.1);
    const targetFov = THREE.MathUtils.lerp(hipFov, adsFov, aimProgress.current);
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

    /* ---------------- footsteps sound ---------------- */
    if (moving && grounded) {
      const stepInterval = wantSprint ? 300 : 470;
      if (now - lastStep.current > stepInterval) {
        lastStep.current = now;
        sfx.footstep(wantSprint);
      }
    }

    /* ------------------------- firing ------------------------- */
    if (firing.current || input.fire) tryShoot();

    /* --------------------- gentle regen ----------------------- */
    if (st.health < 100 && Date.now() - st.damageAt > 5000)
      st.heal(9 * dt);

    /* ---------------- spent casings physics ------------------- */
    const cList = casings.current;
    for (let i = cList.length - 1; i >= 0; i--) {
      const c = cList[i];
      if (now - c.born > 2500) {
        cList.splice(i, 1);
        continue;
      }
      c.vel.y -= 12 * dt;
      c.pos.addScaledVector(c.vel, dt);
      c.rot.x += c.rotVel.x * dt;
      c.rot.y += c.rotVel.y * dt;
      c.rot.z += c.rotVel.z * dt;
      if (c.pos.y < 0.035) {
        c.pos.y = 0.035;
        c.vel.y = -c.vel.y * 0.32;
        c.vel.x *= 0.65;
        c.vel.z *= 0.65;
        c.rotVel.multiplyScalar(0.6);
      }
    }

    /* ------------------- gun view-model pose & animations ------------------- */
    const g = gun.current;
    if (g) {
      g.position.copy(camera.position);
      g.quaternion.copy(camera.quaternion);

      // Realistic Multi-Phase AK-47 Reload Kinematics:
      // Phase 1 (0-30%): Weapon tilts left/up (showing banana mag); Left hand leaves handguard and rocks the empty mag forward/out
      // Phase 2 (30-65%): Left hand grabs fresh bakelite magazine from pouch and firmly locks/clicks it into the magwell (mag rocks in)
      // Phase 3 (65-88%): Left hand reaches over/under to decisively rack the right-side steel bolt charging handle
      // Phase 4 (88-100%): Left hand returns to cupping the wooden lower handguard; weapon settles back onto shoulder
      let reloadRotX = 0;
      let reloadRotY = 0;
      let reloadRotZ = 0;
      let reloadTransX = 0;
      let reloadTransY = 0;
      let reloadTransZ = 0;

      const leftArm = leftArmGroup.current;
      const mag = magGroup.current;

      if (st.reloading && reloadStart.current > 0) {
        const elapsed = (performance.now() - reloadStart.current) / RELOAD_MS;
        const p = Math.min(1, Math.max(0, elapsed));
        if (p < 0.3) {
          // Tilt gun to expose magazine well, left hand releases handguard and drops down
          const t = p / 0.3;
          reloadRotX = -0.35 * Math.sin(t * Math.PI * 0.5);
          reloadRotZ = 0.42 * Math.sin(t * Math.PI * 0.5);
          reloadRotY = -0.18 * Math.sin(t * Math.PI * 0.5);
          reloadTransY = -0.08 * Math.sin(t * Math.PI * 0.5);
          if (leftArm) leftArm.position.set(0.04 * t, -0.32 * t, 0.18 * t);
          if (mag) mag.position.set(0, -0.55 * t, -0.12 * t);
        } else if (p < 0.65) {
          // Fresh magazine brought up from bottom and rocked firmly into the magwell
          const t = (p - 0.3) / 0.35;
          reloadRotX = -0.35 + 0.12 * Math.sin(t * Math.PI);
          reloadRotZ = 0.42 - 0.14 * t;
          reloadRotY = -0.18 + 0.06 * t;
          reloadTransY = -0.08 + 0.03 * Math.sin(t * Math.PI * 2);
          if (leftArm) leftArm.position.set(0.04 * (1 - t), -0.32 * (1 - t), 0.18 * (1 - t));
          if (mag) mag.position.set(0, -0.45 * (1 - t), -0.08 * (1 - t));
        } else if (p < 0.88) {
          // Reaching to charging handle and racking bolt back
          const t = (p - 0.65) / 0.23;
          reloadRotX = -0.18 + 0.08 * Math.sin(t * Math.PI);
          reloadRotZ = 0.28 * (1 - t);
          reloadTransZ = 0.06 * Math.sin(t * Math.PI);
          if (leftArm) leftArm.position.set(0.06 * Math.sin(t * Math.PI), 0.08 * Math.sin(t * Math.PI), 0.22 * Math.sin(t * Math.PI));
          if (mag) mag.position.set(0, 0, 0);
        } else {
          // Settling back to shoulder stance
          const t = (p - 0.88) / 0.12;
          reloadRotX = -0.08 * (1 - t);
          reloadRotZ = 0;
          reloadRotY = 0;
          reloadTransY = 0;
          if (leftArm) leftArm.position.set(0, 0, 0);
          if (mag) mag.position.set(0, 0, 0);
        }
      } else {
        if (leftArm) leftArm.position.set(0, 0, 0);
        if (mag) mag.position.set(0, 0, 0);
      }
      const sway = active ? Math.sin(bobPhase.current * 2) * 0.011 : 0;
      const swayX = active ? Math.cos(bobPhase.current) * 0.007 : 0;

      // Interpolate between Hip-Fire and Iron Sight (ADS)
      // Hands centered with muzzle slightly towards left for hip-fire; laser-aligned true iron sights in ADS
      const hipPos = { x: -0.02 + swayX, y: -0.13 + sway, z: -0.08 };
      const adsPos = { x: 0.000, y: -0.003 + sway * 0.05, z: -0.055 };

      const posX = THREE.MathUtils.lerp(hipPos.x, adsPos.x, aimProgress.current) + reloadTransX;
      const posY = THREE.MathUtils.lerp(hipPos.y, adsPos.y, aimProgress.current) + reloadTransY;
      const posZ = THREE.MathUtils.lerp(hipPos.z, adsPos.z, aimProgress.current) + reloadTransZ + recoil.current * 0.035;

      g.translateX(posX);
      g.translateY(posY);
      g.translateZ(posZ);
      const hipRotX = recoil.current * 0.035 + reloadRotX;
      const adsRotX = recoil.current * 0.012 + reloadRotX;
      const rotX = THREE.MathUtils.lerp(hipRotX, adsRotX, aimProgress.current);
      const rotY = reloadRotY;
      const rotZ = reloadRotZ;

      g.rotateX(rotX);
      g.rotateY(rotY);
      if (Math.abs(rotZ) > 0.001) g.rotateZ(rotZ);
    }
  });

  return (
    <group>
      {/* ---------- weapon view-model: AK-47 + rigged arms ---------- */}
      <group ref={gun}>
        <Suspense fallback={null}>
          <AK47 magRef={magGroup} aimProgressRef={aimProgress} />
          <RightArm />
          <LeftArm ref={leftArmGroup} />
        </Suspense>

        {/* muzzle anchor, flash sprite & dynamic light aligned with AK-47 muzzle tip */}
        <object3D ref={muzzle} position={[0.0, 0.0, -0.865]} />
        <sprite ref={flashSprite} position={[0.0, 0.0, -0.87]} visible={false}>
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
          position={[0.0, 0.0, -0.87]}
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

      {/* ---------- spent brass casings ---------- */}
      <SpentCasingsRenderer casings={casings} />
    </group>
  );
}

function SpentCasingsRenderer({ casings }: { casings: React.RefObject<Casing[]> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const brassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#dfb143",
        metalness: 0.94,
        roughness: 0.2,
      }),
    [],
  );

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const list = casings.current || [];
    m.count = list.length;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      dummy.position.copy(c.pos);
      dummy.rotation.copy(c.rot);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, 32]}
      frustumCulled={false}
      material={brassMat}
    >
      <cylinderGeometry args={[0.0055, 0.006, 0.024, 8]} />
    </instancedMesh>
  );
}
