import { useEffect, useRef, type ReactNode } from 'react';
import type { Action } from '../../input/actions';
import { input } from '../../input/InputManager';

/**
 * Thumb-sized action button. Holds while any of its pointers is down; every
 * end/cancel/lost-capture path releases, so it can't stay stuck after an
 * interruption (notification, palm touch, app switch).
 */
export function TouchButton({
  action,
  label,
  icon,
  size = 72,
  className = '',
}: {
  action: Action;
  label: string;
  icon: ReactNode;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Set<number>());

  const release = (id: number) => {
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
        input.setButton('touch', action, true);
        e.currentTarget.classList.add('pressed');
        navigator.vibrate?.(8);
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
