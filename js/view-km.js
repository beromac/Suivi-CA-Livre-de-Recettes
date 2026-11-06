// Frais kilométriques : suivis À PART des dépenses (ils ne comptent ni dans les dépenses, ni dans la trésorerie, ni dans la TVA).
// Ils servent uniquement à la déclaration fiscale.
import { state } from './state.js';
import { MOIS, fraisKm, totauxKm } from './calc.js';
import { esc, eur, fmtDate, pct } from './util.js';
import { baremeFor, CV_LABELS, clampCv } from './bareme.js';
import { openDepenseForm } from './view-livres.js';
import { openPrint } from './view-imprimer.js';

const nb = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

function detail(d) {
  if (d.bareme) return `barème ${baremeFor(String(d.date).slice(0, 4)).year}, ${esc(CV_LABELS[clampCv(d.cv)])}${d.elec ? ', électrique' : ''}`;
  return `${pct(d.tauxKm)} €/km (manuel)`;
}

export function render() {
  const { year, data } = state;
  const list = fraisKm(data, year);
  const tot = totauxKm(list);
  const row = (d) => `<tr data-edit="${esc(d.id)}" class="click"><td>${fmtDate(d.date)}</td><td>${esc(d.fournisseur)}</td><td>${esc(d.designation || '')}</td>
    <td class="num">${d.jours ? nb(d.jours) : ''}</td><td class="num">${nb(d.km)}</td><td class="muted">${detail(d)}</td><td class="num strong">${eur(d.montantTTC)}</td></tr>`;
  let body = '';
  for (let m = 1; m <= 12; m++) {
    const rs = list.filter((d) => Number(d.date.slice(5, 7)) === m);
    if (!rs.length) continue;
    const t = totauxKm(rs);
    body += rs.map(row).join('') + `<tr class="sub"><td colspan="3">Total ${MOIS[m - 1]}</td><td class="num">${t.jours ? nb(t.jours) : ''}</td><td class="num">${nb(t.km)}</td><td></td><td class="num">${eur(t.indemnites)}</td></tr>`;
  }
  const html = `
    <div class="page-head"><h1>Frais kilométriques ${year}</h1>
      <div><button class="btn" data-print>🖨 Imprimer</button> <button class="btn primary" data-new>＋ Nouveau trajet</button></div></div>
    <p class="notice">Ces frais sont suivis <strong>à part</strong> : ils ne sont pas comptés dans vos dépenses, votre trésorerie ni la TVA. Ils servent uniquement à la déclaration fiscale. L'indemnité est calculée selon le barème kilométrique${data.settings.kmCv ? ` (${esc(CV_LABELS[clampCv(data.settings.kmCv)])}${data.settings.kmElec ? ', électrique' : ''})` : ' (renseignez la puissance de votre véhicule dans les Réglages)'}.</p>
    <div class="cards">
      <div class="card t-treso"><div class="card-label">Kilomètres ${year}</div><div class="card-value">${nb(tot.km)} km</div><div class="muted">${tot.trajets} trajet(s)${tot.jours ? ` · ${nb(tot.jours)} jour(s)` : ''}</div></div>
      <div class="card t-tva"><div class="card-label">Indemnités kilométriques</div><div class="card-value">${eur(tot.indemnites)}</div><div class="muted">à reporter dans la déclaration fiscale</div></div>
    </div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Magasin / lieu</th><th>Motif</th><th class="num">Jours</th><th class="num">Km</th><th>Calcul</th><th class="num">Indemnité</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="3">TOTAL ${year}</td><td class="num">${tot.jours ? nb(tot.jours) : ''}</td><td class="num">${nb(tot.km)}</td><td></td><td class="num">${eur(tot.indemnites)}</td></tr></tfoot></table></div>`
      : '<p class="empty">Aucun trajet enregistré pour cette année.</p>'}`;
  return {
    html,
    bind(root) {
      root.querySelector('[data-new]').addEventListener('click', () => openDepenseForm(null, 0, true));
      root.querySelector('[data-print]').addEventListener('click', () => openPrint({ year, month: 0, opts: { kmFisc: true } }));
      root.querySelectorAll('[data-edit]').forEach((tr) => tr.addEventListener('click', () => openDepenseForm(data.depenses.find((d) => d.id === tr.dataset.edit), 0, true)));
    },
  };
}
