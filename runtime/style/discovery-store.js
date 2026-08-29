// SHADED Style Discovery — discovery-store (renderer-unabhängiger Kern).
//
// Reine Persistenz-Logik: toJSON()/fromJSON() des gesamten Discovery-
// Zustands (Preference-Model, Vote-Historie, Runde, komponierte
// Custom-Profile). Der Storage-Adapter (localStorage im Browser, ein
// einfaches Objekt in Node) wird injiziert — dieses Modul kennt kein DOM.

export const DISCOVERY_STATE_SCHEMA = 'shaded.style.discovery/v1';
export const DISCOVERY_STORAGE_KEY = 'shaded-style-discovery-v1';

export function createDiscoveryState({ preferenceModelState = {}, history = [], round = 0, customProfiles = [] } = {}) {
  return { schema: DISCOVERY_STATE_SCHEMA, preferenceModelState, history, round, customProfiles };
}

export function toJSON(state) {
  return JSON.stringify(state);
}

export function fromJSON(json) {
  const state = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  if (state.schema !== DISCOVERY_STATE_SCHEMA) throw new Error('Ungültiger Discovery-Zustand: falsches schema');
  return state;
}

// In-Memory-Adapter mit derselben Form wie window.localStorage — Standard-
// Fallback für Node-Tests und für Umgebungen ohne localStorage.
export function createMemoryStorageAdapter() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

export class DiscoveryStore {
  constructor(storageAdapter, key = DISCOVERY_STORAGE_KEY) {
    this.storage = storageAdapter || createMemoryStorageAdapter();
    this.key = key;
  }

  save(state) {
    this.storage.setItem(this.key, toJSON(state));
    return state;
  }

  load() {
    const raw = this.storage.getItem(this.key);
    if (raw == null) return null;
    try {
      return fromJSON(raw);
    } catch {
      return null;
    }
  }

  clear() {
    this.storage.removeItem(this.key);
  }
}
