import { HERO_COMBAT } from '../../config/combat';

export interface CombatInput {
  /** Punch pressed this step (edge). */
  attackPressed: boolean;
  /** Heat vision held. */
  aimHeld: boolean;
}

export type CombatEvent =
  | { type: 'punch'; side: 'left' | 'right'; combo: number }
  /** The punch reaches full extension: resolve hits now. */
  | { type: 'punchHit'; combo: number }
  | { type: 'overheat' };

/**
 * The hero's combat state: health with delayed regeneration, a heat-vision
 * meter that overheats, and a three-hit punch combo. Pure and fixed-step, so it
 * runs in tests without Rapier or three.js.
 */
export class HeroCombat {
  health: number = HERO_COMBAT.maxHealth;
  heat: number = HERO_COMBAT.heat.capacity;
  overheated = false;
  /** True while the beam is actually firing this step. */
  firing = false;
  /** Seconds into the current punch (or -1). */
  punchTime = -1;
  combo = 0;
  side: 'left' | 'right' = 'right';
  private sinceDamage = Infinity;
  private sinceFire = Infinity;
  private sincePunch = Infinity;
  private hitResolved = false;
  private grace = 0;

  reset() {
    this.health = HERO_COMBAT.maxHealth;
    this.heat = HERO_COMBAT.heat.capacity;
    this.overheated = false;
    this.firing = false;
    this.punchTime = -1;
    this.combo = 0;
    this.sinceDamage = Infinity;
    this.grace = HERO_COMBAT.respawnGrace;
  }

  get punching() {
    return this.punchTime >= 0;
  }

  step(inp: CombatInput, dt: number): CombatEvent[] {
    const events: CombatEvent[] = [];
    const h = HERO_COMBAT.heat;
    const p = HERO_COMBAT.punch;
    this.grace = Math.max(0, this.grace - dt);

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

    // --- punches ------------------------------------------------------------
    this.sincePunch += dt;
    if (this.punchTime >= 0) {
      this.punchTime += dt;
      if (!this.hitResolved && this.punchTime >= p.hitAt) {
        this.hitResolved = true;
        events.push({ type: 'punchHit', combo: this.combo });
      }
      if (this.punchTime >= p.duration) this.punchTime = -1;
    }
    if (inp.attackPressed && this.punchTime < 0) {
      this.combo = this.sincePunch <= p.comboWindow && this.combo < 3 ? this.combo + 1 : 1;
      this.side = this.combo % 2 === 1 ? 'right' : 'left';
      this.punchTime = 0;
      this.sincePunch = 0;
      this.hitResolved = false;
      events.push({ type: 'punch', side: this.side, combo: this.combo });
    }

    // --- health ---------------------------------------------------------------
    this.sinceDamage += dt;
    if (this.health > 0 && this.sinceDamage >= HERO_COMBAT.regenDelay) {
      this.health = Math.min(HERO_COMBAT.maxHealth, this.health + HERO_COMBAT.regenRate * dt);
    }
    return events;
  }

  /** Applies damage; returns true if this knocked the hero out. */
  takeDamage(amount: number): boolean {
    if (this.health <= 0 || this.grace > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.sinceDamage = 0;
    return this.health === 0;
  }

  /** Damage and knockback of the current punch. */
  punchStrength() {
    const p = HERO_COMBAT.punch;
    return this.combo >= 3 ? { damage: p.finisherDamage, knockback: p.finisherKnockback } : { damage: p.damage, knockback: p.knockback };
  }
}
