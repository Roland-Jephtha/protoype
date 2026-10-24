import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA } from '../../config/gameConfig';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { useSettings } from '../../state/settings';
import { runtime } from '../runtime';
import { clampPitch, damp, nextCameraDistance, orbitOffset } from './cameraMath';

/**
 * Third-person orbit camera.
 *  - Look input (mouse / touch) rotates yaw & pitch with pitch limits.
 *  - Follows the interpolated player position with exponential smoothing.
 *  - Distance and FOV adapt to the movement mode (sprint pulls back + widens).
 *  - A sphere cast from the pivot keeps the camera out of walls.
 * Runs after physics (-50) and player publishing (-40) each frame.
 */
export function ThirdPersonCamera() {
  const { world, rapier } = useRapier();
  const probe = useMemo(() => new rapier.Ball(CAMERA.collisionPadding), [rapier]);
  const state = useRef<{
    yaw: number;
    pitch: number;
    distance: number;
    modeDistance: number;
    fov: number;
    target: Vector3;
    initialised: boolean;
  }>({
    yaw: runtime.cameraYaw,
    pitch: CAMERA.defaultPitch,
    distance: CAMERA.distance,
    modeDistance: CAMERA.distance,
    fov: CAMERA.fov,
    target: new Vector3().copy(runtime.playerRenderPosition),
    initialised: false,
  });
  const tmp = useMemo(() => ({ pivot: new Vector3(), dir: new Vector3() }), []);

  useFrame((frame, rawDt) => {
    const camera = frame.camera as PerspectiveCamera;
    const dt = Math.min(rawDt, 0.1);
    const s = state.current;
    const settings = useSettings.getState();
    const paused = useApp.getState().paused;

    // --- orbit ----------------------------------------------------------
    const look = input.consumeLook();
    if (!paused) {
      s.yaw -= look.x;
      s.pitch = clampPitch(s.pitch + look.y * (settings.invertY ? -1 : 1));
    }
    runtime.cameraYaw = s.yaw;
    runtime.cameraPitch = s.pitch;

    // --- follow ---------------------------------------------------------
    const goal = tmp.pivot.copy(runtime.playerRenderPosition);
    goal.y += CAMERA.targetHeight;
    if (!s.initialised) {
      s.target.copy(goal);
      s.initialised = true;
    } else {
      s.target.lerp(goal, damp(CAMERA.followSharpness, dt));
    }

    // --- mode-dependent distance & FOV ----------------------------------
    const st = runtime.playerState;
    const modeDistance: number =
      st === 'flyBoost' ? CAMERA.boostDistance : st === 'fly' ? CAMERA.flyDistance : st === 'sprint' ? CAMERA.sprintDistance : CAMERA.distance;
    // Ease between mode distances; only real collisions may pull the camera in instantly.
    s.modeDistance += (modeDistance - s.modeDistance) * damp(CAMERA.distanceSharpness, dt);
    const desiredDistance = s.modeDistance;
    const boost = st === 'flyBoost' ? CAMERA.boostFovBoost : st === 'sprint' ? CAMERA.sprintFovBoost : st === 'fly' ? CAMERA.flyFovBoost : 0;
    const fovBoost = boost * (settings.reducedMotion ? 0.3 : 1);
    s.fov += (CAMERA.fov + fovBoost - s.fov) * damp(CAMERA.fovSharpness, dt);
    if (Math.abs(camera.fov - s.fov) > 0.01) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }

    // Shoulder offset shifts the pivot right of the hero so they don't block the view.
    const pivot = tmp.pivot.copy(s.target);
    pivot.x += Math.cos(s.yaw) * CAMERA.shoulderOffset;
    pivot.z += -Math.sin(s.yaw) * CAMERA.shoulderOffset;

    // --- collision ------------------------------------------------------
    const o = orbitOffset(s.yaw, s.pitch);
    tmp.dir.set(o.x, o.y, o.z);
    let limit: number = desiredDistance;
    const hit = world.castShape(
      pivot,
      { x: 0, y: 0, z: 0, w: 1 },
      tmp.dir,
      probe,
      0,
      desiredDistance,
      true,
      undefined,
      undefined,
      undefined,
      runtime.playerBody ?? undefined,
    );
    if (hit) limit = hit.time_of_impact;
    s.distance = nextCameraDistance(s.distance, desiredDistance, limit, dt);
    runtime.cameraDistance = s.distance;

    camera.position.set(pivot.x + o.x * s.distance, pivot.y + o.y * s.distance, pivot.z + o.z * s.distance);
    camera.lookAt(pivot);
    runtime.cameraPosition.copy(camera.position);
  }, -30);

  return null;
}
