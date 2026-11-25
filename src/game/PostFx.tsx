import { BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { GraphicsQuality } from '../config/gameConfig';
import type { RegionLook } from '../config/regions';
import { POST_FX } from '../config/graphics';

/**
 * Screen effects on Medium and High: a per-region colour grade, a soft
 * vignette and filmic tone mapping. (Bloom is left out for now: the sky and
 * sunlit sand are as bright as the emissive lights, so it hazed the whole
 * screen; selective glow is a later step.) Off on Low (phones), where the
 * renderer's own tone mapping is used instead.
 *
 * Note: the composer renders the frame itself (useFrame priority 1) — the one
 * deliberate exception to the "never priority > 0" rule in CLAUDE.md.
 */
export function PostFx({ quality, look }: { quality: GraphicsQuality; look: RegionLook }) {
  if (quality === 'low') return null;
  const p = POST_FX[quality];
  const grade = look.grade ?? POST_FX.defaultGrade;
  return (
    <EffectComposer multisampling={p.multisampling}>
      <HueSaturation saturation={grade.saturation} />
      <BrightnessContrast brightness={grade.brightness} contrast={grade.contrast} />
      <Vignette offset={0.3} darkness={p.vignette} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
