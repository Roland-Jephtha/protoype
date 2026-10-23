import { useEffect, useRef } from 'react';
import { TOUCH } from '../../config/controls';
import { input } from '../../input/InputManager';
import { stickDebug } from '../../input/stickDebug';
import { applyRadialDeadZone, pointerOffsetToStick } from '../../input/stickMath';
import { useSettings } from '../../state/settings';


/**
 * PSP-style left analog stick: fixed circular base, knob follows the thumb
 * within the radius, 360° analog output with radial dead zone + response curve.
 *
 * Tracks exactly one pointer id (multi-touch safe) and uses pointer capture so
 * the thumb can drift outside the base. Any end/cancel/lost-capture returns the
 * stick to neutral, so movement can never stay stuck.
 */
export function VirtualStick({ scale }: { scale: number }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const radius = TOUCH.stickRadius * scale;

  const apply = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const s = pointerOffsetToStick(clientX - cx, clientY - cy, radius);
    const { stickDeadZone } = useSettings.getState();
    const out = applyRadialDeadZone(s.rawX, s.rawY, stickDeadZone, TOUCH.defaultResponseExponent);
    input.setMove('touch', out.x, out.y);
    if (knobRef.current) knobRef.current.style.transform = `translate(${s.knobX}px, ${s.knobY}px)`;
    Object.assign(stickDebug, { rawX: s.rawX, rawY: s.rawY, outX: out.x, outY: out.y, magnitude: out.magnitude, active: true });
  };

  const reset = () => {
    activeId.current = null;
    input.setMove('touch', 0, 0);
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
    baseRef.current?.classList.remove('active');
    Object.assign(stickDebug, { rawX: 0, rawY: 0, outX: 0, outY: 0, magnitude: 0, active: false });
  };

  // Neutralise on unmount (controls hidden, pause, screen change).
  useEffect(() => reset, []);

  return (
    <div
      ref={baseRef}
      className="touch-stick"
      style={{ width: radius * 2.4, height: radius * 2.4 }}
      onPointerDown={(e) => {
        if (activeId.current !== null) return;
        e.preventDefault();
        activeId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add('active');
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === activeId.current) apply(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => e.pointerId === activeId.current && reset()}
      onPointerCancel={(e) => e.pointerId === activeId.current && reset()}
      onLostPointerCapture={(e) => e.pointerId === activeId.current && reset()}
    >
      <div className="touch-stick-ring" style={{ width: radius * 2, height: radius * 2 }} />
      <div ref={knobRef} className="touch-stick-knob" style={{ width: radius * 0.9, height: radius * 0.9 }} />
    </div>
  );
}
