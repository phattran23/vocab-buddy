import { useMemo, useState } from 'react';
import { api } from './api.js';
import { Confetti, Mascot, SpeakButton, WordImage, speak } from './components.jsx';

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

// Picture words (emoji/photo) are quizzed with pictures; abstract words (TOEIC) with text only.
const VISUAL_TYPES = ['pic2word', 'word2pic', 'listen'];
const TEXT_TYPES = ['en2vi', 'cloze', 'vi2en', 'hear'];
const typesFor = (w) => (w.visual ? VISUAL_TYPES : TEXT_TYPES);

/** The example sentence with the target word (and simple inflections) replaced by a blank. */
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function blankOut(w) {
  if (!w.example) return null;
  const re = new RegExp(String.raw`\b${escapeRe(w.word)}\w*`, 'i');
  return re.test(w.example) ? w.example.replace(re, '_____') : null;
}

function buildQuestion(word, type, pool) {
  if (type === 'cloze' && !blankOut(word)) type = 'vi2en';
  const same = pool.filter((w) => w.id !== word.id && w.visual === word.visual
    && (word.visual ? w.emoji !== word.emoji : w.vi !== word.vi));
  // Text questions: prefer wrong answers with the same part of speech so the choice is not trivial.
  const ranked = word.visual ? shuffle(same)
    : shuffle(same).sort((a, b) => (b.pos === word.pos) - (a.pos === word.pos));
  return { word, type, options: shuffle([word, ...ranked.slice(0, 3)]) };
}

function buildQuiz(words, distractors) {
  const pool = [...words, ...distractors];
  return shuffle(words).map((w, i) => buildQuestion(w, typesFor(w)[i % typesFor(w).length], pool));
}

/** Phase 1: flip through picture cards. */
function Cards({ words, onDone }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const w = words[i];
  const next = () => {
    if (i + 1 >= words.length) return onDone();
    setI(i + 1); setFlipped(false);
  };
  const flip = () => { setFlipped(!flipped); if (!flipped) speak(w.word); };

  return (
    <>
      <Progress value={i} max={words.length} />
      <p className="hint">Tap the card to flip it</p>
      <div className={`flip ${flipped ? 'is-flipped' : ''}`} onClick={flip} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && flip()}>
        <div className="flip-inner">
          <div className="flip-face card">
            {w.visual ? (
              <>
                <WordImage word={w} className="huge" />
                <p className="muted">What is this?</p>
              </>
            ) : (
              <>
                <h2 className="big-word">{w.word}</h2>
                <p className="phonetic">{w.phonetic}{w.pos && <span className="pos"> · {w.pos}</span>}</p>
                <SpeakButton text={w.word} />
                <p className="muted">What does it mean?</p>
              </>
            )}
          </div>
          <div className="flip-face flip-back card">
            <h2 className="big-word">{w.word}</h2>
            <p className="phonetic">{w.phonetic}{w.pos && <span className="pos"> · {w.pos}</span>}</p>
            <p className="vi">{w.vi}</p>
            {w.definition && <p className="def">{w.definition}</p>}
            <p className="example">“{w.example}”</p>
            {w.exampleVi && <p className="example-vi">{w.exampleVi}</p>}
            <SpeakButton text={w.word} />
          </div>
        </div>
      </div>
      {w.visual && w.credit && !flipped && <p className="credit">Image: {w.credit}</p>}
      <button className="btn btn-yellow btn-big" onClick={next}>
        {i + 1 >= words.length ? 'Start quiz!' : 'Next'}
      </button>
    </>
  );
}

function Progress({ value, max }) {
  return (
    <div className="bar" aria-label={`${value} of ${max}`}>
      <div className="bar-fill" style={{ width: `${(value / Math.max(max, 1)) * 100}%` }} />
    </div>
  );
}

/** Phase 2: quiz. Wrong answers are re-queued until answered correctly. */
function Quiz({ words, distractors, onUser, onDone }) {
  const pool = useMemo(() => [...words, ...distractors], [words, distractors]);
  const [queue, setQueue] = useState(() => buildQuiz(words, distractors));
  const [total] = useState(queue.length);
  const [picked, setPicked] = useState(null); // option id
  const [stats, setStats] = useState({ right: 0, wrong: 0, xp: 0 });
  const [step, setStep] = useState(0);

  const q = queue[0];
  const answered = picked !== null;
  const correct = answered && picked === q.word.id;

  const choose = (opt) => {
    if (answered) return;
    setPicked(opt.id);
    const ok = opt.id === q.word.id;
    if (['listen', 'word2pic', 'hear', 'en2vi'].includes(q.type)) speak(q.word.word);
    api.answer(q.word.id, ok).then((r) => onUser(r.user)).catch(() => {});
    setStats((s) => ({ right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1), xp: s.xp + (ok ? 10 : 0) }));
  };

  const next = () => {
    const rest = queue.slice(1);
    if (!correct) {
      const types = typesFor(q.word);
      const retry = types[(types.indexOf(q.type) + 1) % types.length];
      rest.push(buildQuestion(q.word, retry, pool));
    }
    setPicked(null);
    setStep((s) => s + (correct ? 1 : 0));
    if (rest.length === 0) return onDone(stats);
    setQueue(rest);
  };

  if (!q) return null;
  const prompt = {
    pic2word: 'What is this called?',
    word2pic: 'Which picture is…',
    listen: 'Listen and pick the picture',
    en2vi: 'What does it mean?',
    vi2en: 'Which English word is this?',
    cloze: 'Fill in the blank',
    hear: 'Listen and pick the word',
  }[q.type];
  const picsMode = q.word.visual && q.type !== 'pic2word';
  const showVi = q.type === 'en2vi';

  return (
    <>
      <Progress value={step} max={total} />
      <h2 className="prompt">{prompt}</h2>

      <div className="stimulus">
        {q.type === 'pic2word' && <WordImage word={q.word} className="large" />}
        {q.type === 'word2pic' && (
          <div className="stim-word">
            <span className="big-word">{q.word.word}</span>
            <span className="vi">{q.word.vi}</span>
            <SpeakButton text={q.word.word} />
          </div>
        )}
        {(q.type === 'listen' || q.type === 'hear') && <SpeakButton text={q.word.word} big />}
        {q.type === 'en2vi' && (
          <div className="stim-word">
            <span className="big-word">{q.word.word}</span>
            <span className="phonetic">{q.word.phonetic}{q.word.pos && <span className="pos"> · {q.word.pos}</span>}</span>
            <SpeakButton text={q.word.word} />
          </div>
        )}
        {q.type === 'vi2en' && (
          <div className="stim-word">
            <span className="big-word vi-big">{q.word.vi}</span>
            {q.word.pos && <span className="phonetic pos">{q.word.pos}</span>}
          </div>
        )}
        {q.type === 'cloze' && (
          <div className="stim-word cloze">
            <span className="cloze-text">“{blankOut(q.word)}”</span>
            {q.word.exampleVi && <span className="example-vi">{q.word.exampleVi}</span>}
          </div>
        )}
      </div>

      <div className={`options ${picsMode ? 'options-pics' : ''}`}>
        {q.options.map((opt) => {
          const state = !answered ? '' : opt.id === q.word.id ? 'right' : opt.id === picked ? 'wrong' : 'dim';
          return (
            <button key={opt.id} className={`option ${state} ${showVi ? 'option-vi' : ''}`}
              onClick={() => choose(opt)} disabled={answered}>
              {picsMode ? <WordImage word={opt} className="small" /> : showVi ? opt.vi : opt.word}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={`feedback ${correct ? 'good' : 'bad'}`}>
          <Mascot mood={correct ? 'cheer' : 'sad'} size={64} />
          <div className="feedback-text">
            <strong>{correct ? 'Awesome!' : 'Oops, not quite'}</strong>
            {!correct && <span>It’s “{q.word.word}” — {q.word.vi}</span>}
            {correct && !q.word.visual && q.word.exampleVi && <span className="feedback-note">{q.word.example}</span>}
          </div>
          <button className={`btn ${correct ? 'btn-green' : 'btn-pink'}`} onClick={next}>Continue</button>
        </div>
      )}
    </>
  );
}

function Results({ stats, onClose }) {
  const accuracy = Math.round((stats.right / Math.max(stats.right + stats.wrong, 1)) * 100);
  return (
    <div className="results">
      <Confetti />
      <Mascot mood="cheer" size={140} />
      <h1>Lesson complete!</h1>
      <div className="stat-row">
        <div className="stat card"><b>+{stats.xp}</b><span>XP</span></div>
        <div className="stat card"><b>{accuracy}%</b><span>Accuracy</span></div>
      </div>
      <button className="btn btn-green btn-big" onClick={onClose}>Done</button>
    </div>
  );
}

/** mode: 'learn' (cards then quiz) or 'review' (quiz only) */
export default function Lesson({ title, mode, words, distractors, onUser, onClose }) {
  const [phase, setPhase] = useState(mode === 'learn' ? 'cards' : 'quiz');
  const [stats, setStats] = useState(null);

  return (
    <main className="screen lesson">
      <header className="lesson-head">
        <button className="btn btn-round btn-white" onClick={onClose} aria-label="Close">✕</button>
        <h1>{title}</h1>
      </header>
      {phase === 'cards' && <Cards words={words} onDone={() => setPhase('quiz')} />}
      {phase === 'quiz' && (
        <Quiz words={words} distractors={distractors} onUser={onUser}
          onDone={(s) => { setStats(s); setPhase('done'); }} />
      )}
      {phase === 'done' && <Results stats={stats} onClose={onClose} />}
    </main>
  );
}
