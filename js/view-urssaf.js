import { state, hooks, saveSettings } from './state.js';
import { MOIS, periodes, rateFor, summarizeYear } from './calc.js';
import { tauxFor } from './taux.js';
import { esc, eur, fmtDate, today, pct } from './util.js';
import { toast } from './ui.js';

export function render() {
  const { year, data } = state;
  const per = data.settings.periodicite || 'mensuelle';
  const list = periodes(data, year, per);
  const rate = rateFor(data.settings, year);
  const total = summarizeYear(data, year).total;

  // Période « à déclarer maintenant » : la dernière période terminée (année en cours uniquement).
  const t = today();
  let current = null;
  if (Number(t.slice(0, 4)) === year) {
    const m = Number(t.slice(5, 7));
    current = list.filter((p) => p.end < m).pop() || null;
  }

  const card = (p, highlight) => `<div class="card period${highlight ? ' highlight' : ''}">
      <div class="period-head"><h3>${esc(p.label)} ${year}</h3><span class="muted">échéance habituelle : ${fmtDate(p.echeance)}</span></div>
      <div class="cards inner">
        <div><div class="card-label">Chiffre d'affaires à déclarer</div><div class="card-value">${eur(p.ht)}</div></div>
        <div><div class="card-label">Cotisations estimées (${pct(rate)} %)</div><div class="card-value">${eur(p.du)}</div></div>
      </div>
      ${p.lignes.length ? `<details><summary>${p.lignes.length} facture(s) encaissée(s)</summary><div class="table-wrap"><table>
        <thead><tr><th>Encaissé le</th><th>N°</th><th>Client</th><th class="num">HT</th></tr></thead><tbody>
        ${p.lignes.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.facture.numero)}</td><td>${esc(r.mission.client)}</td><td class="num">${eur(r.ht)}</td></tr>`).join('')}
        </tbody></table></div></details>` : '<p class="muted">Aucun encaissement sur cette période : déclarez 0 € (la déclaration reste obligatoire).</p>'}
    </div>`;

  const html = `
    <div class="page-head"><h1>Déclaration URSSAF ${year}</h1>
      <label class="inline">Périodicité
        <select id="per"><option value="mensuelle"${per === 'mensuelle' ? ' selected' : ''}>Mensuelle</option><option value="trimestrielle"${per === 'trimestrielle' ? ' selected' : ''}>Trimestrielle</option></select></label></div>
    <p class="muted">Le chiffre d'affaires à déclarer est la somme des factures <strong>encaissées</strong> pendant la période (date d'encaissement), hors TVA. ${(() => { const t = tauxFor(data.settings.formeActivite, year, data.settings.versementLiberatoire); return t && rate === t.total ? `Le taux de ${pct(rate)} % = cotisations ${pct(t.cotis)} % + contribution à la formation professionnelle ${pct(t.cfp)} %${t.vl ? ` + versement libératoire ${pct(t.vl)} %` : ''}, ajusté automatiquement selon l'année.` : `Le taux de ${pct(rate)} % est modifiable dans les réglages.`; })()}</p>
    ${current ? `<h2>À déclarer maintenant</h2>${card(current, true)}` : ''}
    <h2>Toutes les périodes</h2>
    ${list.map((p) => card(p, false)).join('')}
    <div class="card"><div class="card-label">Total année ${year}</div>
      <div class="card-value">${eur(total.recettesHT)} de CA · ${eur(total.urssafDu)} de cotisations estimées</div>
      <div class="muted">Déjà payé à l'URSSAF (dépenses « Paiement URSSAF ») : ${eur(total.urssafPaye)} · reste estimé : ${eur(Math.round((total.urssafDu - total.urssafPaye) * 100) / 100)}</div></div>`;

  return {
    html,
    bind(root) {
      root.querySelector('#per').addEventListener('change', async (e) => {
        await saveSettings({ periodicite: e.target.value }); toast('Périodicité enregistrée'); hooks.render();
      });
    },
  };
}

export { MOIS };
