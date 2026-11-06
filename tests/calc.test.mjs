import test from 'node:test';
import assert from 'node:assert/strict';
import { recettes, summarize, summarizeYear, periodes, enAttente, nextFactureNumber, factureAmounts, defaultSettings, margeTva, rateFor, suiviMois, simulationTva, isAssujetti, expenseAmounts, relevesAImprimer, caParClient, caCumule, statutDocument, fraisKm, totauxKm, depenses, depensesParCategorie } from '../js/calc.js';

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
  const d = mk([fac('a', 1000, '2026-05-10', { tvaTaux: 20 })], [], { tvaAssujetti: true });
  const s = summarize(d, 2026, 5);
  assert.equal(s.recettesHT, 1000); assert.equal(s.recettesTVA, 200); assert.equal(s.recettesTTC, 1200);
  assert.deepEqual(factureAmounts(d.missions[0].factures[0]), { ht: 1000, tva: 200, ttc: 1200 });
});

test('dépenses : URSSAF et virements perso exclus des dépenses pro (comme l\'Excel)', () => {
  const d = mk([fac('a', 2000, '2026-04-15')], [
    { id: 'x1', date: '2026-04-03', categorie: 'repas', montantTTC: 20, montantTVA: 2 },
    { id: 'x2', date: '2026-04-04', categorie: 'urssaf', montantTTC: 400, montantTVA: 0 },
    { id: 'x3', date: '2026-04-05', categorie: 'perso', montantTTC: 900, montantTVA: 0 },
  ], { tvaAssujetti: true });
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

test('suivi : les virements perso apparaissent dans le mois où ils sont faits', () => {
  const d = mk([], [{ id: 'p1', date: '2026-02-20', categorie: 'perso', montantTTC: 800, montantTVA: 0 }]);
  const s = suiviMois(d, 2026);
  assert.equal(s[1].perso, 800); assert.equal(s[0].perso, 0);
});

test('simulation TVA : collectée sur encaissements − déductible sur dépenses pro, par mois', () => {
  const d = mk([fac('a', 1000, '2026-03-10')], [
    { id: 'e1', date: '2026-03-04', categorie: 'fournitures', montantTTC: 120, montantTVA: 20 },
    { id: 'e2', date: '2026-03-05', categorie: 'perso', montantTTC: 500, montantTVA: 0 },
  ]);
  const s = simulationTva(d, 2026);
  assert.equal(s.months[2].collectee, 200); assert.equal(s.months[2].deductible, 20); assert.equal(s.months[2].aReverser, 180);
  const d2 = mk([fac('a', 1200, '2026-03-10')], [], { tvaSimMode: 'incluse' });
  assert.equal(simulationTva(d2, 2026).months[2].collectee, 200); // 1200 TTC → 200 de TVA
  const d3 = mk([], [{ id: 'e1', date: '2026-04-04', categorie: 'repas', montantTTC: 60, montantTVA: 10 }]);
  const s3 = simulationTva(d3, 2026);
  assert.equal(s3.months[3].aReverser, -10); assert.equal(s3.total.aReverser, -10); // crédit de TVA
});

test('assujetti : la TVA est réelle (taux des factures), plus de simulation', () => {
  const d = mk([fac('a', 1000, '2026-05-10', { tvaTaux: 10 })], [], { tvaAssujetti: true });
  const s = simulationTva(d, 2026);
  assert.equal(s.reel, true); assert.equal(s.months[4].collectee, 100);
});

test('franchise en base (case décochée) : aucune TVA, TTC = HT, coût des dépenses = TTC', () => {
  // la facture porte un taux de TVA, mais il est ignoré tant que la case « soumis à la TVA » n'est pas cochée
  const d = mk([fac('a', 1000, '2026-05-10', { tvaTaux: 20 })], [{ id: 'e', date: '2026-05-02', categorie: 'fournitures', montantTTC: 120, montantTVA: 20 }]);
  assert.equal(isAssujetti(d.settings), false);
  const s = summarize(d, 2026, 5);
  assert.equal(s.recettesHT, 1000); assert.equal(s.recettesTVA, 0); assert.equal(s.recettesTTC, 1000);
  assert.equal(s.depensesHT, 120); // TVA non récupérable : le coût réel est le TTC
  assert.equal(recettes(d, 2026, 5)[0].tva, 0);
  assert.deepEqual(expenseAmounts(d.depenses[0], false), { ttc: 120, tva: 0, ht: 120 });
  // la simulation, elle, continue d'utiliser le « dont TVA » saisi
  assert.equal(simulationTva(d, 2026).months[4].deductible, 20);
  assert.equal(simulationTva(d, 2026).reel, false);
});

test('relevés à imprimer : le mois + précédent / suivant cochés (y compris à cheval sur deux années)', () => {
  const r = (y, m, extra = {}) => ({ id: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m, fileIds: [`f${y}${m}`], ...extra });
  const rel = [r(2025, 12), r(2026, 1, { surPrecedent: true }), r(2026, 2), r(2026, 3, { surSuivant: true }), r(2026, 4), r(2026, 12, { surSuivant: true })];
  assert.deepEqual(relevesAImprimer(rel, 2026, 2).map((x) => x.id), ['2026-02']);
  assert.deepEqual(relevesAImprimer(rel, 2026, 3).map((x) => x.id), ['2026-03', '2026-04']);
  assert.deepEqual(relevesAImprimer(rel, 2026, 1).map((x) => x.id), ['2025-12', '2026-01']);
  const dec = relevesAImprimer(rel, 2026, 12); assert.deepEqual(dec.map((x) => x.id), ['2026-12', '2027-01']);
  assert.equal(dec[1].fileIds.length, 0); // le relevé de janvier 2027 n'est pas encore enregistré → sera signalé « manquant »
  assert.equal(dec[1].raisons[0].mois, 12);
  const annee = relevesAImprimer(rel, 2026, 0).map((x) => x.id);
  assert.deepEqual(annee, ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-12', '2027-01']);
  // un relevé qui n'a que des cases cochées, sans fichier, n'est imprimé que s'il est réclamé par un voisin
  assert.deepEqual(relevesAImprimer([r(2026, 5, { fileIds: [], surSuivant: true })], 2026, 5).map((x) => x.id), ['2026-06']);
});

test('caParClient : regroupe par client, trie, limite à 7 + « Autres », ignore les non encaissés', () => {
  const fac = (n, ht, enc) => ({ numero: n, date: '2026-01-05', montantHT: ht, tvaTaux: 0, dateEncaissement: enc });
  const missions = [
    { id: 'a', client: 'Alpha', factures: [fac('F1', 1000, '2026-02-01')] },
    { id: 'a2', client: 'alpha ', factures: [fac('F2', 500, '2026-03-01')] },
    { id: 'b', client: 'Beta', factures: [fac('F3', 2000, '2026-04-01'), fac('F4', 999, '')] },
    { id: 'c', client: 'Vieux', factures: [fac('F5', 700, '2025-12-31')] },
  ];
  for (let i = 0; i < 8; i++) missions.push({ id: 'x' + i, client: 'Petit' + i, factures: [fac('P' + i, 10 + i, '2026-05-01')] });
  const l = caParClient({ missions, depenses: [], settings: defaultSettings(), tombstones: {} }, 2026);
  assert.equal(l[0].client, 'Beta'); assert.equal(l[0].montant, 2000);
  assert.equal(l[1].client, 'Alpha'); assert.equal(l[1].montant, 1500);
  assert.equal(l.length, 8); assert.equal(l[7].client, 'Autres'); assert.equal(l[7].autres, 3);
  assert(!l.some((x) => x.client === 'Vieux'));
  assert(Math.abs(l.reduce((s, x) => s + x.part, 0) - 1) < 1e-9);
});

test('caCumule : cumul mensuel du CA encaissé', () => {
  const d = { missions: [{ id: 'a', client: 'A', factures: [{ numero: 'F1', date: '2026-01-05', montantHT: 100, tvaTaux: 0, dateEncaissement: '2026-02-10' }, { numero: 'F2', date: '2026-01-05', montantHT: 50, tvaTaux: 0, dateEncaissement: '2026-04-10' }] }], depenses: [], settings: defaultSettings(), tombstones: {} };
  const c = caCumule(d, 2026);
  assert.deepEqual([c[0].cumul, c[1].cumul, c[2].cumul, c[3].cumul, c[11].cumul], [0, 100, 100, 150, 150]);
});

test('statutDocument : expiré, bientôt (≤ 60 j), valide, sans échéance', () => {
  const j = '2026-11-05';
  assert.deepEqual(statutDocument({ dateEcheance: '2026-11-04' }, j), { etat: 'expire', jours: -1 });
  assert.deepEqual(statutDocument({ dateEcheance: '2026-11-05' }, j), { etat: 'bientot', jours: 0 });
  assert.equal(statutDocument({ dateEcheance: '2027-01-04' }, j).etat, 'bientot');   // 60 jours
  assert.equal(statutDocument({ dateEcheance: '2027-01-05' }, j).etat, 'ok');        // 61 jours
  assert.equal(statutDocument({}, j).etat, 'sans');
});

test('frais kilométriques : suivis à part, hors dépenses, trésorerie et TVA déductible', () => {
  const d = { missions: [{ id: 'm', client: 'A', factures: [{ id: 'f', numero: 'F', date: '2026-03-01', montantHT: 1000, tvaTaux: 0, dateEncaissement: '2026-03-05' }] }],
    depenses: [
      { id: 'a', date: '2026-03-10', categorie: 'fournitures', fournisseur: 'X', montantTTC: 100, montantTVA: 0 },
      { id: 'k1', date: '2026-03-11', categorie: 'km', fournisseur: 'Magasin', km: 100, montantTTC: 52.9, jours: 1 },
      { id: 'k2', date: '2026-04-02', categorie: 'km', fournisseur: 'Magasin', km: 50.5, montantTTC: 26.5 },
      { id: 'p', date: '2026-03-12', categorie: 'perso', fournisseur: 'Moi', montantTTC: 300, montantTVA: 0 },
    ], settings: defaultSettings(), tombstones: {} };
  assert.deepEqual(depenses(d, 2026, 3).map((x) => x.id), ['a', 'p']);
  const s = summarize(d, 2026, 3);
  assert.equal(s.depensesHT, 100); assert.equal(s.perso, 300);
  assert.equal(s.tresorerie, Math.round((1000 - 100 - s.urssafDu) * 100) / 100);
  assert.deepEqual(fraisKm(d, 2026).map((x) => x.id), ['k1', 'k2']);
  assert.deepEqual(fraisKm(d, 2026, 4).map((x) => x.id), ['k2']);
  assert.deepEqual(totauxKm(fraisKm(d, 2026)), { km: 150.5, indemnites: 79.4, jours: 1, trajets: 2 });
});

test('depensesParCategorie : hors URSSAF, virements perso et frais km, triées, parts = 100 %', () => {
  const d = { missions: [], settings: defaultSettings(), tombstones: {}, depenses: [
    { id: '1', date: '2026-01-10', categorie: 'fournitures', fournisseur: 'A', montantTTC: 300, montantTVA: 0 },
    { id: '2', date: '2026-02-10', categorie: 'fournitures', fournisseur: 'B', montantTTC: 100, montantTVA: 0 },
    { id: '3', date: '2026-02-11', categorie: 'assurance', fournisseur: 'C', montantTTC: 500, montantTVA: 0 },
    { id: '4', date: '2026-02-12', categorie: 'perso', fournisseur: 'Moi', montantTTC: 900, montantTVA: 0 },
    { id: '5', date: '2026-02-13', categorie: 'urssaf', fournisseur: 'U', montantTTC: 700, montantTVA: 0 },
    { id: '6', date: '2026-02-14', categorie: 'km', fournisseur: 'K', km: 10, montantTTC: 6, montantTVA: 0 },
    { id: '7', date: '2025-02-14', categorie: 'services', fournisseur: 'Vieux', montantTTC: 50, montantTVA: 0 },
  ] };
  const l = depensesParCategorie(d, 2026);
  assert.deepEqual(l.map((x) => [x.categorie, x.montant]), [['assurance', 500], ['fournitures', 400]]);
  assert(Math.abs(l.reduce((s, x) => s + x.part, 0) - 1) < 1e-9);
  assert.equal(l[0].label, 'Assurance');
});
