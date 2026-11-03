import * as db from './db.js';
import { uid, compressImage } from './util.js';

/** Enregistre un justificatif (photo ou PDF) et renvoie son identifiant. */
export async function saveFile(file) {
  let blob = file;
  let type = file.type || 'application/octet-stream';
  let name = file.name || 'justificatif';
  if (type.startsWith('image/')) {
    blob = await compressImage(file);
    if (blob !== file) { type = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg'; }
  }
  const id = uid();
  await db.put('files', { id, name, type, size: blob.size, created: new Date().toISOString(), blob });
  return id;
}

export const getFile = (id) => db.get('files', id);

export async function deleteFiles(ids) {
  for (const id of ids || []) if (id) await db.del('files', id);
}

let pdfjs;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** Convertit un PDF en images (une par page) pour pouvoir l'imprimer avec le reste. */
export async function pdfToImages(blob, scale = 1.5) {
  const lib = await loadPdfjs();
  const pdf = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return pages;
}
