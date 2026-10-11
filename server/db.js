import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPICS } from './words.js';

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
export const IMAGE_DIR = path.join(DATA_DIR, 'images');
fs.mkdirSync(IMAGE_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'vocab.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    xp INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    last_active TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY,
    topic_id INTEGER NOT NULL REFERENCES topics(id),
    word TEXT NOT NULL UNIQUE,
    vi TEXT NOT NULL,
    phonetic TEXT,
    definition TEXT,
    example TEXT,
    emoji TEXT,
    query TEXT,
    image_url TEXT,
    image_credit TEXT
  );

  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    box INTEGER NOT NULL DEFAULT 0,
    due_at INTEGER NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, word_id)
  );
`);

// Additive column migrations for databases created before these fields existed.
const addColumn = (table, col, type) => {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
};
addColumn('topics', 'level', 'TEXT');
addColumn('words', 'pos', 'TEXT');
addColumn('words', 'vi_example', 'TEXT');

// Idempotent seed: adds any topics/words that are missing.
const insTopic = db.prepare('INSERT OR IGNORE INTO topics (slug, name, emoji, color, level) VALUES (?, ?, ?, ?, ?)');
const getTopic = db.prepare('SELECT id FROM topics WHERE slug = ?');
const insWord = db.prepare(
  `INSERT OR IGNORE INTO words (topic_id, word, vi, phonetic, definition, example, emoji, query, pos, vi_example)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
// words.js is the source of truth: re-sync content of rows that were seeded earlier.
const setLevel = db.prepare('UPDATE topics SET level = ?, name = ?, emoji = ?, color = ? WHERE slug = ?');
const syncWord = db.prepare(
  `UPDATE words SET vi = ?, phonetic = ?, definition = ?, example = ?, emoji = ?, query = ?, pos = ?, vi_example = ?
   WHERE topic_id = ? AND word = ?`,
);
db.exec('BEGIN');
for (const t of TOPICS) {
  insTopic.run(t.slug, t.name, t.emoji, t.color, t.level ?? null);
  const { id } = getTopic.get(t.slug);
  setLevel.run(t.level ?? null, t.name, t.emoji, t.color, t.slug);
  for (const w of t.words) {
    syncWord.run(w.vi, w.ph, w.def, w.ex, w.emoji, w.q ?? w.word, w.pos ?? null, w.exVi ?? null, id, w.word);
    insWord.run(id, w.word, w.vi, w.ph, w.def, w.ex, w.emoji, w.q ?? w.word, w.pos ?? null, w.exVi ?? null);
  }
}
db.exec('COMMIT');
