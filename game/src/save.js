// save.js — the run's persistence. One versioned localStorage key holds the
// cash, the story stage, the taxi tally and the Sun Discs found so far, so a
// player who closes the tab comes back to the same city they left.

import { SAVE_KEY } from './config.js';

export function freshSave() {
  return {
    cash: 60,
    stage: 0,          // story jobs completed: 0..3
    fares: 0,          // taxi fares completed, all time
    discs: [],         // indices into DISC_SPOTS already collected
    started: false,    // true once NEW GAME or CONTINUE has been chosen
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number' || !Array.isArray(data.discs)) return null;
    const base = freshSave();
    return { ...base, ...data, started: true };
  } catch {
    return null;
  }
}

export function storeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      stage: state.stage,
      fares: state.fares,
      discs: state.discs,
      started: true,
    }));
  } catch {
    // A full or blocked store never breaks the game; the run just isn't kept.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}
