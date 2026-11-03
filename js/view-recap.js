import { state } from './state.js';
import { MOIS, summarizeYear, enAttente, margeTva, suiviMois, simulationTva } from './calc.js';
import { esc, eur, fmtDate, pct } from './util.js';
import { openEncaisser } from './view-missions.js';

export function render() {
  const { year, data } = state;
  const ys = summarizeYear(data, year);
  const t = ys.total;
  const att = enAttente(data);
  const tva = margeTva(data, year);
  const suivi = suiviMois(data, year);
  const sim = simulationTva(data, year);
  const stot = (k) => suivi.reduce((a, x) => a + x[k], 0);
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
    <h2>Travail prévu (devis) et argent encaissé</h2>
    <p class="muted">Un devis compte dans le mois où le travail est prévu (ou signé) ; l'argent compte dans le mois où il est encaissé. L'écart cumulé est ce qui est travaillé mais pas encore en trésorerie.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mois</th><th class="num">Devis prévus HT</th><th class="num">Facturé HT</th><th class="num">Encaissé HT</th><th class="num">Vir. perso</th><th class="num">Écart cumulé</th></tr></thead>
      <tbody>${suivi.map((x) => `<tr><td>${MOIS[x.month - 1]}${x.devis.length ? `<details><summary class="muted">${x.devis.length} devis</summary>${x.devis.map((l) => `<div class="muted"><a href="#/mission/${l.mission.id}">${esc(l.mission.client)}</a> ${eur(l.montant)}${Object.keys(l.encaissements).length ? ' → encaissé ' + Object.entries(l.encaissements).map(([k, v]) => `${MOIS[Number(k.slice(5)) - 1].toLowerCase()} ${k.slice(0, 4)} (${eur(v)})`).join(', ') : ' → pas encore encaissé'}</div>`).join('')}</details>` : ''}</td>
        <td class="num">${eur(x.devisHT)}</td><td class="num">${eur(x.factureHT)}</td><td class="num">${eur(x.encaisseHT)}</td><td class="num">${eur(x.perso)}</td><td class="num strong">${eur(x.ecartCumule)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="num">${eur(stot('devisHT'))}</td><td class="num">${eur(stot('factureHT'))}</td><td class="num">${eur(stot('encaisseHT'))}</td><td class="num">${eur(stot('perso'))}</td><td class="num">${eur(suivi[11].ecartCumule)}</td></tr></tfoot>
    </table></div>
    <h2>Simulation de TVA (si vous sortez de la franchise)</h2>
    <p class="muted">Simulation indicative au taux de ${pct(sim.taux)} %, ${sim.incluse ? 'TVA considérée comme déjà incluse dans vos prix actuels' : 'TVA ajoutée à vos prix actuels'} (réglable dans Réglages). TVA collectée = sur les encaissements du mois ; TVA déductible = « dont TVA » saisie sur vos dépenses professionnelles, justificatifs à l'appui.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mois</th><th class="num">TVA collectée</th><th class="num">TVA déductible</th><th class="num">TVA à reverser</th><th class="num">Cumul</th></tr></thead>
      <tbody>${sim.months.map((x) => `<tr><td>${MOIS[x.month - 1]}</td><td class="num">${eur(x.collectee)}</td><td class="num">${eur(x.deductible)}</td><td class="num strong">${x.aReverser < 0 ? eur(-x.aReverser) + ' à récupérer' : eur(x.aReverser)}</td><td class="num">${eur(x.cumul)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="num">${eur(sim.total.collectee)}</td><td class="num">${eur(sim.total.deductible)}</td><td class="num">${sim.total.aReverser < 0 ? eur(-sim.total.aReverser) + ' à récupérer' : eur(sim.total.aReverser)}</td><td class="num">${eur(sim.total.aReverser)}</td></tr></tfoot>
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
