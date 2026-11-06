import { state, hooks, releveOf, updateReleve } from './state.js';
import { MOIS, summarizeYear, enAttente, margeTva, margePlafond, suiviMois, isAssujetti } from './calc.js';
import { esc, eur, fmtDate, pct } from './util.js';
import { openEncaisser } from './view-missions.js';
import { openModal, toast, FilePicker } from './ui.js';
import { tvaHtml } from './tva-view.js';
import { chartsHtml } from './charts.js';
import { alerteHtml } from './view-documents.js';

/** Cellule « relevé de banque » d'un mois : nombre de fichiers joints, ou bouton d'ajout (avec alerte si le mois a de l'activité). */
function releveCell(year, m) {
  const rel = releveOf(year, m.month);
  const n = rel ? (rel.fileIds || []).length : 0;
  const actif = m.recettesHT || m.depensesHT || m.perso || m.urssafPaye;
  const main = n
    ? `<button type="button" class="link" data-releve="${m.month}">📎 ${n} fichier${n > 1 ? 's' : ''}</button>`
    : `<button type="button" class="btn small" data-releve="${m.month}">＋ Ajouter</button>${actif ? ' <span class="badge warn">manquant</span>' : ''}`;
  const flag = (name, label, title) => `<label class="check flag" title="${title}"><input type="checkbox" data-flag="${name}" data-m="${m.month}"${rel && rel[name] ? ' checked' : ''}> ${label}</label>`;
  return `${main}<div class="flags">${flag('surPrecedent', '◀ préc.', `Des encaissements de ${MOIS[m.month - 1]} figurent sur le relevé du mois précédent`)}${flag('surSuivant', 'suiv. ▶', `Des encaissements de ${MOIS[m.month - 1]} figurent sur le relevé du mois suivant`)}</div>`;
}

/** Fenêtre d'ajout / consultation du relevé de banque d'un mois (PDF ou photos, plusieurs fichiers possibles). */
export function openReleve(year, month) {
  const rel = releveOf(year, month);
  const modal = openModal({
    title: `Relevé de banque — ${MOIS[month - 1]} ${year}`,
    body: `<form class="form">
      <div class="field"><span>Relevé(s) bancaire(s) du mois (PDF ou photos)</span><div id="fp"></div></div>
      <div class="form-actions"><span class="spacer"></span><button type="button" class="btn" data-close2>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
  });
  const fp = new FilePicker(modal.$('#fp'), { ids: rel ? rel.fileIds : [], multiple: true });
  modal.$('[data-close2]').addEventListener('click', () => modal.close());
  modal.$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = await fp.commit();
    await updateReleve(year, month, { fileIds: ids });
    await fp.cleanup();
    modal.close(); toast('Relevé enregistré'); hooks.render();
  });
}

export function render() {
  const { year, data } = state;
  const ys = summarizeYear(data, year);
  const t = ys.total;
  const att = enAttente(data);
  const tva = margeTva(data, year);
  const plaf = margePlafond(data, year);
  const nbPerso = data.depenses.filter((d) => d.categorie === 'perso' && String(d.date || '').startsWith(String(year))).length;
  const suivi = suiviMois(data, year);
  const tvaOn = isAssujetti(data.settings);
  const stot = (k) => suivi.reduce((a, x) => a + x[k], 0);
  const lb = data.settings.lastBackup;
  const days = lb ? Math.floor((Date.now() - new Date(lb)) / 86400000) : null;
  const backupWarn = (days === null || days > 30)
    ? `<div class="notice warn">💾 ${days === null ? 'Aucune sauvegarde n\'a encore été faite.' : `Dernière sauvegarde il y a ${days} jours.`}
       Vos données sont stockées sur cet appareil : <a href="#/reglages">faites une sauvegarde</a> régulièrement.</div>` : '';

  const rows = ys.months.map((m) => `<tr>
      <td><a href="#/recettes/${m.month}">${MOIS[m.month - 1]}</a></td>
      <td class="num">${eur(m.recettesHT)}</td><td class="num">${eur(m.depensesHT)}</td>
      <td class="num">${eur(m.urssafDu)}</td><td class="num strong">${eur(m.tresorerie)}</td><td class="num">${eur(m.perso)}</td>
      <td>${releveCell(year, m)}</td></tr>`).join('');

  const attRows = att.map((a, i) => `<tr>
      <td>${esc(a.facture.numero)}</td><td><a href="#/mission/${a.mission.id}">${esc(a.mission.client)}</a></td>
      <td>${fmtDate(a.facture.date)}</td><td class="num">${eur(tvaOn ? a.ttc : a.ht)}</td>
      <td class="right"><button class="btn small primary" data-enc="${i}">Marquer encaissée</button></td></tr>`).join('');

  const html = `
    <h1>Récapitulatif ${year}</h1>
    ${backupWarn}
    ${alerteHtml(data)}
    <div class="cards">
      <div class="card t-ca"><div class="card-label">CA encaissé HT</div><div class="card-value">${eur(t.recettesHT)}</div><div class="muted">à déclarer à l'URSSAF</div></div>
      <div class="card t-urssaf"><div class="card-label">Cotisations URSSAF dues</div><div class="card-value">${eur(t.urssafDu)}</div><div class="muted">taux ${pct(t.rate)} % · déjà payé ${eur(t.urssafPaye)}</div></div>
      <div class="card t-dep"><div class="card-label">Dépenses HT</div><div class="card-value">${eur(t.depensesHT)}</div></div>
      <div class="card t-treso"><div class="card-label">Trésorerie</div><div class="card-value">${eur(t.tresorerie)}</div><div class="muted">recettes − dépenses − URSSAF</div></div>
      <div class="card t-perso"><div class="card-label">Virements personnels</div><div class="card-value">${eur(t.perso)}</div><div class="muted">${nbPerso} virement${nbPerso > 1 ? 's' : ''} cumulé${nbPerso > 1 ? 's' : ''} en ${year}</div></div>
      ${!tvaOn && tva.seuil ? `<div class="card t-tva"><div class="card-label">Avant le seuil de TVA</div><div class="card-value">${tva.reste >= 0 ? eur(tva.reste) : 'Seuil dépassé'}</div><div class="muted">${tva.reste >= 0 && tva.jours != null ? `≈ ${String(tva.jours).replace('.', ',')} jours à ${eur(tva.tjm)}` : `de ${eur(-tva.reste)} au-dessus de ${eur(tva.seuil)}`}</div></div>` : ''}
      ${plaf.plafond ? `<div class="card t-plafond"><div class="card-label">Avant le plafond de CA</div><div class="card-value">${plaf.reste >= 0 ? eur(plaf.reste) : 'Plafond dépassé'}</div><div class="muted">${Math.round(plaf.pct * 100)} % de ${eur(plaf.plafond)} utilisés${plaf.reste < 0 ? ` (dépassé de ${eur(-plaf.reste)})` : ''}</div></div>` : ''}
    </div>
    <p class="muted">Le chiffre d'affaires est compté dans le mois de la <strong>date d'encaissement</strong> de chaque facture.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mois</th><th class="num">Recettes HT</th><th class="num">Dépenses HT</th><th class="num">URSSAF dû</th><th class="num">Trésorerie</th><th class="num">Vir. perso</th><th>Relevé de banque</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="num">${eur(t.recettesHT)}</td><td class="num">${eur(t.depensesHT)}</td><td class="num">${eur(t.urssafDu)}</td><td class="num">${eur(t.tresorerie)}</td><td class="num">${eur(t.perso)}</td><td></td></tr></tfoot>
    </table></div>
    <p class="muted">Relevé de banque : cochez « ◀ préc. » ou « suiv. ▶ » quand des encaissements du mois figurent sur le relevé du mois d'avant ou d'après. À l'impression, ce relevé est joint avec celui du mois.</p>
    ${chartsHtml(data, year)}
    <h2>Travail prévu (devis) et argent encaissé</h2>
    <p class="muted">Un devis compte dans le mois où le travail est prévu (ou signé) ; l'argent compte dans le mois où il est encaissé. L'écart cumulé est ce qui est travaillé mais pas encore en trésorerie.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mois</th><th class="num">Devis prévus HT</th><th class="num">Facturé HT</th><th class="num">Encaissé HT</th><th class="num">Vir. perso</th><th class="num">Écart cumulé</th></tr></thead>
      <tbody>${suivi.map((x) => `<tr><td>${MOIS[x.month - 1]}${x.devis.length ? `<details><summary class="muted">${x.devis.length} devis</summary>${x.devis.map((l) => `<div class="muted"><a href="#/mission/${l.mission.id}">${esc(l.mission.client)}</a> ${eur(l.montant)}${Object.keys(l.encaissements).length ? ' → encaissé ' + Object.entries(l.encaissements).map(([k, v]) => `${MOIS[Number(k.slice(5)) - 1].toLowerCase()} ${k.slice(0, 4)} (${eur(v)})`).join(', ') : ' → pas encore encaissé'}</div>`).join('')}</details>` : ''}</td>
        <td class="num">${eur(x.devisHT)}</td><td class="num">${eur(x.factureHT)}</td><td class="num">${eur(x.encaisseHT)}</td><td class="num">${eur(x.perso)}</td><td class="num strong">${eur(x.ecartCumule)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="num">${eur(stot('devisHT'))}</td><td class="num">${eur(stot('factureHT'))}</td><td class="num">${eur(stot('encaisseHT'))}</td><td class="num">${eur(stot('perso'))}</td><td class="num">${eur(suivi[11].ecartCumule)}</td></tr></tfoot>
    </table></div>
    ${tvaHtml(data, year)}
    <h2>Factures en attente d'encaissement <span class="badge">${att.length}</span></h2>
    ${att.length ? `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Client</th><th>Émise le</th><th class="num">${tvaOn ? 'TTC' : 'Montant'}</th><th></th></tr></thead><tbody>${attRows}</tbody></table></div>
      <p class="muted">Ces montants ne comptent dans aucun mois tant que la date d'encaissement n'est pas renseignée.</p>`
      : '<p class="muted">Aucune facture en attente.</p>'}`;

  return {
    html,
    bind(root) {
      root.querySelectorAll('[data-flag]').forEach((c) => c.addEventListener('change', async () => {
        await updateReleve(year, Number(c.dataset.m), { [c.dataset.flag]: c.checked });
        hooks.render();
      }));
      root.querySelectorAll('[data-releve]').forEach((b) => b.addEventListener('click', () => openReleve(year, Number(b.dataset.releve))));
      root.querySelectorAll('[data-enc]').forEach((b) => b.addEventListener('click', () => {
        const a = att[Number(b.dataset.enc)];
        openEncaisser(a.mission.id, a.facture.id);
      }));
    },
  };
}
