/** Pure analog-stick helpers. No DOM access, so they are unit-testable. */

export interface StickVector {
  x: number;
  y: number;
  /** 0..1 after dead zone and response curve. */
  magnitude: number;
}

/**
 * Converts a pointer offset from the stick centre (CSS px, y down) into a
 * clamped knob offset for display and a raw normalized vector (y up = forward).
 */
export function pointerOffsetToStick(dx: number, dy: number, radius: number) {
  const len = Math.hypot(dx, dy);
  const scale = len > radius ? radius / len : 1;
  const knobX = dx * scale;
  const knobY = dy * scale;
  return {
    knobX,
    knobY,
    rawX: knobX / radius,
    rawY: -knobY / radius,
  };
}

/**
 * Radial dead zone with rescaling, so output ramps smoothly from 0 at the
 * dead-zone edge to 1 at full deflection, followed by a power response curve.
 * Direction is preserved exactly (full 360° movement).
 */
export function applyRadialDeadZone(
  x: number,
  y: number,
  deadZone: number,
  responseExponent = 1,
): StickVector {
  const rawMag = Math.min(1, Math.hypot(x, y));
  const dz = Math.min(Math.max(deadZone, 0), 0.95);
  if (rawMag <= dz || rawMag === 0) return { x: 0, y: 0, magnitude: 0 };

  const rescaled = (rawMag - dz) / (1 - dz);
  const curved = Math.pow(rescaled, Math.max(responseExponent, 0.1));
  const len = Math.hypot(x, y);
  return { x: (x / len) * curved, y: (y / len) * curved, magnitude: curved };
}

/** Clamps a 2D vector to unit length (e.g. diagonal keyboard input). */
export function clampUnit(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}
