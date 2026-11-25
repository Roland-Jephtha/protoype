import { describe, expect, it } from 'vitest';
import { DRONE, HERO_COMBAT } from '../src/config/combat';
import { createDrone, damageDrone, stepBolts, stepDrone, type Bolt, type DroneContext } from '../src/game/combat/drone';
import { HeroCombat, type CombatEvent, type CombatInput } from '../src/game/combat/heroCombat';
import { inCone, pickAlongRay, raySphere, type Target } from '../src/game/combat/targets';
import { mulberry32 } from '../src/game/world/cityLayout';

const DT = 1 / 60;
const idle: CombatInput = { attackPressed: false, aimHeld: false };

function run(c: HeroCombat, seconds: number, inp = idle) {
  const events: CombatEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...c.step(inp, DT));
  return events;
}

describe('hero combat', () => {
  it('heat vision drains the meter, overheats, and recharges after a delay', () => {
    const c = new HeroCombat();
    const full = HERO_COMBAT.heat.capacity / HERO_COMBAT.heat.drainPerSecond;
    const events = run(c, full + 0.5, { attackPressed: false, aimHeld: true });
    expect(events.some((e) => e.type === 'overheat')).toBe(true);
    expect(c.overheated).toBe(true);
    expect(c.firing).toBe(false);
    // Still locked while holding, until it refills past the resume threshold.
    run(c, HERO_COMBAT.heat.rechargeDelay + 0.5, { attackPressed: false, aimHeld: true });
    expect(c.firing).toBe(false);
    run(c, 6);
    expect(c.overheated).toBe(false);
    expect(c.heat).toBeGreaterThan(HERO_COMBAT.heat.capacity * 0.9);
  });

  it('each tap throws one strike in a learnable order, ending in a heavy finisher', () => {
    const c = new HeroCombat();
    const kinds: string[] = [];
    const sides: string[] = [];
    let heavy = 0;
    for (let i = 0; i < 5; i++) {
      const events = c.step({ attackPressed: true, aimHeld: false }, DT);
      kinds.push(c.strikes[0].kind);
      sides.push(c.strikes[0].side);
      events.push(...run(c, c.strikeLength + 0.05));
      heavy += events.filter((e) => e.type === 'punchHit' && e.heavy).length;
      expect(events.filter((e) => e.type === 'punchHit')).toHaveLength(1);
    }
    expect(kinds.slice(0, 4)).toEqual(['cross', 'cross', 'cross', 'cross']);
    expect(sides.slice(0, 4)).toEqual(['right', 'left', 'right', 'left']);
    expect(c.combo).toBe(5);
    expect(heavy).toBe(1); // only the finisher
    expect(c.punchStrength(true).damage).toBe(HERO_COMBAT.punch.finisherDamage);
    expect(c.punchStrength(false).damage).toBeLessThan(HERO_COMBAT.punch.damage);
    // After the finisher, or after a pause, it starts again with the jab.
    c.step({ attackPressed: true, aimHeld: false }, DT);
    // Hands keep alternating across combos: the finisher was thrown with the right, so this is the left.
    expect(c.strikes[0].side).toBe(sides[4] === 'right' ? 'left' : 'right');
    expect(c.combo).toBe(1);
    run(c, 1.5);
    c.step({ attackPressed: true, aimHeld: false }, DT);
    expect(c.combo).toBe(1);
  });

  it('landed hits build the combo counter; every fifth is a super hit; getting hit or a pause resets it', () => {
    const c = new HeroCombat();
    const supers = Array.from({ length: 10 }, () => c.landed());
    expect(c.chain).toBe(10);
    expect(supers.filter(Boolean)).toHaveLength(2);
    expect(supers[4]).toBe(true);
    run(c, HERO_COMBAT.punch.chainTimeout + 0.1);
    expect(c.chain).toBe(0);
    c.landed();
    c.takeDamage(5);
    expect(c.chain).toBe(0);
  });

  it('takes damage, regenerates after a delay, and reports a knockout', () => {
    const c = new HeroCombat();
    c.takeDamage(40);
    run(c, HERO_COMBAT.regenDelay - 0.5);
    expect(c.health).toBe(60);
    run(c, 4);
    expect(c.health).toBeGreaterThan(90);
    expect(c.takeDamage(500)).toBe(true);
    expect(c.health).toBe(0);
    c.reset();
    expect(c.takeDamage(50)).toBe(false); // respawn grace
    expect(c.health).toBe(HERO_COMBAT.maxHealth);
  });
});

const target = (x: number, y: number, z: number, radius = 1): Target => ({ position: { x, y, z }, radius, alive: true, damage: () => {} });

describe('target picking', () => {
  it('ray-sphere distance', () => {
    expect(raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -10 }, 1)).toBeCloseTo(9);
    expect(raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 3, y: 0, z: -10 }, 1)).toBeNull();
  });

  it('heat vision hits the nearest target, with a little aim assist', () => {
    const near = target(0, 0, -10);
    const far = target(0, 0, -30);
    const hit = pickAlongRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 100, 0.05, [far, near]);
    expect(hit?.target).toBe(near);
    const offAxis = target(2, 0, -40); // just outside the sphere, ~2.9° off the ray
    expect(pickAlongRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 100, 0.07, [offAxis])?.target).toBe(offAxis);
    expect(pickAlongRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 100, 0.01, [offAxis])).toBeNull();
  });

  it('punches hit what is in front and in reach only', () => {
    const front = target(0, 1, -2);
    const behind = target(0, 1, 2);
    const far = target(0, 1, -9);
    const hits = inCone({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 2.8, 0.9, [front, behind, far]);
    expect(hits).toEqual([front]);
  });
});

describe('drones', () => {
  const ground = () => 0;
  const ctx = (hero = { x: 999, y: 0, z: 999 }, heroActive = true): DroneContext => ({ hero, heroActive, groundY: ground, rand: mulberry32(3) });

  it('patrol their circle until the hero comes close, then attack and fire', () => {
    const d = createDrone({ x: 0, z: 0, radius: 50 }, 0, ground);
    for (let t = 0; t < 10; t += DT) stepDrone(d, DT, ctx());
    expect(d.mode).toBe('patrol');
    expect(Math.hypot(d.x, d.z)).toBeGreaterThan(30);
    const c = ctx({ x: d.x + 30, y: 0, z: d.z });
    let shots = 0;
    for (let t = 0; t < 10; t += DT) if (stepDrone(d, DT, c)) shots++;
    expect(d.mode).toBe('attack');
    expect(shots).toBeGreaterThan(2);
    // Holds its distance and height around the hero.
    const dist = Math.hypot(d.x - c.hero.x, d.z - c.hero.z);
    expect(dist).toBeGreaterThan(DRONE.attackDistance * 0.6);
    expect(dist).toBeLessThan(DRONE.attackDistance * 1.5);
    expect(d.y).toBeGreaterThan(3);
  });

  it('go back to patrol while the hero is down', () => {
    const d = createDrone({ x: 0, z: 0, radius: 50 }, 0, ground);
    d.mode = 'attack';
    stepDrone(d, DT, ctx({ x: d.x + 10, y: 0, z: d.z }, false));
    expect(d.mode).toBe('patrol');
  });

  it('are destroyed by enough damage, fall, and come back later', () => {
    const d = createDrone({ x: 0, z: 0, radius: 50 }, 0, ground);
    expect(damageDrone(d, 60, { x: 0, y: 0, z: 0 })).toBe(false);
    expect(damageDrone(d, 60, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(d.mode).toBe('wreck');
    for (let t = 0; t < DRONE.wreckTime + 0.1; t += DT) stepDrone(d, DT, ctx());
    expect(d.mode).toBe('down');
    expect(d.y).toBeLessThan(1);
    for (let t = 0; t < DRONE.respawn + 0.1; t += DT) stepDrone(d, DT, ctx());
    expect(d.mode).toBe('patrol');
    expect(d.health).toBe(DRONE.health);
  });

  it('bolts hit the hero they are aimed at, and miss one who moved', () => {
    const shoot = (): Bolt[] => [{ x: 0, y: 1, z: -20, dx: 0, dy: 0, dz: 1, age: 0 }];
    const a = shoot();
    let hits = 0;
    for (let t = 0; t < 1; t += DT) hits += stepBolts(a, DT, { x: 0, y: 0, z: 0 }, true, ground);
    expect(hits).toBe(1);
    expect(a).toHaveLength(0);
    const b = shoot();
    hits = 0;
    for (let t = 0; t < 1; t += DT) hits += stepBolts(b, DT, { x: 3, y: 0, z: 0 }, true, ground);
    expect(hits).toBe(0);
  });
});

describe('melee lock-on', () => {
  it('picks the enemy closest to the aim direction, ignoring traffic and anything out of range', async () => {
    const { pickMeleeTarget } = await import('../src/game/combat/targets');
    const ahead = target(0, 1, -6);
    const side = target(5, 1, -2);
    const car = { ...target(0, 1, -3), kind: 'vehicle' as const };
    const far = target(0, 1, -30);
    const origin = { x: 0, y: 1, z: 0 };
    expect(pickMeleeTarget(origin, { x: 0, y: 0, z: -1 }, 12, 1.2, [side, car, far, ahead])).toBe(ahead);
    expect(pickMeleeTarget(origin, { x: 1, y: 0, z: 0 }, 12, 1.2, [side, car, far, ahead])).toBe(side);
    expect(pickMeleeTarget(origin, { x: 0, y: 0, z: 1 }, 12, 1.2, [side, ahead])).toBeNull();
  });
});

describe('Speed Force', () => {
  it('toggles on, drains while running, switches itself off when empty, then recharges', () => {
    const c = new HeroCombat();
    expect(c.step({ ...idle, slowmoPressed: true }, DT).some((e) => e.type === 'speedForce' && e.on)).toBe(true);
    run(c, 5);
    expect(c.speedForce).toBe(true);
    expect(c.speedEnergy).toBeLessThan(80);
    run(c, 20);
    expect(c.speedForce).toBe(false);
    const empty = c.speedEnergy;
    run(c, 6);
    expect(c.speedEnergy).toBeGreaterThan(empty + 10);
  });
});

describe('hero skills', () => {
  it('holding punch and releasing throws a power punch that scales with the charge', () => {
    const c = new HeroCombat();
    const held = { attackPressed: false, attackHeld: true, aimHeld: false };
    c.step({ ...held, attackPressed: true }, DT);
    run(c, 1, held);
    expect(c.charging).toBe(true);
    const events = c.step({ attackPressed: false, attackHeld: false, aimHeld: false }, DT);
    const power = events.find((e) => e.type === 'powerPunch');
    expect(power && power.type === 'powerPunch' && power.charge).toBeCloseTo(1, 1);
    expect(c.powerPunching).toBe(true);
  });

  it('a quick tap is just a punch, not a power punch', () => {
    const c = new HeroCombat();
    c.step({ attackPressed: true, attackHeld: true, aimHeld: false }, DT);
    const events = [...c.step({ attackPressed: false, attackHeld: false, aimHeld: false }, DT), ...run(c, 1)];
    expect(events.some((e) => e.type === 'powerPunch')).toBe(false);
  });

  it('breaths drain solar energy; freeze wins over wind; none while firing heat vision', () => {
    const c = new HeroCombat();
    c.step({ ...idle, breathHeld: true, freezeHeld: true }, DT);
    expect(c.breath).toBe('freeze');
    c.step({ ...idle, breathHeld: true }, DT);
    expect(c.breath).toBe('wind');
    c.step({ ...idle, breathHeld: true, aimHeld: true }, DT);
    expect(c.breath).toBe('none');
    const before = c.solar;
    run(c, 1, { ...idle, breathHeld: true });
    expect(c.solar).toBeLessThan(before);
  });

  it('Super Nova fires only after a full charge, on release', () => {
    const c = new HeroCombat();
    run(c, HERO_COMBAT.nova.chargeTime * 0.5, { ...idle, novaHeld: true });
    expect(c.step(idle, DT).some((e) => e.type === 'nova')).toBe(false); // released early: cancelled
    run(c, HERO_COMBAT.nova.chargeTime + 0.1, { ...idle, novaHeld: true });
    expect(c.novaCharge).toBe(1);
    expect(c.step(idle, DT).some((e) => e.type === 'nova')).toBe(true);
  });
});

describe('freezing', () => {
  it('a frozen drone drops out of the sky and shatters', async () => {
    const { freezeDrone } = await import('../src/game/combat/drone');
    const d = createDrone({ x: 0, z: 0, radius: 50 }, 0, () => 0);
    freezeDrone(d, 3);
    for (let t = 0; t < 3; t += DT) stepDrone(d, DT, { hero: { x: 999, y: 0, z: 999 }, heroActive: true, groundY: () => 0, rand: mulberry32(1) });
    expect(d.mode).toBe('wreck');
  });
});

describe('hit reactions', () => {
  it('a heavy blow knocks the hero flat (back or face down), then he gets up; light hits only rock him', async () => {
    const { hitPose } = await import('../src/game/combat/heroActions');
    const { HERO_HIT } = await import('../src/config/combat');
    const lying = hitPose('knockdown', HERO_HIT.fall + 0.1, false)!;
    expect(lying.pitch).toBeLessThan(-1.3);
    expect(lying.drop).toBe(1);
    expect(hitPose('knockdown', HERO_HIT.fall + 0.1, true)!.pitch).toBeGreaterThan(1.3);
    expect(hitPose('knockdown', HERO_HIT.fall + HERO_HIT.lie + HERO_HIT.getUp + 0.01, false)).toBeNull();
    expect(Math.abs(hitPose('stagger', HERO_HIT.stagger / 2, false)!.pitch)).toBeLessThanOrEqual(HERO_HIT.staggerLean);
    expect(hitPose('stagger', HERO_HIT.stagger / 2, false)!.drop).toBe(0);
  });
});
