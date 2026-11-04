import { state, hooks, missionById, saveMission, deleteMission, missionFileIds } from './state.js';
import { MODES, missionStats, factureAmounts, nextFactureNumber, isAssujetti } from './calc.js';
import { esc, eur, fmtDate, today, uid } from './util.js';
import { openModal, confirmBox, toast, field, options, FilePicker, viewFile } from './ui.js';
import { deleteFiles } from './files.js';

const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')));

/* ===================== Liste des missions ===================== */
export function renderList(params, query) {
  const { year, data } = state;
  const q = (query.q || '').toLowerCase();
  const filtre = query.f || 'tous';
  const all = query.all === '1';
  let list = data.missions.filter((m) => all || Number(m.annee) === year);
  if (q) list = list.filter((m) => `${m.client} ${m.ref} ${m.nature}`.toLowerCase().includes(q));
  const stat = (m) => missionStats(m);
  if (filtre === 'attente') list = list.filter((m) => stat(m).resteAEncaisser > 0);
  if (filtre === 'afacturer') list = list.filter((m) => stat(m).resteAFacturer > 0);
  if (filtre === 'sansdevis') list = list.filter((m) => !(m.devis || []).some((d) => d.fileId));
  list.sort((a, b) => String(b.created).localeCompare(String(a.created)));

  const rows = list.map((m) => {
    const s = stat(m);
    const badge = s.resteAEncaisser > 0 ? `<span class="badge warn">${eur(s.resteAEncaisser)} à encaisser</span>`
      : (s.factureHT > 0 ? '<span class="badge ok">Encaissée</span>' : '<span class="badge">Pas de facture</span>');
    return `<tr class="click" data-go="${m.id}">
      <td><strong>${esc(m.client)}</strong><div class="muted">${esc(m.ref || '')}${m.ref && m.nature ? ' · ' : ''}${esc(m.nature || '')}</div></td>
      <td class="num">${eur(s.devisHT)}</td><td class="num">${eur(s.factureHT)}</td><td class="num">${eur(s.encaisseHT)}</td><td>${badge}</td></tr>`;
  }).join('');

  const html = `
    <div class="page-head"><h1>Missions ${all ? '(toutes années)' : year}</h1>
      <button class="btn primary" data-new>＋ Nouvelle mission</button></div>
    <div class="filters">
      <input type="search" id="q" placeholder="Rechercher (client, référence…)" value="${esc(query.q || '')}">
      <select id="f">${options([['tous', 'Toutes'], ['attente', 'Reste à encaisser'], ['afacturer', 'Reste à facturer'], ['sansdevis', 'Sans devis signé']], filtre)}</select>
      <label class="check"><input type="checkbox" id="all" ${all ? 'checked' : ''}> Toutes les années</label>
    </div>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Mission</th><th class="num">Devis HT</th><th class="num">Facturé HT</th><th class="num">Encaissé HT</th><th>État</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<p class="empty">Aucune mission. Créez-en une avec « Nouvelle mission ».</p>'}`;

  return {
    html,
    bind(root) {
      const go = () => {
        const p = new URLSearchParams();
        const qv = root.querySelector('#q').value; if (qv) p.set('q', qv);
        const fv = root.querySelector('#f').value; if (fv !== 'tous') p.set('f', fv);
        if (root.querySelector('#all').checked) p.set('all', '1');
        location.hash = `#/missions${p.toString() ? '?' + p : ''}`;
      };
      root.querySelector('#f').addEventListener('change', go);
      root.querySelector('#all').addEventListener('change', go);
      root.querySelector('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      root.querySelector('#q').addEventListener('change', go);
      root.querySelectorAll('[data-go]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/mission/${tr.dataset.go}`; }));
      root.querySelector('[data-new]').addEventListener('click', () => openMissionForm());
    },
  };
}

/* ===================== Fiche mission ===================== */
export function renderDetail(params) {
  const m = missionById(params[0]);
  if (!m) return { html: '<p class="empty">Mission introuvable. <a href="#/missions">Retour aux missions</a></p>', bind() {} };
  const s = missionStats(m);
  const tvaOn = isAssujetti(state.data.settings);

  const devisRows = (m.devis || []).map((d) => `<tr>
      <td>${esc(d.numero || '—')}</td><td>${fmtDate(d.dateSignature)}</td><td class="num">${eur(d.montantHT)}</td>
      <td>${d.fileId ? `<button class="link" data-view="${d.fileId}">📄 Voir</button>` : '<span class="badge warn">Pas de fichier</span>'}</td>
      <td class="right"><button class="btn small" data-edit-devis="${d.id}">Modifier</button></td></tr>`).join('');

  const facRows = (m.factures || []).map((f) => {
    const a = factureAmounts(f, tvaOn);
    const etat = f.dateEncaissement
      ? `<span class="badge ok">Encaissée le ${fmtDate(f.dateEncaissement)}</span>${f.mode ? `<div class="muted">${esc(f.mode)}</div>` : ''}`
      : `<span class="badge warn">En attente</span> <button class="btn small primary" data-enc="${f.id}">Encaisser</button>`;
    return `<tr>
      <td>${esc(f.numero)}</td><td>${fmtDate(f.date)}</td><td class="num">${eur(a.ht)}</td>${tvaOn ? `<td class="num">${eur(a.ttc)}</td>` : ''}
      <td>${etat}</td>
      <td>${f.fileId ? `<button class="link" data-view="${f.fileId}">📄 Voir</button>` : '<span class="badge warn">Pas de fichier</span>'}</td>
      <td class="right"><button class="btn small" data-edit-fac="${f.id}">Modifier</button></td></tr>`;
  }).join('');

  const html = `
    <p><a href="#/missions">← Missions</a></p>
    <div class="page-head"><h1>${esc(m.client)}</h1>
      <div><button class="btn" data-edit>Modifier</button> <button class="btn danger" data-del>Supprimer</button></div></div>
    <p class="muted">${esc([m.ref, m.nature].filter(Boolean).join(' · '))}${m.adresse ? `<br>${esc(m.adresse)}` : ''}${m.siret ? `<br>SIRET ${esc(m.siret)}` : ''}${m.notes ? `<br>${esc(m.notes)}` : ''}</p>
    <div class="cards">
      <div class="card"><div class="card-label">Devis signé(s) HT</div><div class="card-value">${eur(s.devisHT)}</div></div>
      <div class="card"><div class="card-label">Facturé HT</div><div class="card-value">${eur(s.factureHT)}</div><div class="muted">reste à facturer ${eur(s.resteAFacturer)}</div></div>
      <div class="card"><div class="card-label">Encaissé HT</div><div class="card-value">${eur(s.encaisseHT)}</div><div class="muted">reste à encaisser ${eur(s.resteAEncaisser)}</div></div>
    </div>
    <div class="page-head"><h2>Devis signés</h2><button class="btn" data-add-devis>＋ Ajouter un devis</button></div>
    ${(m.devis || []).length ? `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Signé le</th><th class="num">HT</th><th>Fichier</th><th></th></tr></thead><tbody>${devisRows}</tbody></table></div>` : '<p class="empty">Aucun devis enregistré.</p>'}
    <div class="page-head"><h2>Factures</h2><button class="btn" data-add-fac>＋ Ajouter une facture</button></div>
    ${(m.factures || []).length ? `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Date</th><th class="num">HT</th>${tvaOn ? '<th class="num">TTC</th>' : ''}<th>Encaissement</th><th>Fichier</th><th></th></tr></thead><tbody>${facRows}</tbody></table></div>` : '<p class="empty">Aucune facture enregistrée.</p>'}
    <p class="muted">Le CA d'une facture est compté dans le mois de sa <strong>date d'encaissement</strong>.</p>`;

  return {
    html,
    bind(root) {
      root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewFile(b.dataset.view)));
      root.querySelector('[data-edit]').addEventListener('click', () => openMissionForm(m));
      root.querySelector('[data-del]').addEventListener('click', async () => {
        if (await confirmBox(`Supprimer la mission « ${m.client} » avec ses devis, factures et justificatifs ? Cette action est définitive.`, { ok: 'Supprimer', danger: true })) {
          await deleteMission(m.id); toast('Mission supprimée'); location.hash = '#/missions';
        }
      });
      root.querySelector('[data-add-devis]').addEventListener('click', () => openDevisForm(m));
      root.querySelector('[data-add-fac]').addEventListener('click', () => openFactureForm(m));
      root.querySelectorAll('[data-edit-devis]').forEach((b) => b.addEventListener('click', () => openDevisForm(m, m.devis.find((d) => d.id === b.dataset.editDevis))));
      root.querySelectorAll('[data-edit-fac]').forEach((b) => b.addEventListener('click', () => openFactureForm(m, m.factures.find((f) => f.id === b.dataset.editFac))));
      root.querySelectorAll('[data-enc]').forEach((b) => b.addEventListener('click', () => openEncaisser(m.id, b.dataset.enc)));
    },
  };
}

/* ===================== Formulaires ===================== */
export function openMissionForm(m = null) {
  const isNew = !m;
  const cur = m || { client: '', ref: '', adresse: '', siret: '', nature: '', notes: '', annee: state.year };
  const modal = openModal({
    title: isNew ? 'Nouvelle mission' : 'Modifier la mission',
    body: `<form class="form">
      ${field('Client *', `<input name="client" required value="${esc(cur.client)}" autocomplete="off">`)}
      ${field('Référence / nom de la mission', `<input name="ref" value="${esc(cur.ref)}">`)}
      ${field('Nature de la prestation', `<input name="nature" value="${esc(cur.nature)}">`)}
      ${field('Adresse du client', `<input name="adresse" value="${esc(cur.adresse)}">`)}
      ${field('SIRET du client', `<input name="siret" inputmode="numeric" value="${esc(cur.siret)}">`)}
      ${field('Année de la mission', `<input name="annee" type="number" min="2000" max="2100" required value="${esc(cur.annee)}">`)}
      ${field('Notes', `<textarea name="notes" rows="2">${esc(cur.notes)}</textarea>`)}
      <div class="form-actions"><button type="button" class="btn" data-close2>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
  });
  modal.$('[data-close2]').addEventListener('click', () => modal.close());
  modal.$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const mission = { ...(m || { id: uid(), devis: [], factures: [], created: new Date().toISOString() }), ...fd, annee: Number(fd.annee) };
    await saveMission(mission);
    modal.close(); toast('Mission enregistrée');
    if (isNew) location.hash = `#/mission/${mission.id}`; else hooks.render();
  });
}

function openDevisForm(m, d = null) {
  const cur = d || { numero: '', dateSignature: today(), datePrevue: '', montantHT: '', fileId: null };
  const modal = openModal({
    title: d ? 'Modifier le devis' : 'Ajouter un devis signé',
    body: `<form class="form">
      ${field('Numéro du devis', `<input name="numero" value="${esc(cur.numero)}">`)}
      ${field('Date de signature', `<input name="dateSignature" type="date" value="${esc(cur.dateSignature)}">`)}
      ${field('Date de réalisation prévue', `<input name="datePrevue" type="date" value="${esc(cur.datePrevue || '')}">`, 'Facultatif. Le devis est suivi dans ce mois-là (sinon dans le mois de signature), pour comparer le travail prévu à l\'argent encaissé.')}
      ${field('Montant HT (€)', `<input name="montantHT" inputmode="decimal" required value="${esc(cur.montantHT)}">`)}
      <div class="field"><span>Devis signé (PDF ou photo)</span><div id="fp"></div></div>
      <div class="form-actions">${d ? '<button type="button" class="btn danger" data-del>Supprimer</button>' : ''}<span class="spacer"></span>
        <button type="button" class="btn" data-close2>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
  });
  const fp = new FilePicker(modal.$('#fp'), { ids: cur.fileId ? [cur.fileId] : [], multiple: false });
  modal.$('[data-close2]').addEventListener('click', () => modal.close());
  const del = modal.$('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmBox('Supprimer ce devis et son fichier ?', { ok: 'Supprimer', danger: true }))) return;
    m.devis = m.devis.filter((x) => x.id !== d.id);
    await saveMission(m); await deleteFiles([d.fileId]); modal.close(); hooks.render();
  });
  modal.$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const ids = await fp.commit();
    const rec = { id: d ? d.id : uid(), numero: fd.numero, dateSignature: fd.dateSignature, datePrevue: fd.datePrevue || '', montantHT: num(fd.montantHT), fileId: ids[0] || null };
    m.devis = d ? m.devis.map((x) => (x.id === d.id ? rec : x)) : [...(m.devis || []), rec];
    await saveMission(m); await fp.cleanup(); modal.close(); toast('Devis enregistré'); hooks.render();
  });
}

function openFactureForm(m, f = null) {
  const s = missionStats(m);
  const cur = f || {
    numero: nextFactureNumber(state.data, state.year), date: today(),
    montantHT: s.resteAFacturer > 0 ? s.resteAFacturer : '', tvaTaux: isAssujetti(state.data.settings) ? (state.data.settings.tvaTaux || 20) : 0,
    dateEncaissement: '', mode: '', fileId: null,
  };
  const modal = openModal({
    title: f ? 'Modifier la facture' : 'Ajouter une facture',
    body: `<form class="form">
      ${field('Numéro de facture *', `<input name="numero" required value="${esc(cur.numero)}">`)}
      ${field('Date de la facture', `<input name="date" type="date" required value="${esc(cur.date)}">`)}
      ${field('Montant HT (€) *', `<input name="montantHT" inputmode="decimal" required value="${esc(cur.montantHT)}">`)}
      ${isAssujetti(state.data.settings) ? field('Taux de TVA (%)', `<input name="tvaTaux" inputmode="decimal" value="${esc(cur.tvaTaux)}">`, 'TVA ajoutée au montant HT (20 %, 10 %, 5,5 %…).') : ''}
      <fieldset><legend>Encaissement</legend>
        ${field('Date d\'encaissement', `<input name="dateEncaissement" type="date" value="${esc(cur.dateEncaissement)}">`, 'Laissez vide tant que le paiement n\'est pas reçu : le CA n\'est compté qu\'à cette date.')}
        ${field('Mode d\'encaissement', `<select name="mode"><option value=""></option>${options(MODES.map((x) => [x, x]), cur.mode)}</select>`)}
      </fieldset>
      <div class="field"><span>Facture (PDF ou photo)</span><div id="fp"></div></div>
      <div class="form-actions">${f ? '<button type="button" class="btn danger" data-del>Supprimer</button>' : ''}<span class="spacer"></span>
        <button type="button" class="btn" data-close2>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
  });
  const fp = new FilePicker(modal.$('#fp'), { ids: cur.fileId ? [cur.fileId] : [], multiple: false });
  modal.$('[data-close2]').addEventListener('click', () => modal.close());
  const del = modal.$('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmBox('Supprimer cette facture et son fichier ?', { ok: 'Supprimer', danger: true }))) return;
    m.factures = m.factures.filter((x) => x.id !== f.id);
    await saveMission(m); await deleteFiles([f.fileId]); modal.close(); hooks.render();
  });
  modal.$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const ids = await fp.commit();
    const rec = {
      id: f ? f.id : uid(), numero: fd.numero, date: fd.date, montantHT: num(fd.montantHT), tvaTaux: isAssujetti(state.data.settings) ? num(fd.tvaTaux) : 0,
      dateEncaissement: fd.dateEncaissement || '', mode: fd.mode, fileId: ids[0] || null,
    };
    m.factures = f ? m.factures.map((x) => (x.id === f.id ? rec : x)) : [...(m.factures || []), rec];
    await saveMission(m); await fp.cleanup(); modal.close(); toast('Facture enregistrée'); hooks.render();
  });
}

/** Saisie rapide de l'encaissement d'une facture (date + mode). */
export function openEncaisser(missionId, factureId) {
  const m = missionById(missionId);
  const f = (m.factures || []).find((x) => x.id === factureId);
  const tvaOn = isAssujetti(state.data.settings);
  const a = factureAmounts(f, tvaOn);
  const modal = openModal({
    title: `Encaisser la facture ${f.numero}`,
    body: `<form class="form">
      <p>${esc(m.client)} — <strong>${eur(tvaOn ? a.ttc : a.ht)}</strong>${tvaOn ? ' TTC' : ''}</p>
      ${field('Date d\'encaissement', `<input name="dateEncaissement" type="date" required value="${today()}">`, 'C\'est la date à laquelle l\'argent est arrivé (relevé bancaire, remise de chèque…).')}
      ${field('Mode d\'encaissement', `<select name="mode">${options(MODES.map((x) => [x, x]), f.mode || 'Virement')}</select>`)}
      <div class="form-actions"><button type="button" class="btn" data-close2>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
  });
  modal.$('[data-close2]').addEventListener('click', () => modal.close());
  modal.$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    f.dateEncaissement = fd.dateEncaissement; f.mode = fd.mode;
    await saveMission(m); modal.close(); toast(`Encaissement enregistré — compté en ${fd.dateEncaissement.slice(5, 7)}/${fd.dateEncaissement.slice(0, 4)}`); hooks.render();
  });
}
