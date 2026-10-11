// Run once after adding API keys:  npm run images --prefix server
import { db } from './db.js';
import { ensureImage, imageProvidersConfigured } from './images.js';

if (!imageProvidersConfigured()) {
  console.error('Set PIXABAY_API_KEY and/or PEXELS_API_KEY in server/.env first.');
  process.exit(1);
}
const words = db.prepare('SELECT * FROM words WHERE image_url IS NULL AND query != ''').all();
let ok = 0;
for (const w of words) {
  const r = await ensureImage(w);
  if (r.image_url) ok++;
  console.log(r.image_url ? '✔' : '✘', w.word);
}
console.log(`${ok}/${words.length} images cached.`);
