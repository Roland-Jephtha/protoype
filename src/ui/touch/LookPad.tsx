import { useEffect, useRef } from 'react';
import { CAMERA } from '../../config/gameConfig';
import { input } from '../../input/InputManager';
import { useSettings } from '../../state/settings';

/**
 * Right-side camera drag area. Sits *under* the action buttons, so a touch
 * that lands on a button never rotates the camera and vice versa.
 * Tracks one pointer id; drag deltas become yaw/pitch in radians.
 */
export function LookPad() {
  const activeId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });

  useEffect(
    () => () => {
      activeId.current = null;
    },
    [],
  );

  const end = (id: number) => {
    if (id === activeId.current) activeId.current = null;
  };

  return (
    <div
      className="touch-lookpad"
      onPointerDown={(e) => {
        if (activeId.current !== null) return;
        e.preventDefault();
        activeId.current = e.pointerId;
        last.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== activeId.current) return;
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
        const k = CAMERA.touchSensitivity * useSettings.getState().touchLookSensitivity;
        input.addLook(dx * k, -dy * k);
      }}
      onPointerUp={(e) => end(e.pointerId)}
      onPointerCancel={(e) => end(e.pointerId)}
      onLostPointerCapture={(e) => end(e.pointerId)}
    />
  );
}
