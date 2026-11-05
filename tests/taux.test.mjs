import test from 'node:test';
import assert from 'node:assert/strict';
import { tauxFor, tableFor, FORMES } from '../js/taux.js';
import { rateFor, defaultSettings, summarize } from '../js/calc.js';

test('taux 2026 = cotisations + CFP (barème URSSAF)', () => {
  assert.equal(tauxFor('services_com', 2026).total, 21.3);   // = le 21,3 % du fichier Excel
  assert.equal(tauxFor('services_art', 2026).total, 21.5);
  assert.equal(tauxFor('vente', 2026).total, 12.4);
  assert.equal(tauxFor('liberal_ssi', 2026).total, 25.8);
  assert.equal(tauxFor('liberal_cipav', 2026).total, 23.4);
  assert.equal(tauxFor('meuble_classe', 2026).total, 6.1);
});

test('le taux s\'ajuste selon l\'année (BNC : 24,6 % en 2025, 25,6 % en 2026)', () => {
  assert.equal(tauxFor('liberal_ssi', 2025).total, 24.8);
  assert.equal(tauxFor('liberal_ssi', 2026).total, 25.8);
});

test('versement libératoire ajouté seulement si l\'option est cochée', () => {
  assert.equal(tauxFor('services_com', 2026, true).total, 23);   // 21,2 + 0,1 + 1,7
  assert.equal(tauxFor('liberal_ssi', 2026, true).total, 28);     // 25,6 + 0,2 + 2,2
  assert.equal(tauxFor('services_com', 2026, false).vl, 0);
});

test('année inconnue : derniers taux connus, signalé ; forme inconnue : null', () => {
  const t = tauxFor('liberal_ssi', 2030);
  assert.equal(t.exact, false); assert.equal(t.annee, 2026); assert.equal(t.total, 25.8);
  assert.equal(tauxFor('', 2026), null); assert.equal(tauxFor('nimporte', 2026), null);
  assert.equal(tableFor(2026).exact, true);
});

test('rateFor : taux de l\'année saisi > forme d\'activité > taux manuel', () => {
  const s = { ...defaultSettings() };
  assert.equal(rateFor(s, 2026), 21.3);                    // manuel par défaut (aucune forme)
  s.formeActivite = 'liberal_ssi';
  assert.equal(rateFor(s, 2025), 24.8); assert.equal(rateFor(s, 2026), 25.8);
  s.rates = { 2026: 12.9 };                                 // ex. ACRE : prioritaire
  assert.equal(rateFor(s, 2026), 12.9); assert.equal(rateFor(s, 2025), 24.8);
});

test('summarize utilise le taux de l\'année de chaque encaissement', () => {
  const settings = { ...defaultSettings(), formeActivite: 'liberal_ssi' };
  const mk = (enc) => ({ missions: [{ id: 'm', client: 'A', factures: [{ id: 'f', numero: 'F1', date: '2025-01-01', montantHT: 1000, tvaTaux: 0, dateEncaissement: enc }] }], depenses: [], settings, tombstones: {} });
  assert.equal(summarize(mk('2025-12-20'), 2025, 12).urssafDu, 248);
  assert.equal(summarize(mk('2026-01-05'), 2026, 1).urssafDu, 258);
  assert.ok(Object.keys(FORMES).length === 6);
});

import { seuilTvaFor } from '../js/taux.js';
import { margeTva } from '../js/calc.js';

test('seuil de TVA automatique selon la forme (2026) : services 37 500 €, vente / hébergement 85 000 €', () => {
  assert.deepEqual([seuilTvaFor('services_com', 2026).seuil, seuilTvaFor('services_com', 2026).majore], [37500, 41250]);
  assert.equal(seuilTvaFor('liberal_ssi', 2026).seuil, 37500);
  assert.equal(seuilTvaFor('services_art', 2026).seuil, 37500);
  assert.deepEqual([seuilTvaFor('vente', 2026).seuil, seuilTvaFor('vente', 2026).majore], [85000, 93500]);
  assert.equal(seuilTvaFor('meuble_classe', 2026).seuil, 85000);
  assert.equal(seuilTvaFor('', 2026), null);
  assert.equal(seuilTvaFor('vente', 2031).exact, false);
});

test('margeTva : seuil automatique si forme choisie, manuel sinon, masquable', () => {
  const mk = (settings) => ({ missions: [{ id: 'm', client: 'A', factures: [{ id: 'f', numero: 'F', date: '2026-01-01', montantHT: 10000, tvaTaux: 0, dateEncaissement: '2026-02-01' }] }], depenses: [], settings: { ...defaultSettings(), ...settings }, tombstones: {} });
  assert.equal(margeTva(mk({}), 2026).seuil, 37200);                              // manuel (Excel)
  const a = margeTva(mk({ formeActivite: 'services_com' }), 2026);
  assert.equal(a.seuil, 37500); assert.equal(a.reste, 27500); assert.equal(a.majore, 41250);
  assert.equal(margeTva(mk({ formeActivite: 'vente' }), 2026).seuil, 85000);
  assert.equal(margeTva(mk({ formeActivite: 'vente', seuilTvaAffiche: false }), 2026).seuil, 0);
});

import { plafondCaFor, PLAFONDS_CA } from '../js/taux.js';
import { margePlafond } from '../js/calc.js';

test('plafond de CA micro-entrepreneur 2026 : services 83 600 €, vente 203 100 € ; 2025 : 77 700 / 188 700', () => {
  assert.equal(plafondCaFor('liberal_ssi', 2026).plafond, 83600);
  assert.equal(plafondCaFor('services_com', 2026).plafond, 83600);
  assert.equal(plafondCaFor('vente', 2026).plafond, 203100);
  assert.equal(plafondCaFor('services_art', 2025).plafond, 77700);
  assert.equal(plafondCaFor('vente', 2025).plafond, 188700);
  assert.equal(plafondCaFor('', 2026), null);
  assert.equal(plafondCaFor('vente', 2030).exact, false);
  assert.ok(PLAFONDS_CA[2026]);
});

test('margePlafond : reste, pourcentage, masquable, absent sans forme', () => {
  const mk = (settings) => ({ missions: [{ id: 'm', client: 'A', factures: [{ id: 'f', numero: 'F', date: '2026-01-01', montantHT: 20900, tvaTaux: 0, dateEncaissement: '2026-02-01' }] }], depenses: [], settings: { ...defaultSettings(), ...settings }, tombstones: {} });
  const m = margePlafond(mk({ formeActivite: 'services_com' }), 2026);
  assert.equal(m.plafond, 83600); assert.equal(m.reste, 62700); assert.equal(Math.round(m.pct * 100), 25);
  assert.equal(margePlafond(mk({}), 2026).plafond, 0);
  assert.equal(margePlafond(mk({ formeActivite: 'services_com', plafondAffiche: false }), 2026).plafond, 0);
  assert.equal(margePlafond(mk({ formeActivite: 'services_com' }), 2027).exact, false);
});
