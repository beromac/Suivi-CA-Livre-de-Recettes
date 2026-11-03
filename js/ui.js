import { esc } from './util.js';
import { getFile, saveFile, deleteFiles } from './files.js';

/* ---------- Fenêtres modales ---------- */
export function openModal({ title, body, wide = false, onClose }) {
  const host = document.getElementById('modals');
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button></div>
    <div class="modal-body">${body}</div></div>`;
  host.appendChild(el);
  document.body.classList.add('modal-open');
  const api = {
    el,
    $: (sel) => el.querySelector(sel),
    close() {
      el.remove();
      if (!host.children.length) document.body.classList.remove('modal-open');
      onClose && onClose();
    },
  };
  el.addEventListener('mousedown', (e) => { if (e.target === el) api.close(); });
  el.querySelector('[data-close]').addEventListener('click', () => api.close());
  return api;
}

export function confirmBox(message, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title: 'Confirmation',
      body: `<p>${esc(message)}</p><div class="form-actions"><button type="button" class="btn" data-no>Annuler</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button></div>`,
      onClose: () => finish(false),
    });
    m.$('[data-no]').addEventListener('click', () => m.close());
    m.$('[data-yes]').addEventListener('click', () => { finish(true); m.close(); });
  });
}

let toastTimer;
export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

/* ---------- Visionneuse de justificatif ---------- */
export async function viewFile(id) {
  const f = await getFile(id);
  if (!f) { toast('Fichier introuvable', 'err'); return; }
  const url = URL.createObjectURL(f.blob);
  const isImg = f.type.startsWith('image/');
  const m = openModal({
    title: f.name,
    wide: true,
    body: `${isImg ? `<img class="viewer-img" src="${url}" alt="${esc(f.name)}">`
      : `<iframe class="viewer-pdf" src="${url}" title="${esc(f.name)}"></iframe>`}
      <div class="form-actions"><a class="btn" href="${url}" target="_blank" rel="noopener">Ouvrir dans un onglet</a>
      <a class="btn" href="${url}" download="${esc(f.name)}">Télécharger</a></div>`,
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
  });
  return m;
}

/* ---------- Sélecteur de justificatifs (photo / PDF) ---------- */
export class FilePicker {
  /** @param {HTMLElement} el conteneur ; @param {{ids?:string[], multiple?:boolean}} opts */
  constructor(el, { ids = [], multiple = true } = {}) {
    this.el = el;
    this.multiple = multiple;
    this.existing = [...ids];   // fichiers déjà enregistrés
    this.removed = [];          // à supprimer après enregistrement de la fiche
    this.added = [];            // nouveaux fichiers (File)
    this.names = {};
    this.render();
  }

  async render() {
    for (const id of this.existing) {
      if (!this.names[id]) { const f = await getFile(id); this.names[id] = f ? f.name : '(introuvable)'; }
    }
    const chips = [
      ...this.existing.map((id) => `<span class="chip"><button type="button" class="link" data-view="${id}">📄 ${esc(this.names[id])}</button><button type="button" class="x" data-rm-existing="${id}" aria-label="Retirer">✕</button></span>`),
      ...this.added.map((f, i) => `<span class="chip new">🆕 ${esc(f.name)}<button type="button" class="x" data-rm-new="${i}" aria-label="Retirer">✕</button></span>`),
    ].join('');
    const full = !this.multiple && this.existing.length + this.added.length >= 1;
    this.el.innerHTML = `<div class="chips">${chips || '<span class="muted">Aucun fichier</span>'}</div>
      ${full ? '' : `<div class="pick-btns">
        <label class="btn small">📎 Ajouter un fichier<input type="file" accept="image/*,application/pdf" ${this.multiple ? 'multiple' : ''} hidden data-pick></label>
        <label class="btn small">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" hidden data-pick></label></div>`}`;
    this.el.querySelectorAll('[data-pick]').forEach((inp) => inp.addEventListener('change', () => {
      this.added.push(...inp.files);
      this.render();
    }));
    this.el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewFile(b.dataset.view)));
    this.el.querySelectorAll('[data-rm-existing]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.rmExisting;
      this.existing = this.existing.filter((x) => x !== id);
      this.removed.push(id);
      this.render();
    }));
    this.el.querySelectorAll('[data-rm-new]').forEach((b) => b.addEventListener('click', () => {
      this.added.splice(Number(b.dataset.rmNew), 1);
      this.render();
    }));
  }

  /** Enregistre les nouveaux fichiers et renvoie la liste finale d'identifiants. */
  async commit() {
    const ids = [...this.existing];
    for (const f of this.added) ids.push(await saveFile(f));
    return ids;
  }

  /** À appeler une fois la fiche enregistrée : supprime les fichiers retirés. */
  async cleanup() { await deleteFiles(this.removed); }
}

/* ---------- Petits helpers de formulaire ---------- */
export const field = (label, input, hint = '') =>
  `<label class="field"><span>${label}</span>${input}${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;

export const options = (list, selected) =>
  list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(l)}</option>`).join('');
