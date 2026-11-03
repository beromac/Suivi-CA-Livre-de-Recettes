import test from 'node:test';
import assert from 'node:assert/strict';
import { recettes, summarize, summarizeYear, periodes, enAttente, nextFactureNumber, factureAmounts, defaultSettings, margeTva, rateFor, suiviMois } from '../js/calc.js';

const fac = (id, ht, enc, extra = {}) => ({ id, numero: id, date: '2026-01-05', montantHT: ht, tvaTaux: 0, dateEncaissement: enc, ...extra });
const mk = (factures, depenses = [], settings = {}) => ({
  missions: [{ id: 'm1', client: 'ACME', annee: 2026, devis: [{ id: 'd1', montantHT: 3000 }], factures }],
  depenses, settings: { ...defaultSettings(), ...settings }, tombstones: {},
});

test('le CA est compté dans le mois de la date d\'encaissement, pas de la facture', () => {
  const d = mk([fac('F2026-001', 1000, '2026-03-02'), fac('F2026-002', 500, '')]);
  d.missions[0].factures[0].date = '2026-01-10'; // facturée en janvier, encaissée en mars
  assert.equal(summarize(d, 2026, 1).recettesHT, 0);
  assert.equal(summarize(d, 2026, 3).recettesHT, 1000);
  assert.equal(recettes(d, 2026, 3).length, 1);
});

test('limites de mois et d\'année', () => {
  const d = mk([fac('a', 100, '2026-01-31'), fac('b', 200, '2026-02-01'), fac('c', 400, '2025-12-31'), fac('d', 800, '2027-01-01')]);
  assert.equal(summarize(d, 2026, 1).recettesHT, 100);
  assert.equal(summarize(d, 2026, 2).recettesHT, 200);
  assert.equal(summarizeYear(d, 2026).total.recettesHT, 300);
  assert.equal(summarizeYear(d, 2025).total.recettesHT, 400);
});

test('facture non encaissée : en attente et comptée nulle part', () => {
  const d = mk([fac('a', 700, '')]);
  assert.equal(summarizeYear(d, 2026).total.recettesHT, 0);
  assert.equal(enAttente(d).length, 1);
  assert.equal(enAttente(d)[0].ttc, 700);
});

test('URSSAF = CA encaissé HT × taux (21,3 % par défaut, comme le fichier Excel)', () => {
  const d = mk([fac('a', 1000, '2026-05-10')]);
  assert.equal(summarize(d, 2026, 5).urssafDu, 213);
  const d2 = mk([fac('a', 1000, '2026-05-10')], [], { rates: { 2026: 24.6 } });
  assert.equal(summarize(d2, 2026, 5).urssafDu, 246);
  assert.equal(rateFor(d2.settings, 2027), 21.3);
});

test('avec TVA : le CA à déclarer est HT, la TVA est séparée', () => {
  const d = mk([fac('a', 1000, '2026-05-10', { tvaTaux: 20 })]);
  const s = summarize(d, 2026, 5);
  assert.equal(s.recettesHT, 1000); assert.equal(s.recettesTVA, 200); assert.equal(s.recettesTTC, 1200);
  assert.deepEqual(factureAmounts(d.missions[0].factures[0]), { ht: 1000, tva: 200, ttc: 1200 });
});

test('dépenses : URSSAF et virements perso exclus des dépenses pro (comme l\'Excel)', () => {
  const d = mk([fac('a', 2000, '2026-04-15')], [
    { id: 'x1', date: '2026-04-03', categorie: 'repas', montantTTC: 20, montantTVA: 2 },
    { id: 'x2', date: '2026-04-04', categorie: 'urssaf', montantTTC: 400, montantTVA: 0 },
    { id: 'x3', date: '2026-04-05', categorie: 'perso', montantTTC: 900, montantTVA: 0 },
  ]);
  const s = summarize(d, 2026, 4);
  assert.equal(s.depensesHT, 18); assert.equal(s.urssafPaye, 400); assert.equal(s.perso, 900);
  assert.equal(s.tresorerie, 2000 - 18 - 426);
});

test('périodes : mensuelle et trimestrielle, échéance', () => {
  const d = mk([fac('a', 100, '2026-01-20'), fac('b', 200, '2026-03-30'), fac('c', 400, '2026-04-02')]);
  const t = periodes(d, 2026, 'trimestrielle');
  assert.equal(t.length, 4); assert.equal(t[0].ht, 300); assert.equal(t[1].ht, 400);
  assert.equal(t[0].echeance, '2026-04-30'); assert.equal(t[3].echeance, '2027-01-31');
  const m = periodes(d, 2026, 'mensuelle');
  assert.equal(m.length, 12); assert.equal(m[0].echeance, '2026-02-28'); assert.equal(m[11].echeance, '2027-01-31');
});

test('numérotation des factures et marge avant seuil TVA', () => {
  const d = mk([fac('F2026-007', 100, '')]);
  assert.equal(nextFactureNumber(d, 2026), 'F2026-008');
  assert.equal(nextFactureNumber(d, 2027), 'F2027-001');
  const dd = mk([fac('a', 6000, '2026-02-02')]);
  const m = margeTva(dd, 2026);
  assert.equal(m.reste, 31200); assert.equal(m.jours, 104); // (37200 − 6000) / 300 = 104 jours, comme l'Excel
});

test('suivi : devis de janvier (2000 €) encaissé en février → écart cumulé en janvier, soldé en février', () => {
  const d = mk([fac('F1', 2000, '2026-02-10')]);
  d.missions[0].devis = [{ id: 'd1', montantHT: 2000, dateSignature: '2026-01-05' }];
  const s = suiviMois(d, 2026);
  assert.equal(s[0].devisHT, 2000); assert.equal(s[0].encaisseHT, 0); assert.equal(s[0].ecartCumule, 2000);
  assert.equal(s[1].devisHT, 0); assert.equal(s[1].encaisseHT, 2000); assert.equal(s[1].ecartCumule, 0);
  assert.deepEqual(s[0].devis[0].encaissements, { '2026-02': 2000 });
});

test('suivi : la date de réalisation prévue prime sur la date de signature', () => {
  const d = mk([]);
  d.missions[0].devis = [{ id: 'd1', montantHT: 900, dateSignature: '2026-01-05', datePrevue: '2026-03-20' }];
  const s = suiviMois(d, 2026);
  assert.equal(s[0].devisHT, 0); assert.equal(s[2].devisHT, 900); assert.equal(s[11].ecartCumule, 900);
});
