// Barème kilométrique (voitures) : indemnités calculées automatiquement selon la puissance fiscale.
//
// Le barème est annuel et CUMULATIF : le taux dépend du total de kilomètres de l'année pour un même véhicule
// (jusqu'à 5 000 km, de 5 001 à 20 000 km, au-delà de 20 000 km). L'indemnité d'un trajet est donc
//   coût(km déjà faits dans l'année + km du trajet) − coût(km déjà faits dans l'année).
//
// MISE À JOUR : chaque année, l'administration publie le barème (souvent reconduit à l'identique). Ajoutez la
// nouvelle année dans BAREMES ci-dessous. Tant qu'une année n'y figure pas, le dernier barème connu est utilisé
// et l'application l'affiche clairement (voir baremeFor).
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// [d ≤ 5 000 : d × a ; 5 001 à 20 000 : d × b + c ; > 20 000 : d × e]
const T2023 = {
  3: [0.529, 0.316, 1065, 0.370],
  4: [0.606, 0.340, 1330, 0.407],
  5: [0.636, 0.357, 1395, 0.427],
  6: [0.665, 0.374, 1457, 0.447],
  7: [0.697, 0.394, 1515, 0.470],
};

/** Barèmes thermiques par année (revenus de l'année). 2023 à 2026 : barème identique (non revalorisé depuis 2023). */
export const BAREMES = { 2023: T2023, 2024: T2023, 2025: T2023, 2026: T2023 };

export const CV_LABELS = { 3: '3 CV et moins', 4: '4 CV', 5: '5 CV', 6: '6 CV', 7: '7 CV et plus' };
export const clampCv = (cv) => Math.min(7, Math.max(3, Math.round(Number(cv) || 0)));

/** Barème applicable à une année : exact si connu, sinon le plus récent des années précédentes. */
export function baremeFor(year) {
  const known = Object.keys(BAREMES).map(Number).sort((a, b) => a - b);
  const y = Number(year);
  let used = known.filter((k) => k <= y).pop();
  if (used === undefined) used = known[0];
  return { year: used, exact: used === y, table: BAREMES[used], latest: known[known.length - 1] };
}

/** Coefficients [a, b, c, e] pour un véhicule ; l'électrique est majoré de 20 % (arrondi comme le barème officiel). */
export function coefficients(year, cv, electrique = false) {
  const [a, b, c, e] = baremeFor(year).table[clampCv(cv)];
  if (!electrique) return [a, b, c, e];
  const r3 = (x) => Math.round(x * 1.2 * 1000) / 1000;
  return [r3(a), r3(b), Math.round(c * 1.2), r3(e)];
}

/** Coût annuel total pour d km professionnels. */
export function coutAnnuel(d, [a, b, c, e]) {
  if (d <= 0) return 0;
  if (d <= 5000) return d * a;
  if (d <= 20000) return d * b + c;
  return d * e;
}

/** Indemnité d'un trajet de `km` km après `avant` km déjà parcourus dans l'année. */
export function indemnite(year, cv, electrique, avant, km) {
  const co = coefficients(year, cv, electrique);
  return round2(coutAnnuel(avant + km, co) - coutAnnuel(avant, co));
}

const yearOf = (d) => Number(String(d.date || '').slice(0, 4));

/**
 * Calcule les indemnités des dépenses « frais kilométriques » en calcul automatique (`bareme: true`) d'une année.
 * Les trajets sont classés par date ; le cumul est tenu séparément pour chaque véhicule (puissance + électrique).
 * Retourne une Map id → { montant, taux }.
 */
export function planKm(depenses, year) {
  const list = depenses.filter((d) => d.categorie === 'km' && d.bareme && yearOf(d) === Number(year))
    .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.id).localeCompare(String(y.id)));
  const cum = new Map();
  const out = new Map();
  for (const d of list) {
    const cv = clampCv(d.cv), elec = !!d.elec, key = `${cv}|${elec}`;
    const avant = cum.get(key) || 0, km = Number(d.km) || 0;
    const montant = indemnite(year, cv, elec, avant, km);
    out.set(d.id, { montant, taux: km ? Math.round((montant / km) * 10000) / 10000 : 0 });
    cum.set(key, avant + km);
  }
  return out;
}
