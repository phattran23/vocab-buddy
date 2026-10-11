import fs from 'node:fs/promises';
import path from 'node:path';
import { db, IMAGE_DIR } from './db.js';

const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;

export const imageProvidersConfigured = () => Boolean(PIXABAY_KEY || PEXELS_KEY);

async function searchPixabay(q) {
  if (!PIXABAY_KEY) return null;
  const url = new URL('https://pixabay.com/api/');
  url.search = new URLSearchParams({
    key: PIXABAY_KEY, q, image_type: 'illustration', safesearch: 'true', per_page: '5', order: 'popular',
  });
  const res = await fetch(url);
  if (!res.ok) return null;
  const hit = (await res.json()).hits?.[0];
  return hit ? { url: hit.webformatURL, credit: `${hit.user} / Pixabay` } : null;
}

async function searchPexels(q) {
  if (!PEXELS_KEY) return null;
  const url = new URL('https://api.pexels.com/v1/search');
  url.search = new URLSearchParams({ query: q, per_page: '1', orientation: 'square' });
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) return null;
  const photo = (await res.json()).photos?.[0];
  return photo ? { url: photo.src.medium, credit: `${photo.photographer} / Pexels` } : null;
}

const inflight = new Map();
const failedAt = new Map(); // word id -> ms; avoid hammering providers on repeated misses
const RETRY_MS = 10 * 60 * 1000;

async function download(word) {
  if (Date.now() - (failedAt.get(word.id) ?? 0) < RETRY_MS) return word;
  try {
    const found = (await searchPixabay(word.query)) ?? (await searchPexels(word.query));
    if (!found) throw new Error('no result');
    const img = await fetch(found.url);
    if (!img.ok) throw new Error(`download ${img.status}`);
    const file = `${word.id}.jpg`;
    await fs.writeFile(path.join(IMAGE_DIR, file), Buffer.from(await img.arrayBuffer()));
    db.prepare('UPDATE words SET image_url = ?, image_credit = ? WHERE id = ?')
      .run(`/images/${file}`, found.credit, word.id);
    return { ...word, image_url: `/images/${file}`, image_credit: found.credit };
  } catch (err) {
    failedAt.set(word.id, Date.now());
    console.warn(`[images] ${word.word}: ${err.message}`);
    return word;
  }
}

/** Returns the word row with image_url filled in (downloaded + cached on disk) when possible. */
export function ensureImage(word) {
  if (word.image_url || !word.query || !imageProvidersConfigured()) return Promise.resolve(word);
  if (!inflight.has(word.id)) {
    inflight.set(word.id, download(word).finally(() => inflight.delete(word.id)));
  }
  return inflight.get(word.id);
}
