// Page « Impôts » : aide à la déclaration de revenus (cases + montants) et comparateur de structures.
import { state, hooks, saveSettings } from './state.js';
import { MOIS, summarizeYear, fraisKm, totauxKm, margePlafond } from './calc.js';
import { esc, eur, pct } from './util.js';
import { aideDeclaration, LIBELLES_TYPE, ANNEE_CASES_VERIFIEE } from './impots.js';
import { comparer, balayage, SIMU_DEFAUT, baremeIR, parts } from './simu.js';
import { courbesComparaison, COLORS } from './charts.js';
import { FORMES } from './taux.js';
import { openPrint } from './view-imprimer.js';

let tab = 'declaration';
const num = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
const nbr = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Contenu de l'aide à la déclaration (réutilisé par la page et par l'impression). */
export function declarationHtml(data, year, { print = false } = {}) {
  const a = aideDeclaration(data, year);
  const s = data.settings;
  const casesBlock = !a.type
    ? `<div class="notice warn">Choisissez la forme de votre auto-entreprise dans les <a href="#/reglages">Réglages</a> pour afficher les cases à remplir.</div>`
    : !a.cases
      ? `<div class="notice warn">${esc(a.libelle)} : cette activité a sa propre rubrique dans l'annexe 2042-C-PRO (location meublée). Reportez-vous à la notice du formulaire de l'année pour la case exacte. Montant à reporter : <strong>${eur(a.ca)}</strong> (recettes brutes encaissées).</div>`
      : `<div class="table-wrap"><table><thead><tr><th>Case</th><th>Rubrique</th><th class="num">Montant à saisir</th></tr></thead><tbody>
          <tr><td><strong class="case">${a.cases[0]}</strong></td><td>${esc(a.libelle)}${a.liberatoire ? ' — <em>avec versement libératoire</em>' : ''}<br><span class="muted">Déclarant 2 : ${a.cases[1]} · Personne à charge : ${a.cases[2]}</span></td><td class="num strong">${eur(a.ca)}</td></tr>
        </tbody></table></div>
        <p class="muted">Saisissez le <strong>chiffre d'affaires brut encaissé</strong>, sans retirer l'abattement ni les cotisations : l'administration applique elle-même l'abattement forfaitaire.${a.liberatoire ? ' Vous avez coché le versement libératoire : utilisez les cases de la rubrique « versement libératoire ».' : ''}</p>`;

  const mois = a.mois.map((m) => `<tr><td>${MOIS[m.month - 1]}</td><td class="num">${eur(m.ca)}</td></tr>`).join('');
  const caseNote = a.casesAJour ? '' : `<div class="notice warn">⚠ Les numéros de cases ont été vérifiés pour la déclaration ${ANNEE_CASES_VERIFIEE + 1} (revenus ${ANNEE_CASES_VERIFIEE}). Pour les revenus ${year}, vérifiez-les sur le formulaire 2042-C-PRO de l'année avant de remplir.</div>`;
  return `
    <h2>Déclaration de revenus ${a.declarationYear} <span class="muted">(revenus ${year})</span></h2>
    ${caseNote}
    <p class="muted">À reporter dans l'<strong>annexe 2042-C-PRO</strong> (revenus des professions non salariées) de votre déclaration en ligne, au printemps ${a.declarationYear}. Le chiffre d'affaires est en principe pré-rempli à partir de vos déclarations à l'URSSAF : vérifiez qu'il correspond au montant ci-dessous.</p>
    ${casesBlock}
    <div class="cards">
      <div class="card t-ca"><div class="card-label">CA encaissé ${year}</div><div class="card-value">${eur(a.ca)}</div><div class="muted">= total déclaré à l'URSSAF</div></div>
      ${a.abattement != null && !a.liberatoire ? `<div class="card t-tva"><div class="card-label">Abattement forfaitaire ${pct(Math.round(a.tauxAbattement * 100))} %</div><div class="card-value">${eur(a.abattement)}</div><div class="muted">revenu imposable estimé : ${eur(a.revenuImposable)}</div></div>` : ''}
      ${a.liberatoire ? `<div class="card t-tva"><div class="card-label">Impôt libératoire estimé</div><div class="card-value">${eur(a.impotLiberatoire)}</div><div class="muted">payé avec vos cotisations</div></div>` : ''}
      <div class="card t-urssaf"><div class="card-label">Cotisations URSSAF ${year}</div><div class="card-value">${eur(a.cotisations)}</div><div class="muted">non déductibles en micro</div></div>
    </div>
    <h3>Frais kilométriques ${year}</h3>
    <p>${a.km.trajets ? `<strong>${nbr(a.km.km)} km</strong> · indemnités calculées au barème : <strong>${eur(a.km.indemnites)}</strong> (${a.km.trajets} trajet${a.km.trajets > 1 ? 's' : ''}).` : 'Aucun trajet enregistré.'}</p>
    <p class="muted">⚠ En <strong>micro-entreprise</strong>, ces frais ne se reportent <strong>dans aucune case</strong> : l'abattement forfaitaire couvre déjà toutes vos charges. Ils ne servent que si vous êtes au <strong>régime réel</strong> (frais réels déductibles) ou si vous avez un emploi salarié et choisissez les frais réels (déclaration principale, case 1AK) : dans ce cas, ne déduisez pas deux fois les mêmes trajets.</p>
    <h3>Vérification mois par mois</h3>
    <div class="table-wrap"><table><thead><tr><th>Mois</th><th class="num">CA encaissé HT</th></tr></thead><tbody>${mois}</tbody><tfoot><tr><td>TOTAL ${year}</td><td class="num">${eur(a.ca)}</td></tr></tfoot></table></div>
    ${print ? '' : `<p><button class="btn" data-print-fiscal>🖨 Imprimer cette fiche</button></p>`}
    <p class="muted">Aide indicative : les cases et abattements sont ceux du formulaire de l'année indiquée. En cas de doute, appuyez-vous sur la notice officielle (impots.gouv.fr) ou un professionnel.</p>`;
}

function champ(label, name, valeur, hint = '', type = 'text') {
  if (type === 'checkbox') return `<label class="check"><input name="${name}" type="checkbox"${valeur ? ' checked' : ''}><span>${label}${hint ? ` <small class="muted">— ${hint}</small>` : ''}</span></label>`;
  return `<label class="field"><span>${label}</span><input name="${name}" ${type === 'checkbox' ? 'type="checkbox"' + (valeur ? ' checked' : '') : `inputmode="decimal" value="${esc(valeur)}"`}>${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
}

function comparateurHtml(data, year) {
  const s = data.settings;
  const simu = { ...SIMU_DEFAUT, ...(s.simu || {}) };
  const ys = summarizeYear(data, year);
  const caAuto = Math.round(ys.total.recettesHT), chargesAuto = Math.round(ys.total.depensesHT);
  const km = totauxKm(fraisKm(data, year));
  const ca = simu.ca != null && simu.ca !== '' ? num(simu.ca) : caAuto;
  const charges = simu.charges != null && simu.charges !== '' ? num(simu.charges) : chargesAuto;
  const plaf = margePlafond({ ...data, settings: { ...s, plafondAffiche: true } }, year);
  const plafond = plaf.plafond || 0;
  const ir = baremeIR(year);
  const entrees = { ca, charges, chargesKm: km.indemnites, forme: s.formeActivite, year, plafond, simu };
  const r = comparer(entrees);
  const b = balayage({ ...entrees, max: Math.max(ca * 1.6, (plafond || 60000) * 1.15) });
  const micro = r.micro;
  const ligne = (label, f, cls = '') => `<tr class="${cls}"><td>${label}</td>${r.resultats.map((x) => `<td class="num${x.possible ? '' : ' muted'}">${f(x)}</td>`).join('')}</tr>`;
  const ecart = (x) => (x.id === 'micro' ? '—' : `${x.net - micro.net >= 0 ? '+' : ''}${eur(x.net - micro.net)}`);
  const gain = r.meilleur ? r.meilleur.net - micro.net : 0;
  const verdict = !r.meilleur ? '' : r.meilleur.id === 'micro'
    ? `<div class="notice ok"><strong>Dans cette simulation, la micro-entreprise reste la plus avantageuse</strong> : il vous reste environ <strong>${eur(micro.net)}</strong> par an (${eur(micro.net / 12)} par mois).${b.seuil ? ` Une autre structure ne devient plus intéressante qu'à partir d'un CA d'environ <strong>${eur(b.seuil)}</strong> (à charges proportionnelles).` : ' Aucune autre structure ne la dépasse sur la plage de CA étudiée.'}</div>`
    : `<div class="notice ${micro.possible ? 'warn' : 'warn'}"><strong>${esc(r.meilleur.label)} laisserait environ ${eur(r.meilleur.net)} par an${micro.possible ? `, soit ${eur(gain)} de plus (${eur(gain / 12)} par mois) que la micro-entreprise` : ''}.</strong>${micro.possible ? '' : ' La micro-entreprise n\'est plus possible à ce niveau de CA (plafond dépassé).'}
      Vérifiez avant de décider : comptabilité obligatoire, formalités, protection sociale et frais de création ne sont que partiellement chiffrés ici${b.seuil && micro.possible ? ` ; l'avantage apparaît à partir d'un CA d'environ ${eur(b.seuil)}` : ''}.</div>`;
  const proche = plafond && ca > plafond * 0.8
    ? `<div class="notice warn">Votre CA simulé représente ${Math.round((ca / plafond) * 100)} % du plafond de la micro-entreprise (${eur(plafond)}). Un dépassement deux années de suite fait sortir du régime ; au-delà de la franchise de TVA, la TVA s'applique aussi.</div>` : '';
  const { parts: nParts } = parts({ couple: simu.couple, enfants: simu.enfants });
  const noms = { micro: 'Micro-entreprise', ei: 'EI au réel', eurl: 'EURL (IS)', sasu: 'SASU' };
  const couleurs = { micro: COLORS[0], ei: COLORS[1], eurl: COLORS[2], sasu: COLORS[4] };

  return `
    <h2>Comparer les structures <span class="muted">(simulation ${year})</span></h2>
    <p class="muted">Pour savoir quelle forme vous laisse le plus d'argent, et à partir de quand sortir de l'auto-entreprise. Les chiffres de départ viennent de vos données ${year} ; modifiez-les pour simuler une autre année ou un autre niveau d'activité.</p>
    <form class="form simu" id="simu-form">
      <div class="grid2">
        ${champ(`Chiffre d'affaires annuel simulé (€)`, 'ca', simu.ca ?? '', `Vide = CA encaissé ${year} : ${eur(caAuto)}`)}
        ${champ('Charges professionnelles annuelles (€)', 'charges', simu.charges ?? '', `Vide = dépenses ${year} : ${eur(chargesAuto)} (hors URSSAF, virements perso, frais km)`)}
        ${champ('Autres revenus nets imposables du foyer (€/an)', 'autresRevenus', simu.autresRevenus || '', 'Salaire du conjoint, de votre emploi, etc. (après abattement de 10 %)')}
        ${champ('Enfants à charge', 'enfants', simu.enfants || '', `Parts de quotient familial : ${nbr(nParts)}`)}
      </div>
      <div class="checks">
        ${champ('Je vis en couple (imposition commune)', 'couple', simu.couple, '', 'checkbox')}
        ${champ(`Inclure mes frais kilométriques (${eur(km.indemnites)}) dans les charges déductibles au réel`, 'inclureKm', simu.inclureKm, 'Les indemnités km ne sont pas déductibles en micro.', 'checkbox')}
      </div>
      <details><summary>Hypothèses modifiables</summary><div class="grid2">
        ${champ('Cotisations non salarié (EI, EURL), % du revenu net', 'tauxTns', simu.tauxTns, 'Environ 40 à 45 % selon le niveau de revenu')}
        ${champ('Frais de comptabilité EI au réel (€/an)', 'comptaEI', simu.comptaEI)}
        ${champ('Frais de comptabilité EURL (€/an)', 'comptaEURL', simu.comptaEURL, 'Environ 1 500 à 3 500 €')}
        ${champ('Frais de comptabilité SASU (€/an)', 'comptaSASU', simu.comptaSASU, 'Environ 1 800 à 4 000 €')}
        ${champ('Capital de l\'EURL (€)', 'capital', simu.capital, 'Dividendes au-delà de 10 % du capital : soumis aux cotisations')}
      </div></details>
      <p><button type="button" class="btn" data-simu-reset>Revenir aux valeurs de mes données</button></p>
    </form>
    ${!s.formeActivite ? `<div class="notice warn">Forme d'activité non choisie : taux « prestations commerciales » utilisé. Choisissez votre forme dans les <a href="#/reglages">Réglages</a>.</div>` : ''}
    ${verdict}${proche}
    <div class="table-wrap"><table class="compare"><thead><tr><th></th>${r.resultats.map((x) => `<th class="num${r.meilleur && x.id === r.meilleur.id ? ' best' : ''}">${esc(x.id === 'micro' ? 'Micro-entreprise' : x.label)}${r.meilleur && x.id === r.meilleur.id ? ' ★' : ''}</th>`).join('')}</tr></thead><tbody>
      ${ligne('Chiffre d\'affaires', (x) => eur(x.ca))}
      ${ligne('Charges professionnelles', (x) => (x.id === 'micro' ? eur(x.charges) + ' (non déduites)' : eur(x.charges)))}
      ${ligne('Comptabilité', (x) => eur(x.comptabilite))}
      ${ligne('Cotisations sociales', (x) => eur(x.cotisations))}
      ${ligne('Impôt sur les sociétés', (x) => (x.id === 'eurl' || x.id === 'sasu' ? eur(x.impotSocietes) : '—'))}
      ${ligne('Impôt sur le revenu (et flat tax)', (x) => eur(x.impotRevenu))}
      ${ligne('<strong>Il vous reste (par an)</strong>', (x) => `<strong>${x.possible ? eur(x.net) : 'non possible'}</strong>`, 'total')}
      ${ligne('Par mois', (x) => (x.possible ? eur(x.net / 12) : '—'))}
      ${ligne('Écart avec la micro', (x) => (x.possible ? ecart(x) : '—'))}
    </tbody></table></div>
    <details class="detail"><summary>Détail des hypothèses de chaque structure</summary><ul>${r.resultats.map((x) => `<li><strong>${esc(x.label)}</strong> : ${x.detail.map(esc).join(' · ')}</li>`).join('')}</ul></details>
    <section class="chart-card"><h3>Ce qu'il vous reste selon le chiffre d'affaires</h3>${courbesComparaison({ xs: b.xs, series: b.series, noms, couleurs, caActuel: ca, plafond })}
      <p class="muted">À charges proportionnelles à votre CA actuel. Le point de croisement des courbes indique à partir de quel CA changer de structure devient intéressant.</p></section>
    <h3>Au-delà des chiffres</h3>
    <div class="table-wrap"><table><thead><tr><th>Structure</th><th>Protection sociale</th><th>Contraintes</th></tr></thead><tbody>
      <tr><td><strong>Micro-entreprise</strong></td><td>Régime des indépendants, cotisations proportionnelles au CA (rien si pas de CA)</td><td>Aucune comptabilité complexe ; plafond de CA ; charges non déductibles</td></tr>
      <tr><td><strong>EI au réel</strong></td><td>Idem micro, cotisations sur le bénéfice réel (minimum annuel)</td><td>Comptabilité complète, TVA ; charges déductibles ; pas de plafond</td></tr>
      <tr><td><strong>EURL à l'IS</strong></td><td>Gérant non salarié : cotisations sur la rémunération ; dividendes au-delà de 10 % du capital cotisés</td><td>Société : statuts, comptes annuels, assemblée ; patrimoine séparé</td></tr>
      <tr><td><strong>SASU</strong></td><td>Président assimilé salarié : meilleure couverture (retraite, prévoyance) mais pas d'assurance chômage ; dividendes sans cotisations</td><td>Société : comptes annuels, bulletins de paie si salaire ; charges patronales élevées</td></tr>
    </tbody></table></div>
    <div class="notice"><strong>Simulation indicative, pas un conseil.</strong> Hypothèses : barème de l'impôt sur le revenu ${ir.annee}${ir.exact ? '' : ` (le barème ${year} n'est pas encore connu : celui de ${ir.annee} est utilisé)`} avec quotient familial et décote ; cotisations non salarié ≈ ${simu.tauxTns} % du revenu net (minimum 1 200 €) ; SASU : charges ≈ 80 % du salaire net ; dividendes à 31,4 % (flat tax 2026) ; IS 15 % jusqu'à 42 500 € puis 25 %. Non modélisés : TVA, CFE, ACRE, versement libératoire, frais de création, fiscalité de la retraite et des droits sociaux. Faites valider avec un expert-comptable avant de changer de statut.</div>`;
}

export function render() {
  const { year, data } = state;
  const html = `
    <div class="page-head"><h1>Impôts</h1></div>
    <div class="tabs" role="tablist"><button class="tab ${tab === 'declaration' ? 'active' : ''}" data-tab="declaration">🧾 Ma déclaration de revenus</button><button class="tab ${tab === 'comparer' ? 'active' : ''}" data-tab="comparer">⚖ Comparer les structures</button></div>
    ${tab === 'declaration' ? declarationHtml(data, year) : comparateurHtml(data, year)}`;
  return {
    html,
    bind(root) {
      root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; hooks.render(); }));
      const pr = root.querySelector('[data-print-fiscal]');
      if (pr) pr.addEventListener('click', () => openPrint({ year, month: 0, opts: { fiscal: true } }));
      const f = root.querySelector('#simu-form');
      if (f) {
        f.addEventListener('submit', (e) => e.preventDefault());
        f.addEventListener('change', async () => {
          const g = (n) => f.elements[n];
          const v = (n) => (g(n).value === '' ? null : num(g(n).value));
          await saveSettings({ simu: { ca: v('ca'), charges: v('charges'), autresRevenus: num(g('autresRevenus').value), enfants: Math.max(0, Math.floor(num(g('enfants').value))), couple: g('couple').checked, inclureKm: g('inclureKm').checked,
            tauxTns: num(g('tauxTns').value) || SIMU_DEFAUT.tauxTns, comptaEI: num(g('comptaEI').value), comptaEURL: num(g('comptaEURL').value), comptaSASU: num(g('comptaSASU').value), capital: num(g('capital').value) } });
          hooks.render();
        });
        root.querySelector('[data-simu-reset]').addEventListener('click', async () => { await saveSettings({ simu: { ...SIMU_DEFAUT } }); hooks.render(); });
      }
    },
  };
}
export { LIBELLES_TYPE, FORMES };
