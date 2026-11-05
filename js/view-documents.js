// Documents administratifs : attestations URSSAF, assurance RCP, avis d'imposition, Kbis/INSEE, contrats…
// Chaque document peut avoir une date d'échéance (ex. fin de validité de l'attestation RCP) : une alerte s'affiche.
import { state, hooks, saveDocument, deleteDocument } from './state.js';
import { CATEGORIES_DOC, statutDocument } from './calc.js';
import { esc, fmtDate, today, uid } from './util.js';
import { openModal, confirmBox, toast, field, options, FilePicker, viewFile } from './ui.js';

const ALERTE_JOURS = 60;

/** Documents expirés ou arrivant à échéance (pour l'alerte du Récap). */
export function documentsAlertes(data) {
  return (data.documents || [])
    .map((d) => ({ d, s: statutDocument(d, today(), ALERTE_JOURS) }))
    .filter((x) => x.s.etat === 'expire' || x.s.etat === 'bientot')
    .sort((a, b) => a.s.jours - b.s.jours);
}

const badge = (s) => s.etat === 'expire' ? `<span class="badge warn">Expiré depuis ${-s.jours} j</span>`
  : s.etat === 'bientot' ? `<span class="badge warn">Expire dans ${s.jours} j</span>`
  : s.etat === 'ok' ? '<span class="badge ok">Valide</span>' : '';

export function alerteHtml(data) {
  const a = documentsAlertes(data);
  if (!a.length) return '';
  return `<div class="notice warn">🗂 <strong>Documents administratifs à renouveler</strong> :
    ${a.map(({ d, s }) => `${esc(d.titre)} (${s.etat === 'expire' ? `expiré le ${fmtDate(d.dateEcheance)}` : `échéance le ${fmtDate(d.dateEcheance)}`})`).join(' · ')}
    — <a href="#/documents">voir les documents</a></div>`;
}

export function render() {
  const { data } = state;
  const docs = [...(data.documents || [])];
  const groups = Object.entries(CATEGORIES_DOC).map(([k, label]) => [k, label, docs.filter((d) => (CATEGORIES_DOC[d.categorie] ? d.categorie : 'autre') === k)
    .sort((a, b) => String(b.dateDocument || '').localeCompare(String(a.dateDocument || '')))]).filter((g) => g[2].length);

  const card = (d) => {
    const s = statutDocument(d, today(), ALERTE_JOURS);
    const n = (d.fileIds || []).length;
    return `<div class="card doc">
      <div class="page-head"><strong>${esc(d.titre)}</strong> ${badge(s)}</div>
      <p class="muted" style="margin:.2rem 0">${[d.organisme ? esc(d.organisme) : '', d.reference ? `N° ${esc(d.reference)}` : '', d.dateDocument ? `du ${fmtDate(d.dateDocument)}` : '', d.dateEcheance ? `valable jusqu'au ${fmtDate(d.dateEcheance)}` : ''].filter(Boolean).join(' · ')}</p>
      ${d.notes ? `<p style="margin:.2rem 0">${esc(d.notes)}</p>` : ''}
      <div class="doc-actions">
        ${n ? (d.fileIds || []).map((id, i) => `<button class="btn small" data-view="${esc(id)}">📄 ${n > 1 ? `Fichier ${i + 1}` : 'Ouvrir'}</button>`).join('') : '<span class="badge warn">aucun fichier</span>'}
        <button class="btn small" data-edit="${esc(d.id)}">Modifier</button>
      </div></div>`;
  };

  const html = `
    <div class="page-head"><h1>Documents administratifs</h1><button class="btn primary" data-new>＋ Ajouter un document</button></div>
    <p class="muted">Gardez ici vos documents importants (attestation de vigilance URSSAF, assurance RCP, avis d'imposition, Kbis / avis de situation INSEE, contrats…). Ils sont sauvegardés et synchronisés comme le reste. Indiquez une date d'échéance pour être prévenu avant l'expiration.</p>
    ${alerteHtml(data)}
    ${groups.length ? groups.map(([k, label, list]) => `<h2>${esc(label)} <span class="badge">${list.length}</span></h2><div class="docs">${list.map(card).join('')}</div>`).join('')
      : '<div class="card"><p>Aucun document pour le moment.</p><p class="muted">Exemples : attestation d\'assurance RCP, attestation de vigilance URSSAF, avis de situation INSEE, avis de CFE.</p></div>'}`;

  return {
    html,
    bind(root) {
      root.querySelector('[data-new]').addEventListener('click', () => openDocumentForm(null));
      root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openDocumentForm(docs.find((x) => x.id === b.dataset.edit))));
      root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewFile(b.dataset.view)));
    },
  };
}

export function openDocumentForm(d) {
  const cur = d || { titre: '', categorie: 'assurance', organisme: '', reference: '', dateDocument: today(), dateEcheance: '', notes: '', fileIds: [] };
  const modal = openModal({
    title: d ? 'Modifier le document' : 'Nouveau document',
    body: `<form class="form">
      ${field('Titre *', `<input name="titre" required value="${esc(cur.titre)}" placeholder="ex. Attestation RCP 2026" autocomplete="off">`)}
      ${field('Catégorie', `<select name="categorie">${options(Object.entries(CATEGORIES_DOC), cur.categorie)}</select>`)}
      ${field('Organisme / assureur', `<input name="organisme" value="${esc(cur.organisme || '')}" autocomplete="off">`)}
      ${field('N° de contrat / référence', `<input name="reference" value="${esc(cur.reference || '')}" autocomplete="off">`)}
      ${field('Date du document', `<input name="dateDocument" type="date" value="${esc(cur.dateDocument || '')}">`)}
      ${field('Date d\'échéance (fin de validité)', `<input name="dateEcheance" type="date" value="${esc(cur.dateEcheance || '')}">`, `Facultatif. Une alerte s'affiche ${ALERTE_JOURS} jours avant, sur cette page et dans le Récap.`)}
      ${field('Notes', `<textarea name="notes" rows="2">${esc(cur.notes || '')}</textarea>`)}
      <div class="field"><span>Fichier(s) : PDF ou photo</span><div id="fp"></div></div>
      <div class="form-actions">${d ? '<button type="button" class="btn danger" data-del>Supprimer</button>' : ''}<span class="spacer"></span>
        <button type="button" class="btn" data-close2>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
  });
  const fp = new FilePicker(modal.$('#fp'), { ids: cur.fileIds || [], multiple: true });
  modal.$('[data-close2]').addEventListener('click', () => modal.close());
  const del = modal.$('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (await confirmBox('Supprimer ce document et ses fichiers ?', { ok: 'Supprimer', danger: true })) {
      await deleteDocument(d.id); modal.close(); toast('Document supprimé'); hooks.render();
    }
  });
  modal.$('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const fileIds = await fp.commit();
    await saveDocument({ id: d ? d.id : uid(), titre: fd.titre, categorie: fd.categorie, organisme: fd.organisme, reference: fd.reference, dateDocument: fd.dateDocument, dateEcheance: fd.dateEcheance, notes: fd.notes, fileIds });
    await fp.cleanup(); modal.close(); toast('Document enregistré'); hooks.render();
  });
}
