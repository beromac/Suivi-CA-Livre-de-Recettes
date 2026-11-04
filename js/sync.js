// Synchronisation GitHub côté navigateur : configuration, adaptateur IndexedDB, synchro automatique.
import * as db from './db.js';
import { state, load, hooks } from './state.js';
import { GitHub } from './github.js';
import { syncCore, planApply } from './sync-core.js';
import { defaultSettings } from './calc.js';

const KEY = 'lr_sync';
const STATUS_KEY = 'lr_sync_status';

export const getConfig = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
export const setConfig = (c) => {
  try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
};
export const isConfigured = () => { const c = getConfig(); return !!(c && c.owner && c.repo && c.token); };
export const getStatus = () => {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY)) || null; } catch { return null; }
};
const setStatus = (s) => { try { localStorage.setItem(STATUS_KEY, JSON.stringify(s)); } catch { /* ignore */ } };

export const client = (c = getConfig()) => new GitHub({ owner: c.owner.trim(), repo: c.repo.trim(), branch: (c.branch || 'main').trim(), token: c.token.trim() });

const adapter = {
  async snapshot() {
    const files = {};
    for (const f of await db.getAll('files')) files[f.id] = { id: f.id, name: f.name, type: f.type, size: f.size, created: f.created };
    return {
      missions: await db.getAll('missions'),
      depenses: await db.getAll('depenses'),
      releves: await db.getAll('releves'),
      settings: (await db.get('meta', 'settings')) || null,
      tombstones: (await db.get('meta', 'tombstones')) || {},
      files,
    };
  },
  async hasBlob(id) { return !!(await db.get('files', id)); },
  async getBlob(id) { return new Uint8Array(await (await db.get('files', id)).blob.arrayBuffer()); },
  async putBlob(meta, bytes) { await db.put('files', { ...meta, blob: new Blob([bytes], { type: meta.type }) }); },
  async apply(merged) {
    for (const [store, list] of [['missions', merged.missions], ['depenses', merged.depenses], ['releves', merged.releves]]) {
      const plan = planApply(await db.getAll(store), list, merged.tombstones);
      for (const r of plan.put) await db.put(store, r);
      for (const id of plan.del) await db.del(store, id);
    }
    await db.put('meta', merged.tombstones, 'tombstones');
    const cur = (await db.get('meta', 'settings')) || null;
    if (merged.settings && (!cur || (cur.updated || '') <= (merged.settings.updated || ''))) {
      await db.put('meta', { ...defaultSettings(), ...merged.settings, lastBackup: cur ? cur.lastBackup : null }, 'settings');
    }
  },
};

let running = null;
export async function syncNow(onProgress) {
  if (!isConfigured()) throw new Error('Synchronisation non configurée.');
  if (running) return running;
  running = (async () => {
    try {
      const res = await syncCore({ gh: client(), local: adapter, onProgress });
      await load();
      setStatus({ ok: true, at: new Date().toISOString(), ...res });
      hooks.render();
      return res;
    } catch (e) {
      setStatus({ ok: false, at: new Date().toISOString(), error: e.message });
      throw e;
    } finally { running = null; }
  })();
  return running;
}

/** Synchronise automatiquement 4 s après la dernière modification (si activé), et au retour du réseau. */
export function startAuto(onError) {
  let timer;
  const run = () => {
    const c = getConfig();
    if (!c || !c.auto || !navigator.onLine) return;
    syncNow().catch((e) => onError && onError(e));
  };
  const prev = hooks.onChange;
  hooks.onChange = () => { prev(); clearTimeout(timer); timer = setTimeout(run, 4000); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  run();
}

export const dataSummary = () => ({ missions: state.data.missions.length, depenses: state.data.depenses.length });
