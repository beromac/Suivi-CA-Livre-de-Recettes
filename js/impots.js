// Aide à la déclaration de revenus du micro-entrepreneur : cases du formulaire 2042-C-PRO et montants à reporter.
//
// Les numéros de cases ci-dessous sont ceux de la déclaration 2026 (revenus 2025). Ils sont reconduits d'une année
// à l'autre en général, mais vérifiez toujours sur le formulaire de l'année (impots.gouv.fr). Pour une nouvelle
// année, vérifiez CASES et ajoutez l'année dans ANNEE_CASES_VERIFIEE.
import { round2, recettes, sumRecettes, fraisKm, totauxKm, summarizeYear, rateFor, isAssujetti } from './calc.js';
import { FORMES, tauxFor } from './taux.js';

export const ANNEE_CASES_VERIFIEE = 2025; // année des REVENUS pour laquelle les cases ont été vérifiées (déclaration 2026)

/** Abattement forfaitaire du régime micro, par type d'activité (appliqué automatiquement par l'administration). */
export const ABATTEMENT = { vente: 0.71, services: 0.5, bnc: 0.34 };
export const ABATTEMENT_MIN = 305;

/** Type fiscal de chaque forme d'activité. */
export const TYPE_FISCAL = { vente: 'vente', services_com: 'services', services_art: 'services', liberal_ssi: 'bnc', liberal_cipav: 'bnc', meuble_classe: 'meuble' };

export const LIBELLES_TYPE = {
  vente: 'Vente de marchandises (micro-BIC)',
  services: 'Prestations de services commerciales ou artisanales (micro-BIC)',
  bnc: 'Profession libérale (micro-BNC)',
  meuble: 'Location de meublé de tourisme classé (micro-BIC)',
};

/** Cases : sans versement libératoire (CA brut) et avec versement libératoire. [déclarant 1, déclarant 2, personne à charge] */
export const CASES = {
  vente:    { normal: ['5KO', '5LO', '5MO'], liberatoire: ['5TA', '5UA', '5VA'] },
  services: { normal: ['5KP', '5LP', '5MP'], liberatoire: ['5TB', '5UB', '5VB'] },
  bnc:      { normal: ['5HQ', '5IQ', '5JQ'], liberatoire: ['5TE', '5UE', '5VE'] },
  meuble:   null, // rubrique spécifique : voir la notice de la 2042-C-PRO
};

/** Données de l'aide à la déclaration pour une année de revenus. */
export function aideDeclaration(data, year) {
  const s = data.settings;
  const forme = s.formeActivite;
  const type = TYPE_FISCAL[forme] || null;
  const vl = !!s.versementLiberatoire;
  const ys = summarizeYear(data, year);
  const ca = round2(ys.total.recettesHT);
  const km = totauxKm(fraisKm(data, year));
  const taux = type ? ABATTEMENT[type === 'meuble' ? 'services' : type] : null;
  const abattement = taux == null ? null : round2(Math.max(ca * taux, Math.min(ca, ABATTEMENT_MIN)));
  const cotisations = round2(ys.total.urssafDu);
  const t = tauxFor(forme, year, vl);
  const impotLiberatoire = vl && t ? round2((ca * t.vl) / 100) : 0;
  const cases = type ? CASES[type] : null;
  return {
    year, declarationYear: Number(year) + 1, forme, type, libelle: type ? LIBELLES_TYPE[type] : null,
    liberatoire: vl, ca, mois: ys.months.map((m) => ({ month: m.month, ca: round2(m.recettesHT) })),
    cases: cases ? (vl ? cases.liberatoire : cases.normal) : null,
    tauxAbattement: taux, abattement, revenuImposable: abattement == null ? null : round2(Math.max(0, ca - abattement)),
    cotisations, impotLiberatoire, km,
    casesAJour: Number(year) === ANNEE_CASES_VERIFIEE,
    tva: isAssujetti(s),
  };
}
export { FORMES, rateFor, recettes, sumRecettes };
