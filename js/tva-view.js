// Section « TVA » partagée par le récapitulatif et l'impression.
// Assujetti : TVA réelle (collectée sur les encaissements − déductible sur les dépenses).
// Franchise en base : simulation facultative (réglage « Afficher la simulation de TVA »).
import { MOIS, simulationTva, isAssujetti } from './calc.js';
import { eur, pct } from './util.js';

export function tvaSection(data) {
  const st = data.settings;
  const actif = isAssujetti(st);
  if (!actif && st.tvaSimAffiche === false) return '';
  return { actif, st };
}

export function tvaHtml(data, year) {
  const info = tvaSection(data);
  if (!info) return '';
  const sim = simulationTva(data, year);
  const fmt = (v) => (v < 0 ? `${eur(-v)} à récupérer` : eur(v));
  const title = info.actif ? 'TVA à déclarer' : 'Simulation de TVA (si vous sortez de la franchise)';
  const note = info.actif
    ? 'TVA collectée = TVA des factures encaissées dans le mois (exigible à l\'encaissement pour les prestations de services) ; TVA déductible = « dont TVA » des dépenses professionnelles, justificatifs à l\'appui. Indicatif : la déclaration se fait sur impots.gouv.fr.'
    : `Simulation indicative au taux de ${pct(sim.taux)} %, ${sim.incluse ? 'TVA considérée comme déjà incluse dans vos prix actuels' : 'TVA ajoutée à vos prix actuels'} (réglable dans Réglages). TVA collectée = sur les encaissements du mois ; TVA déductible = « dont TVA » saisie sur vos dépenses professionnelles.`;
  return `<h2>${title}</h2>
    <p class="muted">${note}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mois</th><th class="num">TVA collectée</th><th class="num">TVA déductible</th><th class="num">TVA à reverser</th><th class="num">Cumul</th></tr></thead>
      <tbody>${sim.months.map((x) => `<tr><td>${MOIS[x.month - 1]}</td><td class="num">${eur(x.collectee)}</td><td class="num">${eur(x.deductible)}</td><td class="num strong">${fmt(x.aReverser)}</td><td class="num">${eur(x.cumul)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="num">${eur(sim.total.collectee)}</td><td class="num">${eur(sim.total.deductible)}</td><td class="num">${fmt(sim.total.aReverser)}</td><td class="num">${eur(sim.total.aReverser)}</td></tr></tfoot>
    </table></div>`;
}
