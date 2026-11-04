// Logique métier pure (aucun accès au navigateur) : testable sous Node.
export const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export const CATEGORIES = {
  repas: 'Repas',
  transport: 'Transport',
  km: 'Frais kilométriques',
  fournitures: 'Fournitures / matériel',
  services: 'Abonnements / logiciels',
  autre: 'Autre',
  urssaf: 'Paiement URSSAF',
  perso: 'Virement perso',
};
// Ces deux catégories ne sont pas des dépenses professionnelles (comme dans le fichier Excel).
export const HORS_DEPENSES = ['urssaf', 'perso'];

export const MODES = ['Chèque', 'Espèces', 'Virement', 'Prélèvement', 'Carte bancaire'];

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const pad2 = (n) => String(n).padStart(2, '0');

export function defaultSettings() {
  return {
    nom: '', siret: '', adresse: '', activite: '',
    defaultRate: 21.3,       // taux de cotisations URSSAF (%), repris du fichier Excel
    rates: {},               // taux par année : { "2026": 21.3 }
    periodicite: 'mensuelle', // ou 'trimestrielle'
    tvaAssujetti: false,     // false = franchise en base de TVA : la TVA n'apparaît nulle part
    tvaSimAffiche: true,     // en franchise : afficher (ou non) la simulation de TVA
    tvaTaux: 0,              // taux de TVA proposé par défaut sur les factures (0 = sans TVA)
    kmRate: 0,               // €/km proposé par défaut (saisie manuelle)
    kmCv: 0,                 // puissance fiscale du véhicule (3 à 7) : 0 = calcul manuel ; sinon barème kilométrique automatique
    kmElec: false,           // véhicule électrique (barème majoré de 20 %)
    tjm: 300,                // taux journalier moyen (€), repris du fichier Excel (CA ÷ 300)
    tvaSimTaux: 20,          // simulation de TVA (sortie de la franchise) : taux appliqué
    tvaSimMode: 'ajoutee',   // 'ajoutee' : la TVA s'ajoute aux prix actuels ; 'incluse' : elle est déjà comprise dans les prix
    seuilTva: 37200,         // seuil de franchise de TVA (€) : 124 jours × 300 € dans le fichier Excel
    lastBackup: null,
  };
}

export const rateFor = (settings, year) =>
  settings.rates && settings.rates[year] != null && settings.rates[year] !== '' ? Number(settings.rates[year]) : Number(settings.defaultRate);

/** Assujetti à la TVA (hors franchise en base) : coché dans les réglages. */
export const isAssujetti = (settings) => !!(settings && settings.tvaAssujetti);

/** Hors assujettissement (`actif` faux) : aucune TVA, TTC = HT. */
export function factureAmounts(f, actif = true) {
  const ht = round2(f.montantHT);
  const tva = actif ? round2(ht * (Number(f.tvaTaux) || 0) / 100) : 0;
  return { ht, tva, ttc: round2(ht + tva) };
}

/** Hors assujettissement, la TVA des achats n'est pas récupérable : le coût réel est le TTC. */
export function expenseAmounts(d, actif = true) {
  const ttc = round2(d.montantTTC);
  const tva = actif ? round2(d.montantTVA) : 0;
  return { ttc, tva, ht: round2(ttc - tva) };
}

const prefix = (year, month) => (month ? `${year}-${pad2(month)}` : `${year}-`);

/** Recettes ENCAISSÉES : on classe par date d'encaissement (règle du livre des recettes / URSSAF). */
export function recettes(data, year, month) {
  const pre = prefix(year, month);
  const out = [];
  for (const mission of data.missions) {
    for (const f of mission.factures || []) {
      if (f.dateEncaissement && f.dateEncaissement.startsWith(pre)) {
        out.push({ mission, facture: f, date: f.dateEncaissement, ...factureAmounts(f, isAssujetti(data.settings)) });
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || String(a.facture.numero).localeCompare(String(b.facture.numero)));
  return out;
}

export function depenses(data, year, month) {
  const pre = prefix(year, month);
  return data.depenses
    .filter((d) => d.date && d.date.startsWith(pre))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const sumRecettes = (list) => ({
  ht: round2(list.reduce((s, r) => s + r.ht, 0)),
  tva: round2(list.reduce((s, r) => s + r.tva, 0)),
  ttc: round2(list.reduce((s, r) => s + r.ttc, 0)),
});

export function summarize(data, year, month) {
  const rec = sumRecettes(recettes(data, year, month));
  const rate = rateFor(data.settings, year);
  const deps = depenses(data, year, month);
  const actif = isAssujetti(data.settings);
  const pro = deps.filter((d) => !HORS_DEPENSES.includes(d.categorie));
  const depensesHT = round2(pro.reduce((s, d) => s + expenseAmounts(d, actif).ht, 0));
  const depensesTTC = round2(pro.reduce((s, d) => s + expenseAmounts(d, actif).ttc, 0));
  const urssafPaye = round2(deps.filter((d) => d.categorie === 'urssaf').reduce((s, d) => s + expenseAmounts(d).ttc, 0));
  const perso = round2(deps.filter((d) => d.categorie === 'perso').reduce((s, d) => s + expenseAmounts(d).ttc, 0));
  const urssafDu = round2(rec.ht * rate / 100);
  return {
    recettesHT: rec.ht, recettesTVA: rec.tva, recettesTTC: rec.ttc,
    depensesHT, depensesTTC, urssafDu, urssafPaye, perso, rate,
    tresorerie: round2(rec.ht - depensesHT - urssafDu),
  };
}

export function summarizeYear(data, year) {
  const months = [];
  for (let m = 1; m <= 12; m++) months.push({ month: m, ...summarize(data, year, m) });
  const tot = (k) => round2(months.reduce((s, x) => s + x[k], 0));
  return {
    months,
    total: {
      recettesHT: tot('recettesHT'), recettesTVA: tot('recettesTVA'), recettesTTC: tot('recettesTTC'),
      depensesHT: tot('depensesHT'), depensesTTC: tot('depensesTTC'),
      urssafDu: tot('urssafDu'), urssafPaye: tot('urssafPaye'), perso: tot('perso'), tresorerie: tot('tresorerie'),
      rate: rateFor(data.settings, year),
    },
  };
}

const lastDay = (y, m) => new Date(y, m, 0).getDate();

/** Périodes de déclaration URSSAF (mensuelle ou trimestrielle) avec échéance habituelle. */
export function periodes(data, year, periodicite) {
  const out = [];
  const step = periodicite === 'trimestrielle' ? 3 : 1;
  for (let start = 1; start <= 12; start += step) {
    const end = start + step - 1;
    let ht = 0;
    const lignes = [];
    for (let m = start; m <= end; m++) {
      const r = recettes(data, year, m);
      lignes.push(...r);
      ht += sumRecettes(r).ht;
    }
    ht = round2(ht);
    const rate = rateFor(data.settings, year);
    // échéance habituelle : dernier jour du mois suivant la fin de la période
    let ey = year, em = end + 1;
    if (em > 12) { em = 1; ey += 1; }
    const echeance = `${ey}-${pad2(em)}-${pad2(lastDay(ey, em))}`;
    out.push({
      start, end, ht, rate, du: round2(ht * rate / 100), lignes, echeance,
      label: step === 1 ? MOIS[start - 1] : `T${(start - 1) / 3 + 1} (${MOIS[start - 1].slice(0, 3)}.–${MOIS[end - 1].slice(0, 3)}.)`,
    });
  }
  return out;
}

/** Factures émises mais pas encore encaissées. */
export function enAttente(data) {
  const out = [];
  for (const mission of data.missions) {
    for (const f of mission.factures || []) {
      if (!f.dateEncaissement && Number(f.montantHT) > 0) out.push({ mission, facture: f, ...factureAmounts(f, isAssujetti(data.settings)) });
    }
  }
  out.sort((a, b) => String(a.facture.date).localeCompare(String(b.facture.date)));
  return out;
}

export function missionStats(m) {
  const devisHT = round2((m.devis || []).reduce((s, d) => s + (Number(d.montantHT) || 0), 0));
  const factures = (m.factures || []).map(factureAmounts);
  const factureHT = round2(factures.reduce((s, f) => s + f.ht, 0));
  const encaisseHT = round2((m.factures || []).filter((f) => f.dateEncaissement).reduce((s, f) => s + factureAmounts(f).ht, 0));
  return { devisHT, factureHT, encaisseHT, resteAFacturer: round2(devisHT - factureHT), resteAEncaisser: round2(factureHT - encaisseHT) };
}

export function nextFactureNumber(data, year) {
  let max = 0;
  for (const m of data.missions) {
    for (const f of m.factures || []) {
      const r = /^F(\d{4})-(\d+)$/.exec(f.numero || '');
      if (r && Number(r[1]) === Number(year)) max = Math.max(max, Number(r[2]));
    }
  }
  return `F${year}-${String(max + 1).padStart(3, '0')}`;
}

export function yearsInData(data, extra = []) {
  const ys = new Set(extra.map(Number));
  const take = (iso) => { if (iso && /^\d{4}/.test(iso)) ys.add(Number(iso.slice(0, 4))); };
  for (const m of data.missions) {
    if (m.annee) ys.add(Number(m.annee));
    (m.devis || []).forEach((d) => take(d.dateSignature));
    (m.factures || []).forEach((f) => { take(f.date); take(f.dateEncaissement); });
  }
  data.depenses.forEach((d) => take(d.date));
  return [...ys].filter(Boolean).sort((a, b) => a - b);
}

/** Marge avant le seuil de franchise de TVA (équivalent de « Nbre de jour restant avant TVA » du fichier Excel). */
export function margeTva(data, year) {
  const s = data.settings;
  const ca = summarizeYear(data, year).total.recettesHT;
  const seuil = Number(s.seuilTva) || 0;
  const tjm = Number(s.tjm) || 0;
  const reste = round2(seuil - ca);
  return { ca, seuil, reste, jours: tjm > 0 ? Math.round((reste / tjm) * 10) / 10 : null, tjm };
}

/** Date retenue pour situer un devis dans le temps : mois de réalisation prévu, sinon date de signature. */
export const devisDate = (d) => d.datePrevue || d.dateSignature || '';

/**
 * Suivi mensuel « travail prévu / facturé / encaissé » : le devis compte dans le mois où le travail est prévu
 * (ou signé), l'encaissement dans le mois où l'argent arrive. L'écart cumulé = ce qui est travaillé mais pas encore en trésorerie.
 */
export function suiviMois(data, year) {
  const out = [];
  let cumul = 0;
  for (let m = 1; m <= 12; m++) {
    const pre = `${year}-${pad2(m)}`;
    const devis = [];
    for (const mission of data.missions) {
      for (const d of mission.devis || []) {
        if (devisDate(d).startsWith(pre)) {
          const enc = {};
          for (const f of mission.factures || []) {
            if (f.dateEncaissement) enc[f.dateEncaissement.slice(0, 7)] = round2((enc[f.dateEncaissement.slice(0, 7)] || 0) + factureAmounts(f).ht);
          }
          devis.push({ mission, devis: d, montant: round2(d.montantHT), encaissements: enc });
        }
      }
    }
    const devisHT = round2(devis.reduce((s, x) => s + x.montant, 0));
    let factureHT = 0;
    for (const mission of data.missions) for (const f of mission.factures || []) if ((f.date || '').startsWith(pre)) factureHT += factureAmounts(f).ht;
    factureHT = round2(factureHT);
    const sm = summarize(data, year, m);
    const encaisseHT = sm.recettesHT;
    cumul = round2(cumul + devisHT - encaisseHT);
    out.push({ month: m, devisHT, factureHT, encaisseHT, perso: sm.perso, ecartCumule: cumul, devis });
  }
  return out;
}

/**
 * Simulation de TVA si vous n'étiez plus en franchise : TVA collectée sur les encaissements (exigible à l'encaissement
 * pour les prestations de services) moins TVA déductible sur les dépenses professionnelles du mois.
 * Une facture qui porte déjà un taux de TVA garde sa vraie TVA ; les autres sont simulées au taux `tvaSimTaux`.
 */
export function simulationTva(data, year) {
  const st = data.settings;
  const taux = st.tvaSimTaux === '' || st.tvaSimTaux == null ? 20 : Number(st.tvaSimTaux);
  const incluse = st.tvaSimMode === 'incluse';
  const reel = isAssujetti(st); // assujetti : TVA réelle des factures ; sinon : simulation
  const months = [];
  let cumul = 0;
  for (let m = 1; m <= 12; m++) {
    let collectee = 0;
    for (const r of recettes(data, year, m)) {
      collectee += reel ? r.tva : (incluse ? r.ht * taux / (100 + taux) : r.ht * taux / 100);
    }
    collectee = round2(collectee);
    const deductible = round2(depenses(data, year, m).filter((d) => !HORS_DEPENSES.includes(d.categorie)).reduce((a, d) => a + round2(d.montantTVA), 0));
    const aReverser = round2(collectee - deductible);
    cumul = round2(cumul + aReverser);
    months.push({ month: m, collectee, deductible, aReverser, cumul });
  }
  const tot = (k) => round2(months.reduce((a, x) => a + x[k], 0));
  return { taux, incluse, reel, months, total: { collectee: tot('collectee'), deductible: tot('deductible'), aReverser: tot('aReverser') } };
}

/**
 * Relevés de banque à imprimer pour un mois (ou toute l'année) : le relevé du mois lui-même, plus celui du mois
 * précédent / suivant quand la case correspondante est cochée (des encaissements y figurent). Gère le changement d'année.
 */
export function relevesAImprimer(releves, year, month) {
  const byId = new Map(releves.map((r) => [r.id, r]));
  const key = (y, m) => `${y}-${pad2(m)}`;
  const shift = (y, m, d) => { let mm = m + d; let yy = y; if (mm < 1) { mm = 12; yy -= 1; } if (mm > 12) { mm = 1; yy += 1; } return { y: yy, m: mm }; };
  const out = new Map();
  const add = (y, m, raison) => {
    const k = key(y, m);
    if (!out.has(k)) out.set(k, { id: k, year: y, month: m, fileIds: (byId.get(k) || {}).fileIds || [], raisons: [] });
    if (raison) out.get(k).raisons.push(raison);
  };
  const months = month ? [Number(month)] : Array.from({ length: 12 }, (_, i) => i + 1);
  for (const m of months) {
    const r = byId.get(key(year, m));
    if (!r) continue;
    if ((r.fileIds || []).length) add(year, m, null);
    if (r.surPrecedent) { const t = shift(year, m, -1); add(t.y, t.m, { mois: m, year }); }
    if (r.surSuivant) { const t = shift(year, m, 1); add(t.y, t.m, { mois: m, year }); }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** CA encaissé (HT) de l'année par client, trié du plus important au plus petit. Au-delà de `max` clients, le reste est regroupé en « Autres ». */
export function caParClient(data, year, max = 7) {
  const map = new Map();
  for (const r of recettes(data, year)) {
    const name = (r.mission.client || '').trim() || 'Sans nom';
    const key = name.toLowerCase();
    const cur = map.get(key) || { client: name, montant: 0, missionIds: new Set() };
    cur.montant = round2(cur.montant + r.ht);
    cur.missionIds.add(r.mission.id);
    map.set(key, cur);
  }
  let list = [...map.values()].filter((x) => x.montant > 0).sort((a, b) => b.montant - a.montant || a.client.localeCompare(b.client));
  if (list.length > max) {
    const rest = list.slice(max);
    list = [...list.slice(0, max), { client: 'Autres', montant: round2(rest.reduce((s, x) => s + x.montant, 0)), autres: rest.length, missionIds: new Set() }];
  }
  const total = round2(list.reduce((s, x) => s + x.montant, 0));
  return list.map((x) => ({ client: x.client, montant: x.montant, part: total ? x.montant / total : 0, autres: x.autres || 0, missionId: x.missionIds.size === 1 ? [...x.missionIds][0] : null }));
}

/** CA encaissé cumulé mois par mois (pour suivre la progression vers le seuil de TVA). */
export function caCumule(data, year) {
  let cum = 0;
  return summarizeYear(data, year).months.map((m) => { cum = round2(cum + m.recettesHT); return { month: m.month, cumul: cum }; });
}
