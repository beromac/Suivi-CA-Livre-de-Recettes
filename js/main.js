import * as db from './db.js';
import { state, load, setYear, hooks } from './state.js';
import { yearsInData } from './calc.js';
import { esc } from './util.js';
import { openModal, toast } from './ui.js';
import * as recap from './view-recap.js';
import * as missions from './view-missions.js';
import * as livres from './view-livres.js';
import * as urssaf from './view-urssaf.js';
import * as imprimer from './view-imprimer.js';
import * as reglages from './view-reglages.js';
import * as documents from './view-documents.js';
import * as kmView from './view-km.js';
import * as impots from './view-impots.js';
import { isConfigured, startAuto } from './sync.js';

const routes = {
  recap: () => recap.render(),
  missions: (p, q) => missions.renderList(p, q),
  mission: (p) => missions.renderDetail(p),
  recettes: (p) => livres.renderRecettes(p),
  depenses: (p) => livres.renderDepenses(p),
  urssaf: () => urssaf.render(),
  km: (p) => kmView.render(p),
  impots: () => impots.render(),
  documents: () => documents.render(),
  imprimer: () => imprimer.render(),
  reglages: () => reglages.render(),
};
const navKey = { mission: 'missions' };

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const [name = 'recap', ...params] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: routes[name] ? name : 'recap', params, query: Object.fromEntries(new URLSearchParams(qs)) };
}

let lastKey = '';
async function render() {
  const { name, params, query } = parseHash();
  const key = location.hash;
  const root = document.getElementById('app');
  const view = await routes[name](params, query);
  root.innerHTML = view.html;
  view.bind && view.bind(root);
  document.querySelectorAll('#mainnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (navKey[name] || name)));
  document.getElementById('yearLabel').textContent = state.year;
  if (key !== lastKey) { window.scrollTo(0, 0); lastKey = key; }
}
hooks.render = () => render().catch(showError);

function showError(e) {
  console.error(e);
  toast(`Erreur : ${e.message || e}`, 'err');
}

function changeYear(y) {
  setYear(y);
  render().catch(showError);
}

function openYearPicker() {
  const now = new Date().getFullYear();
  const years = [...new Set([...yearsInData(state.data, [state.year, now]), now + 1])].sort((a, b) => b - a);
  const m = openModal({
    title: 'Choisir l\'année',
    body: `<div class="check-grid">${years.map((y) => `<button type="button" class="btn${y === state.year ? ' primary' : ''}" data-y="${y}">${y}</button>`).join('')}</div>
      <form class="form" style="margin-top:1rem"><label class="field"><span>Ouvrir une autre année</span><input name="y" type="number" min="2000" max="2100" placeholder="ex. ${now + 2}" required></label>
      <div class="form-actions"><button class="btn primary">Ouvrir</button></div></form>`,
  });
  m.el.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { changeYear(b.dataset.y); m.close(); }));
  m.$('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const y = Number(new FormData(e.target).get('y'));
    if (y >= 2000 && y <= 2100) { changeYear(y); m.close(); }
  });
}

async function boot() {
  try {
    await db.open();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="notice warn"><strong>Stockage indisponible.</strong> Ce navigateur bloque la base de données locale (navigation privée ?). Ouvrez l'application dans une fenêtre normale.<br><small>${esc(e.message || e)}</small></div>`;
    return;
  }
  await load();
  document.getElementById('yearPrev').addEventListener('click', () => changeYear(state.year - 1));
  document.getElementById('yearNext').addEventListener('click', () => changeYear(state.year + 1));
  document.getElementById('yearLabel').addEventListener('click', openYearPicker);
  window.addEventListener('hashchange', () => render().catch(showError));
  if (!location.hash) location.hash = '#/recap';
  await render();

  // Demande à ne pas effacer les données automatiquement (utile sur Android).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (isConfigured()) startAuto((e) => toast(`Synchronisation : ${e.message}`, 'err'));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors-ligne indisponible, sans gravité */ });
  }
}

boot();
