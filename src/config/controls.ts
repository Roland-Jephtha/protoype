import type { Action } from '../input/actions';

/**
 * Default desktop bindings, keyed by KeyboardEvent.code so they are layout
 * independent (WASD stays in the same physical place on AZERTY).
 */
export const DEFAULT_KEY_BINDINGS: Record<string, Action> = {
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyE: 'interact',
  KeyQ: 'power',
  KeyF: 'fly',
  // Not Ctrl: Ctrl+W would close the browser tab mid-flight.
  KeyC: 'descend',
  Escape: 'pause',
  KeyP: 'pause',
};

export const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
} as const;

/** MouseEvent.button → action. */
export const MOUSE_BINDINGS: Record<number, Action> = {
  0: 'attack',
  2: 'aim',
};

/** Toggles the developer diagnostics overlay. */
export const DEBUG_TOGGLE_KEY = 'F3';

export const TOUCH = {
  /** Left stick radius in CSS px (knob travel). */
  stickRadius: 56,
  /** Default normalized dead zone (0..1). User-adjustable in settings. */
  defaultDeadZone: 0.15,
  /** Response curve exponent: 1 = linear, >1 = finer control near center. */
  defaultResponseExponent: 1.4,
} as const;
