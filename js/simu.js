// Simulateur : micro-entreprise, entreprise individuelle au réel, EURL à l'IS, SASU.
//
// ⚠ Estimations indicatives, simplifiées : elles ne remplacent pas un expert-comptable. Hypothèses principales :
//  - impôt sur le revenu : barème progressif, quotient familial (avec plafonnement) et décote ; l'impôt attribué à l'activité
//    est la différence « impôt du foyer avec l'activité − impôt du foyer sans l'activité » ;
//  - travailleur non salarié (EI au réel, EURL) : cotisations ≈ 45 % du revenu net (modifiable), minimum ≈ 1 200 € ;
//  - SASU : charges ≈ 80 % du salaire net (coût total ≈ 1,8 × le net) ; dividendes au PFU (31,4 % en 2026) ;
//  - impôt sur les sociétés : 15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà ;
//  - la TVA, la CFE, l'ACRE, le versement libératoire et les cotisations facultatives ne sont pas modélisés.
import { round2 } from './calc.js';
import { tauxFor, FORMES } from './taux.js';
import { ABATTEMENT, ABATTEMENT_MIN, TYPE_FISCAL } from './impots.js';

/** Barème de l'impôt sur le revenu par année de REVENUS (revenus 2025 = déclaration 2026). */
export const IR = {
  2025: {
    tranches: [[11600, 0], [29579, 0.11], [84577, 0.30], [181917, 0.41], [Infinity, 0.45]],
    plafondDemiPart: 1807,
    decote: { seul: [1982, 897], couple: [3277, 1483] }, tauxDecote: 0.4525,
  },
};
export const IS = { seuil: 42500, tauxReduit: 0.15, taux: 0.25 };
export const PFU = 0.314;           // 12,8 % d'impôt + 18,6 % de prélèvements sociaux (2026)
export const COTIS_MIN_TNS = 1200;
export const RATIO_SASU = 0.80;     // charges sociales ≈ 80 % du salaire net
export const IMPOSABLE_SALAIRE = 0.94; // salaire net imposable après déduction forfaitaire de 10 %, ≈ 0,94 × net

export function baremeIR(year) {
  const known = Object.keys(IR).map(Number).sort((a, b) => a - b);
  const used = known.filter((k) => k <= Number(year)).pop() ?? known[0];
  return { annee: used, exact: used === Number(year), ...IR[used] };
}

const irParPart = (q, tr) => { let ir = 0, bas = 0; for (const [haut, taux] of tr) { if (q > bas) ir += (Math.min(q, haut) - bas) * taux; bas = haut; } return ir; };

/** Nombre de parts : base 1 (seul) ou 2 (couple) ; enfants : 0,5 pour chacun des deux premiers, 1 à partir du troisième. */
export function parts(foyer) {
  const base = foyer.couple ? 2 : 1;
  const e = Math.max(0, Math.floor(Number(foyer.enfants) || 0));
  return { base, parts: base + Math.min(e, 2) * 0.5 + Math.max(0, e - 2) };
}

/** Impôt sur le revenu du foyer pour un revenu net imposable donné. */
export function irFoyer(revenu, foyer, year) {
  const b = baremeIR(year);
  const { base, parts: n } = parts(foyer);
  const r = Math.max(0, revenu);
  const brut = irParPart(r / n, b.tranches) * n;
  const brutBase = irParPart(r / base, b.tranches) * base;
  const plafond = b.plafondDemiPart * ((n - base) / 0.5);
  let ir = n > base && brutBase - brut > plafond ? brutBase - plafond : brut;
  const [seuil, forfait] = base === 2 ? b.decote.couple : b.decote.seul;
  if (ir < seuil) ir = Math.max(0, ir - Math.max(0, forfait - b.tauxDecote * ir));
  return round2(ir);
}

/** Part de l'impôt du foyer attribuable à l'activité. */
export const irActivite = (revenuActivite, foyer, year) =>
  round2(irFoyer((Number(foyer.autresRevenus) || 0) + Math.max(0, revenuActivite), foyer, year) - irFoyer(Number(foyer.autresRevenus) || 0, foyer, year));

export const impotSocietes = (b) => round2(b <= 0 ? 0 : Math.min(b, IS.seuil) * IS.tauxReduit + Math.max(0, b - IS.seuil) * IS.taux);

/** Forme d'activité retenue pour la simulation (services commerciaux par défaut). */
export function profil(forme) {
  const f = FORMES[forme] ? forme : 'services_com';
  return { forme: f, devine: !FORMES[forme], type: TYPE_FISCAL[f] };
}

const r2 = round2;

export function simMicro({ ca, charges, forme, year, foyer, plafond }) {
  const p = profil(forme);
  const t = tauxFor(p.forme, year, false);
  const cotisations = r2((ca * (t.cotis + t.cfp)) / 100);
  const taux = ABATTEMENT[p.type === 'meuble' ? 'services' : p.type];
  const imposable = r2(Math.max(0, ca - Math.max(ca * taux, Math.min(ca, ABATTEMENT_MIN))));
  const ir = irActivite(imposable, foyer, year);
  return {
    id: 'micro', label: 'Micro-entreprise (actuelle)', possible: !plafond || ca <= plafond, ca, charges, comptabilite: 0,
    cotisations, impotSocietes: 0, impotRevenu: ir, dividendes: 0, remuneration: r2(ca - cotisations - charges), resteSociete: 0,
    net: r2(ca - cotisations - charges - ir),
    detail: [`Cotisations ${r2(t.cotis + t.cfp)} % du CA`, `Abattement forfaitaire ${Math.round(taux * 100)} % : revenu imposable ${imposable} €`, 'Vos charges réelles ne sont pas déductibles (abattement forfaitaire)'],
  };
}

export function simEI({ ca, charges, compta, ik = 0, tauxTns, foyer, year }) {
  const avant = ca - charges - compta - ik; // les indemnités km sont déduites du bénéfice mais ne sont pas une dépense réelle de trésorerie
  const c = tauxTns / (1 + tauxTns);
  const cotisations = avant <= 0 ? 0 : r2(Math.min(avant, Math.max(COTIS_MIN_TNS, c * avant)));
  const revenu = r2(avant - cotisations);
  const ir = irActivite(revenu, foyer, year);
  return {
    id: 'ei', label: 'Entreprise individuelle au réel', possible: true, ca, charges, comptabilite: compta,
    cotisations, impotSocietes: 0, impotRevenu: ir, dividendes: 0, remuneration: revenu, resteSociete: 0, net: r2(revenu - ir + ik),
    detail: [`Cotisations TNS ≈ ${Math.round(tauxTns * 100)} % du revenu net`, 'Vos charges réelles (et frais km) sont déductibles', `Bénéfice imposable : ${revenu} €`, ...(ik ? [`Indemnités km déduites : ${ik} € (déductibles, sans dépense de trésorerie)`] : [])],
  };
}

/** Balaye la rémunération nette versée et retient celle qui maximise ce qui reste au dirigeant (bénéfice restant distribué en dividendes). */
function meilleurMix(P, evaluer, nMax) {
  let best = null;
  const pas = Math.max(25, nMax / 240);
  for (let n = 0; n <= nMax + 1e-9; n += pas) { const r = evaluer(Math.min(n, nMax)); if (!best || r.net > best.net) best = r; }
  return best;
}

export function simEURL({ ca, charges, compta, ik = 0, tauxTns, capital, foyer, year }) {
  const P = ca - charges - compta - ik; // IK remboursées au gérant par la société : déductibles, perçues en net par lui
  const c = tauxTns / (1 + tauxTns);
  const base = { id: 'eurl', label: 'EURL à l\'IS', possible: true, ca, charges, comptabilite: compta };
  if (P <= 0) return { ...base, cotisations: 0, impotSocietes: 0, impotRevenu: 0, dividendes: 0, remuneration: 0, resteSociete: 0, net: r2(P + ik), detail: ['Pas de bénéfice'] };
  const franchise = Math.max(0, capital) * 0.10; // dividendes au-delà de 10 % du capital : soumis aux cotisations TNS
  const evaluer = (N) => {
    const cotis = r2(Math.max(COTIS_MIN_TNS, tauxTns * N)); // cotisations ≈ tauxTns × rémunération nette
    const benefice = Math.max(0, P - N - cotis);
    const is = impotSocietes(benefice);
    const D = benefice - is;
    const flat = Math.min(D, franchise), exces = D - flat;
    const cotisExces = exces * c;
    const revenuImposable = N + exces - cotisExces;
    const ir = irActivite(revenuImposable, foyer, year);
    const pfu = flat * PFU;
    return { ...base, remuneration: r2(N), cotisations: r2(cotis + cotisExces), impotSocietes: is, impotRevenu: r2(ir + pfu), dividendes: r2(D), resteSociete: 0,
      net: r2(N + exces - cotisExces - ir + flat - pfu + ik),
      detail: [`Rémunération nette ${r2(N)} € (cotisations TNS ≈ ${Math.round(tauxTns * 100)} %)`, `IS 15 % / 25 % : ${is} €`, `Dividendes ${r2(D)} € dont ${r2(exces)} € au-delà de 10 % du capital (soumis aux cotisations)`] };
  };
  return meilleurMix(P, evaluer, Math.max(0, (P - COTIS_MIN_TNS) / (1 + tauxTns))) || evaluer(0);
}

export function simSASU({ ca, charges, compta, ik = 0, foyer, year }) {
  const P = ca - charges - compta - ik;
  const base = { id: 'sasu', label: 'SASU', possible: true, ca, charges, comptabilite: compta };
  if (P <= 0) return { ...base, cotisations: 0, impotSocietes: 0, impotRevenu: 0, dividendes: 0, remuneration: 0, resteSociete: 0, net: r2(P + ik), detail: ['Pas de bénéfice'] };
  const k = 1 + RATIO_SASU;
  const evaluer = (N) => {
    const cout = N * k;
    const benefice = Math.max(0, P - cout);
    const is = impotSocietes(benefice);
    const D = benefice - is;
    const ir = irActivite(N * IMPOSABLE_SALAIRE, foyer, year);
    const pfu = D * PFU;
    return { ...base, remuneration: r2(N), cotisations: r2(N * RATIO_SASU), impotSocietes: is, impotRevenu: r2(ir + pfu), dividendes: r2(D), resteSociete: 0,
      net: r2(N - ir + D - pfu + ik),
      detail: [`Salaire net ${r2(N)} € (charges ≈ ${Math.round(RATIO_SASU * 100)} % du net)`, `IS 15 % / 25 % : ${is} €`, `Dividendes ${r2(D)} € au PFU de 31,4 %, sans cotisations sociales`] };
  };
  return meilleurMix(P, evaluer, P / k) || evaluer(0);
}

/** Valeurs par défaut des paramètres de simulation. */
export const SIMU_DEFAUT = { couple: false, enfants: 0, autresRevenus: 0, tauxTns: 45, comptaEI: 1000, comptaEURL: 2000, comptaSASU: 2500, capital: 1000, inclureKm: true, ca: null, charges: null };

/** Lance toutes les simulations. entrees : { ca, charges, chargesKm, forme, year, plafond, simu } */
export function comparer({ ca, charges, chargesKm = 0, forme, year, plafond, simu }) {
  const s = { ...SIMU_DEFAUT, ...(simu || {}) };
  const foyer = { couple: !!s.couple, enfants: s.enfants, autresRevenus: s.autresRevenus };
  const tauxTns = (Number(s.tauxTns) || 0) / 100;
  const ik = s.inclureKm ? chargesKm : 0; // indemnités kilométriques : déductibles seulement hors micro
  const res = [
    simMicro({ ca, charges, forme, year, foyer, plafond }),
    simEI({ ca, charges, ik, compta: Number(s.comptaEI) || 0, tauxTns, foyer, year }),
    simEURL({ ca, charges, ik, compta: Number(s.comptaEURL) || 0, tauxTns, capital: Number(s.capital) || 0, foyer, year }),
    simSASU({ ca, charges, ik, compta: Number(s.comptaSASU) || 0, foyer, year }),
  ];
  const valides = res.filter((r) => r.possible);
  const meilleur = valides.reduce((b, r) => (!b || r.net > b.net ? r : b), null);
  return { resultats: res, meilleur, micro: res[0] };
}

/** Courbe : ce qui reste selon le CA, à charges proportionnelles. Retourne aussi le CA à partir duquel une autre structure dépasse la micro. */
export function balayage({ ca, charges, chargesKm = 0, forme, year, plafond, simu, max }) {
  const ratio = ca > 0 ? charges / ca : 0, ratioKm = ca > 0 ? chargesKm / ca : 0;
  const haut = max || Math.max(ca * 1.6, 60000);
  const xs = [], series = { micro: [], ei: [], eurl: [], sasu: [] };
  let seuil = null;
  for (let x = 10000; x <= haut; x += 2500) {
    const r = comparer({ ca: x, charges: x * ratio, chargesKm: x * ratioKm, forme, year, plafond, simu });
    xs.push(x); r.resultats.forEach((q) => series[q.id].push(q.net));
    const alt = Math.max(r.resultats[1].net, r.resultats[2].net, r.resultats[3].net);
    if (seuil === null && alt > r.micro.net) seuil = x;
  }
  return { xs, series, seuil };
}
