import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { db, IMAGE_DIR } from './db.js';
import { ensureImage, imageProvidersConfigured } from './images.js';

const PORT = process.env.PORT || 4000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';
if (!process.env.JWT_SECRET) console.warn('[auth] JWT_SECRET not set, using an insecure dev secret.');
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Leitner boxes: days until a word is due again, indexed by box (1..5).
const BOX_DAYS = [0, 1, 2, 4, 8, 16];
const DAY = 86_400_000;
const XP_PER_CORRECT = 10;

const app = express();
app.use(cors());
app.use(express.json());
app.use('/images', express.static(IMAGE_DIR, { maxAge: '7d' }));

// ---------- helpers ----------
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: 'Something went wrong' });
});

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, xp: u.xp, streak: u.streak });
const sign = (u) => jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '30d' });

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in' });
  }
}

const today = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const shapeWord = (w, box = null) => ({
  id: w.id, word: w.word, vi: w.vi, phonetic: w.phonetic, definition: w.definition,
  example: w.example, visual: !w.pos, pos: w.pos, exampleVi: w.vi_example, emoji: w.emoji, image: w.image_url, credit: w.image_credit, box,
});

// Extra wrong answers: 8 picture words and 8 text-only (TOEIC) words, the latter preferring the same level.
const distractorsFor = (excludeIds, level = null) => {
  const ph = excludeIds.map(() => '?').join(',') || '0';
  const pick = (cond, order, ...args) => db.prepare(
    `SELECT w.* FROM words w JOIN topics t ON t.id = w.topic_id
     WHERE w.id NOT IN (${ph}) AND ${cond} ORDER BY ${order} LIMIT 8`,
  ).all(...excludeIds, ...args).map((w) => shapeWord(w));
  return [
    ...pick('w.pos IS NULL', 'RANDOM()'),
    ...pick('w.pos IS NOT NULL', '(t.level IS ?) DESC, RANDOM()', level),
  ];
};

// ---------- public ----------
app.get('/api/config', (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, imagesEnabled: imageProvidersConfigured() });
});

app.post('/api/auth/register', wrap(async (req, res) => {
  const { email = '', password = '', name = '' } = req.body;
  const mail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(mail)) return res.status(400).json({ error: 'Enter a valid email' });
  if (password.length < 6) return res.status(400).json({ error: 'Password needs 6+ characters' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) {
    return res.status(409).json({ error: 'That email is already registered' });
  }
  const hash = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(mail, name.trim() || mail.split('@')[0], hash, Date.now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.post('/api/auth/google', wrap(async (req, res) => {
  if (!googleClient) return res.status(501).json({ error: 'Google sign-in is not configured' });
  const ticket = await googleClient.verifyIdToken({
    idToken: req.body.credential, audience: GOOGLE_CLIENT_ID,
  }).catch(() => null);
  const p = ticket?.getPayload();
  if (!p?.email || !p.email_verified) return res.status(401).json({ error: 'Google sign-in failed' });

  let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(p.sub, p.email.toLowerCase());
  if (user) {
    if (!user.google_id) db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(p.sub, user.id);
  } else {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO users (email, name, google_id, created_at) VALUES (?, ?, ?, ?)',
    ).run(p.email.toLowerCase(), p.name || p.email.split('@')[0], p.sub, Date.now());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  }
  res.json({ token: sign(user), user: publicUser(user) });
}));

// ---------- authed ----------
app.get('/api/me', auth, (req, res) => {
  const due = db.prepare('SELECT COUNT(*) AS n FROM progress WHERE user_id = ? AND due_at <= ?')
    .get(req.user.id, Date.now()).n;
  const learned = db.prepare('SELECT COUNT(*) AS n FROM progress WHERE user_id = ? AND box >= 3')
    .get(req.user.id).n;
  res.json({ user: publicUser(req.user), due, learned });
});

app.get('/api/topics', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.slug, t.name, t.emoji, t.color, t.level,
      (SELECT COUNT(*) FROM words w WHERE w.topic_id = t.id) AS total,
      (SELECT COUNT(*) FROM progress p JOIN words w ON w.id = p.word_id
        WHERE w.topic_id = t.id AND p.user_id = ? AND p.box >= 3) AS mastered
    FROM topics t ORDER BY t.id`).all(req.user.id);
  res.json(rows);
});

app.get('/api/topics/:slug/words', auth, wrap(async (req, res) => {
  const topic = db.prepare('SELECT * FROM topics WHERE slug = ?').get(req.params.slug);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  let words = db.prepare('SELECT * FROM words WHERE topic_id = ? ORDER BY id').all(topic.id);
  words = await Promise.all(words.map(ensureImage));
  const boxes = new Map(db.prepare('SELECT word_id, box FROM progress WHERE user_id = ?')
    .all(req.user.id).map((r) => [r.word_id, r.box]));
  res.json({
    topic: { slug: topic.slug, name: topic.name, emoji: topic.emoji, color: topic.color },
    words: words.map((w) => shapeWord(w, boxes.get(w.id) ?? 0)),
    distractors: distractorsFor(words.map((w) => w.id), topic.level),
  });
}));

app.get('/api/review', auth, wrap(async (req, res) => {
  let words = db.prepare(`
    SELECT w.*, p.box FROM progress p JOIN words w ON w.id = p.word_id
    WHERE p.user_id = ? AND p.due_at <= ? ORDER BY p.due_at LIMIT 10`).all(req.user.id, Date.now());
  words = await Promise.all(words.map(async (w) => ({ ...(await ensureImage(w)), box: w.box })));
  res.json({
    words: words.map((w) => shapeWord(w, w.box)),
    distractors: distractorsFor(words.map((w) => w.id)),
  });
}));

app.post('/api/answer', auth, (req, res) => {
  const wordId = Number(req.body.wordId);
  const correct = Boolean(req.body.correct);
  if (!db.prepare('SELECT 1 FROM words WHERE id = ?').get(wordId)) {
    return res.status(404).json({ error: 'Unknown word' });
  }
  const row = db.prepare('SELECT box FROM progress WHERE user_id = ? AND word_id = ?')
    .get(req.user.id, wordId);
  const box = correct ? Math.min((row?.box ?? 0) + 1, 5) : 1;
  const dueAt = Date.now() + (correct ? BOX_DAYS[box] * DAY : 60_000);

  db.prepare(`
    INSERT INTO progress (user_id, word_id, box, due_at, correct, wrong) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, word_id) DO UPDATE SET
      box = excluded.box, due_at = excluded.due_at,
      correct = correct + excluded.correct, wrong = wrong + excluded.wrong`)
    .run(req.user.id, wordId, box, dueAt, correct ? 1 : 0, correct ? 0 : 1);

  // streak: consecutive days with at least one answer
  const { last_active: last, streak } = req.user;
  const nextStreak = last === today() ? streak : last === today(-1) ? streak + 1 : 1;
  db.prepare('UPDATE users SET xp = xp + ?, streak = ?, last_active = ? WHERE id = ?')
    .run(correct ? XP_PER_CORRECT : 0, nextStreak, today(), req.user.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user), box });
});

app.listen(PORT, () => {
  console.log(`Vocab API on http://localhost:${PORT}`);
  console.log(`Images: ${imageProvidersConfigured() ? 'Pixabay/Pexels enabled' : 'no API key, using emoji fallback'}`);
});
