import { Sky } from '@react-three/drei';
import { advance, Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { DirectionalLight, Object3D } from 'three';
import { CAMERA, GRAPHICS_PRESETS, PHYSICS, PLAYER } from '../config/gameConfig';
import { useApp } from '../state/appStore';
import { useSettings } from '../state/settings';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { Player } from './player/Player';
import { runtime } from './runtime';
import { TestDistrict } from './world/TestDistrict';

const SUN_OFFSET: [number, number, number] = [-70, 55, -45];
const SKY_COLOR = '#9fb0c4';

/**
 * Dusk lighting. The shadow-casting sun follows the player so a small, sharp
 * shadow frustum covers the area that matters instead of the whole district.
 */
function Lighting({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
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
    sun.current.position.set(sx + SUN_OFFSET[0], p.y + SUN_OFFSET[1], sz + SUN_OFFSET[2]);
    sun.current.target = target;
  });

  return (
    <>
      <hemisphereLight args={['#c6d4ec', '#6a5d52', 1.5]} />
      <directionalLight
        ref={sun}
        color="#ffc38a"
        intensity={2.6}
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
    const loop = (ts: number) => {
      const t = ts / 1000;
      if (!started) {
        // First frame: anchor the clock so the initial delta isn't the page's whole lifetime.
        clock.elapsedTime = t;
        started = true;
      } else {
        advance(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clock]);
  return null;
}

/** Signals when the physics WASM and world have finished their first mount. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export function GameCanvas({ onReady }: { onReady: () => void }) {
  const quality = useSettings((s) => s.graphicsQuality);
  const preset = GRAPHICS_PRESETS[quality];
  const paused = useApp((s) => s.paused);

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
      camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: [PLAYER.spawn[0], 4, PLAYER.spawn[2] + 6] }}
    >
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 90, preset.drawDistance]} />
      <Sky distance={2000} sunPosition={SUN_OFFSET} turbidity={6} rayleigh={1.6} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <Lighting shadows={preset.shadows} mapSize={preset.shadowMapSize} />
      <Suspense fallback={null}>
        <Physics timeStep={PHYSICS.timeStep} paused={paused} updatePriority={-50} gravity={[0, -PHYSICS.gravity, 0]}>
          <TestDistrict />
          <Player />
          <ThirdPersonCamera />
          <ReadySignal onReady={onReady} />
        </Physics>
      </Suspense>
      <PerfProbe />
      <VsyncFrameLoop />
    </Canvas>
  );
}
