// Synchronisation entre appareils via un dépôt GitHub privé — logique pure (sans navigateur), testable sous Node.
//
// Principe : chaque mission / dépense porte un horodatage `updated`. À la synchronisation, on fusionne
// enregistrement par enregistrement (le plus récent gagne), les suppressions sont propagées par des
// « pierres tombales », et les justificatifs (fichiers) sont échangés à part, un fichier par identifiant.
export const FORMAT = 'livre-recettes-sync-v1';
export const DATA_PATH = 'data.json';
export const FILES_DIR = 'files/';

const ts = (r) => (r && r.updated) || '';

/** JSON canonique (clés triées) : sert à savoir si deux jeux de données sont identiques. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export const referencedFileIds = (missions, depenses, releves = []) => {
  const ids = new Set();
  for (const m of missions) {
    (m.devis || []).forEach((d) => d.fileId && ids.add(d.fileId));
    (m.factures || []).forEach((f) => f.fileId && ids.add(f.fileId));
  }
  for (const d of depenses) (d.fileIds || []).forEach((id) => id && ids.add(id));
  for (const r of releves) (r.fileIds || []).forEach((id) => id && ids.add(id));
  return ids;
};

function mergeCollection(a, b, tombstones) {
  const map = new Map();
  for (const r of [...(a || []), ...(b || [])]) {
    const cur = map.get(r.id);
    if (!cur || ts(r) > ts(cur)) map.set(r.id, r);
  }
  for (const [id, r] of [...map]) {
    const t = tombstones[id];
    if (t && t >= ts(r)) map.delete(id); // supprimé après la dernière modification
  }
  return [...map.values()].sort((x, y) => String(x.id).localeCompare(String(y.id)));
}

/** Fusionne deux jeux de données {missions, depenses, settings, tombstones, files}. `remote` peut être null. */
export function mergeData(local, remote) {
  const r = remote || { missions: [], depenses: [], releves: [], settings: null, tombstones: {}, files: {} };
  const tombstones = { ...(r.tombstones || {}) };
  for (const [id, t] of Object.entries(local.tombstones || {})) if (!tombstones[id] || t > tombstones[id]) tombstones[id] = t;

  const missions = mergeCollection(local.missions, r.missions, tombstones);
  const depenses = mergeCollection(local.depenses, r.depenses, tombstones);
  const releves = mergeCollection(local.releves, r.releves, tombstones);

  // Une pierre tombale devenue inutile (enregistrement modifié depuis) est retirée.
  const alive = new Set([...missions, ...depenses, ...releves].map((x) => x.id));
  for (const id of Object.keys(tombstones)) if (alive.has(id)) delete tombstones[id];

  const ls = local.settings || null;
  const rs = r.settings || null;
  const settings = !rs ? ls : !ls ? rs : (ts(rs) > ts(ls) ? rs : ls);

  const allFiles = { ...(r.files || {}), ...(local.files || {}) };
  const files = {};
  for (const id of referencedFileIds(missions, depenses, releves)) if (allFiles[id]) files[id] = allFiles[id];

  return { format: FORMAT, missions, depenses, releves, settings, tombstones, files };
}

/** Décide quoi écrire / supprimer en local après fusion, sans écraser ce qui a été modifié pendant la synchro. */
export function planApply(current, merged, tombstones) {
  const cur = new Map(current.map((x) => [x.id, x]));
  const put = [];
  for (const rec of merged) {
    const c = cur.get(rec.id);
    if (!c || ts(c) <= ts(rec)) { if (!c || canonical(c) !== canonical(rec)) put.push(rec); }
  }
  const keep = new Set(merged.map((x) => x.id));
  const del = current.filter((c) => !keep.has(c.id) && tombstones[c.id] && tombstones[c.id] >= ts(c)).map((c) => c.id);
  return { put, del };
}

/** Données partagées (on retire ce qui est propre à l'appareil). */
export const sharedSettings = (s) => {
  if (!s) return null;
  const { lastBackup, ...rest } = s; // eslint-disable-line no-unused-vars
  return rest;
};

/**
 * Synchronise. `gh` : client GitHub (voir github.js). `local` : adaptateur de stockage
 *  - snapshot() → {missions, depenses, settings, tombstones, files:{id:meta}}  (files = fichiers présents localement)
 *  - hasBlob(id), getBlob(id) → Uint8Array, putBlob(meta, bytes)
 *  - apply(merged)
 */
export async function syncCore({ gh, local, onProgress = () => {}, maxAttempts = 4 }) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    onProgress('Lecture des données distantes…');
    const rf = await gh.getFile(DATA_PATH);
    let remote = null;
    if (rf) {
      remote = JSON.parse(new TextDecoder().decode(rf.bytes));
      if (remote.format !== FORMAT) throw new Error('Le dépôt contient un fichier data.json qui n\'a pas été créé par cette application.');
    }
    const snap = await local.snapshot();
    const merged = mergeData({ ...snap, settings: sharedSettings(snap.settings) }, remote);

    const ids = Object.keys(merged.files);
    const remoteFiles = await gh.listFiles(FILES_DIR);
    let up = 0;
    for (const id of ids) {
      if (!remoteFiles.has(id) && await local.hasBlob(id)) {
        onProgress(`Envoi des justificatifs (${++up})…`);
        await gh.putFile(FILES_DIR + id, await local.getBlob(id), `Justificatif ${id}`);
      }
    }

    const changed = !remote || canonical(remote) !== canonical(merged);
    if (changed) {
      onProgress('Enregistrement des données…');
      const text = JSON.stringify(merged, null, 1);
      try {
        await gh.putFile(DATA_PATH, new TextEncoder().encode(text), 'Synchronisation', rf ? rf.sha : undefined);
      } catch (e) {
        if (e.status === 409 || e.status === 422) { lastErr = e; continue; } // modifié entre-temps : on recommence
        throw e;
      }
    }

    let down = 0;
    for (const id of ids) {
      if (!(await local.hasBlob(id))) {
        onProgress(`Téléchargement des justificatifs (${++down})…`);
        const bytes = await gh.getFileBytes(FILES_DIR + id);
        if (bytes) await local.putBlob(merged.files[id], bytes);
      }
    }
    await local.apply(merged);
    return { pushed: changed, uploaded: up, downloaded: down, missions: merged.missions.length, depenses: merged.depenses.length, releves: merged.releves.length };
  }
  throw new Error(`Synchronisation interrompue : le dépôt est modifié en continu (${lastErr ? lastErr.message : 'conflit'}). Réessayez.`);
}
