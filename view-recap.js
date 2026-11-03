import { state } from './state.js';
import { MOIS, summarizeYear, enAttente, margeTva } from './calc.js';
import { esc, eur, fmtDate, pct } from './util.js';
import { openEncaisser } from './view-missions.js';

export function render() {
  const { year, data } = state;
  const ys = summarizeYear(data, year);
  const t = ys.total;
  const att = enAttente(data);
  const tva = margeTva(data, year);
  const lb = data.settings.lastBackup;
  const days = lb ? Math.floor((Date.now() - new Date(lb)) / 86400000) : null;
  const backupWarn = (days === null || days > 30)
    ? `<div class="notice warn">💾 ${days === null ? 'Aucune sauvegarde n\'a encore été faite.' : `Dernière sauvegarde il y a ${days} jours.`}
       Vos données sont stockées sur cet appareil : <a href="#/reglages">faites une sauvegarde</a> régulièrement.</div>` : '';

  const rows = ys.months.map((m) => `<tr>
      <td><a href="#/recettes/${m.month}">${MOIS[m.month - 1]}</a></td>
      <td class="num">${eur(m.recettesHT)}</td><td class="num">${eur(m.depensesHT)}</td>
      <td class="num">${eur(m.urssafDu)}</td><td class="num strong">${eur(m.tresorerie)}</td><td class="num">${eur(m.perso)}</td></tr>`).join('');

  const attRows = att.map((a, i) => `<tr>
      <td>${esc(a.facture.numero)}</td><td><a href="#/mission/${a.mission.id}">${esc(a.mission.client)}</a></td>
      <td>${fmtDate(a.facture.date)}</td><td class="num">${eur(a.ttc)}</td>
      <td class="right"><button class="btn small primary" data-enc="${i}">Marquer encaissée</button></td></tr>`).join('');

  const html = `
    <h1>Récapitulatif ${year}</h1>
    ${backupWarn}
    <div class="cards">
      <div class="card"><div class="card-label">CA encaissé HT</div><div class="card-value">${eur(t.recettesHT)}</div><div class="muted">à déclarer à l'URSSAF</div></div>
      <div class="card"><div class="card-label">Cotisations URSSAF dues</div><div class="card-value">${eur(t.urssafDu)}</div><div class="muted">taux ${pct(t.rate)} % · déjà payé ${eur(t.urssafPaye)}</div></div>
      <div class="card"><div class="card-label">Dépenses HT</div><div class="card-value">${eur(t.depensesHT)}</div></div>
      <div class="card"><div class="card-label">Trésorerie</div><div class="card-value">${eur(t.tresorerie)}</div><div class="muted">recettes − dépenses − URSSAF</div></div>
      ${tva.seuil ? `<div class="card"><div class="card-label">Avant le seuil de TVA</div><div class="card-value">${tva.reste >= 0 ? eur(tva.reste) : 'Seuil dépassé'}</div><div class="muted">${tva.reste >= 0 && tva.jours != null ? `≈ ${String(tva.jours).replace('.', ',')} jours à ${eur(tva.tjm)}` : `de ${eur(-tva.reste)} au-dessus de ${eur(tva.seuil)}`}</div></div>` : ''}
    </div>
    <p class="muted">Le chiffre d'affaires est compté dans le mois de la <strong>date d'encaissement</strong> de chaque facture.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mois</th><th class="num">Recettes HT</th><th class="num">Dépenses HT</th><th class="num">URSSAF dû</th><th class="num">Trésorerie</th><th class="num">Vir. perso</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="num">${eur(t.recettesHT)}</td><td class="num">${eur(t.depensesHT)}</td><td class="num">${eur(t.urssafDu)}</td><td class="num">${eur(t.tresorerie)}</td><td class="num">${eur(t.perso)}</td></tr></tfoot>
    </table></div>
    <h2>Factures en attente d'encaissement <span class="badge">${att.length}</span></h2>
    ${att.length ? `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Client</th><th>Émise le</th><th class="num">TTC</th><th></th></tr></thead><tbody>${attRows}</tbody></table></div>
      <p class="muted">Ces montants ne comptent dans aucun mois tant que la date d'encaissement n'est pas renseignée.</p>`
      : '<p class="muted">Aucune facture en attente.</p>'}`;

  return {
    html,
    bind(root) {
      root.querySelectorAll('[data-enc]').forEach((b) => b.addEventListener('click', () => {
        const a = att[Number(b.dataset.enc)];
        openEncaisser(a.mission.id, a.facture.id);
      }));
    },
  };
}
