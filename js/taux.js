// Taux de cotisations du micro-entrepreneur (auto-entrepreneur) selon la forme d'activité et l'année.
//
// Taux total prélevé par l'URSSAF = cotisations sociales + contribution à la formation professionnelle (CFP)
// (+ versement libératoire de l'impôt sur le revenu, si l'option est choisie).
//
// MISE À JOUR : ces taux changent par décret (le taux des professions libérales BNC augmente par paliers).
// Ajoutez la nouvelle année dans TAUX ci-dessous. Tant qu'une année n'y figure pas, les derniers taux connus
// sont utilisés et l'application l'indique. Vérifiez toujours sur autoentrepreneur.urssaf.fr.
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const FORMES = {
  vente:         { label: 'Vente de marchandises (BIC)', cfp: 0.1, vl: 1, tva: 'vente' },
  services_com:  { label: 'Prestations de services commerciales (BIC)', cfp: 0.1, vl: 1.7, tva: 'services' },
  services_art:  { label: 'Prestations de services artisanales (BIC)', cfp: 0.3, vl: 1.7, tva: 'services' },
  liberal_ssi:   { label: 'Profession libérale, régime général / SSI (BNC)', cfp: 0.2, vl: 2.2, tva: 'services' },
  liberal_cipav: { label: 'Profession libérale réglementée, CIPAV (BNC)', cfp: 0.2, vl: 2.2, tva: 'services' },
  meuble_classe: { label: 'Location de meublé de tourisme classé', cfp: 0.1, vl: 1.7, tva: 'vente', plafond: 'services' },
};

/** Cotisations sociales (%) par année et par forme. */
export const TAUX = {
  2025: { vente: 12.3, services_com: 21.2, services_art: 21.2, liberal_ssi: 24.6, liberal_cipav: 23.2, meuble_classe: 6 },
  2026: { vente: 12.3, services_com: 21.2, services_art: 21.2, liberal_ssi: 25.6, liberal_cipav: 23.2, meuble_classe: 6 },
};

/** Table applicable à une année : exacte si connue, sinon la plus proche (la plus récente avant, ou la première). */
export function tableFor(year) {
  const known = Object.keys(TAUX).map(Number).sort((a, b) => a - b);
  const y = Number(year);
  const used = known.filter((k) => k <= y).pop() ?? known[0];
  return { year: used, exact: used === y, table: TAUX[used], latest: known[known.length - 1] };
}

/** Détail du taux d'une forme pour une année : null si aucune forme n'est choisie. */
export function tauxFor(forme, year, versementLiberatoire = false) {
  const f = FORMES[forme];
  if (!f) return null;
  const t = tableFor(year);
  const cotis = t.table[forme];
  const vl = versementLiberatoire ? f.vl : 0;
  return { forme, cotis, cfp: f.cfp, vl, total: round2(cotis + f.cfp + vl), annee: t.year, exact: t.exact };
}

/**
 * Seuils de franchise en base de TVA (€) par année : « normal » (la franchise cesse au 1er janvier suivant)
 * et « majoré » (la TVA est due dès le jour du dépassement).
 *  - vente : vente de marchandises, consommation sur place, hébergement (meublés de tourisme)
 *  - services : prestations de services commerciales, artisanales et libérales (BNC)
 * Ajoutez la nouvelle année ici ; à défaut, les derniers seuils connus sont utilisés.
 */
export const SEUILS_TVA = {
  2025: { vente: [85000, 93500], services: [37500, 41250] },
  2026: { vente: [85000, 93500], services: [37500, 41250] },
};

/** Seuils TVA de la forme d'activité pour une année ; null si aucune forme n'est choisie. */
export function seuilTvaFor(forme, year) {
  const f = FORMES[forme];
  if (!f) return null;
  const known = Object.keys(SEUILS_TVA).map(Number).sort((a, b) => a - b);
  const y = Number(year);
  const used = known.filter((k) => k <= y).pop() ?? known[0];
  const [seuil, majore] = SEUILS_TVA[used][f.tva];
  return { seuil, majore, type: f.tva, annee: used, exact: used === y };
}

/**
 * Plafonds de chiffre d'affaires du régime micro-entrepreneur (€), par année (triennaux : 2023-2025 puis 2026-2028).
 * Le plafond s'apprécie sur le CA HT encaissé de l'année civile ; il n'y a sortie du régime qu'après un dépassement
 * deux années civiles consécutives. Même type que les seuils de TVA : vente (vente, hébergement) ou services.
 * Meublé de tourisme classé : rattaché aux services (à vérifier selon votre situation).
 */
export const PLAFONDS_CA = {
  2025: { vente: 188700, services: 77700 },
  2026: { vente: 203100, services: 83600 },
};

/** Plafond de CA de la forme d'activité pour une année ; null si aucune forme n'est choisie. */
export function plafondCaFor(forme, year) {
  const f = FORMES[forme];
  if (!f) return null;
  const type = f.plafond || f.tva;
  const known = Object.keys(PLAFONDS_CA).map(Number).sort((a, b) => a - b);
  const y = Number(year);
  const used = known.filter((k) => k <= y).pop() ?? known[0];
  return { plafond: PLAFONDS_CA[used][type], type, annee: used, exact: used === y };
}
