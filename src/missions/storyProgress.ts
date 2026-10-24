/**
 * Minimal story progress in localStorage until full IndexedDB save slots land
 * (Milestone 5). Only records which missions are complete.
 */
const KEY = 'krypton.story.v1';

export function loadCompletedMissions(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { completed?: unknown };
    return Array.isArray(raw.completed) ? raw.completed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markMissionComplete(id: string) {
  try {
    const completed = new Set(loadCompletedMissions());
    completed.add(id);
    localStorage.setItem(KEY, JSON.stringify({ completed: [...completed] }));
  } catch {
    // Storage blocked: progress just isn't remembered between sessions.
  }
}
