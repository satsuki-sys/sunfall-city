// save.js — the whole save system: one JSON record in localStorage holding
// the player's cash, story stage, taxi tally and the sun discs they have
// already found. The key is versioned so a future build can migrate cleanly.

import { SAVE_KEY, START_CASH } from './config.js';

// A fresh profile, used for NEW GAME and whenever the stored record is
// missing or unreadable.
export function freshSave() {
  return {
    cash: START_CASH,
    stage: 0,          // story stage: 0 meet, 1 deliver, 2 steal, 3 pier, 4 done
    taxiFares: 0,
    discs: [],         // indices into DISC_SPOTS already collected
    storyDone: false,
  };
}

// Read the stored profile, or null when there is none worth keeping.
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const base = freshSave();
    return {
      cash: Number.isFinite(data.cash) ? data.cash : base.cash,
      stage: Number.isInteger(data.stage) ? data.stage : 0,
      taxiFares: Number.isInteger(data.taxiFares) ? data.taxiFares : 0,
      discs: Array.isArray(data.discs) ? data.discs.filter(Number.isInteger) : [],
      storyDone: data.storyDone === true,
    };
  } catch {
    return null;
  }
}

// Persist a profile object (the game keeps one live copy and stores it on
// every meaningful change: cash, stage, discs).
export function storeSave(profile) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can be unavailable (private mode); the game simply runs unsaved.
  }
}

// Wipe the record; NEW GAME starts from a clean slate.
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage itself is unavailable.
  }
}
