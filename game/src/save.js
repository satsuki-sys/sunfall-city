// Persistence, kept deliberately small: the save lives in localStorage under
// one key and holds cash, story progress, lifetime taxi fares, the sun discs
// collected so far and where the player left off. It is written on mission
// completions, disc pickups and pauses, and read back by the title screen's
// Continue button. Missing or corrupt data is not an error — it simply means
// a fresh game.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const usable = typeof data === 'object' && data !== null && typeof data.cash === 'number';
    return usable ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full store: play continues, just unsaved.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
