import { ACTIONS, type Action, type InputSource } from './actions';
import { clampUnit } from './stickMath';

const SOURCES: InputSource[] = ['keyboard', 'mouse', 'touch', 'gamepad'];

/**
 * Device-agnostic input state consumed by gameplay.
 *
 * - Buttons are tracked per source, so releasing a touch button never cancels
 *   a key still held on the keyboard (and vice versa).
 * - Presses are latched until consumed, so a tap shorter than one simulation
 *   step is never lost.
 * - Look input is accumulated in radians and drained by the camera each frame.
 *
 * Gameplay reads from this object; it never touches DOM events directly.
 */
export class InputManager {
  private held = new Map<InputSource, Set<Action>>();
  private moveBySource = new Map<InputSource, { x: number; y: number }>();
  private pressLatch = new Set<Action>();
  private releaseLatch = new Set<Action>();
  private look = { x: 0, y: 0 };

  constructor() {
    for (const s of SOURCES) {
      this.held.set(s, new Set());
      this.moveBySource.set(s, { x: 0, y: 0 });
    }
  }

  setButton(source: InputSource, action: Action, down: boolean): void {
    const wasHeld = this.isHeld(action);
    const set = this.held.get(source)!;
    if (down) set.add(action);
    else set.delete(action);
    const nowHeld = this.isHeld(action);
    if (!wasHeld && nowHeld) this.pressLatch.add(action);
    if (wasHeld && !nowHeld) this.releaseLatch.add(action);
  }

  isHeld(action: Action): boolean {
    for (const set of this.held.values()) if (set.has(action)) return true;
    return false;
  }

  /** True once per press, then cleared. */
  consumePressed(action: Action): boolean {
    return this.pressLatch.delete(action);
  }

  consumeReleased(action: Action): boolean {
    return this.releaseLatch.delete(action);
  }

  /** x = right, y = forward, each in -1..1. */
  setMove(source: InputSource, x: number, y: number): void {
    const v = this.moveBySource.get(source)!;
    v.x = x;
    v.y = y;
  }

  /** Strongest source wins, so keyboard and stick do not add up past 1. */
  getMove(): { x: number; y: number } {
    let best = { x: 0, y: 0 };
    let bestMag = 0;
    for (const v of this.moveBySource.values()) {
      const m = Math.hypot(v.x, v.y);
      if (m > bestMag) {
        bestMag = m;
        best = v;
      }
    }
    return clampUnit(best.x, best.y);
  }

  /** Adds camera rotation in radians (yaw right +, pitch up +). */
  addLook(yaw: number, pitch: number): void {
    this.look.x += yaw;
    this.look.y += pitch;
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.look.x, y: this.look.y };
    this.look.x = 0;
    this.look.y = 0;
    return out;
  }

  /** Releases everything held by one source (blur, touch cancel, controls hidden). */
  releaseSource(source: InputSource): void {
    for (const action of [...this.held.get(source)!]) this.setButton(source, action, false);
    this.setMove(source, 0, 0);
  }

  releaseAll(): void {
    for (const s of SOURCES) this.releaseSource(s);
    this.clearLatches();
  }

  /** Drop pending presses and look deltas (e.g. when leaving a menu). */
  clearLatches(): void {
    this.pressLatch.clear();
    this.releaseLatch.clear();
    this.look.x = 0;
    this.look.y = 0;
  }

  /** Snapshot for the debug overlay. */
  debugSnapshot() {
    const held = ACTIONS.filter((a) => this.isHeld(a));
    const sources: Record<string, string[]> = {};
    for (const [s, set] of this.held) if (set.size) sources[s] = [...set];
    return { move: this.getMove(), held, sources };
  }
}

/** The single game-wide input instance. */
export const input = new InputManager();
