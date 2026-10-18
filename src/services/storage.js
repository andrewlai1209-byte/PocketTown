const KEY = 'pocket-town-3d';
const NUMBER_FIELDS = ['day', 'minute', 'money', 'food', 'energy', 'mood', 'trust', 'reputation', 'supplies', 'speed'];

export function loadState(defaults) {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    const raw = stored?.state || stored;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
    const state = {...defaults};
    for (const key of NUMBER_FIELDS) if (Number.isFinite(raw[key])) state[key] = raw[key];
    state.day = Math.max(1, Math.floor(state.day));
    state.minute = Math.max(0, Math.min(1439, Math.floor(state.minute)));
    state.speed = [1, 2, 4].includes(state.speed) ? state.speed : 1;
    for (const key of ['food', 'energy', 'mood', 'trust']) state[key] = Math.max(0, Math.min(100, state[key]));
    state.supplies = Math.max(0, Math.min(99, state.supplies));
    for (const key of ['friendships', 'shifts']) {
      if (raw[key] && typeof raw[key] === 'object' && !Array.isArray(raw[key])) {
        state[key] = Object.fromEntries(Object.entries(raw[key]).filter(([, v]) => Number.isFinite(v)));
      }
    }
    if (raw.bag && typeof raw.bag === 'object' && !Array.isArray(raw.bag)) {
      state.bag = Object.fromEntries(Object.entries(raw.bag)
        .filter(([k, v]) => Number.isFinite(v) && v > 0 && typeof k === 'string')
        .map(([k, v]) => [k, Math.min(99, Math.floor(v))]));
    }
    state.log = Array.isArray(raw.log) ? raw.log.filter(item => typeof item === 'string').slice(0, 26) : [];
    if (raw.minds && typeof raw.minds === 'object' && !Array.isArray(raw.minds) && Array.isArray(raw.minds.people)) state.minds = raw.minds;
    return state;
  } catch {
    return defaults;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({version: 4, state}));
    return true;
  } catch {
    return false;
  }
}
