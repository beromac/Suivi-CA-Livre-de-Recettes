import { state, hooks, saveDepense, deleteDepense } from './state.js';
import { MOIS, CATEGORIES, MODES, recettes, depenses, sumRecettes, summarize, expenseAmounts, rateFor, round2, HORS_DEPENSES } from './calc.js';
import { esc, eur, fmtDate, today, uid, pct } from './util.js';
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
  const rows = list.map((r) => `<tr>
    <td>${fmtDate(r.date)}</td><td>${esc(r.facture.numero)}</td>
    <td><a href="#/mission/${r.mission.id}">${esc(r.mission.client)}</a></td>
    <td>${esc(r.mission.adresse || '')}</td><td>${esc(r.mission.siret || '')}</td><td>${esc(r.mission.nature || r.mission.ref || '')}</td>
    <td class="num">${eur(r.ht)}</td><td class="num">${eur(r.ttc)}</td><td class="num">${eur(r.tva)}</td><td>${esc(r.facture.mode || '')}</td></tr>`).join('');
  const title = month ? `${MOIS[month - 1]} ${year}` : `Année ${year}`;
  const html = `
    <h1>Livre chronologique des recettes</h1>
    ${monthTabs('recettes', month)}
    <h2>${title}</h2>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Encaissé le</th><th>N° pièce</th><th>Client</th><th>Adresse</th><th>SIRET</th><th>Nature</th><th class="num">HT</th><th class="num">TTC</th><th class="num">TVA</th><th>Mode</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="6">TOTAL RECETTES ENCAISSÉES</td><td class="num">${eur(tot.ht)}</td><td class="num">${eur(tot.ttc)}</td><td class="num">${eur(tot.tva)}</td><td></td></tr></tfoot>
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
  const sansJust = list.filter((d) => !(d.fileIds || []).length && !HORS_DEPENSES.includes(d.categorie)).length;
  const rows = list.map((d) => {
    const a = expenseAmounts(d);
    const j = (d.fileIds || []).length
      ? `<button class="link" data-view="${d.fileIds[0]}">📎 ${d.fileIds.length}</button>`
      : (HORS_DEPENSES.includes(d.categorie) ? '<span class="muted">—</span>' : '<span class="badge warn">manquant</span>');
    return `<tr class="click" data-edit="${d.id}">
      <td>${fmtDate(d.date)}</td><td>${esc(d.fournisseur)}<div class="muted">${esc(d.designation || '')}</div></td>
      <td>${esc(CATEGORIES[d.categorie] || d.categorie)}</td>
      <td class="num">${eur(a.ht)}</td><td class="num">${eur(a.ttc)}</td><td class="num">${eur(a.tva)}</td><td>${esc(d.mode || '')}</td><td>${j}</td></tr>`;
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
      <thead><tr><th>Date</th><th>Fournisseur / désignation</th><th>Catégorie</th><th class="num">HT</th><th class="num">TTC</th><th class="num">TVA</th><th>Paiement</th><th>Justif.</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4">TOTAL DÉPENSES PROFESSIONNELLES (TTC, hors URSSAF et virements perso)</td><td class="num">${eur(totPro)}</td><td colspan="3"></td></tr></tfoot>
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
  const cur = d || { date: defDate, fournisseur: '', designation: '', categorie: 'autre', montantTTC: '', montantTVA: '', mode: 'Carte bancaire', km: '', tauxKm: data.settings.kmRate || '', fileIds: [], reference: '' };
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
        ${field('Indemnité (€ / km)', `<input name="tauxKm" inputmode="decimal" value="${esc(cur.tauxKm)}">`)}
      </div>
      <div id="amtBox">
        ${field('Montant TTC (€) *', `<input name="montantTTC" inputmode="decimal" value="${esc(cur.montantTTC)}">`)}
        ${field('dont TVA (€)', `<input name="montantTVA" inputmode="decimal" value="${esc(cur.montantTVA)}">`)}
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
    modal.$('[name=tauxKm]').required = km;
  };
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
    const ttc = isKm ? round2(num(fd.km) * num(fd.tauxKm)) : num(fd.montantTTC);
    const fileIds = await fp.commit();
    const rec = {
      id: d ? d.id : uid(), date: fd.date, categorie: fd.categorie, fournisseur: fd.fournisseur, designation: fd.designation,
      reference: fd.reference, mode: fd.mode, fileIds,
      montantTTC: ttc, montantTVA: isKm ? 0 : num(fd.montantTVA),
      ...(isKm ? { km: num(fd.km), tauxKm: num(fd.tauxKm) } : {}),
    };
    await saveDepense(rec); await fp.cleanup(); modal.close(); toast('Dépense enregistrée'); hooks.render();
  });
}
