import { useEffect, useRef, type ReactNode } from 'react';
import { CAMERA } from '../../config/gameConfig';
import type { Action } from '../../input/actions';
import { input } from '../../input/InputManager';
import { useSettings } from '../../state/settings';
import { screenDeltaToGame } from '../orientation';

/**
 * Thumb-sized action button. Holds while any of its pointers is down; every
 * end/cancel/lost-capture path releases, so it can't stay stuck after an
 * interruption (notification, palm touch, app switch). With `dragToLook`,
 * sliding the thumb while holding also turns the camera (aim while firing).
 */
export function TouchButton({
  action,
  label,
  icon,
  size = 72,
  className = '',
  dragToLook = false,
}: {
  action: Action;
  label: string;
  icon: ReactNode;
  size?: number;
  className?: string;
  dragToLook?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Set<number>());
  const last = useRef(new Map<number, { x: number; y: number }>());

  const release = (id: number) => {
    last.current.delete(id);
    if (!pointers.current.delete(id)) return;
    if (pointers.current.size === 0) {
      input.setButton('touch', action, false);
      ref.current?.classList.remove('pressed');
    }
  };

  useEffect(
    () => () => {
      pointers.current.clear();
      input.setButton('touch', action, false);
    },
    [action],
  );

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`touch-btn ${className}`}
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.add(e.pointerId);
        last.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        input.setButton('touch', action, true);
        e.currentTarget.classList.add('pressed');
        navigator.vibrate?.(8);
      }}
      onPointerMove={(e) => {
        const prev = last.current.get(e.pointerId);
        if (!dragToLook || !prev) return;
        const { x: dx, y: dy } = screenDeltaToGame(e.clientX - prev.x, e.clientY - prev.y);
        last.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const k = CAMERA.touchSensitivity * useSettings.getState().touchLookSensitivity;
        input.addLook(dx * k, -dy * k);
      }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
      onLostPointerCapture={(e) => release(e.pointerId)}
      // Keyboard/screen-reader "click" never reaches gameplay; touch drives it.
      onClick={(e) => e.preventDefault()}
    >
      <span className="touch-btn-icon">{icon}</span>
      <span className="touch-btn-label">{label}</span>
    </button>
  );
}
