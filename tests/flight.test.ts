import { describe, expect, it } from 'vitest';
import { FLIGHT } from '../src/config/gameConfig';
import { flightDirection, GroundMotor, type MotorInput } from '../src/game/player/groundMovement';

const DT = 1 / 60;
const idle: MotorInput = { moveX: 0, moveY: 0, cameraYaw: 0, sprintHeld: false, jumpPressed: false, jumpHeld: false };

/** Open sky with a floor at y = 0: everything passes except going below the floor. */
function simulate(m: GroundMotor, inputs: (i: number) => Partial<MotorInput>, steps: number, startY = 0) {
  let y = startY;
  for (let i = 0; i < steps; i++) {
    const d = m.step({ ...idle, ...inputs(i) }, DT);
    const a = { ...d };
    if (y + d.y <= 0) a.y = -y;
    y += a.y;
    m.resolve(d, a, y <= 1e-6, DT);
  }
  return y;
}

const speed = (m: GroundMotor) => Math.hypot(m.velocity.x, m.velocity.y, m.velocity.z);

function airborneFlyer(altitude = 30) {
  const m = new GroundMotor();
  simulate(m, () => ({}), 10);
  const y = simulate(m, (i) => ({ flyPressed: i === 0, jumpHeld: true }), Math.round((altitude / FLIGHT.baseSpeed) * 60) + 30);
  return { m, y };
}

describe('flightDirection', () => {
  it('flies where the camera looks, including pitch', () => {
    const level = flightDirection(0, 1, 0, 0, 0);
    expect(level.z).toBeCloseTo(-1);
    expect(level.y).toBeCloseTo(0);
    const up = flightDirection(0, 1, 0, Math.PI / 4, 0);
    expect(up.y).toBeGreaterThan(0.6);
    expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1);
  });

  it('never exceeds unit length when combining stick and vertical input', () => {
    const d = flightDirection(1, 1, 0.3, 0.2, 1);
    expect(Math.hypot(d.x, d.y, d.z)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('flight', () => {
  it('F takes off from the ground with an upward push', () => {
    const m = new GroundMotor();
    simulate(m, () => ({}), 10);
    expect(m.grounded).toBe(true);
    const y = simulate(m, (i) => ({ flyPressed: i === 0 }), 20);
    expect(m.mode).toBe('flight');
    expect(y).toBeGreaterThan(0.5);
  });

  it('Jump again while airborne takes off (double-tap to fly)', () => {
    const m = new GroundMotor();
    simulate(m, () => ({}), 10);
    simulate(m, (i) => ({ jumpPressed: i === 0 || i === 20, jumpHeld: i < 25 }), 30);
    expect(m.mode).toBe('flight');
  });

  it('cruises at 60 km/h with full stick', () => {
    const { m } = airborneFlyer();
    simulate(m, () => ({ moveY: 1 }), 120, 30);
    expect(speed(m) * 3.6).toBeCloseTo(60, 0);
    expect(m.state).toBe('fly');
  });

  it('boosts to 250 km/h', () => {
    const { m } = airborneFlyer();
    simulate(m, () => ({ moveY: 1, sprintHeld: true }), 300, 30);
    expect(speed(m) * 3.6).toBeCloseTo(250, 0);
    expect(m.state).toBe('flyBoost');
  });

  it('brakes to a hover with no input, staying in the air', () => {
    const { m, y } = airborneFlyer();
    simulate(m, () => ({ moveY: 1, sprintHeld: true }), 120, y);
    const yy = simulate(m, () => ({}), 180, y);
    expect(speed(m)).toBeLessThan(0.01);
    expect(m.state).toBe('hover');
    expect(m.mode).toBe('flight');
    expect(yy).toBeGreaterThan(5);
  });

  it('climbs with Jump held and when looking up', () => {
    const { m } = airborneFlyer();
    simulate(m, () => ({ jumpHeld: true }), 60, 30);
    expect(m.velocity.y).toBeGreaterThan(FLIGHT.baseSpeed * 0.9);
    simulate(m, () => ({ moveY: 1, cameraPitch: 0.6 }), 120, 30);
    expect(m.velocity.y).toBeGreaterThan(5);
  });

  it('lands softly when descending onto the ground', () => {
    const { m, y } = airborneFlyer(10);
    simulate(m, () => ({ descendHeld: true }), 240, y);
    expect(m.mode).toBe('ground');
    expect(m.grounded).toBe(true);
  });

  it('a fast dive into the ground is a hard landing', () => {
    const { m, y } = airborneFlyer(60);
    simulate(m, () => ({ moveY: 1, cameraPitch: -1.3, sprintHeld: true }), 300, y);
    expect(m.mode).toBe('ground');
    expect(m.lastLandingSpeed).toBeGreaterThan(FLIGHT.hardLandingSpeed);
  });

  it('F in flight drops out and falls under gravity', () => {
    const { m, y } = airborneFlyer();
    const hoverY = simulate(m, () => ({}), 90, y); // settle into a hover first
    simulate(m, (i) => ({ flyPressed: i === 0 }), 30, hoverY);
    expect(m.mode).toBe('ground');
    expect(m.velocity.y).toBeLessThan(-3);
  });
});

describe('Man of Steel launch', () => {
  it('holding Fly crouches, then launches far higher than a tap', () => {
    const tap = new GroundMotor();
    const held = new GroundMotor();
    // Settle both on the floor.
    for (const m of [tap, held]) for (let i = 0; i < 10; i++) {
      const d = m.step({ moveX: 0, moveY: 0, cameraYaw: 0, sprintHeld: false, jumpPressed: false, jumpHeld: false }, 1 / 60);
      m.resolve(d, { ...d, y: 0 }, true, 1 / 60);
    }
    const base = { moveX: 0, moveY: 0, cameraYaw: 0, sprintHeld: false, jumpPressed: false, jumpHeld: false };
    tap.step({ ...base, flyPressed: true, flyHeld: true }, 1 / 60);
    tap.step({ ...base, flyHeld: false }, 1 / 60);
    held.step({ ...base, flyPressed: true, flyHeld: true }, 1 / 60);
    let crouched = false;
    for (let i = 0; i < 40; i++) {
      held.step({ ...base, flyHeld: true }, 1 / 60);
      crouched ||= held.state === 'hardLand';
    }
    expect(crouched).toBe(true);
    expect(held.mode).toBe('flight');
    expect(held.velocity.y).toBeGreaterThan(tap.velocity.y * 3);
    expect(held.consumeLaunch()).toBeGreaterThan(0.9);
  });
});
