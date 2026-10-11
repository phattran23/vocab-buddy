# Vocab Buddy

Mobile-first cartoon web app for learning English vocabulary (with Vietnamese meanings) through pictures.

- **Front end:** React + Vite (`client/`), phone-first layout, flip cards, picture quizzes, TTS pronunciation
- **Back end:** Express + SQLite via Node's built-in `node:sqlite` (`server/`), no native build step
- **Images:** Pixabay (illustrations) then Pexels, downloaded once and cached on disk. No key → emoji fallback
- **Auth:** email + password, and Google Sign-In
- **Learning:** Leitner spaced repetition (boxes 1–5 → review after 1/2/4/8/16 days), XP and daily streaks

## Run it

```bash
npm run install:all
cp server/.env.example server/.env   # then fill in keys (all optional to start)
npm run dev
```

Open http://localhost:5173 (also on your phone via the Network URL Vite prints, same Wi-Fi).

## Deploy to Cloudflare (Workers + D1)

One Worker serves the built client and the API (`worker/index.js`), with data in a D1 database.
Tables and words are created/updated automatically by the Worker on the first request after a deploy.

Cloudflare dashboard → Workers & Pages → Create → Import a repository, then:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

The D1 database `vocab-buddy` is referenced by id in `wrangler.jsonc` (create your own with `npx wrangler d1 create vocab-buddy` if you fork this). Optional: set a `JWT_SECRET`
secret in the Worker settings; without it a random one is generated and stored in D1.
Google Sign-In and downloaded photos are only available in the local Express server.

Local test of the Worker: `npm run cf:dev` (http://localhost:8787). Manual deploy: `npm run cf:deploy`.

After editing the word lists, `npm run build` regenerates `worker/content.generated.js` (commit it).

## Keys (server/.env)

| Variable | Where to get it |
|---|---|
| `PIXABAY_API_KEY` | https://pixabay.com/api/docs/ (free) |
| `PEXELS_API_KEY` | https://www.pexels.com/api/ (free) |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials → OAuth client (Web). Add `http://localhost:5173` as an authorized JS origin |
| `JWT_SECRET` | any long random string |

After adding image keys, pre-download all word images once: `npm run images --prefix server`.

## Add words

Edit `server/words.js` (topics and words). New entries are seeded on the next server start.
`q` overrides the image search query for ambiguous words.

## API

`POST /api/auth/{register,login,google}` · `GET /api/me` · `GET /api/topics` ·
`GET /api/topics/:slug/words` · `GET /api/review` · `POST /api/answer {wordId, correct}`
