import { state, hooks, saveDepense, deleteDepense } from './state.js';
import { MOIS, CATEGORIES, MODES, recettes, depenses, sumRecettes, summarize, expenseAmounts, rateFor, round2, HORS_DEPENSES, isAssujetti } from './calc.js';
import { esc, eur, fmtDate, today, uid, pct } from './util.js';
import { planKm, baremeFor, CV_LABELS, clampCv } from './bareme.js';
import { openModal, confirmBox, toast, field, options, FilePicker, viewFile } from './ui.js';

const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')));

function monthTabs(base, month) {
  const cur = Number(month) || 0;
  return `<div class="tabs scroll">
    <a class="${cur === 0 ? 'active' : ''}" href="#/${base}/0">Année</a>
    ${MOIS.map((n, i) => `<a class="${cur === i + 1 ? 'active' : ''}" href="#/${base}/${i + 1}">${n.slice(0, 4)}${n.length > 4 ? '.' : ''}</a>`).join('')}</div>`;
}

const defaultMonth = (year) => (year === new Date().getFullYear() ? new Date().getMonth() + 1 : 0);

/* ===================== Livre des recettes ===================== */
export function renderRecettes(params) {
  const { year, data } = state;
  const month = params[0] === undefined ? defaultMonth(year) : Number(params[0]);
  const list = recettes(data, year, month || null);
  const tot = sumRecettes(list);
  const rate = rateFor(data.settings, year);
  const tvaOn = isAssujetti(data.settings);
  const rows = list.map((r) => `<tr>
    <td>${fmtDate(r.date)}</td><td>${esc(r.facture.numero)}</td>
    <td><a href="#/mission/${r.mission.id}">${esc(r.mission.client)}</a></td>
    <td>${esc(r.mission.adresse || '')}</td><td>${esc(r.mission.siret || '')}</td><td>${esc(r.mission.nature || r.mission.ref || '')}</td>
    <td class="num">${eur(r.ht)}</td>${tvaOn ? `<td class="num">${eur(r.ttc)}</td><td class="num">${eur(r.tva)}</td>` : ''}<td>${esc(r.facture.mode || '')}</td></tr>`).join('');
  const title = month ? `${MOIS[month - 1]} ${year}` : `Année ${year}`;
  const html = `
    <h1>Livre chronologique des recettes</h1>
    ${monthTabs('recettes', month)}
    <h2>${title}</h2>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Encaissé le</th><th>N° pièce</th><th>Client</th><th>Adresse</th><th>SIRET</th><th>Nature</th><th class="num">${tvaOn ? 'HT' : 'Montant'}</th>${tvaOn ? '<th class="num">TTC</th><th class="num">TVA</th>' : ''}<th>Mode</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="6">TOTAL RECETTES ENCAISSÉES</td><td class="num">${eur(tot.ht)}</td>${tvaOn ? `<td class="num">${eur(tot.ttc)}</td><td class="num">${eur(tot.tva)}</td>` : ''}<td></td></tr></tfoot>
    </table></div>
    <p class="notice">À déclarer à l'URSSAF pour cette période : <strong>${eur(tot.ht)}</strong> de chiffre d'affaires · cotisations estimées à ${pct(rate)} % : <strong>${eur(round2(tot.ht * rate / 100))}</strong></p>`
      : '<p class="empty">Aucune recette encaissée sur cette période.<br><span class="muted">Une facture apparaît ici dès que sa date d\'encaissement est renseignée (fiche mission → Encaisser).</span></p>'}`;
  return { html, bind() {} };
}

/* ===================== Livre des dépenses ===================== */
export function renderDepenses(params) {
  const { year, data } = state;
  const month = params[0] === undefined ? defaultMonth(year) : Number(params[0]);
  const list = depenses(data, year, month || null);
  const tvaOn = isAssujetti(data.settings);
  const sansJust = list.filter((d) => !(d.fileIds || []).length && !HORS_DEPENSES.includes(d.categorie)).length;
  const rows = list.map((d) => {
    const a = expenseAmounts(d, tvaOn);
    const j = (d.fileIds || []).length
      ? `<button class="link" data-view="${d.fileIds[0]}">📎 ${d.fileIds.length}</button>`
      : (HORS_DEPENSES.includes(d.categorie) ? '<span class="muted">—</span>' : '<span class="badge warn">manquant</span>');
    return `<tr class="click" data-edit="${d.id}">
      <td>${fmtDate(d.date)}</td><td>${esc(d.fournisseur)}<div class="muted">${esc(d.designation || '')}</div></td>
      <td>${esc(CATEGORIES[d.categorie] || d.categorie)}</td>
      ${tvaOn ? `<td class="num">${eur(a.ht)}</td><td class="num">${eur(a.ttc)}</td><td class="num">${eur(a.tva)}</td>` : `<td class="num">${eur(a.ttc)}</td>`}<td>${esc(d.mode || '')}</td><td>${j}</td></tr>`;
  }).join('');

  const s = month ? summarize(data, year, month) : null;
  const byCat = {};
  for (const d of list) { byCat[d.categorie] = round2((byCat[d.categorie] || 0) + expenseAmounts(d).ttc); }
  const catLine = Object.entries(byCat).map(([k, v]) => `<span class="badge">${esc(CATEGORIES[k] || k)} : ${eur(v)}</span>`).join(' ');
  const totPro = round2(list.filter((d) => !HORS_DEPENSES.includes(d.categorie)).reduce((x, d) => x + expenseAmounts(d).ttc, 0));
  const title = month ? `${MOIS[month - 1]} ${year}` : `Année ${year}`;

  const html = `
    <div class="page-head"><h1>Livre chronologique des dépenses</h1><button class="btn primary" data-new>＋ Nouvelle dépense</button></div>
    ${monthTabs('depenses', month)}
    <h2>${title}</h2>
    ${sansJust ? `<div class="notice warn">⚠ ${sansJust} dépense(s) sans justificatif sur cette période. Ouvrez-la pour ajouter une photo ou un PDF.</div>` : ''}
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Fournisseur / désignation</th><th>Catégorie</th>${tvaOn ? '<th class="num">HT</th><th class="num">TTC</th><th class="num">TVA</th>' : '<th class="num">Montant</th>'}<th>Paiement</th><th>Justif.</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="${tvaOn ? 4 : 3}">TOTAL DÉPENSES PROFESSIONNELLES (TTC, hors URSSAF et virements perso)</td><td class="num">${eur(totPro)}</td><td colspan="${tvaOn ? 3 : 2}"></td></tr></tfoot>
    </table></div>
    <p>${catLine}</p>
    ${s ? `<p class="notice">Solde du mois : recettes HT ${eur(s.recettesHT)} − dépenses HT ${eur(s.depensesHT)} − URSSAF dû ${eur(s.urssafDu)} = <strong>${eur(s.tresorerie)}</strong></p>` : ''}`
      : '<p class="empty">Aucune dépense sur cette période.</p>'}`;

  return {
    html,
    bind(root) {
      root.querySelector('[data-new]').addEventListener('click', () => openDepenseForm(null, month));
      root.querySelectorAll('[data-edit]').forEach((tr) => tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-view]')) { viewFile(e.target.closest('[data-view]').dataset.view); return; }
        openDepenseForm(data.depenses.find((d) => d.id === tr.dataset.edit));
      }));
    },
  };
}

export function openDepenseForm(d = null, month = 0) {
  const { year, data } = state;
  const defDate = (() => {
    const t = today();
    if (month && Number(t.slice(0, 4)) === year && Number(t.slice(5, 7)) === month) return t;
    if (month) return `${year}-${String(month).padStart(2, '0')}-01`;
    return Number(t.slice(0, 4)) === year ? t : `${year}-01-01`;
  })();
  const cur = d || { date: defDate, fournisseur: '', designation: '', categorie: 'autre', montantTTC: '', montantTVA: '', mode: 'Carte bancaire', km: '', tauxKm: data.settings.kmRate || '', bareme: !!data.settings.kmCv, cv: data.settings.kmCv || 0, elec: !!data.settings.kmElec, fileIds: [], reference: '' };
  const modal = openModal({
    title: d ? 'Modifier la dépense' : 'Nouvelle dépense',
    body: `<form class="form">
      ${field('Date *', `<input name="date" type="date" required value="${esc(cur.date)}">`)}
      ${field('Catégorie', `<select name="categorie">${options(Object.entries(CATEGORIES), cur.categorie)}</select>`)}
      ${field('Fournisseur / bénéficiaire *', `<input name="fournisseur" required value="${esc(cur.fournisseur)}" autocomplete="off">`)}
      ${field('Désignation', `<input name="designation" value="${esc(cur.designation)}">`)}
      ${field('N° de pièce', `<input name="reference" value="${esc(cur.reference || '')}">`)}
      <div id="kmBox" hidden>
        ${field('Kilomètres', `<input name="km" inputmode="decimal" value="${esc(cur.km)}">`)}
        ${data.settings.kmCv || cur.bareme ? `<label class="check"><input type="checkbox" name="bareme" ${cur.bareme ? 'checked' : ''}> Calcul automatique selon le barème kilométrique (${esc(CV_LABELS[clampCv(cur.cv || data.settings.kmCv)])}${(d ? cur.elec : data.settings.kmElec) ? ', électrique' : ''})</label>` : '<p class="muted">Astuce : renseignez la puissance de votre véhicule dans les Réglages pour calculer l\'indemnité automatiquement.</p>'}
        <div id="kmAuto" hidden><p class="notice" id="kmCalc" style="margin:0"></p></div>
        <div id="kmManuel">${field('Indemnité (€ / km)', `<input name="tauxKm" inputmode="decimal" value="${esc(cur.tauxKm)}">`)}</div>
      </div>
      <div id="amtBox">
        ${field('Montant TTC (€) *', `<input name="montantTTC" inputmode="decimal" value="${esc(cur.montantTTC)}">`)}
        ${(isAssujetti(data.settings) || data.settings.tvaSimAffiche !== false) ? field('dont TVA (€)', `<input name="montantTVA" inputmode="decimal" value="${esc(cur.montantTVA)}">`, isAssujetti(data.settings) ? 'TVA récupérable indiquée sur le justificatif.' : 'Facultatif : sert uniquement à la simulation de TVA.') : ''}
      </div>
      ${field('Mode de paiement', `<select name="mode"><option value=""></option>${options(MODES.map((x) => [x, x]), cur.mode)}</select>`)}
      <div class="field"><span>Justificatif(s) : ticket, facture, relevé… (PDF ou photo)</span><div id="fp"></div></div>
      <div class="form-actions">${d ? '<button type="button" class="btn danger" data-del>Supprimer</button>' : ''}<span class="spacer"></span>
        <button type="button" class="btn" data-close2>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
  });
  const fp = new FilePicker(modal.$('#fp'), { ids: cur.fileIds || [], multiple: true });
  const sel = modal.$('[name=categorie]');
  const syncKm = () => {
    const km = sel.value === 'km';
    modal.$('#kmBox').hidden = !km;
    modal.$('#amtBox').hidden = km;
    modal.$('[name=montantTTC]').required = !km;
    modal.$('[name=km]').required = km;
    const auto = km && !!(modal.$('[name=bareme]') && modal.$('[name=bareme]').checked);
    modal.$('#kmAuto').hidden = !auto;
    modal.$('#kmManuel').hidden = auto;
    modal.$('[name=tauxKm]').required = km && !auto;
    if (auto) calcKm();
  };
  // Aperçu du calcul : on simule la dépense avec les autres trajets de l'année (le barème est cumulatif).
  const kmVehicule = () => ({ cv: d && cur.bareme ? cur.cv : data.settings.kmCv, elec: d && cur.bareme ? !!cur.elec : !!data.settings.kmElec });
  const calcKm = () => {
    const date = modal.$('[name=date]').value || cur.date, km = num(modal.$('[name=km]').value), y = Number(String(date).slice(0, 4));
    const v = kmVehicule();
    const cand = { id: d ? d.id : '__new__', date, categorie: 'km', km, bareme: true, cv: v.cv, elec: v.elec };
    const plan = planKm([...data.depenses.filter((x) => !d || x.id !== d.id), cand], y);
    const r = plan.get(cand.id), b = baremeFor(y);
    modal.$('#kmCalc').innerHTML = km > 0 && r
      ? `Indemnité : <strong>${eur(r.montant)}</strong> (${String(r.taux).replace('.', ',')} €/km en moyenne) — barème ${b.year}${b.exact ? '' : ` ⚠ (barème ${y} non encore disponible)`}, cumulé sur l'année.`
      : 'Saisissez les kilomètres : l\'indemnité sera calculée selon le barème.';
  };
  const cb = modal.$('[name=bareme]');
  if (cb) cb.addEventListener('change', syncKm);
  modal.$('[name=km]').addEventListener('input', () => { if (cb && cb.checked) calcKm(); });
  modal.$('[name=date]').addEventListener('change', () => { if (cb && cb.checked) calcKm(); });
  sel.addEventListener('change', syncKm); syncKm();
  modal.$('[data-close2]').addEventListener('click', () => modal.close());
  const del = modal.$('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (await confirmBox('Supprimer cette dépense et ses justificatifs ?', { ok: 'Supprimer', danger: true })) {
      await deleteDepense(d.id); modal.close(); toast('Dépense supprimée'); hooks.render();
    }
  });
  modal.$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const isKm = fd.categorie === 'km';
    const auto = isKm && fd.bareme === 'on';
    const ttc = isKm ? (auto ? 0 : round2(num(fd.km) * num(fd.tauxKm))) : num(fd.montantTTC); // en automatique, le montant est calculé à l'enregistrement
    const fileIds = await fp.commit();
    const rec = {
      id: d ? d.id : uid(), date: fd.date, categorie: fd.categorie, fournisseur: fd.fournisseur, designation: fd.designation,
      reference: fd.reference, mode: fd.mode, fileIds,
      montantTTC: ttc, montantTVA: isKm ? 0 : (fd.montantTVA !== undefined ? num(fd.montantTVA) : num(d && d.montantTVA)),
      ...(isKm ? { km: num(fd.km), tauxKm: auto ? 0 : num(fd.tauxKm), bareme: auto, ...(auto ? kmVehicule() : {}) } : {}),
    };
    await saveDepense(rec); await fp.cleanup(); modal.close(); toast('Dépense enregistrée'); hooks.render();
  });
}
