// The save file: one versioned localStorage record holding cash, the story
// stage and the sun discs already found. Anything unreadable is treated as
// "no save" — a corrupt save must never cost the player the game itself.

import { SAVE_KEY } from './config.js';

export function freshProfile() {
  return { cash: 60, stage: 0, discs: [], fares: 0 };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (typeof data.cash !== 'number' || typeof data.stage !== 'number') return null;
    if (!Array.isArray(data.discs)) return null;
    return {
      cash: Math.max(0, Math.floor(data.cash)),
      stage: Math.min(4, Math.max(0, Math.floor(data.stage))),
      discs: data.discs.filter((d) => Number.isInteger(d) && d >= 0 && d < 12),
      fares: typeof data.fares === 'number' ? data.fares : 0,
    };
  } catch {
    return null;
  }
}

export function storeSave(profile) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
  } catch {
    // Private mode or a full store: play on without persisting.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
