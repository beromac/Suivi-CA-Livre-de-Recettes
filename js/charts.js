// Graphiques SVG sans bibliothèque : évolution mensuelle, progression vers le seuil de TVA, répartition par client.
import { MOIS, summarizeYear, caParClient, depensesParCategorie, caCumule, margeTva, margePlafond, isAssujetti } from './calc.js';
import { esc, eur } from './util.js';

export const COLORS = ['#0b6e63', '#d9822b', '#3b6fb6', '#b5486b', '#7a5ab0', '#5f9b2f', '#c0a000', '#2a9db8', '#8a8f8e'];
const C_CA = COLORS[0], C_DEP = COLORS[1], C_URS = COLORS[2];

const pc1 = (part) => String(Math.round(part * 1000) / 10).replace('.', ',');
const ABBR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const short = (v) => (Math.abs(v) >= 1000 ? `${String(Math.round(v / 100) / 10).replace('.', ',')} k` : String(String(Math.round(v * 10) / 10).replace('.', ',')));

/** Échelle « ronde » : pas de 1, 2, 2,5 ou 5 × 10^n, maximum multiple du pas, 3 à 6 graduations. */
function niceScale(v) {
  if (v <= 0) return { max: 100, step: 25 };
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  return { max: Math.ceil(v / step - 1e-9) * step, step };
}

const frame = (w, h, inner, label) => `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

function axes(W, H, m, { max, step }) {
  let out = '';
  for (let v = 0; v <= max + 1e-9; v += step) {
    const y = H - m.b - ((H - m.t - m.b) * v) / max;
    out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" class="grid"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" class="tick">${short(v)}</text>`;
  }
  return out;
}

const legend = (items) => `<div class="legend">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}</div>`;

/** Barres groupées : CA encaissé, dépenses, cotisations URSSAF dues, par mois. */
export function barsMensuel(data, year) {
  const ms = summarizeYear(data, year).months;
  const series = [['CA encaissé', C_CA, 'recettesHT'], ['Dépenses', C_DEP, 'depensesHT'], ['URSSAF dû', C_URS, 'urssafDu']];
  const sc = niceScale(Math.max(...ms.flatMap((m) => series.map((s) => m[s[2]])))), max = sc.max;
  const W = 720, H = 280, m = { l: 48, r: 8, t: 10, b: 28 };
  const gw = (W - m.l - m.r) / 12, bw = Math.min(14, (gw - 8) / 3);
  let inner = axes(W, H, m, sc);
  ms.forEach((mo, i) => {
    const x0 = m.l + gw * i + (gw - bw * 3) / 2;
    series.forEach(([name, col, key], j) => {
      const v = mo[key], h = ((H - m.t - m.b) * v) / max;
      inner += `<rect x="${x0 + j * bw}" y="${H - m.b - h}" width="${bw - 1}" height="${Math.max(h, v > 0 ? 1 : 0)}" fill="${col}" rx="1.5"><title>${MOIS[i]} — ${name} : ${eur(v)}</title></rect>`;
    });
    inner += `<text x="${m.l + gw * i + gw / 2}" y="${H - 9}" text-anchor="middle" class="tick">${ABBR[i]}</text>`;
  });
  return frame(W, H, inner, `CA, dépenses et URSSAF par mois en ${year}`) + legend(series.map((s) => [s[1], s[0]]));
}

/** Courbe du CA cumulé, avec la ligne du seuil de TVA si on est en franchise. */
export function courbeCumul(data, year) {
  const cum = caCumule(data, year);
  const t = margeTva(data, year);
  const seuil = !isAssujetti(data.settings) && t.seuil ? t.seuil : 0;
  const plafond = margePlafond(data, year).plafond;
  const top = Math.max(cum[11].cumul, seuil * 1.05, plafond * 1.05);
  const sc = niceScale(top), max = sc.max;
  const W = 720, H = 240, m = { l: 48, r: 8, t: 10, b: 28 };
  const gw = (W - m.l - m.r) / 12;
  const px = (i) => m.l + gw * i + gw / 2, py = (v) => H - m.b - ((H - m.t - m.b) * v) / max;
  let inner = axes(W, H, m, sc);
  const pts = cum.map((c, i) => `${px(i)},${py(c.cumul)}`).join(' ');
  inner += `<polyline points="${pts}" fill="none" stroke="${C_CA}" stroke-width="2.5" stroke-linejoin="round"/>`;
  cum.forEach((c, i) => { inner += `<circle cx="${px(i)}" cy="${py(c.cumul)}" r="3.5" fill="${C_CA}"><title>${MOIS[i]} — cumul : ${eur(c.cumul)}</title></circle><text x="${px(i)}" y="${H - 9}" text-anchor="middle" class="tick">${ABBR[i]}</text>`; });
  if (seuil) inner += `<line x1="${m.l}" x2="${W - m.r}" y1="${py(seuil)}" y2="${py(seuil)}" stroke="${COLORS[3]}" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${W - m.r - 4}" y="${py(seuil) - 5}" text-anchor="end" class="tick" fill="${COLORS[3]}">seuil de TVA ${eur(seuil)}</text>`;
  if (plafond) inner += `<line x1="${m.l}" x2="${W - m.r}" y1="${py(plafond)}" y2="${py(plafond)}" stroke="${COLORS[4]}" stroke-width="1.5" stroke-dasharray="2 4"/><text x="${W - m.r - 4}" y="${py(plafond) + 13}" text-anchor="end" class="tick" fill="${COLORS[4]}">plafond micro-entreprise ${eur(plafond)}</text>`;
  return frame(W, H, inner, `CA encaissé cumulé en ${year}`) + legend([[C_CA, 'CA encaissé cumulé'], ...(seuil ? [[COLORS[3], 'Seuil de franchise de TVA']] : []), ...(plafond ? [[COLORS[4], 'Plafond de CA micro-entreprise']] : [])]);
}

/** Camembert (anneau) générique : items = [{label, montant, part, href?, note?, autres?}], légende chiffrée à côté. */
function donut(items, { centre, aria, vide }) {
  if (!items.length) return `<p class="muted">${vide}</p>`;
  const R = 90, r = 52, cx = 100, cy = 100;
  let a0 = -Math.PI / 2, inner = '';
  const pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  const color = (x, i) => (x.autres ? COLORS[8] : COLORS[i % 8]);
  items.forEach((x, i) => {
    const col = color(x, i);
    const tip = `<title>${esc(x.label)} : ${eur(x.montant)} (${pc1(x.part)} %)</title>`;
    if (x.part >= 0.9999) { inner += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${col}" stroke-width="${R - r}">${tip}</circle>`; return; }
    const a1 = a0 + x.part * Math.PI * 2, big = x.part > 0.5 ? 1 : 0;
    inner += `<path d="M${pt(R, a0)} A${R},${R} 0 ${big} 1 ${pt(R, a1)} L${pt(r, a1)} A${r},${r} 0 ${big} 0 ${pt(r, a0)} Z" fill="${col}" stroke="var(--surface)" stroke-width="1.5">${tip}</path>`;
    a0 = a1;
  });
  inner += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-v">${eur(items.reduce((s, x) => s + x.montant, 0))}</text><text x="${cx}" y="${cy + 14}" text-anchor="middle" class="tick">${esc(centre)}</text>`;
  const rows = items.map((x, i) => `<li><i style="background:${color(x, i)}"></i><span class="who">${x.href ? `<a href="${x.href}">${esc(x.label)}</a>` : esc(x.label)}${x.note ? ` <span class="muted">(${esc(x.note)})</span>` : ''}</span><span class="num">${eur(x.montant)}</span><span class="num pc">${pc1(x.part)} %</span></li>`).join('');
  return `<div class="donut-wrap">${frame(200, 200, inner, aria)}<ul class="donut-legend">${rows}</ul></div>`;
}

/** Camembert du CA encaissé par client. */
export function camembertClients(data, year) {
  const list = caParClient(data, year).map((x) => ({ label: x.client, montant: x.montant, part: x.part, autres: x.autres, note: x.autres ? `${x.autres} clients` : '', href: x.missionId ? `#/mission/${x.missionId}` : '' }));
  return donut(list, { centre: 'encaissé HT', aria: `Répartition du CA ${year} par client`, vide: 'Aucun encaissement cette année : le graphique apparaîtra dès qu\'une facture sera encaissée.' });
}

/** Camembert des dépenses professionnelles par catégorie. */
export function camembertDepenses(data, year) {
  const list = depensesParCategorie(data, year);
  return donut(list, { centre: isAssujetti(data.settings) ? 'dépensé HT' : 'dépensé', aria: `Répartition des dépenses ${year} par catégorie`, vide: 'Aucune dépense cette année : le graphique apparaîtra dès qu\'une dépense sera enregistrée.' });
}

/** Bloc complet pour le Récap et l'impression annuelle. */
export function chartsHtml(data, year) {
  return `<div class="charts-block"><h2>Graphiques ${year}</h2>
    <div class="charts">
      <section class="chart-card"><h3>Évolution mensuelle : CA, dépenses, URSSAF</h3>${barsMensuel(data, year)}</section>
      <section class="chart-card"><h3>CA encaissé cumulé, seuil de TVA et plafond</h3>${courbeCumul(data, year)}</section>
      <section class="chart-card"><h3>Répartition du CA par client</h3>${camembertClients(data, year)}</section>
      <section class="chart-card"><h3>Où je dépense le plus (par catégorie)</h3>${camembertDepenses(data, year)}</section>
    </div></div>`;
}
