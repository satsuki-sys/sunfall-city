// Persistence, deliberately tiny: one localStorage key holds the whole save —
// cash, story progress, lifetime taxi fares, the sun discs collected so far,
// and where the player left off. The game writes it on mission completions,
// disc pickups and pauses, and the title screen's Continue button reads it
// back. A missing or corrupt save is never an error; it just means a fresh
// game starts instead.

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
    // Private browsing or a full store: the run continues, unsaved.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing was there to clear.
  }
}
