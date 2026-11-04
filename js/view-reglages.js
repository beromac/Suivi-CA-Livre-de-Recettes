import { state, hooks, saveSettings, load, recalcKm } from './state.js';
import { rateFor } from './calc.js';
import { baremeFor, CV_LABELS } from './bareme.js';
import * as db from './db.js';
import { esc, fmtDate } from './util.js';
import { toast, confirmBox, field } from './ui.js';
import { exportBackup, importBackup, exportCSV } from './backup.js';
import { getConfig, setConfig, getStatus, syncNow, client, isConfigured, startAuto } from './sync.js';

const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')));

export function render() {
  const { year, data } = state;
  const s = data.settings;
  const cfg = getConfig() || { owner: '', repo: '', branch: 'main', token: '', auto: true };
  const st = getStatus();
  const bar = baremeFor(year);
  const kmInfo = `<p class="muted" style="margin:-.4rem 0 0">Barème appliqué aux dépenses de ${year} : <strong>barème ${bar.year}</strong>${bar.exact ? '' : ` — ⚠ le barème ${year} n'est pas encore dans l'application (le dernier connu est utilisé) ; il sera pris en compte à la prochaine mise à jour, puis cliquez sur « Recalculer »`}.
    Le barème est cumulatif sur l'année : le taux baisse après 5 000 km puis 20 000 km. <button type="button" class="btn small" id="b-km">Recalculer les indemnités ${year}</button></p>`;
  const lb = s.lastBackup ? fmtDate(s.lastBackup.slice(0, 10)) : 'jamais';

  const html = `
    <h1>Réglages</h1>

    <form class="form card" id="f-profil">
      <h2>Mon activité</h2>
      <p class="muted">Ces informations apparaissent en en-tête des documents imprimés.</p>
      ${field('Nom / raison sociale', `<input name="nom" value="${esc(s.nom)}">`)}
      ${field('SIRET', `<input name="siret" inputmode="numeric" value="${esc(s.siret)}">`)}
      ${field('Adresse', `<input name="adresse" value="${esc(s.adresse)}">`)}
      ${field('Activité', `<input name="activite" value="${esc(s.activite)}">`)}
      <div class="form-actions"><button class="btn primary">Enregistrer</button></div>
    </form>

    <form class="form card" id="f-calc">
      <h2>Cotisations et paramètres</h2>
      ${field('Taux de cotisations URSSAF par défaut (%)', `<input name="defaultRate" inputmode="decimal" value="${esc(s.defaultRate)}">`, 'Repris de votre fichier Excel : 21,3 %. Vérifiez le taux de votre activité sur autoentrepreneur.urssaf.fr.')}
      ${field(`Taux spécifique pour ${year} (%)`, `<input name="rateYear" inputmode="decimal" placeholder="${esc(rateFor(s, year))}" value="${esc((s.rates || {})[year] ?? '')}">`, 'Laissez vide pour utiliser le taux par défaut. Utile si le taux change d\'une année à l\'autre.')}
      ${field('Périodicité de déclaration', `<select name="periodicite"><option value="mensuelle"${s.periodicite === 'mensuelle' ? ' selected' : ''}>Mensuelle</option><option value="trimestrielle"${s.periodicite === 'trimestrielle' ? ' selected' : ''}>Trimestrielle</option></select>`)}
      <label class="check"><input type="checkbox" name="tvaAssujetti" ${s.tvaAssujetti ? 'checked' : ''}> <strong>Je suis soumis à la TVA</strong> (hors franchise en base)</label>
      <p class="muted" style="margin:-.4rem 0 0">Décoché (franchise en base, auto-entrepreneur) : aucune TVA n'apparaît dans les factures, les livres ni les récapitulatifs. Coché : la TVA des factures et des dépenses s'affiche partout, et le tableau « TVA à déclarer » remplace la simulation.</p>
      <label class="check"><input type="checkbox" name="tvaSimAffiche" ${s.tvaSimAffiche !== false ? 'checked' : ''}> Afficher la simulation de TVA tant que je suis en franchise (prévision en cas de sortie)</label>
      ${field('Taux de TVA proposé sur les nouvelles factures (%)', `<input name="tvaTaux" inputmode="decimal" value="${esc(s.tvaTaux)}">`, '0 = franchise en base de TVA (aucune TVA facturée).')}
      ${field('Véhicule : puissance fiscale (barème kilométrique)', `<select name="kmCv"><option value="0"${!s.kmCv ? ' selected' : ''}>Non renseignée : indemnité saisie à la main</option>${Object.entries(CV_LABELS).map(([k, v]) => `<option value="${k}"${Number(s.kmCv) === Number(k) ? ' selected' : ''}>${v}</option>`).join('')}</select>`, 'Si renseignée, l\'indemnité des frais kilométriques est calculée automatiquement d\'après le barème de l\'année de la dépense.')}
      <label class="check"><input type="checkbox" name="kmElec" ${s.kmElec ? 'checked' : ''}> Véhicule électrique (barème majoré de 20 %)</label>
      ${kmInfo}
      ${field('Indemnité kilométrique manuelle proposée (€/km)', `<input name="kmRate" inputmode="decimal" value="${esc(s.kmRate)}">`, 'Utilisée seulement quand le calcul automatique est désactivé sur une dépense.')}
      ${field('Seuil de franchise de TVA (€)', `<input name="seuilTva" inputmode="decimal" value="${esc(s.seuilTva)}">`, 'Repris de votre Excel (124 jours × 300 € = 37 200 €). Mettez 0 pour masquer l\'indicateur.')}
      ${field('Simulation de TVA : taux (%)', `<input name="tvaSimTaux" inputmode="decimal" value="${esc(s.tvaSimTaux)}">`, 'Taux utilisé pour estimer la TVA si vous sortiez de la franchise (20 % en général).')}
      ${field('Simulation de TVA : vos prix actuels…', `<select name="tvaSimMode"><option value="ajoutee"${s.tvaSimMode !== 'incluse' ? ' selected' : ''}>sont HT : la TVA s\'ajoute (le client paie plus)</option><option value="incluse"${s.tvaSimMode === 'incluse' ? ' selected' : ''}>seraient TTC : la TVA est comprise (vous gardez moins)</option></select>`)}
      ${field('Taux journalier moyen (€)', `<input name="tjm" inputmode="decimal" value="${esc(s.tjm)}">`, 'Sert à convertir la marge avant le seuil en nombre de jours.')}
      <div class="form-actions"><button class="btn primary">Enregistrer</button></div>
    </form>

    <div class="card form" id="backup">
      <h2>Sauvegarde</h2>
      <p class="muted">Vos données sont conservées sur cet appareil. Dernière sauvegarde : <strong>${lb}</strong>. Le fichier .zip contient toutes les données et tous les justificatifs.</p>
      <div class="form-actions" style="justify-content:flex-start">
        <button class="btn primary" id="b-export">💾 Télécharger une sauvegarde (.zip)</button>
        <label class="btn">📥 Restaurer une sauvegarde<input type="file" id="b-import" accept=".zip,application/zip" hidden></label>
        <button class="btn" id="b-csv">📄 Exporter ${year} en CSV (Excel)</button>
      </div>
    </div>

    <form class="form card" id="f-sync">
      <h2>Synchronisation PC ⇄ Android (GitHub)</h2>
      <p class="muted">Pour retrouver les mêmes données sur plusieurs appareils : créez un dépôt GitHub <strong>privé</strong> réservé à vos données, puis renseignez-le ici sur chaque appareil. Détails dans le fichier README.</p>
      ${field('Compte GitHub (propriétaire du dépôt)', `<input name="owner" value="${esc(cfg.owner)}" autocomplete="off" placeholder="mon-compte">`)}
      ${field('Nom du dépôt privé', `<input name="repo" value="${esc(cfg.repo)}" autocomplete="off" placeholder="mes-donnees-compta">`)}
      ${field('Branche', `<input name="branch" value="${esc(cfg.branch || 'main')}" autocomplete="off">`)}
      ${field('Jeton d\'accès (fine-grained token)', `<input name="token" type="password" value="${esc(cfg.token)}" autocomplete="off" placeholder="github_pat_…">`, 'Droit « Contents : Read and write » sur ce seul dépôt. Il reste enregistré uniquement sur cet appareil.')}
      <label class="check"><input type="checkbox" name="auto" ${cfg.auto !== false ? 'checked' : ''}> Synchroniser automatiquement après chaque modification</label>
      <div id="syncStatus" class="muted">${st ? (st.ok ? `✅ Dernière synchronisation : ${new Date(st.at).toLocaleString('fr-FR')}` : `⚠ Échec (${new Date(st.at).toLocaleString('fr-FR')}) : ${esc(st.error)}`) : 'Jamais synchronisé sur cet appareil.'}</div>
      <div class="form-actions" style="justify-content:flex-start">
        <button class="btn primary" id="s-save">Enregistrer et synchroniser</button>
        <button type="button" class="btn" id="s-now"${isConfigured() ? '' : ' disabled'}>🔄 Synchroniser maintenant</button>
        <button type="button" class="btn danger" id="s-off"${isConfigured() ? '' : ' disabled'}>Désactiver</button>
      </div>
    </form>

    <div class="card form">
      <h2>Stockage</h2>
      <p class="muted" id="storage">Calcul…</p>
      <div class="form-actions" style="justify-content:flex-start"><button class="btn danger" id="wipe">Effacer toutes les données de cet appareil</button></div>
    </div>`;

  return {
    html,
    bind(root) {
      const $ = (sel) => root.querySelector(sel);
      const fdOf = (e) => Object.fromEntries(new FormData(e.target));

      $('#f-profil').addEventListener('submit', async (e) => {
        e.preventDefault(); await saveSettings(fdOf(e)); toast('Enregistré');
      });
      $('#f-calc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = fdOf(e);
        const rates = { ...(s.rates || {}) };
        if (f.rateYear === '') delete rates[year]; else rates[year] = num(f.rateYear);
        await saveSettings({ defaultRate: num(f.defaultRate), rates, periodicite: f.periodicite, tvaAssujetti: 'tvaAssujetti' in f, tvaSimAffiche: 'tvaSimAffiche' in f, tvaTaux: ('tvaAssujetti' in f && !num(f.tvaTaux)) ? 20 : num(f.tvaTaux), kmRate: num(f.kmRate), kmCv: num(f.kmCv), kmElec: 'kmElec' in f, seuilTva: num(f.seuilTva), tjm: num(f.tjm), tvaSimTaux: f.tvaSimTaux === '' ? 20 : num(f.tvaSimTaux), tvaSimMode: f.tvaSimMode });
        toast('Paramètres enregistrés');
      });

      $('#b-km').addEventListener('click', async () => { const n = await recalcKm(year); await load(); toast(n ? `${n} indemnité(s) recalculée(s)` : 'Rien à recalculer'); hooks.render(); });

      $('#b-export').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await exportBackup(); toast('Sauvegarde téléchargée'); hooks.render(); } catch (err) { toast(`Échec : ${err.message}`, 'err'); e.target.disabled = false; }
      });
      $('#b-csv').addEventListener('click', () => exportCSV(year));
      $('#b-import').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!(await confirmBox('Restaurer cette sauvegarde REMPLACERA toutes les données actuelles de cet appareil. Continuer ?', { ok: 'Restaurer', danger: true }))) { e.target.value = ''; return; }
        try { await importBackup(file); toast('Sauvegarde restaurée'); hooks.render(); } catch (err) { toast(`Échec : ${err.message}`, 'err'); }
      });

      const showStatus = (msg) => { $('#syncStatus').textContent = msg; };
      const doSync = async () => {
        try {
          const r = await syncNow(showStatus);
          toast(`Synchronisé — ${r.missions} mission(s), ${r.depenses} dépense(s)`);
        } catch (err) { showStatus(`⚠ ${err.message}`); toast(err.message, 'err'); }
      };
      $('#f-sync').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = fdOf(e);
        const c = { owner: f.owner.trim(), repo: f.repo.trim(), branch: (f.branch || 'main').trim(), token: f.token.trim(), auto: 'auto' in f };
        if (!c.owner || !c.repo || !c.token) { toast('Renseignez le compte, le dépôt et le jeton', 'err'); return; }
        showStatus('Vérification de l\'accès au dépôt…');
        try {
          const info = await client(c).check();
          if (!info.private && !(await confirmBox(`Le dépôt ${info.name} est PUBLIC : vos données de facturation seraient visibles de tous. Utilisez un dépôt privé. Continuer quand même ?`, { ok: 'Continuer', danger: true }))) { showStatus(''); return; }
        } catch (err) { showStatus(`⚠ ${err.message}`); toast(err.message, 'err'); return; }
        const first = !isConfigured();
        setConfig(c);
        if (first) startAuto((err) => toast(`Synchronisation : ${err.message}`, 'err'));
        await doSync();
      });
      $('#s-now').addEventListener('click', doSync);
      $('#s-off').addEventListener('click', async () => {
        if (await confirmBox('Désactiver la synchronisation sur cet appareil ? Les données restent ici et sur GitHub.', { ok: 'Désactiver' })) { setConfig(null); hooks.render(); }
      });

      $('#wipe').addEventListener('click', async () => {
        if (!(await confirmBox('Effacer TOUTES les données de cet appareil (missions, dépenses, justificatifs, réglages) ? Faites une sauvegarde avant. Si la synchronisation est active, elles restent sur GitHub.', { ok: 'Tout effacer', danger: true }))) return;
        await Promise.all(['missions', 'depenses', 'files', 'releves', 'meta'].map((x) => db.clear(x)));
        await load(); toast('Données effacées'); hooks.render();
      });

      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(async ({ usage, quota }) => {
          const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
          const mb = (n) => `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`;
          $('#storage').textContent = `Espace utilisé : ${mb(usage || 0)} sur ${mb(quota || 0)} disponibles.${persisted === false ? ' Le navigateur peut effacer ces données s\'il manque de place : pensez à sauvegarder ou synchroniser.' : ''}`;
        }).catch(() => { $('#storage').textContent = ''; });
      }
    },
  };
}
