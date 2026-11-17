// Save and load through localStorage: cash, mission progress, medallions,
// health and position. Saving happens at the garage, from the pause menu,
// and automatically when a mission is completed.
const KEY = 'cayoverde-save-v1';

export function saveGame(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}
