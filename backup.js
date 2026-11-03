// Sauvegarde / restauration : un seul fichier .zip contenant les données et tous les justificatifs.
import * as db from './db.js';
import { state, load, saveSettings } from './state.js';
import { downloadBlob, safeName, today, fmtDate } from './util.js';
import { recettes, depenses, expenseAmounts, CATEGORIES } from './calc.js';

const FORMAT = 'livre-recettes-backup-v1';

export async function exportBackup() {
  const files = await db.getAll('files');
  const zip = new JSZip();
  const meta = files.map(({ id, name, type, size, created }) => ({ id, name, type, size, created }));
  zip.file('data.json', JSON.stringify({
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    missions: state.data.missions,
    depenses: state.data.depenses,
    settings: state.data.settings,
    tombstones: state.data.tombstones || {},
    files: meta,
  }, null, 1));
  for (const f of files) zip.file(`justificatifs/${f.id}__${safeName(f.name)}`, f.blob);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(blob, `sauvegarde-livre-recettes-${today()}.zip`);
  await saveSettings({ lastBackup: new Date().toISOString() });
}

export async function importBackup(file) {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file('data.json');
  if (!dataFile) throw new Error('Ce fichier n\'est pas une sauvegarde valide (data.json manquant).');
  const data = JSON.parse(await dataFile.async('string'));
  if (data.format !== FORMAT) throw new Error('Format de sauvegarde inconnu.');

  const entries = zip.file(/^justificatifs\//);
  const byId = new Map(entries.map((e) => [e.name.split('/')[1].split('__')[0], e]));
  const fileRows = [];
  for (const m of data.files || []) {
    const entry = byId.get(m.id);
    if (!entry) continue;
    const blob = new Blob([await entry.async('arraybuffer')], { type: m.type });
    fileRows.push({ ...m, blob });
  }
  // Tout est lu et validé avant de toucher aux données existantes.
  await Promise.all(['missions', 'depenses', 'files'].map((s) => db.clear(s)));
  for (const m of data.missions || []) await db.put('missions', m);
  for (const d of data.depenses || []) await db.put('depenses', d);
  for (const f of fileRows) await db.put('files', f);
  await db.put('meta', data.settings || {}, 'settings');
  await db.put('meta', data.tombstones || {}, 'tombstones');
  await load();
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Export CSV (ouvrable dans Excel) du livre des recettes et des dépenses d'une année. */
export function exportCSV(year) {
  const rows = [['LIVRE DES RECETTES ' + year], ['Date d\'encaissement', 'N° facture', 'Client', 'Adresse', 'SIRET', 'Nature', 'Montant HT', 'TVA', 'Montant TTC', 'Mode d\'encaissement', 'Date facture']];
  for (const r of recettes(state.data, year)) {
    rows.push([fmtDate(r.date), r.facture.numero, r.mission.client, r.mission.adresse, r.mission.siret, r.mission.nature || r.mission.ref,
      r.ht.toFixed(2).replace('.', ','), r.tva.toFixed(2).replace('.', ','), r.ttc.toFixed(2).replace('.', ','), r.facture.mode, fmtDate(r.facture.date)]);
  }
  rows.push([], ['LIVRE DES DÉPENSES ' + year], ['Date', 'Référence', 'Fournisseur', 'Désignation', 'Catégorie', 'Montant HT', 'TVA', 'Montant TTC', 'Mode de paiement', 'Justificatif']);
  for (const d of depenses(state.data, year)) {
    const a = expenseAmounts(d);
    rows.push([fmtDate(d.date), d.reference, d.fournisseur, d.designation, CATEGORIES[d.categorie] || d.categorie,
      a.ht.toFixed(2).replace('.', ','), a.tva.toFixed(2).replace('.', ','), a.ttc.toFixed(2).replace('.', ','), d.mode, (d.fileIds || []).length ? 'oui' : 'non']);
  }
  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `livres-${year}.csv`);
}

