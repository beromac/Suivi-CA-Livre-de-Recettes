import * as db from './db.js';
import { defaultSettings } from './calc.js';
import { deleteFiles } from './files.js';

let savedYear = null;
try { savedYear = Number(localStorage.getItem('lr_year')); } catch { /* stockage indisponible */ }

export const state = {
  year: savedYear || new Date().getFullYear(),
  data: { missions: [], depenses: [], settings: defaultSettings(), tombstones: {} },
};

export const hooks = { render: () => {}, onChange: () => {} };
const now = () => new Date().toISOString();

export function setYear(y) {
  state.year = Number(y);
  try { localStorage.setItem('lr_year', String(state.year)); } catch { /* ignore */ }
}

export async function load() {
  state.data.missions = await db.getAll('missions');
  state.data.depenses = await db.getAll('depenses');
  state.data.settings = { ...defaultSettings(), ...((await db.get('meta', 'settings')) || {}) };
  state.data.tombstones = (await db.get('meta', 'tombstones')) || {};
}

/** Garde la trace d'une suppression pour que la synchronisation la propage aux autres appareils. */
async function addTombstone(id) {
  const t = (await db.get('meta', 'tombstones')) || {};
  t[id] = now();
  await db.put('meta', t, 'tombstones');
}

export const missionById = (id) => state.data.missions.find((m) => m.id === id);

export const missionFileIds = (m) => [
  ...(m.devis || []).map((d) => d.fileId),
  ...(m.factures || []).map((f) => f.fileId),
].filter(Boolean);

export async function saveMission(m) { m.updated = now(); await db.put('missions', m); await load(); hooks.onChange(); }

export async function deleteMission(id) {
  const m = missionById(id);
  if (!m) return;
  await db.del('missions', id);
  await addTombstone(id);
  await deleteFiles(missionFileIds(m));
  await load();
  hooks.onChange();
}

export async function saveDepense(d) { d.updated = now(); await db.put('depenses', d); await load(); hooks.onChange(); }

export async function deleteDepense(id) {
  const d = state.data.depenses.find((x) => x.id === id);
  await db.del('depenses', id);
  await addTombstone(id);
  if (d) await deleteFiles(d.fileIds);
  await load();
  hooks.onChange();
}

export async function saveSettings(patch) {
  const s = { ...state.data.settings, ...patch };
  // lastBackup est propre à l'appareil : il ne déclenche ni horodatage ni synchronisation.
  const shared = Object.keys(patch).some((k) => k !== 'lastBackup' && k !== 'updated');
  if (shared) s.updated = now();
  await db.put('meta', s, 'settings');
  state.data.settings = s;
  if (shared) hooks.onChange();
}
