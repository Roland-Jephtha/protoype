import { HERO_COMBAT } from '../../config/combat';

export interface CombatInput {
  /** Punch pressed this step (edge) and held. */
  attackPressed: boolean;
  attackHeld?: boolean;
  /** Heat vision held. */
  aimHeld: boolean;
  /** Super breath (wind) held. */
  breathHeld?: boolean;
  freezeHeld?: boolean;
  /** Super Nova: hold to charge, release when full. */
  novaHeld?: boolean;
}

export type CombatEvent =
  | { type: 'punch'; side: 'left' | 'right'; combo: number }
  /** The punch reaches full extension: resolve hits now. */
  | { type: 'punchHit'; combo: number }
  /** A charged power punch was released (0..1 extra charge beyond the hold threshold). */
  | { type: 'powerPunch'; side: 'left' | 'right'; charge: number }
  | { type: 'nova' }
  | { type: 'overheat' };

export type Breath = 'none' | 'wind' | 'freeze';

/**
 * The hero's combat state: health with delayed regeneration, the heat-vision
 * meter, punches (three-hit combo; hold and release for a power punch), and
 * the solar-powered skills — super breath, freeze breath, Super Nova.
 * Pure and fixed-step, so it runs in tests without Rapier or three.js.
 */
export class HeroCombat {
  health: number = HERO_COMBAT.maxHealth;
  heat: number = HERO_COMBAT.heat.capacity;
  solar: number = HERO_COMBAT.solar.capacity;
  overheated = false;
  /** True while the beam is actually firing this step. */
  firing = false;
  /** Which breath is blowing this step. */
  breath: Breath = 'none';
  /** Seconds into the current punch (or -1). */
  punchTime = -1;
  /** The current punch is a power punch. */
  powerPunching = false;
  combo = 0;
  side: 'left' | 'right' = 'right';
  /** Seconds the punch button has been held (charging a power punch). */
  holdTime = 0;
  /** Super Nova charge, 0..1. */
  novaCharge = 0;
  private sinceDamage = Infinity;
  private sinceFire = Infinity;
  private sincePunch = Infinity;
  private hitResolved = false;
  private grace = 0;
  private powerCharge = 0;

  reset() {
    this.health = HERO_COMBAT.maxHealth;
    this.heat = HERO_COMBAT.heat.capacity;
    this.solar = HERO_COMBAT.solar.capacity;
    this.overheated = false;
    this.firing = false;
    this.breath = 'none';
    this.punchTime = -1;
    this.powerPunching = false;
    this.combo = 0;
    this.holdTime = 0;
    this.novaCharge = 0;
    this.sinceDamage = Infinity;
    this.grace = HERO_COMBAT.respawnGrace;
  }

  get punching() {
    return this.punchTime >= 0;
  }

  /** Charging a power punch (held past the threshold). */
  get charging() {
    return this.holdTime >= HERO_COMBAT.powerPunch.holdTime;
  }

  step(inp: CombatInput, dt: number): CombatEvent[] {
    const events: CombatEvent[] = [];
    const h = HERO_COMBAT.heat;
    const p = HERO_COMBAT.punch;
    const pp = HERO_COMBAT.powerPunch;
    this.grace = Math.max(0, this.grace - dt);
    this.solar = Math.min(HERO_COMBAT.solar.capacity, this.solar + HERO_COMBAT.solar.rechargePerSecond * dt);

    // --- heat vision ------------------------------------------------------
    if (this.overheated && this.heat >= h.capacity * h.overheatResume) this.overheated = false;
    this.firing = inp.aimHeld && !this.overheated && this.heat > 0;
    if (this.firing) {
      this.heat = Math.max(0, this.heat - h.drainPerSecond * dt);
      this.sinceFire = 0;
      if (this.heat === 0) {
        this.overheated = true;
        this.firing = false;
        events.push({ type: 'overheat' });
      }
    } else {
      this.sinceFire += dt;
      if (this.sinceFire >= h.rechargeDelay) this.heat = Math.min(h.capacity, this.heat + h.rechargePerSecond * dt);
    }

    // --- breaths (not while firing the beam) ------------------------------
    this.breath = 'none';
    if (!this.firing) {
      const want: Breath = inp.freezeHeld ? 'freeze' : inp.breathHeld ? 'wind' : 'none';
      const cost = want === 'freeze' ? HERO_COMBAT.freezeBreath.costPerSecond : HERO_COMBAT.superBreath.costPerSecond;
      if (want !== 'none' && this.solar > cost * dt) {
        this.solar -= cost * dt;
        this.breath = want;
      }
    }


    // --- Super Nova: hold to charge, release when full --------------------------
    const nova = HERO_COMBAT.nova;
    if (inp.novaHeld && this.solar >= nova.cost) {
      this.novaCharge = Math.min(1, this.novaCharge + dt / nova.chargeTime);
    } else {
      if (this.novaCharge >= 1 && this.solar >= nova.cost) {
        this.solar -= nova.cost;
        events.push({ type: 'nova' });
      }
      this.novaCharge = 0;
    }

    // --- punches ------------------------------------------------------------
    this.sincePunch += dt;
    if (this.punchTime >= 0) {
      this.punchTime += dt;
      if (!this.hitResolved && this.punchTime >= p.hitAt) {
        this.hitResolved = true;
        // A power punch lands when its homing lunge arrives (resolved by the combat driver).
        if (!this.powerPunching) events.push({ type: 'punchHit', combo: this.combo });
      }
      if (this.punchTime >= p.duration + (this.powerPunching ? pp.secondFistAt : 0)) {
        this.punchTime = -1;
        this.powerPunching = false;
      }
    }
    if (inp.attackPressed && this.punchTime < 0) {
      this.combo = this.sincePunch <= p.comboWindow && this.combo < 3 ? this.combo + 1 : 1;
      this.side = this.combo % 2 === 1 ? 'right' : 'left';
      this.startPunch(false);
      events.push({ type: 'punch', side: this.side, combo: this.combo });
    }
    // Holding the button charges a power punch; releasing throws it.
    if (inp.attackHeld) this.holdTime += dt;
    else {
      if (this.holdTime >= pp.holdTime && this.punchTime < 0) {
        this.powerCharge = Math.min(1, (this.holdTime - pp.holdTime) / (pp.maxCharge - pp.holdTime));
        this.side = 'right';
        this.combo = 0;
        this.startPunch(true);
        events.push({ type: 'powerPunch', side: this.side, charge: this.powerCharge });
      }
      this.holdTime = 0;
    }

    // --- health ---------------------------------------------------------------
    this.sinceDamage += dt;
    if (this.health > 0 && this.sinceDamage >= HERO_COMBAT.regenDelay) {
      this.health = Math.min(HERO_COMBAT.maxHealth, this.health + HERO_COMBAT.regenRate * dt);
    }
    return events;
  }

  private startPunch(power: boolean) {
    this.punchTime = 0;
    this.sincePunch = 0;
    this.hitResolved = false;
    this.powerPunching = power;
  }

  /** Applies damage; returns true if this knocked the hero out. */
  takeDamage(amount: number): boolean {
    if (this.health <= 0 || this.grace > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.sinceDamage = 0;
    return this.health === 0;
  }

  /** Dealing damage charges solar energy. */
  dealtDamage(amount: number) {
    this.solar = Math.min(HERO_COMBAT.solar.capacity, this.solar + amount * HERO_COMBAT.solar.perDamage);
  }

  /** Damage and knockback of the current punch. */
  punchStrength() {
    const p = HERO_COMBAT.punch;
    return this.combo >= 3 ? { damage: p.finisherDamage, knockback: p.finisherKnockback } : { damage: p.damage, knockback: p.knockback };
  }
}
