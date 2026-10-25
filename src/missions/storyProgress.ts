import { activeSave, useSaves } from '../save/saveStore';

/** Missions completed in the active save slot. */
export function loadCompletedMissions(): string[] {
  return activeSave().completed;
}

export function markMissionComplete(id: string) {
  useSaves.getState().markComplete(id);
}

export function saveCheckpoint(missionId: string, checkpoint: number) {
  useSaves.getState().setCheckpoint(missionId, checkpoint);
}
