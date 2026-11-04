// Impression : récapitulatif, livres des recettes / dépenses et justificatifs, par mois ou par année.
import { state } from './state.js';
import { MOIS, CATEGORIES, HORS_DEPENSES, recettes, depenses, sumRecettes, summarize, summarizeYear, expenseAmounts, margeTva, rateFor, round2, suiviMois, isAssujetti, relevesAImprimer } from './calc.js';
import { esc, eur, fmtDate, today, pct } from './util.js';
import { getFile, pdfToImages } from './files.js';
import { toast } from './ui.js';
import { tvaHtml } from './tva-view.js';
import { chartsHtml } from './charts.js';

const $ = (s) => document.querySelector(s);

/* ===================== Page « Imprimer » ===================== */
export function render() {
  const { year } = state;
  const now = new Date();
  const defMonth = now.getFullYear() === year ? now.getMonth() + 1 : 0;
  const html = `
    <h1>Imprimer</h1>
    <p class="muted">Choisissez la période et les documents. Un aperçu s'ouvre : « Imprimer » permet aussi d'<strong>enregistrer en PDF</strong> (ordinateur et Android).</p>
    <form class="form card" id="pf">
      <label class="field"><span>Période</span>
        <select name="month"><option value="0"${defMonth === 0 ? ' selected' : ''}>Année ${year} complète</option>
        ${MOIS.map((n, i) => `<option value="${i + 1}"${defMonth === i + 1 ? ' selected' : ''}>${n} ${year}</option>`).join('')}</select></label>
      <fieldset><legend>Récapitulatifs</legend>
        <label class="check"><input type="checkbox" name="recap" checked> Récapitulatif (recettes, dépenses, URSSAF, trésorerie)</label>
        <label class="check"><input type="checkbox" name="livreRec" checked> Livre chronologique des recettes (classé par date d'encaissement)</label>
        <label class="check"><input type="checkbox" name="livreDep" checked> Livre chronologique des dépenses</label>
      </fieldset>
      <fieldset><legend>Justificatifs (une pièce par page)</legend>
        <label class="check"><input type="checkbox" name="jFac" checked> Factures encaissées sur la période</label>
        <label class="check"><input type="checkbox" name="jDevis"> Devis signés des missions concernées</label>
        <label class="check"><input type="checkbox" name="jDep" checked> Justificatifs des dépenses</label>
        <label class="check"><input type="checkbox" name="jRel" checked> Relevés de banque (celui du mois + le mois précédent / suivant s'ils sont cochés)</label>
      </fieldset>
      <div class="form-actions"><button class="btn primary">👁 Aperçu et impression</button></div>
    </form>`;
  return {
    html,
    bind(root) {
      root.querySelector('#pf').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const opts = Object.fromEntries(['recap', 'livreRec', 'livreDep', 'jFac', 'jDevis', 'jDep', 'jRel'].map((k) => [k, fd.has(k)]));
        if (!Object.values(opts).some(Boolean)) { toast('Cochez au moins un document', 'err'); return; }
        openPrint({ year, month: Number(fd.get('month')), opts });
      });
    },
  };
}

/* ===================== Construction des feuilles ===================== */
const periodLabel = (year, month) => (month ? `${MOIS[month - 1]} ${year}` : `Année ${year}`);

function docHead(title, year, month) {
  const s = state.data.settings;
  return `<div class="doc-head"><div><h1>${esc(title)}</h1><div class="muted">${esc(periodLabel(year, month))}</div></div>
    <div class="muted right">${esc(s.nom || '')}${s.activite ? `<br>${esc(s.activite)}` : ''}${s.siret ? `<br>SIRET ${esc(s.siret)}` : ''}${s.adresse ? `<br>${esc(s.adresse)}` : ''}<br>Édité le ${fmtDate(today())}</div></div>`;
}

function recapSheet(year, month) {
  const { data } = state;
  const t = margeTva(data, year);
  if (!month) {
    const ys = summarizeYear(data, year);
    const rows = ys.months.map((m) => `<tr><td>${MOIS[m.month - 1]}</td><td class="num">${eur(m.recettesHT)}</td><td class="num">${eur(m.depensesHT)}</td><td class="num">${eur(m.urssafDu)}</td><td class="num">${eur(m.tresorerie)}</td><td class="num">${eur(m.perso)}</td></tr>`).join('');
    const x = ys.total;
    return { land: false, html: `${docHead('Récapitulatif annuel', year, 0)}
      <div class="table-wrap"><table><thead><tr><th>Mois</th><th>Recettes HT</th><th>Dépenses HT</th><th>URSSAF (${pct(x.rate)} %)</th><th>Trésorerie</th><th>Vir. perso</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>TOTAL</td><td class="num">${eur(x.recettesHT)}</td><td class="num">${eur(x.depensesHT)}</td><td class="num">${eur(x.urssafDu)}</td><td class="num">${eur(x.tresorerie)}</td><td class="num">${eur(x.perso)}</td></tr></tfoot></table></div>
      ${chartsHtml(data, year)}
      <h2>Travail prévu et argent encaissé</h2>
      <div class="table-wrap"><table><thead><tr><th>Mois</th><th>Devis prévus HT</th><th>Facturé HT</th><th>Encaissé HT</th><th>Vir. perso</th><th>Écart cumulé</th></tr></thead><tbody>
      ${suiviMois(data, year).map((x) => `<tr><td>${MOIS[x.month - 1]}</td><td class="num">${eur(x.devisHT)}</td><td class="num">${eur(x.factureHT)}</td><td class="num">${eur(x.encaisseHT)}</td><td class="num">${eur(x.perso)}</td><td class="num">${eur(x.ecartCumule)}</td></tr>`).join('')}</tbody></table></div>
      ${tvaHtml(data, year)}
      <p class="muted">Recettes = factures encaissées dans le mois (date d'encaissement), hors TVA. Dépenses hors paiements URSSAF et virements personnels. Trésorerie = recettes − dépenses − cotisations URSSAF dues.</p>
      <p>Cotisations URSSAF payées sur l'année : <strong>${eur(x.urssafPaye)}</strong> · reste estimé : <strong>${eur(round2(x.urssafDu - x.urssafPaye))}</strong>
      ${!isAssujetti(data.settings) && t.seuil ? `<br>Marge avant le seuil de franchise de TVA (${eur(t.seuil)}) : <strong>${t.reste >= 0 ? eur(t.reste) : 'seuil dépassé de ' + eur(-t.reste)}</strong>${t.reste >= 0 && t.jours != null ? ` (≈ ${String(t.jours).replace('.', ',')} jours à ${eur(t.tjm)})` : ''}` : ''}</p>` };
  }
  const s = summarize(data, year, month);
  const tvaOn = isAssujetti(data.settings);
  const line = (l, v, strong) => `<tr><td${strong ? ' class="strong"' : ''}>${l}</td><td class="num${strong ? ' strong' : ''}">${v}</td></tr>`;
  return { land: false, html: `${docHead('Récapitulatif mensuel', year, month)}
    <div class="table-wrap"><table><tbody>
      ${line('Recettes encaissées HT (chiffre d\'affaires à déclarer)', eur(s.recettesHT), true)}
      ${tvaOn ? line('dont TVA collectée', eur(s.recettesTVA)) + line('Recettes encaissées TTC', eur(s.recettesTTC)) : ''}
      ${line(`Cotisations URSSAF dues (${pct(s.rate)} %)`, eur(s.urssafDu))}
      ${line('Cotisations URSSAF payées ce mois', eur(s.urssafPaye))}
      ${line('Dépenses HT (hors URSSAF et virements perso)', eur(s.depensesHT))}
      ${line('Virements personnels', eur(s.perso))}
      ${line('Solde du mois (recettes − dépenses − URSSAF dû)', eur(s.tresorerie), true)}
    </tbody></table></div>` };
}

function byMonth(list, getDate) {
  const groups = new Map();
  for (const x of list) {
    const m = Number(getDate(x).slice(5, 7));
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(x);
  }
  return [...groups].sort((a, b) => a[0] - b[0]);
}

function recettesSheet(year, month) {
  const { data } = state;
  const tvaOn = isAssujetti(data.settings);
  const rate = rateFor(data.settings, year);
  const list = recettes(data, year, month || null);
  const amounts = (x) => (tvaOn ? `<td class="num">${eur(x.ht)}</td><td class="num">${eur(x.ttc)}</td><td class="num">${eur(x.tva)}</td>` : `<td class="num">${eur(x.ht)}</td>`);
  const row = (r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.facture.numero)}<div class="muted">${fmtDate(r.facture.date)}</div></td><td>${esc(r.mission.client)}</td><td>${esc(r.mission.adresse || '')}</td><td>${esc(r.mission.siret || '')}</td><td>${esc(r.mission.nature || r.mission.ref || '')}</td>
    ${amounts(r)}<td>${esc(r.facture.mode || '')}</td><td class="num">${eur(round2(r.ht * rate / 100))}</td></tr>`;
  const sub = (label, rs) => { const t = sumRecettes(rs); return `<tr class="sub"><td colspan="6">${label}</td>${amounts(t)}<td></td><td class="num">${eur(round2(t.ht * rate / 100))}</td></tr>`; };
  let body = '';
  if (month) body = list.map(row).join('');
  else for (const [m, rs] of byMonth(list, (r) => r.date)) body += rs.map(row).join('') + sub(`Total ${MOIS[m - 1]}`, rs);
  const tot = sumRecettes(list);
  const heads = tvaOn ? '<th>Montant HT</th><th>Montant TTC</th><th>TVA</th>' : '<th>Montant</th>';
  return { land: true, html: `${docHead('Livre chronologique des recettes', year, month)}
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date d'encaissement</th><th>Réf. pièce / date facture</th><th>Client</th><th>Adresse</th><th>SIRET</th><th>Nature</th>${heads}<th>Mode d'encaissement</th><th>URSSAF ${pct(rate)} %</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="6">TOTAL RECETTES ENCAISSÉES</td>${amounts(tot)}<td></td><td class="num">${eur(round2(tot.ht * rate / 100))}</td></tr></tfoot></table></div>`
      : '<p class="muted">Aucune recette encaissée sur cette période.</p>'}` };
}

function depensesSheet(year, month) {
  const { data } = state;
  const tvaOn = isAssujetti(data.settings);
  const list = depenses(data, year, month || null);
  const amounts = (a) => (tvaOn ? `<td class="num">${eur(a.ht)}</td><td class="num">${eur(a.tva)}</td><td class="num">${eur(a.ttc)}</td>` : `<td class="num">${eur(a.ttc)}</td>`);
  const row = (d) => {
    const a = expenseAmounts(d, tvaOn);
    return `<tr><td>${fmtDate(d.date)}</td><td>${esc(d.reference || '')}</td><td>${esc(d.fournisseur)}<div class="muted">${esc(d.designation || '')}${d.categorie === 'km' ? ` (${d.km} km × ${d.tauxKm} €)` : ''}</div></td>
      <td>${esc(CATEGORIES[d.categorie] || d.categorie)}</td>${amounts(a)}<td>${esc(d.mode || '')}</td><td>${(d.fileIds || []).length ? 'oui' : 'non'}</td></tr>`;
  };
  const totals = (rs) => {
    const pro = rs.filter((d) => !HORS_DEPENSES.includes(d.categorie)).map((d) => expenseAmounts(d, tvaOn));
    return { ht: round2(pro.reduce((s, a) => s + a.ht, 0)), tva: round2(pro.reduce((s, a) => s + a.tva, 0)), ttc: round2(pro.reduce((s, a) => s + a.ttc, 0)) };
  };
  const sub = (label, rs) => `<tr class="sub"><td colspan="4">${label}</td>${amounts(totals(rs))}<td colspan="2"></td></tr>`;
  let body = '';
  if (month) body = list.map(row).join('');
  else for (const [m, rs] of byMonth(list, (d) => d.date)) body += rs.map(row).join('') + sub(`Total ${MOIS[m - 1]}`, rs);
  const heads = tvaOn ? '<th>Montant HT</th><th>TVA</th><th>Montant TTC</th>' : '<th>Montant</th>';
  return { land: true, html: `${docHead('Livre chronologique des dépenses', year, month)}
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Réf. pièce</th><th>Fournisseur, désignation</th><th>Nature</th>${heads}<th>Mode de paiement</th><th>Justificatif</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="4">TOTAL DÉPENSES PROFESSIONNELLES (hors URSSAF et virements perso)</td>${amounts(totals(list))}<td colspan="2"></td></tr></tfoot></table></div>`
      : '<p class="muted">Aucune dépense sur cette période.</p>'}` };
}

/** Liste des justificatifs à imprimer, dans l'ordre chronologique. */
function collectPieces(year, month, opts) {
  const { data } = state;
  const tvaOn = isAssujetti(data.settings);
  const pieces = [];
  const rec = recettes(data, year, month || null);
  if (opts.jFac) {
    for (const r of rec) pieces.push({ date: r.date, kind: 'Facture', title: `Facture ${r.facture.numero} — ${r.mission.client}`,
      meta: `${tvaOn ? `${eur(r.ht)} HT · ${eur(r.ttc)} TTC` : eur(r.ht)} · émise le ${fmtDate(r.facture.date)} · encaissée le ${fmtDate(r.date)}${r.facture.mode ? ` (${r.facture.mode})` : ''}`, fileIds: [r.facture.fileId] });
  }
  if (opts.jDevis) {
    const seen = new Set();
    for (const r of rec) {
      for (const d of r.mission.devis || []) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        pieces.push({ date: d.dateSignature || r.date, kind: 'Devis', title: `Devis ${d.numero || ''} signé — ${r.mission.client}`, meta: `${eur(d.montantHT)} HT · signé le ${fmtDate(d.dateSignature)}`, fileIds: [d.fileId] });
      }
    }
  }
  if (opts.jDep) {
    for (const d of depenses(data, year, month || null)) {
      if (HORS_DEPENSES.includes(d.categorie) && !(d.fileIds || []).length) continue;
      const a = expenseAmounts(d, tvaOn);
      pieces.push({ date: d.date, kind: 'Dépense', title: `${d.fournisseur}${d.designation ? ' — ' + d.designation : ''}`, meta: `${fmtDate(d.date)} · ${eur(a.ttc)}${tvaOn ? ' TTC' : ''} · ${CATEGORIES[d.categorie] || d.categorie}${d.mode ? ' · ' + d.mode : ''}`, fileIds: d.fileIds || [] });
    }
  }
  if (opts.jRel) {
    for (const r of relevesAImprimer(data.releves || [], year, month)) {
      const raisons = r.raisons.map((x) => `des encaissements de ${MOIS[x.mois - 1]} ${x.year} y figurent`);
      pieces.push({ date: `${r.year}-${String(r.month).padStart(2, '0')}-31`, kind: 'Relevé de banque', title: `${MOIS[r.month - 1]} ${r.year}`,
        meta: raisons.length ? `Joint car ${raisons.join(' ; ')}` : 'Relevé bancaire du mois', fileIds: r.fileIds });
    }
  }
  return pieces;
}

async function pieceImages(fileId, urls) {
  if (!fileId) return '<p class="miss">⚠ Justificatif manquant (aucun fichier enregistré).</p>';
  const f = await getFile(fileId);
  if (!f) return '<p class="miss">⚠ Fichier introuvable.</p>';
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    try { return (await pdfToImages(f.blob)).map((src) => `<img src="${src}" alt="${esc(f.name)}">`).join(''); }
    catch { return `<p class="miss">⚠ PDF illisible : ${esc(f.name)}</p>`; }
  }
  const url = URL.createObjectURL(f.blob);
  urls.push(url);
  return `<img src="${url}" alt="${esc(f.name)}">`;
}

/* ===================== Aperçu / impression ===================== */
let wired = false;
let token = 0;
let urls = [];

function closePreview() {
  token++;
  $('#print-overlay').hidden = true;
  $('#print-root').innerHTML = '';
  document.body.classList.remove('modal-open');
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}

function wire() {
  if (wired) return;
  wired = true;
  $('#pvClose').addEventListener('click', closePreview);
  $('#pvPrint').addEventListener('click', () => window.print());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#print-overlay').hidden) closePreview(); });
}

export async function openPrint({ year, month, opts }) {
  wire();
  const my = ++token;
  const root = $('#print-root');
  const status = $('#pvStatus');
  const btn = $('#pvPrint');
  $('#print-overlay').hidden = false;
  document.body.classList.add('modal-open');
  root.innerHTML = '';
  btn.disabled = true;
  urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
  const add = (html, land = false) => { const s = document.createElement('section'); s.className = `sheet${land ? ' land' : ''}`; s.innerHTML = html; root.appendChild(s); return s; };

  try {
    status.textContent = 'Préparation…';
    if (opts.recap) { const s = recapSheet(year, month); add(s.html, s.land); }
    if (opts.livreRec) { const s = recettesSheet(year, month); add(s.html, s.land); }
    if (opts.livreDep) { const s = depensesSheet(year, month); add(s.html, s.land); }

    const pieces = collectPieces(year, month, opts);
    let n = 0;
    for (const p of pieces) {
      if (my !== token) return;
      status.textContent = `Justificatifs ${++n} / ${pieces.length}…`;
      const files = p.fileIds.length ? p.fileIds : [null];
      let imgs = '';
      for (const id of files) imgs += await pieceImages(id, urls);
      add(`<figure class="piece"><figcaption>${esc(p.kind)} — ${esc(p.title)}<div class="muted">${esc(p.meta)}</div></figcaption>${imgs}</figure>`);
    }
    if (my !== token) return;
    if (!root.children.length) add('<p class="muted">Rien à imprimer pour cette sélection.</p>');
    await Promise.all([...root.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
    status.textContent = `${root.children.length} page(s) de documents prêtes`;
    btn.disabled = false;
  } catch (e) {
    console.error(e);
    status.textContent = `Erreur : ${e.message || e}`;
  }
}
