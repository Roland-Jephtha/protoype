import type { GraphicsQuality } from './gameConfig';

/** A region's colour grade (post-processing). Saturation/brightness/contrast offsets around 0. */
export interface ColorGrade {
  saturation: number;
  brightness: number;
  contrast: number;
}

/** Screen effects per quality (Low has none). */
export const POST_FX = {
  medium: { multisampling: 0, vignette: 0.45 },
  high: { multisampling: 4, vignette: 0.5 },
  defaultGrade: { saturation: 0.08, brightness: 0, contrast: 0.06 } as ColorGrade,
} satisfies Record<Exclude<GraphicsQuality, 'low'>, unknown> & { defaultGrade: ColorGrade };

/**
 * Image-based lighting: a CC0 sky HDRI (Poly Haven) lights and reflects on every
 * material, so suits, cars, glass and water pick up the sky.
 */
export const ENVIRONMENT = {
  url: `${import.meta.env.BASE_URL ?? '/'}hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr`,
  intensity: 0.35,
};
