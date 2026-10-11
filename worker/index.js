// Cloudflare Worker: the Vocab Buddy API on D1. Static client files are served by the assets binding.
// Mirrors server/index.js (the Express version used for local development).
import { CONTENT_VERSION, TOPICS_JSON, WORD_CHUNKS } from './content.generated.js';

// Leitner boxes: days until a word is due again, indexed by box (1..5).
const BOX_DAYS = [0, 1, 2, 4, 8, 16];
const DAY = 86_400_000;
const XP_PER_CORRECT = 10;
const PBKDF2_ITERATIONS = 100_000; // Workers' WebCrypto maximum
const enc = new TextEncoder();

// ---------- schema + content ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT,
    google_id TEXT UNIQUE, xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
    last_active TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, emoji TEXT NOT NULL,
    color TEXT NOT NULL, level TEXT)`,
  `CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY, topic_id INTEGER NOT NULL REFERENCES topics(id), word TEXT NOT NULL UNIQUE,
    vi TEXT NOT NULL, phonetic TEXT, definition TEXT, example TEXT, emoji TEXT, query TEXT,
    image_url TEXT, image_credit TEXT, pos TEXT, vi_example TEXT)`,
  `CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    box INTEGER NOT NULL DEFAULT 0, due_at INTEGER NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, word_id))`,
];

const UPSERT_TOPICS = `
  INSERT INTO topics (slug, name, emoji, color, level)
  SELECT json_extract(value, '$.slug'), json_extract(value, '$.name'), json_extract(value, '$.emoji'),
         json_extract(value, '$.color'), json_extract(value, '$.level')
  FROM json_each(?) WHERE true
  ON CONFLICT(slug) DO UPDATE SET name = excluded.name, emoji = excluded.emoji,
    color = excluded.color, level = excluded.level`;

const UPSERT_WORDS = `
  INSERT INTO words (topic_id, word, vi, phonetic, definition, example, emoji, query, pos, vi_example)
  SELECT (SELECT id FROM topics WHERE slug = json_extract(value, '$.s')),
         json_extract(value, '$.w'), json_extract(value, '$.vi'), json_extract(value, '$.ph'),
         json_extract(value, '$.d'), json_extract(value, '$.e'), json_extract(value, '$.em'),
         json_extract(value, '$.q'), json_extract(value, '$.p'), json_extract(value, '$.xv')
  FROM json_each(?) WHERE true
  ON CONFLICT(word) DO UPDATE SET topic_id = excluded.topic_id, vi = excluded.vi, phonetic = excluded.phonetic,
    definition = excluded.definition, example = excluded.example, emoji = excluded.emoji,
    query = excluded.query, pos = excluded.pos, vi_example = excluded.vi_example`;

let ready; // per-isolate memo
function ensureReady(db) {
  ready ??= (async () => {
    await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
    const cur = await db.prepare(`SELECT value FROM meta WHERE key = 'content_version'`).first('value');
    if (cur === CONTENT_VERSION) return;
    await db.batch([
      db.prepare(UPSERT_TOPICS).bind(TOPICS_JSON),
      ...WORD_CHUNKS.map((c) => db.prepare(UPSERT_WORDS).bind(c)),
      db.prepare(`INSERT INTO meta (key, value) VALUES ('content_version', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(CONTENT_VERSION),
    ]);
  })().catch((e) => { ready = undefined; throw e; });
  return ready;
}

// ---------- crypto: PBKDF2 passwords + HS256 JWT ----------
const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64.enc(salt)}$${b64.enc(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = b64.enc(await pbkdf2(password, b64.dec(salt), Number(iter)));
  return got.length === hash.length && got.split('').every((c, i) => c === hash[i]);
}

const hmacKey = (secret, usage) => crypto.subtle.importKey(
  'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

async function signJwt(payload, secret, ttlSeconds = 30 * 86400) {
  const head = b64.enc(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64.enc(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64.enc(sig)}`;
}

async function verifyJwt(token, secret) {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) throw new Error('malformed');
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), b64.dec(sig), enc.encode(`${head}.${body}`));
  if (!ok) throw new Error('bad signature');
  const payload = JSON.parse(new TextDecoder().decode(b64.dec(body)));
  if (payload.exp < Date.now() / 1000) throw new Error('expired');
  return payload;
}

// The signing secret is a Worker secret if set, otherwise generated once and kept in D1.
async function jwtSecret(env) {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  const stored = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'jwt_secret'`).first('value');
  if (stored) return stored;
  const fresh = b64.enc(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('jwt_secret', ?)`).bind(fresh).run();
  return env.DB.prepare(`SELECT value FROM meta WHERE key = 'jwt_secret'`).first('value');
}

// ---------- helpers ----------
const json = (data, status = 200) => Response.json(data, { status });
const fail = (status, error) => json({ error }, status);

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, xp: u.xp, streak: u.streak });
const today = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const shapeWord = (w, box = null) => ({
  id: w.id, word: w.word, vi: w.vi, phonetic: w.phonetic, definition: w.definition,
  example: w.example, visual: !w.pos, pos: w.pos, exampleVi: w.vi_example, emoji: w.emoji,
  image: w.image_url, credit: w.image_credit, box,
});

// Extra wrong answers: 8 picture words and 8 text-only (TOEIC) words, the latter preferring the same level.
async function distractorsFor(db, excludeIds, level = null) {
  const ph = excludeIds.map(() => '?').join(',') || '0';
  const pick = async (cond, order, ...args) => (await db.prepare(
    `SELECT w.* FROM words w JOIN topics t ON t.id = w.topic_id
     WHERE w.id NOT IN (${ph}) AND ${cond} ORDER BY ${order} LIMIT 8`,
  ).bind(...excludeIds, ...args).all()).results.map((w) => shapeWord(w));
  return [
    ...(await pick('w.pos IS NULL', 'RANDOM()')),
    ...(await pick('w.pos IS NOT NULL', '(t.level IS ?) DESC, RANDOM()', level)),
  ];
}

async function authUser(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  try {
    const { uid } = await verifyJwt(token, await jwtSecret(env));
    return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
  } catch {
    return null;
  }
}

// ---------- handlers ----------
const handlers = {
  config: () => json({ googleClientId: '', imagesEnabled: false }),

  async register({ req, env }) {
    const { email = '', password = '', name = '' } = await req.json().catch(() => ({}));
    const mail = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return fail(400, 'Enter a valid email');
    if (String(password).length < 6) return fail(400, 'Password needs 6+ characters');
    if (await env.DB.prepare('SELECT 1 AS x FROM users WHERE email = ?').bind(mail).first()) {
      return fail(409, 'That email is already registered');
    }
    const hash = await hashPassword(String(password));
    const { meta } = await env.DB.prepare(
      'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).bind(mail, String(name).trim() || mail.split('@')[0], hash, Date.now()).run();
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(meta.last_row_id).first();
    return json({ token: await signJwt({ uid: user.id }, await jwtSecret(env)), user: publicUser(user) });
  },

  async login({ req, env }) {
    const { email = '', password = '' } = await req.json().catch(() => ({}));
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(String(email).trim().toLowerCase()).first();
    if (!user?.password_hash || !(await verifyPassword(String(password), user.password_hash))) {
      return fail(401, 'Wrong email or password');
    }
    return json({ token: await signJwt({ uid: user.id }, await jwtSecret(env)), user: publicUser(user) });
  },

  google: () => fail(501, 'Google sign-in is not configured'),

  async me({ env, user }) {
    const [due, learned] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM progress WHERE user_id = ? AND due_at <= ?').bind(user.id, Date.now()).first('n'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM progress WHERE user_id = ? AND box >= 3').bind(user.id).first('n'),
    ]);
    return json({ user: publicUser(user), due, learned });
  },

  async topics({ env, user }) {
    const { results } = await env.DB.prepare(`
      SELECT t.slug, t.name, t.emoji, t.color, t.level,
        (SELECT COUNT(*) FROM words w WHERE w.topic_id = t.id) AS total,
        (SELECT COUNT(*) FROM progress p JOIN words w ON w.id = p.word_id
          WHERE w.topic_id = t.id AND p.user_id = ? AND p.box >= 3) AS mastered
      FROM topics t ORDER BY t.id`).bind(user.id).all();
    return json(results);
  },

  async topicWords({ env, user, params }) {
    const topic = await env.DB.prepare('SELECT * FROM topics WHERE slug = ?').bind(params.slug).first();
    if (!topic) return fail(404, 'Topic not found');
    const [{ results: words }, { results: prog }] = await Promise.all([
      env.DB.prepare('SELECT * FROM words WHERE topic_id = ? ORDER BY id').bind(topic.id).all(),
      env.DB.prepare('SELECT word_id, box FROM progress WHERE user_id = ?').bind(user.id).all(),
    ]);
    const boxes = new Map(prog.map((r) => [r.word_id, r.box]));
    return json({
      topic: { slug: topic.slug, name: topic.name, emoji: topic.emoji, color: topic.color },
      words: words.map((w) => shapeWord(w, boxes.get(w.id) ?? 0)),
      distractors: await distractorsFor(env.DB, words.map((w) => w.id), topic.level),
    });
  },

  async review({ env, user }) {
    const { results: words } = await env.DB.prepare(`
      SELECT w.*, p.box FROM progress p JOIN words w ON w.id = p.word_id
      WHERE p.user_id = ? AND p.due_at <= ? ORDER BY p.due_at LIMIT 10`).bind(user.id, Date.now()).all();
    return json({
      words: words.map((w) => shapeWord(w, w.box)),
      distractors: await distractorsFor(env.DB, words.map((w) => w.id)),
    });
  },

  async answer({ req, env, user }) {
    const body = await req.json().catch(() => ({}));
    const wordId = Number(body.wordId);
    const correct = Boolean(body.correct);
    if (!(await env.DB.prepare('SELECT 1 AS x FROM words WHERE id = ?').bind(wordId).first())) {
      return fail(404, 'Unknown word');
    }
    const row = await env.DB.prepare('SELECT box FROM progress WHERE user_id = ? AND word_id = ?')
      .bind(user.id, wordId).first();
    const box = correct ? Math.min((row?.box ?? 0) + 1, 5) : 1;
    const dueAt = Date.now() + (correct ? BOX_DAYS[box] * DAY : 60_000);

    // streak: consecutive days with at least one answer
    const last = user.last_active;
    const streak = last === today() ? user.streak : last === today(-1) ? user.streak + 1 : 1;

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO progress (user_id, word_id, box, due_at, correct, wrong) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, word_id) DO UPDATE SET
          box = excluded.box, due_at = excluded.due_at,
          correct = correct + excluded.correct, wrong = wrong + excluded.wrong`)
        .bind(user.id, wordId, box, dueAt, correct ? 1 : 0, correct ? 0 : 1),
      env.DB.prepare('UPDATE users SET xp = xp + ?, streak = ?, last_active = ? WHERE id = ?')
        .bind(correct ? XP_PER_CORRECT : 0, streak, today(), user.id),
    ]);
    const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    return json({ user: publicUser(fresh), box });
  },
};

// [method, pattern, handler, requiresAuth]
const ROUTES = [
  ['GET', '/api/config', handlers.config, false],
  ['POST', '/api/auth/register', handlers.register, false],
  ['POST', '/api/auth/login', handlers.login, false],
  ['POST', '/api/auth/google', handlers.google, false],
  ['GET', '/api/me', handlers.me, true],
  ['GET', '/api/topics', handlers.topics, true],
  ['GET', '/api/topics/:slug/words', handlers.topicWords, true],
  ['GET', '/api/review', handlers.review, true],
  ['POST', '/api/answer', handlers.answer, true],
].map(([method, pattern, handler, needsAuth]) => ({
  method, handler, needsAuth,
  re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
}));

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    const route = ROUTES.find((r) => r.method === req.method && r.re.test(pathname));
    if (!route) return fail(404, 'Not found');
    try {
      await ensureReady(env.DB);
      const user = route.needsAuth ? await authUser(req, env) : null;
      if (route.needsAuth && !user) return fail(401, 'Please sign in');
      const params = Object.fromEntries(
        Object.entries(route.re.exec(pathname).groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      return await route.handler({ req, env, user, params });
    } catch (err) {
      console.error(err);
      return fail(500, 'Something went wrong');
    }
  },
};
