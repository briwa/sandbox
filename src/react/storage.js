const DRAFT_KEY = 'sandbox-draft';
const DRAFT_TTL = 24 * 60 * 60 * 1000;

export function loadSandboxDraft(key) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const { key: savedKey, savedAt, data } = JSON.parse(raw);
    if (savedKey !== key || !savedAt || Date.now() - savedAt > DRAFT_TTL) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveSandboxDraft(key, data) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ key, savedAt: Date.now(), data }));
  } catch {}
}

export function clearSandboxDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

const SETTINGS_KEY = 'settings:code-fence';

function readAll() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}

export function getCodeFenceSetting(name, fallback) {
  const v = readAll()[name];
  return v === undefined ? fallback : v;
}

export function setCodeFenceSetting(name, value) {
  try {
    const all = readAll();
    all[name] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
  } catch {}
}
