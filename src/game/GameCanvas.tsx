import { Sky } from '@react-three/drei';
import { advance, Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { DirectionalLight, Object3D } from 'three';
import { CAMERA, GRAPHICS_PRESETS, PHYSICS } from '../config/gameConfig';
import { OUTDOOR_DRAW_SCALE, REGIONS, type RegionLook } from '../config/regions';
import { useApp } from '../state/appStore';
import { useSettings } from '../state/settings';
import { runtime } from './runtime';
import { RegionWorld } from './world/RegionWorld';

/**
 * Region lighting. The shadow-casting sun follows the player so a small, sharp
 * shadow frustum covers the area that matters instead of the whole region.
 */
function Lighting({ look, shadows, mapSize }: { look: RegionLook; shadows: boolean; mapSize: number }) {
  const offset = look.sunOffset;
  const sun = useRef<DirectionalLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useFrame(() => {
    const p = runtime.playerRenderPosition;
    if (!sun.current) return;
    // Snap to a 2 m grid to avoid shadow shimmering as the frustum moves.
    const sx = Math.round(p.x / 2) * 2;
    const sz = Math.round(p.z / 2) * 2;
    target.position.set(sx, p.y, sz);
    sun.current.position.set(sx + offset[0], p.y + offset[1], sz + offset[2]);
    sun.current.target = target;
  });

  return (
    <>
      <hemisphereLight args={[look.hemisphere.sky, look.hemisphere.ground, look.hemisphere.intensity]} />
      <directionalLight
        ref={sun}
        color={look.sun.color}
        intensity={look.sun.intensity}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={250}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

/** Writes FPS / frame time / draw calls into runtime for the diagnostics overlay. */
function PerfProbe() {
  const gl = useThree((s) => s.gl);
  useFrame((_, dt) => {
    runtime.frameMs += (dt * 1000 - runtime.frameMs) * 0.1;
    runtime.fps = runtime.frameMs > 0 ? 1000 / runtime.frameMs : 0;
    runtime.drawCalls = gl.info.render.calls;
    runtime.triangles = gl.info.render.triangles;
  });
  return null;
}

/**
 * Drives the frame loop from requestAnimationFrame's vsync timestamp.
 *
 * R3F's default loop measures each frame's delta with a clock read whenever the
 * callback happens to run, which wobbles by a few ms. Physics interpolation
 * turned that into visible judder (±20% per-frame displacement at sprint
 * speed). With frameloop="never", R3F derives every delta from the timestamp
 * we pass to advance(), so physics, camera and animation all step evenly.
 */
function VsyncFrameLoop() {
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    let raf = 0;
    let started = false;
    let reported = false;
    const loop = (ts: number) => {
      // Schedule the next frame first: an exception in a frame callback must
      // never stop the loop (that would freeze the game for good).
      raf = requestAnimationFrame(loop);
      const t = ts / 1000;
      if (!started) {
        // First frame: anchor the clock so the initial delta isn't the page's whole lifetime.
        clock.elapsedTime = t;
        started = true;
        return;
      }
      try {
        advance(t);
      } catch (err) {
        if (!reported) console.error('[frame] error in frame loop (continuing):', err);
        reported = true;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clock]);
  return null;
}

/** Signals when the physics WASM and the region's world have finished mounting. */
function ReadySignal() {
  useEffect(() => {
    // Wait one frame so the region's first render (terrain upload) is done.
    const id = requestAnimationFrame(() => useApp.getState().setRegionReady());
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}

export function GameCanvas() {
  const quality = useSettings((s) => s.graphicsQuality);
  const preset = GRAPHICS_PRESETS[quality];
  // The briefing and the mission-complete screen freeze the world like the pause menu.
  const paused = useApp((s) => s.paused || s.missionPhase === 'briefing' || s.missionPhase === 'complete');
  const regionId = useApp((s) => s.regionId);
  const region = REGIONS[regionId];
  const look = region.look;
  // Cities fog by the quality preset; open regions see further, scaled by quality.
  const fogFar = region.kind === 'city' ? preset.drawDistance : look.fog.far * OUTDOOR_DRAW_SCALE[quality];

  return (
    <Canvas
      // Re-create the renderer when quality changes (antialias can't be toggled live).
      key={quality}
      // Frames are driven by VsyncFrameLoop for even frame deltas.
      frameloop="never"
      shadows={preset.shadows ? 'soft' : false}
      dpr={[1, preset.maxDpr]}
      // Layout (offset) size, not the visual bounding box: stays correct when the
      // app frame is CSS-rotated into landscape on phones.
      resize={{ offsetSize: true }}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: [0, 4, 14] }}
    >
      <color attach="background" args={[look.background]} />
      <fog attach="fog" args={[look.fog.color, look.fog.near, fogFar]} />
      <Sky distance={2000} sunPosition={look.sunOffset} {...look.sky} />
      <Lighting look={look} shadows={preset.shadows} mapSize={preset.shadowMapSize} />
      <Suspense fallback={null}>
        {/* Keyed by region: travelling disposes the old world, colliders and player entirely. */}
        <Physics key={regionId} timeStep={PHYSICS.timeStep} paused={paused} updatePriority={-50} gravity={[0, -PHYSICS.gravity, 0]}>
          <RegionWorld regionId={regionId} />
          <ReadySignal />
        </Physics>
      </Suspense>
      <PerfProbe />
      <VsyncFrameLoop />
    </Canvas>
  );
}
