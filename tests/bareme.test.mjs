import test from 'node:test';
import assert from 'node:assert/strict';
import { baremeFor, coefficients, indemnite, planKm, coutAnnuel } from '../js/bareme.js';

test('barème officiel : 5 CV, 1 000 km = 636 € ; 10 000 km = 4 965 € ; 25 000 km = 10 675 €', () => {
  assert.equal(indemnite(2026, 5, false, 0, 1000), 636);
  assert.equal(indemnite(2026, 5, false, 0, 10000), 4965);   // 10000 × 0,357 + 1395
  assert.equal(indemnite(2026, 5, false, 0, 25000), 10675);  // 25000 × 0,427
  assert.equal(indemnite(2026, 3, false, 0, 100), 52.9);
  assert.equal(indemnite(2026, 9, false, 0, 100), 69.7);      // 7 CV et plus
});

test('électrique : +20 % (tableau officiel)', () => {
  assert.deepEqual(coefficients(2026, 5, true), [0.763, 0.428, 1674, 0.512]);
  assert.deepEqual(coefficients(2026, 6, true), [0.798, 0.449, 1748, 0.536]);
});

test('cumul annuel : le passage de tranche est réparti sur le trajet qui la franchit', () => {
  const a = indemnite(2026, 5, false, 4000, 2000); // 6 000 km au total − 4 000 km
  const co = coefficients(2026, 5, false);
  assert.equal(a, Math.round((coutAnnuel(6000, co) - coutAnnuel(4000, co)) * 100) / 100);
  // la somme des trajets = coût de l'année entière
  const t1 = indemnite(2026, 5, false, 0, 4000), t2 = indemnite(2026, 5, false, 4000, 2000);
  assert.equal(Math.round((t1 + t2) * 100) / 100, Math.round(coutAnnuel(6000, co) * 100) / 100);
});

test('année sans barème : le dernier connu est utilisé et signalé', () => {
  assert.equal(baremeFor(2026).exact, true);
  const f = baremeFor(2031);
  assert.equal(f.exact, false); assert.equal(f.year, 2026);
});

test('planKm : tri par date, cumul par véhicule, ignore le manuel et les autres années', () => {
  const d = (id, date, km, extra = {}) => ({ id, date, categorie: 'km', km, bareme: true, cv: 5, elec: false, ...extra });
  const deps = [d('b', '2026-03-01', 2000), d('a', '2026-01-01', 4000), d('m', '2026-02-01', 500, { bareme: false }),
    d('v', '2026-02-02', 100, { cv: 4 }), d('old', '2025-12-31', 900)];
  const p = planKm(deps, 2026);
  assert.equal(p.has('m'), false); assert.equal(p.has('old'), false);
  assert.equal(p.get('a').montant, indemnite(2026, 5, false, 0, 4000));
  assert.equal(p.get('b').montant, indemnite(2026, 5, false, 4000, 2000));
  assert.equal(p.get('v').montant, indemnite(2026, 4, false, 0, 100));
});
