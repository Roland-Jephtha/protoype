import type { GraphicsQuality } from './gameConfig';

/** Vehicle behaviour on every road (m, m/s, m/s², s). */
export const TRAFFIC = {
  accel: 3.5,
  brake: 9,
  /** Bumper gap kept at standstill (m) and time headway (s). */
  minGap: 3,
  headway: 0.9,
  /** Stop this far before the stop line. */
  stopBuffer: 1,
  /** Hero detection box ahead of a vehicle. */
  playerAhead: 14,
  playerLateral: 2.2,
  /** Shared traffic-light cycle (s): X-axis streets green, then Z-axis streets. */
  lightCycle: 18,
};

/** Downtown streets. */
export const CITY_TRAFFIC = {
  /** Distance from an intersection centre to its stop line (street half-width + margin). */
  stopBack: 8.5,
  laneOffset: 3.5,
  speedLimit: 13,
  perLane: { low: 2, medium: 3, high: 4 } as Record<GraphicsQuality, number>,
};

/** Open roads outside the city. */
export const ROAD_TRAFFIC = {
  laneOffset: 3.2,
  desertHighway: { speedLimit: 24, perLane: 6 },
  forestRoad: { speedLimit: 16, perLane: 4 },
};

/** Forest freight train (m, m/s). 24 m/s ≈ 86 km/h: a sprint can just keep up, flight wins. */
export const TRAIN = {
  speed: 24,
  locoLength: 18,
  wagonLength: 15,
  gap: 1.2,
  wagons: 6,
  width: 3.1,
  height: 4.2,
  /** Hidden run past the end of the line before the train starts over (m). */
  layover: 400,
  /** Where along the line the train starts when the region loads (fraction). */
  startFraction: 0.35,
  /** Race: passing the locomotive by this much wins (m). */
  raceWinLead: 60,
  /** Race: the hero must be at least this fast to count as racing (m/s). */
  raceMinSpeed: 15,
};

/** Ambient life counts per quality preset, and animal behaviour. */
export const LIFE = {
  pedestrians: { low: 16, medium: 32, high: 48 } as Record<GraphicsQuality, number>,
  /** Dogs and, separately, cats in the city. */
  pets: { low: 3, medium: 5, high: 7 } as Record<GraphicsQuality, number>,
  packSize: { low: 2, medium: 3, high: 3 } as Record<GraphicsQuality, number>,
  riverFish: { low: 5, medium: 8, high: 12 } as Record<GraphicsQuality, number>,
  wolf: { walkSpeed: 1.6, runSpeed: 10, fleeRadius: 16 },
  coyote: { walkSpeed: 1.3, runSpeed: 9, fleeRadius: 18 },
  /** Circling birds: ground speed along the circle (m/s). */
  birdSpeed: 12,
};
