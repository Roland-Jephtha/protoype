import { HERO_MODEL_PRIORITY, type HeroModelDef } from '../../config/assets';

let resolved: Promise<HeroModelDef | null> | null = null;

/**
 * Picks the first hero model whose file actually exists. A HEAD request is
 * enough; an HTML response means the dev/preview server's SPA fallback, i.e.
 * the file is missing.
 */
export function resolveHeroModel(): Promise<HeroModelDef | null> {
  resolved ??= (async () => {
    for (const def of HERO_MODEL_PRIORITY) {
      try {
        const res = await fetch(def.url, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        if (res.ok && !type.includes('text/html')) return def;
      } catch {
        /* offline / blocked — try the next one */
      }
    }
    return null;
  })();
  return resolved;
}
