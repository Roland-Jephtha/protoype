import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { HeroModelDef } from '../../config/assets';
import { runtime } from '../runtime';
import type { GroundMotor } from './groundMovement';
import { HeroModel } from './HeroModel';
import { resolveHeroModel } from './heroResolver';
import { PlaceholderHero } from './PlaceholderHero';

class HeroErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[hero] model failed to load, using placeholder:', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Placeholder({ motor }: { motor: GroundMotor }) {
  useEffect(() => {
    runtime.heroModel = 'placeholder';
  }, []);
  return <PlaceholderHero motor={motor} />;
}

function LoadedHero({ def, motor }: { def: HeroModelDef; motor: GroundMotor }) {
  useEffect(() => {
    runtime.heroModel = def.id;
  }, [def]);
  return <HeroModel def={def} motor={motor} />;
}

/**
 * The hero's visual. Shows the primitive placeholder while the GLB loads and
 * if it is missing or fails, so the game never blocks on character art.
 */
export function HeroVisual({ motor }: { motor: GroundMotor }) {
  const [def, setDef] = useState<HeroModelDef | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    resolveHeroModel().then((d) => alive && setDef(d));
    return () => {
      alive = false;
    };
  }, []);

  const fallback = <Placeholder motor={motor} />;
  if (!def) return fallback;
  return (
    <HeroErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedHero def={def} motor={motor} />
      </Suspense>
    </HeroErrorBoundary>
  );
}
