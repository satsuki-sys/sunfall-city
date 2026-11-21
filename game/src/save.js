// Saving, kept deliberately small: a single localStorage key carries the
// whole record — cash, story progress, lifetime taxi fares, which sun
// discs have been collected, and where the player was standing. The game
// writes on mission completions, disc pickups and pauses; the title
// screen's Continue button reads it back. A missing or corrupt save is
// never an error — it simply means a fresh game.

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
    // There was nothing stored to clear.
  }
}
