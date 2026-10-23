import { useEffect, useRef } from 'react';
import { runtime } from '../game/runtime';
import { input } from '../input/InputManager';
import { stickDebug } from '../input/stickDebug';

const f = (n: number, d = 1) => n.toFixed(d).padStart(7);

/**
 * Developer diagnostics (F3 / Settings): frame timing, renderer stats, player
 * state and live input values including raw vs. processed stick output.
 * Polls at 5 Hz and writes text directly — no per-frame React renders.
 */
export function DebugOverlay() {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!ref.current) return;
      const p = runtime.playerPosition;
      const v = runtime.playerVelocity;
      const snap = input.debugSnapshot();
      const sources = Object.entries(snap.sources)
        .map(([s, a]) => `${s}:${a.join(',')}`)
        .join(' ');
      ref.current.textContent = [
        `fps ${f(runtime.fps, 0)}   frame ${f(runtime.frameMs)} ms`,
        `draws ${f(runtime.drawCalls, 0)}   tris ${f(runtime.triangles / 1000, 0)}k`,
        `state ${runtime.playerState.padStart(8)}   grounded ${runtime.grounded ? 'yes' : 'no'}`,
        `pos  ${f(p.x)} ${f(p.y)} ${f(p.z)}`,
        `vel  ${f(v.x)} ${f(v.y)} ${f(v.z)}   |h| ${f(Math.hypot(v.x, v.z))} m/s`,
        `cam  yaw ${f(runtime.cameraYaw, 2)} pitch ${f(runtime.cameraPitch, 2)} dist ${f(runtime.cameraDistance, 2)}`,
        `move ${f(snap.move.x, 2)} ${f(snap.move.y, 2)}`,
        `stick raw ${f(stickDebug.rawX, 2)} ${f(stickDebug.rawY, 2)}  out ${f(stickDebug.outX, 2)} ${f(stickDebug.outY, 2)}  ${stickDebug.active ? 'ACTIVE' : 'idle'}`,
        `held ${snap.held.join(', ') || '-'}`,
        `src  ${sources || '-'}`,
      ].join('\n');
    }, 200);
    return () => window.clearInterval(id);
  }, []);
  return <pre ref={ref} className="debug-overlay" aria-hidden="true" />;
}
