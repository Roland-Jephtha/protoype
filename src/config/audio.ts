/** Procedural audio levels (0..1 gain). */
export const AUDIO = {
  master: 0.7,
  /** Mission intro music sting peak. */
  sting: 0.09,
  /** Maximum gain of each looping bed. */
  loops: { wind: 0.5, heat: 0.12, heatHiss: 0.1, breath: 0.35, nova: 0.15, ambience: 0.06, hum: 0.12 },
  /** Peak gain of each one-shot effect. */
  shots: { punch: 0.7, power: 0.9, explosion: 0.8, zap: 0.15, hurt: 0.35, boom: 1, throw: 0.4, freeze: 0.3 },
};
