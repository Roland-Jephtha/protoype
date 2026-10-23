import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/input/InputManager';

describe('InputManager', () => {
  it('latches a press until consumed, even if released before the next step', () => {
    const im = new InputManager();
    im.setButton('touch', 'jump', true);
    im.setButton('touch', 'jump', false);
    expect(im.isHeld('jump')).toBe(false);
    expect(im.consumePressed('jump')).toBe(true);
    expect(im.consumePressed('jump')).toBe(false);
  });

  it('keeps an action held while any source holds it', () => {
    const im = new InputManager();
    im.setButton('keyboard', 'sprint', true);
    im.setButton('touch', 'sprint', true);
    im.setButton('touch', 'sprint', false);
    expect(im.isHeld('sprint')).toBe(true);
    im.setButton('keyboard', 'sprint', false);
    expect(im.isHeld('sprint')).toBe(false);
  });

  it('does not re-latch a press when a second source joins a held action', () => {
    const im = new InputManager();
    im.setButton('keyboard', 'jump', true);
    im.consumePressed('jump');
    im.setButton('touch', 'jump', true);
    expect(im.consumePressed('jump')).toBe(false);
  });

  it('releaseSource clears stuck buttons and movement from that source only', () => {
    const im = new InputManager();
    im.setButton('touch', 'jump', true);
    im.setMove('touch', 0, 1);
    im.setButton('keyboard', 'sprint', true);
    im.releaseSource('touch');
    expect(im.isHeld('jump')).toBe(false);
    expect(im.getMove()).toEqual({ x: 0, y: 0 });
    expect(im.isHeld('sprint')).toBe(true);
  });

  it('uses the strongest movement source rather than summing', () => {
    const im = new InputManager();
    im.setMove('keyboard', 1, 0);
    im.setMove('touch', 0, 0.4);
    expect(im.getMove()).toEqual({ x: 1, y: 0 });
  });

  it('accumulates look deltas and drains them on consume', () => {
    const im = new InputManager();
    im.addLook(0.1, 0.02);
    im.addLook(0.1, -0.01);
    const l = im.consumeLook();
    expect(l.x).toBeCloseTo(0.2);
    expect(l.y).toBeCloseTo(0.01);
    expect(im.consumeLook()).toEqual({ x: 0, y: 0 });
  });

  it('releaseAll drops pending latches', () => {
    const im = new InputManager();
    im.setButton('mouse', 'attack', true);
    im.releaseAll();
    expect(im.consumePressed('attack')).toBe(false);
    expect(im.isHeld('attack')).toBe(false);
  });
});
