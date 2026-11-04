import * as db from './db.js';
import { defaultSettings } from './calc.js';
import { deleteFiles } from './files.js';
import { planKm } from './bareme.js';

let savedYear = null;
try { savedYear = Number(localStorage.getItem('lr_year')); } catch { /* stockage indisponible */ }

export const state = {
  year: savedYear || new Date().getFullYear(),
  data: { missions: [], depenses: [], releves: [], settings: defaultSettings(), tombstones: {} },
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
  state.data.releves = await db.getAll('releves');
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

const yearOfDate = (d) => Number(String((d && d.date) || '').slice(0, 4));

/** Recalcule les indemnités kilométriques en calcul automatique d'une année (le barème est cumulatif sur l'année). Retourne le nombre de lignes modifiées. */
export async function recalcKm(year) {
  const plan = planKm(await db.getAll('depenses'), year);
  let n = 0;
  for (const d of await db.getAll('depenses')) {
    const p = plan.get(d.id);
    if (p && (d.montantTTC !== p.montant || d.tauxKm !== p.taux)) { await db.put('depenses', { ...d, montantTTC: p.montant, tauxKm: p.taux, updated: now() }); n++; }
  }
  return n;
}

export async function saveDepense(d) {
  const before = state.data.depenses.find((x) => x.id === d.id);
  d.updated = now();
  await db.put('depenses', d);
  if (d.categorie === 'km' || (before && before.categorie === 'km')) {
    for (const y of new Set([yearOfDate(d), yearOfDate(before)].filter(Boolean))) await recalcKm(y);
  }
  await load(); hooks.onChange();
}

export async function deleteDepense(id) {
  const d = state.data.depenses.find((x) => x.id === id);
  await db.del('depenses', id);
  await addTombstone(id);
  if (d) await deleteFiles(d.fileIds);
  if (d && d.categorie === 'km' && yearOfDate(d)) await recalcKm(yearOfDate(d));
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

/* ---------- Relevés de banque (un enregistrement par mois : « AAAA-MM ») ---------- */
export const releveId = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
export const releveOf = (year, month) => state.data.releves.find((r) => r.id === releveId(year, month));

/** Crée / met à jour le relevé d'un mois (fichiers et cases « encaissements sur le relevé précédent / suivant »). Supprimé s'il est vide. */
export async function updateReleve(year, month, patch) {
  const id = releveId(year, month);
  const cur = releveOf(year, month);
  const rec = { id, year: Number(year), month: Number(month), fileIds: [], surPrecedent: false, surSuivant: false, ...(cur || {}), ...patch, updated: now() };
  if (!rec.fileIds.length && !rec.surPrecedent && !rec.surSuivant) {
    if (!cur) return;
    await db.del('releves', id);
    await addTombstone(id);
  } else {
    await db.put('releves', rec);
  }
  await load();
  hooks.onChange();
}
