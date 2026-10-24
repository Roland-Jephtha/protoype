/** Logical game actions. Every input source (keyboard, mouse, touch, gamepad) maps onto these. */
export const ACTIONS = [
  'jump',
  'sprint',
  'attack',
  'aim',
  'interact',
  /** Super breath: a gale that shoves enemies (hold). */
  'breath',
  /** Freeze breath (hold). */
  'freeze',
  /** Super Nova: hold to charge, release to blast. */
  'nova',
  'pause',
  /** Toggle flight (take off / drop out of flight). */
  'fly',
  /** Fly downward (in flight, Jump is "up"). */
  'descend',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Identifies which device produced an input so sources never overwrite each other. */
export type InputSource = 'keyboard' | 'mouse' | 'touch' | 'gamepad';
