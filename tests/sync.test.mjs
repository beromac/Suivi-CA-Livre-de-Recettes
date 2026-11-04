import test from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './mock-github.mjs';
import { GitHub } from '../js/github.js';
import { syncCore, mergeData, planApply, canonical } from '../js/sync-core.js';

/** Appareil factice : mêmes méthodes que l'adaptateur IndexedDB, en mémoire. */
function device() {
  const d = { missions: new Map(), depenses: new Map(), releves: new Map(), settings: null, tombstones: {}, blobs: new Map(), files: {} };
  const local = {
    snapshot: async () => ({ missions: [...d.missions.values()], depenses: [...d.depenses.values()], releves: [...d.releves.values()], settings: d.settings, tombstones: d.tombstones, files: d.files }),
    hasBlob: async (id) => d.blobs.has(id),
    getBlob: async (id) => d.blobs.get(id),
    putBlob: async (meta, bytes) => { d.blobs.set(meta.id, bytes); d.files[meta.id] = meta; },
    apply: async (merged) => {
      for (const [k, list] of [['missions', merged.missions], ['depenses', merged.depenses], ['releves', merged.releves]]) {
        const plan = planApply([...d[k].values()], list, merged.tombstones);
        plan.put.forEach((r) => d[k].set(r.id, r)); plan.del.forEach((id) => d[k].delete(id));
      }
      d.tombstones = merged.tombstones;
      if (merged.settings && (!d.settings || (d.settings.updated || '') <= (merged.settings.updated || ''))) d.settings = merged.settings;
    },
  };
  const addFile = (id, text) => { d.blobs.set(id, new TextEncoder().encode(text)); d.files[id] = { id, name: id + '.pdf', type: 'application/pdf', size: text.length, created: '2026-01-01' }; };
  return { d, local, addFile };
}
const ghFor = (url) => new GitHub({ owner: 'moi', repo: 'data-repo', branch: 'main', token: 'good-token', apiBase: url });

test('deux appareils : fusion, fichiers, suppression propagée', async () => {
  const mock = await startMock();
  const gh = ghFor(mock.url);
  const pc = device(), tel = device();

  pc.d.missions.set('m1', { id: 'm1', client: 'ACME', updated: '2026-01-01T10:00:00Z', devis: [{ id: 'd', fileId: 'f1' }], factures: [] });
  pc.addFile('f1', 'devis-signe');
  let r = await syncCore({ gh, local: pc.local });
  assert.equal(r.pushed, true); assert.equal(r.uploaded, 1);
  assert.ok(mock.state.files.has('data.json') && mock.state.files.has('files/f1'));

  // le téléphone récupère la mission ET le justificatif
  r = await syncCore({ gh, local: tel.local });
  assert.equal(r.downloaded, 1);
  assert.equal(tel.d.missions.get('m1').client, 'ACME');
  assert.equal(new TextDecoder().decode(tel.d.blobs.get('f1')), 'devis-signe');

  // modifications simultanées sur les deux appareils
  tel.d.depenses.set('x1', { id: 'x1', fournisseur: 'SNCF', updated: '2026-02-01T08:00:00Z', fileIds: ['f2'] });
  tel.addFile('f2', 'ticket');
  pc.d.missions.set('m1', { ...pc.d.missions.get('m1'), client: 'ACME SAS', updated: '2026-02-01T09:00:00Z' });
  await syncCore({ gh, local: tel.local });
  await syncCore({ gh, local: pc.local });
  await syncCore({ gh, local: tel.local });
  assert.equal(pc.d.depenses.get('x1').fournisseur, 'SNCF');
  assert.equal(new TextDecoder().decode(pc.d.blobs.get('f2')), 'ticket');
  assert.equal(tel.d.missions.get('m1').client, 'ACME SAS');

  // suppression sur le PC → disparaît du téléphone
  pc.d.missions.delete('m1'); pc.d.tombstones = { m1: '2026-03-01T00:00:00Z' };
  await syncCore({ gh, local: pc.local });
  await syncCore({ gh, local: tel.local });
  assert.equal(tel.d.missions.has('m1'), false);
  assert.equal(tel.d.depenses.has('x1'), true);

  // une nouvelle synchro sans changement ne crée pas de commit inutile
  const before = mock.state.commits;
  await syncCore({ gh, local: tel.local });
  assert.equal(mock.state.commits, before);
  await mock.close();
});

test('conflit 409 : la synchro recommence et aboutit', async () => {
  const mock = await startMock();
  const gh = ghFor(mock.url);
  const a = device();
  a.d.missions.set('m1', { id: 'm1', client: 'X', updated: '2026-01-01T00:00:00Z', devis: [], factures: [] });
  await syncCore({ gh, local: a.local });
  a.d.missions.set('m2', { id: 'm2', client: 'Y', updated: '2026-01-02T00:00:00Z', devis: [], factures: [] });
  mock.state.injectConflict = 2;
  const r = await syncCore({ gh, local: a.local });
  assert.equal(r.pushed, true);
  const remote = JSON.parse(mock.state.files.get('data.json').bytes.toString());
  assert.equal(remote.missions.length, 2);
  await mock.close();
});

test('erreurs explicites : jeton invalide, dépôt absent', async () => {
  const mock = await startMock();
  const bad = new GitHub({ owner: 'moi', repo: 'data-repo', token: 'nope', apiBase: mock.url });
  await assert.rejects(() => syncCore({ gh: bad, local: device().local }), /Jeton GitHub refusé/);
  const missing = new GitHub({ owner: 'moi', repo: 'autre', token: 'good-token', apiBase: mock.url });
  await assert.rejects(() => missing.check(), /Dépôt introuvable/);
  await mock.close();
});

test('fusion : le plus récent gagne, une modification plus récente annule la suppression', () => {
  const a = { missions: [{ id: 'm', client: 'vieux', updated: '2026-01-01' }], depenses: [], settings: { updated: '2026-01-01', defaultRate: 21.3 }, tombstones: {}, files: {} };
  const b = { missions: [{ id: 'm', client: 'neuf', updated: '2026-02-01' }], depenses: [], settings: { updated: '2026-03-01', defaultRate: 24.6 }, tombstones: {}, files: {} };
  const m = mergeData(a, b);
  assert.equal(m.missions[0].client, 'neuf'); assert.equal(m.settings.defaultRate, 24.6);
  const supprime = mergeData({ ...a, tombstones: { m: '2026-01-15' } }, b);
  assert.equal(supprime.missions.length, 1, 'modifiée après la suppression : elle revient');
  const supprime2 = mergeData({ ...a, tombstones: { m: '2026-05-01' } }, b);
  assert.equal(supprime2.missions.length, 0);
  assert.equal(canonical({ b: 1, a: [2] }), canonical({ a: [2], b: 1 }));
});

test('planApply ne touche pas à ce qui a été modifié pendant la synchro', () => {
  const current = [{ id: 'm', updated: '2026-06-01' }, { id: 'n', updated: '2026-06-01' }];
  const plan = planApply(current, [{ id: 'm', updated: '2026-01-01' }], { n: '2026-02-01' });
  assert.deepEqual(plan, { put: [], del: [] });
});

test('relevés de banque : synchronisés avec leurs fichiers, suppression propagée', async () => {
  const mock = await startMock();
  const gh = ghFor(mock.url);
  const pc = device(), tel = device();
  pc.d.releves.set('2026-03', { id: '2026-03', year: 2026, month: 3, fileIds: ['r1'], updated: '2026-04-01T08:00:00Z' });
  pc.addFile('r1', 'releve-mars');
  await syncCore({ gh, local: pc.local });
  assert.ok(mock.state.files.has('files/r1'));
  await syncCore({ gh, local: tel.local });
  assert.equal(tel.d.releves.get('2026-03').fileIds[0], 'r1');
  assert.equal(new TextDecoder().decode(tel.d.blobs.get('r1')), 'releve-mars');
  pc.d.releves.delete('2026-03'); pc.d.tombstones = { '2026-03': '2026-05-01T00:00:00Z' };
  await syncCore({ gh, local: pc.local });
  await syncCore({ gh, local: tel.local });
  assert.equal(tel.d.releves.has('2026-03'), false);
  await mock.close();
});
