import { PerformanceMonitor, Sky } from '@react-three/drei';
import { advance, Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { DirectionalLight, Object3D } from 'three';
import { HIT_STOP, SPEED_FORCE } from '../config/combat';
import { BOSS_FIGHT } from '../config/villains';
import { CAMERA, GRAPHICS_PRESETS, PHYSICS } from '../config/gameConfig';
import { OUTDOOR_DRAW_SCALE, REGIONS, type RegionLook } from '../config/regions';
import { useApp } from '../state/appStore';
import { useSettings } from '../state/settings';
import { runtime } from './runtime';
import { AudioDriver } from './audio/AudioDriver';
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

/** Sets the world time scale each frame: Speed Force slow-motion and hit-stop. Runs before everything else. */
function TimeControl() {
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    runtime.hitStop = Math.max(0, runtime.hitStop - step);
    const f = runtime.finisher;
    if (f && !useApp.getState().paused && (f.time -= step) <= 0) runtime.finisher = null;
    runtime.speedForce = runtime.combat.speedForce;
    runtime.timeScale = runtime.hitStop > 0 ? HIT_STOP.scale : runtime.finisher ? BOSS_FIGHT.finisherScale : runtime.speedForce ? SPEED_FORCE.worldScale : 1;
  }, -60);
  return null;
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
        const t0 = performance.now();
        advance(t);
        // CPU time to simulate and submit the frame (smoothed): the steady cost metric.
        runtime.cpuMs += (performance.now() - t0 - runtime.cpuMs) * 0.1;
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

/**
 * Signals when the physics WASM and the region's world have finished mounting.
 * Before that, compiles every shader the region can use — including effects
 * that start hidden (beams, ice, explosions) and models out of view — so the
 * first heat beam or a villain walking into view never stalls a frame on a
 * shader compile.
 */
function ReadySignal() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // Wait one frame so the region's first render (terrain upload) is done.
    const id = requestAnimationFrame(() => {
      const hidden: Object3D[] = [];
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
      try {
        gl.compile(scene, camera);
      } finally {
        for (const o of hidden) o.visible = false;
      }
      useApp.getState().setRegionReady();
    });
    return () => cancelAnimationFrame(id);
  }, [gl, scene, camera]);
  return null;
}

/** Lowest pixel ratio adaptive resolution may drop to. */
const ADAPTIVE_MIN_DPR = 0.75;

export function GameCanvas() {
  const quality = useSettings((s) => s.graphicsQuality);
  const preset = GRAPHICS_PRESETS[quality];
  // Adaptive resolution: render fewer pixels when the frame rate sags (phones with high-DPI screens).
  // Tagged with the quality it belongs to, so a quality change starts again from the preset's maximum.
  const [dprState, setDprState] = useState({ quality, value: preset.maxDpr });
  const dpr = dprState.quality === quality ? dprState.value : preset.maxDpr;
  const setDpr = (f: (d: number) => number) => setDprState({ quality, value: f(dpr) });
  // The briefing and the mission-complete screen freeze the world like the pause menu.
  const paused = useApp((s) => s.paused || s.missionPhase === 'intro' || s.missionPhase === 'complete' || s.missionPhase === 'failed');
  const regionId = useApp((s) => s.regionId);
  const travelCount = useApp((s) => s.travelCount);
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
      dpr={dpr}
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
        <Physics key={`${regionId}:${travelCount}`} timeStep={PHYSICS.timeStep} paused={paused} updatePriority={-50} gravity={[0, -PHYSICS.gravity, 0]}>
          <RegionWorld regionId={regionId} />
          <ReadySignal />
        </Physics>
      </Suspense>
      {/* Settles after a few changes instead of flip-flopping (each change resizes the canvas). */}
      <PerformanceMonitor
        bounds={() => [38, 58]}
        flipflops={3}
        onDecline={() => setDpr((d) => Math.max(ADAPTIVE_MIN_DPR, d * 0.8))}
        onIncline={() => setDpr((d) => Math.min(preset.maxDpr, d * 1.1))}
        onFallback={() => setDpr(() => ADAPTIVE_MIN_DPR)}
      />
      <TimeControl />
      <PerfProbe />
      <AudioDriver />
      <VsyncFrameLoop />
    </Canvas>
  );
}
