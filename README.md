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
