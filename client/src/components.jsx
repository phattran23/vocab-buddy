import { useState } from 'react';

/** Cartoon mascot "Bibi". mood: happy | cheer | sad | think */
export function Mascot({ mood = 'happy', size = 96 }) {
  const mouth = {
    happy: 'M38 62 Q50 74 62 62',
    cheer: 'M36 60 Q50 82 64 60 Z',
    sad: 'M38 70 Q50 58 62 70',
    think: 'M42 66 L58 66',
  }[mood];
  return (
    <svg className={`mascot mascot-${mood}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="95" rx="26" ry="4" fill="rgba(43,33,64,.18)" />
      <path d="M30 22 L22 4 L42 16 Z M70 22 L78 4 L58 16 Z" fill="#ff6b9d" stroke="#2b2140" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="50" cy="54" r="38" fill="#ffd23f" stroke="#2b2140" strokeWidth="4" />
      <circle cx="35" cy="48" r="9" fill="#fff" stroke="#2b2140" strokeWidth="3" />
      <circle cx="65" cy="48" r="9" fill="#fff" stroke="#2b2140" strokeWidth="3" />
      <circle className="pupil" cx="37" cy="49" r="4" fill="#2b2140" />
      <circle className="pupil" cx="63" cy="49" r="4" fill="#2b2140" />
      <circle cx="24" cy="62" r="5" fill="#ff9fb8" opacity=".8" />
      <circle cx="76" cy="62" r="5" fill="#ff9fb8" opacity=".8" />
      <path d={mouth} fill={mood === 'cheer' ? '#ff6b9d' : 'none'} stroke="#2b2140" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Photo/illustration for a word, falling back to a big emoji. */
export function WordImage({ word, className = '' }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`word-image ${className}`}>
      {word.image && !failed ? (
        <img src={word.image} alt={word.word} onError={() => setFailed(true)} draggable="false" />
      ) : (
        <span className="word-emoji" role="img" aria-label={word.word}>{word.emoji || '❓'}</span>
      )}
    </div>
  );
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

export function SpeakButton({ text, big = false }) {
  return (
    <button
      type="button"
      className={`btn btn-blue btn-round ${big ? 'btn-big' : ''}`}
      onClick={(e) => { e.stopPropagation(); speak(text); }}
      aria-label={`Listen to ${text}`}
    >🔊</button>
  );
}

export function Confetti() {
  const bits = Array.from({ length: 24 }, (_, i) => i);
  const colors = ['#ff6b9d', '#ffd23f', '#4cc9f0', '#6bd968', '#a78bfa', '#ff9f43'];
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((i) => (
        <i key={i} style={{
          left: `${(i * 37) % 100}%`,
          background: colors[i % colors.length],
          animationDelay: `${(i % 8) * 0.12}s`,
          animationDuration: `${1.8 + (i % 5) * 0.3}s`,
        }} />
      ))}
    </div>
  );
}
