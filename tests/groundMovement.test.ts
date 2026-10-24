import { describe, expect, it } from 'vitest';
import { GROUND_MOVEMENT, PHYSICS } from '../src/config/gameConfig';
import { cameraRelativeDirection, GroundMotor, targetGroundSpeed, type MotorInput } from '../src/game/player/groundMovement';

const DT = 1 / 60;
const idle: MotorInput = { moveX: 0, moveY: 0, cameraYaw: 0, sprintHeld: false, jumpPressed: false, jumpHeld: false };

/**
 * Minimal stand-in for the physics layer: a flat floor at y = 0. Movement is
 * allowed everywhere except below the floor. Returns final height and peak.
 */
function simulate(motor: GroundMotor, inputs: (frame: number) => MotorInput, frames: number, startY = 0) {
  let y = startY;
  let peak = startY;
  for (let i = 0; i < frames; i++) {
    const d = motor.step(inputs(i), DT);
    const actual = { ...d };
    if (y + d.y <= 0) actual.y = -y;
    y += actual.y;
    peak = Math.max(peak, y);
    motor.resolve(d, actual, y <= 1e-6, DT);
  }
  return { y, peak };
}

function groundedMotor() {
  const m = new GroundMotor();
  simulate(m, () => idle, 10);
  return m;
}

describe('cameraRelativeDirection', () => {
  it('forward at yaw 0 is -Z and right is +X', () => {
    const f = cameraRelativeDirection(0, 1, 0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    const r = cameraRelativeDirection(1, 0, 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
  });
});

describe('targetGroundSpeed', () => {
  it('is continuous across the walk/run threshold and reaches run speed at full deflection', () => {
    const t = GROUND_MOVEMENT.walkThreshold;
    expect(targetGroundSpeed(t - 1e-6, false)).toBeCloseTo(targetGroundSpeed(t + 1e-6, false), 3);
    expect(targetGroundSpeed(1, false)).toBeCloseTo(GROUND_MOVEMENT.runSpeed);
    expect(targetGroundSpeed(1, true)).toBeCloseTo(GROUND_MOVEMENT.sprintSpeed);
    expect(targetGroundSpeed(0, false)).toBe(0);
  });
});

describe('GroundMotor', () => {
  it('settles onto the floor as grounded/idle', () => {
    const m = groundedMotor();
    expect(m.grounded).toBe(true);
    expect(m.state).toBe('idle');
  });

  it('accelerates gradually rather than instantly', () => {
    const m = groundedMotor();
    simulate(m, () => ({ ...idle, moveY: 1 }), 1);
    const speed1 = Math.hypot(m.velocity.x, m.velocity.z);
    expect(speed1).toBeGreaterThan(0);
    expect(speed1).toBeLessThan(GROUND_MOVEMENT.runSpeed);
    simulate(m, () => ({ ...idle, moveY: 1 }), 60);
    expect(Math.hypot(m.velocity.x, m.velocity.z)).toBeCloseTo(GROUND_MOVEMENT.runSpeed, 1);
    expect(m.state).toBe('run');
  });

  it('decelerates to a stop when input is released', () => {
    const m = groundedMotor();
    simulate(m, () => ({ ...idle, moveY: 1 }), 60);
    simulate(m, () => idle, 30);
    expect(Math.hypot(m.velocity.x, m.velocity.z)).toBe(0);
    expect(m.state).toBe('idle');
  });

  it('jumps to roughly v²/2g and lands back on the floor', () => {
    const m = groundedMotor();
    const { peak } = simulate(m, (i) => ({ ...idle, jumpPressed: i === 0, jumpHeld: true }), 120);
    const expected = GROUND_MOVEMENT.jumpVelocity ** 2 / (2 * PHYSICS.gravity);
    expect(peak).toBeGreaterThan(expected * 0.9);
    expect(peak).toBeLessThan(expected * 1.05);
    expect(m.grounded).toBe(true);
  });

  it('releasing jump early produces a lower jump (variable height)', () => {
    const peakFor = (holdFrames: number) =>
      simulate(groundedMotor(), (i) => ({ ...idle, jumpPressed: i === 0, jumpHeld: i < holdFrames }), 120).peak;
    expect(peakFor(3)).toBeLessThan(peakFor(60) * 0.8);
  });

  it('allows a jump shortly after leaving a ledge (coyote time); later, Jump takes off into flight', () => {
    const pressAfterAirFrames = (airFrames: number) => {
      const m = groundedMotor();
      // Walk off a ledge: the physics reports not-grounded from now on.
      for (let i = 0; i < airFrames; i++) {
        const d = m.step(idle, DT);
        m.resolve(d, d, false, DT);
      }
      m.step({ ...idle, jumpPressed: true, jumpHeld: true }, DT);
      return m;
    };
    const coyote = pressAfterAirFrames(3);
    expect(coyote.mode).toBe('ground');
    expect(coyote.velocity.y).toBeGreaterThan(0);
    expect(pressAfterAirFrames(30).mode).toBe('flight');
  });

  it('buffers a jump pressed just before landing', () => {
    const m = new GroundMotor();
    let y = 1;
    let pressed = false;
    let fired = false;
    for (let i = 0; i < 90 && !fired; i++) {
      // Press once while still airborne, a few centimetres above the floor.
      const press = !pressed && y > 0 && y < 0.35;
      if (press) pressed = true;
      const d = m.step({ ...idle, jumpPressed: press, jumpHeld: true }, DT);
      const a = { ...d };
      if (y + d.y <= 0) a.y = -y;
      y += a.y;
      m.resolve(d, a, y <= 1e-6, DT);
      if (pressed && m.velocity.y > 5) fired = true;
    }
    expect(pressed).toBe(true);
    expect(fired).toBe(true);
  });

  it('enters a hard landing after a long fall', () => {
    const m = new GroundMotor();
    let sawHardLand = false;
    simulate(
      m,
      () => {
        if (m.state === 'hardLand') sawHardLand = true;
        return idle;
      },
      200,
      20,
    );
    expect(sawHardLand).toBe(true);
    expect(m.lastLandingSpeed).toBeGreaterThan(GROUND_MOVEMENT.hardLandingSpeed);
  });

  it('does not hard-land from a normal jump', () => {
    const m = groundedMotor();
    let sawHardLand = false;
    simulate(
      m,
      (i) => {
        if (m.state === 'hardLand') sawHardLand = true;
        return { ...idle, jumpPressed: i === 0, jumpHeld: true };
      },
      120,
    );
    expect(sawHardLand).toBe(false);
  });

  it('bleeds velocity when blocked by a wall', () => {
    const m = groundedMotor();
    simulate(m, () => ({ ...idle, moveY: 1 }), 60);
    const d = m.step({ ...idle, moveY: 1 }, DT);
    m.resolve(d, { x: 0, y: 0, z: 0 }, true, DT);
    expect(Math.hypot(m.velocity.x, m.velocity.z)).toBeLessThan(0.01);
  });

  it('turns the visual facing toward the travel direction', () => {
    const m = groundedMotor();
    m.reset(Math.PI);
    simulate(m, () => idle, 5);
    // Move right (+X) relative to a yaw-0 camera → facing atan2(1, 0) = π/2.
    simulate(m, () => ({ ...idle, moveX: 1 }), 60);
    expect(m.facingYaw).toBeCloseTo(Math.PI / 2, 1);
  });
});

describe('knockback and slowing', () => {
  it('an impulse throws the hero up and back, ignoring steering until control returns', () => {
    const m = groundedMotor();
    const forward: MotorInput = { ...idle, moveY: 1 }; // camera yaw 0: forward is -Z
    m.applyImpulse(0, 9, 14, 0.5);
    let z = 0;
    let maxZ = 0;
    const res = simulate(
      m,
      (i) => {
        z += m.velocity.z * DT;
        maxZ = Math.max(maxZ, z);
        return i < 20 ? forward : idle;
      },
      120,
    );
    expect(res.peak).toBeGreaterThan(9 ** 2 / (2 * PHYSICS.gravity) * 0.9); // ballistic peak of a 9 m/s throw
    expect(maxZ).toBeGreaterThan(3); // carried backwards (+Z) despite holding forward
    expect(m.grounded).toBe(true);
  });

  it('speedScale slows the hero (frozen)', () => {
    const a = groundedMotor();
    const b = groundedMotor();
    const run: MotorInput = { ...idle, moveY: 1 };
    simulate(a, () => run, 120);
    simulate(b, () => ({ ...run, speedScale: 0.25 }), 120);
    expect(Math.hypot(b.velocity.x, b.velocity.z)).toBeCloseTo(Math.hypot(a.velocity.x, a.velocity.z) * 0.25, 1);
  });
});
