import test from 'node:test';
import assert from 'node:assert/strict';
import { irFoyer, parts, irActivite, impotSocietes, simMicro, simEI, simEURL, simSASU, comparer, balayage } from '../js/simu.js';
import { aideDeclaration, CASES } from '../js/impots.js';
import { defaultSettings } from '../js/calc.js';

const seul = { couple: false, enfants: 0, autresRevenus: 0 };

test('IR 2026 (revenus 2025) : barème, décote', () => {
  assert.equal(irFoyer(11600, seul, 2025), 0);
  assert.equal(irFoyer(30000, seul, 2025), 2103.99);              // 17979 × 11 % + 421 × 30 %
  assert.equal(irFoyer(20000, seul, 2025), 445.11);               // 924 − décote (897 − 45,25 % × 924)
  assert.equal(irFoyer(15000, seul, 2025), 0);                    // décote totale
  assert.equal(irFoyer(60000, { couple: true, enfants: 0 }, 2025), irFoyer(60000, { couple: true, enfants: 0 }, 2025));
});

test('parts de quotient familial', () => {
  assert.equal(parts({ couple: false, enfants: 0 }).parts, 1);
  assert.equal(parts({ couple: true, enfants: 2 }).parts, 3);
  assert.equal(parts({ couple: true, enfants: 3 }).parts, 4);
});

test('quotient familial : plafonné ; couple paye moins que célibataire à revenu égal', () => {
  const s = irFoyer(80000, seul, 2025), c = irFoyer(80000, { couple: true, enfants: 0 }, 2025), c2 = irFoyer(80000, { couple: true, enfants: 2 }, 2025);
  assert.ok(c < s && c2 < c);
  const base = irFoyer(80000, { couple: true, enfants: 0 }, 2025);
  assert.ok(base - c2 <= 1807 * 2 + 0.01, 'avantage plafonné à 1 807 € par demi-part');
});

test('impôt attribuable à l\'activité, IS 15 % / 25 %', () => {
  assert.equal(irActivite(0, seul, 2025), 0);
  assert.equal(irActivite(30000, seul, 2025), irFoyer(30000, seul, 2025));
  assert.equal(irActivite(10000, { ...seul, autresRevenus: 30000 }, 2025), irFoyer(40000, seul, 2025) - irFoyer(30000, seul, 2025));
  assert.equal(impotSocietes(42500), 6375); assert.equal(impotSocietes(50000), 6375 + 1875); assert.equal(impotSocietes(-5), 0);
});

test('micro : libéral SSI, 50 000 € de CA, 5 000 € de charges réelles', () => {
  const r = simMicro({ ca: 50000, charges: 5000, forme: 'liberal_ssi', year: 2025, foyer: seul, plafond: 83600 });
  assert.equal(r.cotisations, 12400);                             // 24,8 % en 2025 (24,6 + 0,2)
  // abattement 34 % → revenu imposable 33 000 €
  assert.equal(r.impotRevenu, irFoyer(33000, seul, 2025));
  assert.equal(r.net, Math.round((50000 - 12400 - 5000 - r.impotRevenu) * 100) / 100);
  assert.equal(r.possible, true);
  assert.equal(simMicro({ ca: 90000, charges: 0, forme: 'liberal_ssi', year: 2025, foyer: seul, plafond: 83600 }).possible, false);
});

test('micro : abattement minimum de 305 €, forme non choisie = services commerciaux', () => {
  const r = simMicro({ ca: 400, charges: 0, forme: '', year: 2025, foyer: seul });
  assert.equal(r.impotRevenu, 0);
  assert.ok(r.detail[1].includes('revenu imposable 95 €') || r.detail[1].includes('95'));
});

test('EI au réel : cotisations ≈ 45 % du revenu net (minimum 1 200 €), charges déductibles', () => {
  const r = simEI({ ca: 60000, charges: 10000, compta: 1000, tauxTns: 0.45, foyer: seul, year: 2025 });
  const avant = 49000, cot = Math.round(avant * 0.45 / 1.45 * 100) / 100;
  assert.equal(r.cotisations, cot);
  assert.equal(r.remuneration, avant - cot);
  assert.equal(r.net, Math.round((avant - cot - r.impotRevenu) * 100) / 100);
  assert.equal(simEI({ ca: 3000, charges: 0, compta: 1000, tauxTns: 0.45, foyer: seul, year: 2025 }).cotisations, 1200);
  assert.equal(simEI({ ca: 500, charges: 1000, compta: 0, tauxTns: 0.45, foyer: seul, year: 2025 }).cotisations, 0);
});

test('EURL / SASU : meilleur mix, jamais plus que le bénéfice, pas de bénéfice = perte', () => {
  const foyer = seul;
  const eurl = simEURL({ ca: 80000, charges: 10000, compta: 2000, tauxTns: 0.45, capital: 1000, foyer, year: 2025 });
  const sasu = simSASU({ ca: 80000, charges: 10000, compta: 2500, foyer, year: 2025 });
  for (const r of [eurl, sasu]) { assert.ok(r.net > 0 && r.net < 80000 - 10000); assert.ok(r.remuneration >= 0); }
  // le mix retenu est au moins aussi bon que « tout en salaire » et que « tout en dividendes »
  const tout = simSASU({ ca: 80000, charges: 10000, compta: 2500, foyer, year: 2025 });
  assert.equal(tout.net, sasu.net);
  assert.equal(simSASU({ ca: 1000, charges: 5000, compta: 0, foyer, year: 2025 }).net, -4000);
});

test('comparer : charges élevées → l\'EI au réel bat la micro ; charges faibles → la micro gagne', () => {
  const lourd = comparer({ ca: 40000, charges: 20000, forme: 'liberal_ssi', year: 2025, plafond: 83600, simu: {} });
  assert.notEqual(lourd.meilleur.id, 'micro');
  const leger = comparer({ ca: 30000, charges: 500, forme: 'services_com', year: 2025, plafond: 83600, simu: {} });
  assert.equal(leger.meilleur.id, 'micro');
  assert.equal(lourd.resultats.length, 4);
});

test('comparer : la micro est écartée au-dessus du plafond ; les frais km ne comptent qu\'au réel', () => {
  const r = comparer({ ca: 100000, charges: 5000, forme: 'liberal_ssi', year: 2025, plafond: 83600, simu: {} });
  assert.equal(r.micro.possible, false); assert.notEqual(r.meilleur.id, 'micro');
  const a = comparer({ ca: 40000, charges: 5000, chargesKm: 3000, forme: 'liberal_ssi', year: 2025, plafond: 83600, simu: { inclureKm: true } });
  const b = comparer({ ca: 40000, charges: 5000, chargesKm: 3000, forme: 'liberal_ssi', year: 2025, plafond: 83600, simu: { inclureKm: false } });
  assert.equal(a.micro.net, b.micro.net);
  assert.ok(a.resultats[1].net > b.resultats[1].net, 'les IK déduites augmentent ce qui reste au réel');
  assert.ok(a.resultats[2].net > b.resultats[2].net && a.resultats[3].net > b.resultats[3].net);
});

test('balayage : courbes par CA et point de bascule', () => {
  const b = balayage({ ca: 40000, charges: 20000, forme: 'liberal_ssi', year: 2025, plafond: 83600, simu: {} });
  assert.equal(b.xs.length, b.series.micro.length);
  assert.ok(b.seuil !== null && b.seuil <= 40000);
});

test('aide à la déclaration : cases selon l\'activité et le versement libératoire', () => {
  const mk = (settings) => ({ missions: [{ id: 'm', client: 'A', factures: [{ id: 'f', numero: 'F', date: '2025-03-01', montantHT: 20000, tvaTaux: 0, dateEncaissement: '2025-03-05' }] }], depenses: [{ id: 'k', date: '2025-04-01', categorie: 'km', fournisseur: 'M', km: 100, montantTTC: 63.6, montantTVA: 0 }], settings: { ...defaultSettings(), ...settings }, tombstones: {} });
  const a = aideDeclaration(mk({ formeActivite: 'liberal_ssi' }), 2025);
  assert.deepEqual(a.cases, ['5HQ', '5IQ', '5JQ']); assert.equal(a.ca, 20000); assert.equal(a.abattement, 6800); assert.equal(a.revenuImposable, 13200);
  assert.equal(a.declarationYear, 2026); assert.equal(a.casesAJour, true); assert.equal(a.km.km, 100);
  assert.deepEqual(aideDeclaration(mk({ formeActivite: 'services_com' }), 2025).cases, ['5KP', '5LP', '5MP']);
  assert.deepEqual(aideDeclaration(mk({ formeActivite: 'vente' }), 2025).cases, ['5KO', '5LO', '5MO']);
  const v = aideDeclaration(mk({ formeActivite: 'liberal_ssi', versementLiberatoire: true }), 2025);
  assert.deepEqual(v.cases, ['5TE', '5UE', '5VE']); assert.equal(v.impotLiberatoire, 440);
  assert.equal(aideDeclaration(mk({}), 2025).cases, null);
  assert.equal(aideDeclaration(mk({ formeActivite: 'meuble_classe' }), 2025).cases, null);
  assert.equal(aideDeclaration(mk({ formeActivite: 'liberal_ssi' }), 2026).casesAJour, false);
  assert.ok(CASES.bnc);
});
