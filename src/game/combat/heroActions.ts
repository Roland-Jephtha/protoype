import { useApp } from '../../state/appStore';
import { CAPSULE_REST_HEIGHT } from '../player/groundSnap';
import { runtime } from '../runtime';

/** Hero's feet height from the published capsule position. */
export const heroFeetY = () => runtime.playerPosition.y - CAPSULE_REST_HEIGHT;

/** The hero was knocked out: back to the checkpoint with full health and a moment's grace. */
export function knockOut() {
  runtime.combat.reset();
  runtime.beam.active = false;
  const app = useApp.getState();
  app.restartCheckpoint();
  app.showToast('Knocked down: back at the start point');
}
