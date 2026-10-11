import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Auth from './Auth.jsx';
import Lesson from './Lesson.jsx';
import { Mascot } from './components.jsx';

function Header({ user }) {
  return (
    <header className="topbar">
      <span className="pill pill-orange">🔥 {user.streak}</span>
      <span className="pill pill-yellow">⭐ {user.xp}</span>
    </header>
  );
}

const SET_SIZE = 10;

const LEVELS = [
  { key: null, title: 'Daily Life', sub: 'Everyday words' },
  { key: 'beginner', title: 'TOEIC · Beginner', sub: 'High-frequency workplace vocabulary' },
  { key: 'intermediate', title: 'TOEIC · Intermediate', sub: 'Common business and professional vocabulary' },
  { key: 'advanced', title: 'TOEIC · Advanced', sub: 'Formal business, financial, legal and academic vocabulary' },
];

function Home({ user, stats, topics, onOpenTopic, onReview }) {
  return (
    <section className="screen-body">
      <div className="hello">
        <Mascot mood={stats.due ? 'think' : 'happy'} size={84} />
        <div className="bubble">
          {stats.due
            ? `You have ${stats.due} word${stats.due > 1 ? 's' : ''} to review!`
            : `Hi ${user.name.split(' ')[0]}! Pick a topic to start.`}
        </div>
      </div>

      {stats.due > 0 && (
        <button className="btn btn-pink btn-big btn-wide" onClick={onReview}>
          🔁 Review {stats.due} word{stats.due > 1 ? 's' : ''}
        </button>
      )}

      {LEVELS.map(({ key, title, sub }) => {
        const list = topics.filter((t) => (t.level ?? null) === key);
        if (!list.length) return null;
        return (
          <div key={title}>
            <h2 className="section-title">{title}</h2>
            <p className="muted level-sub">{sub} · {list.length} topics</p>
            <div className="topics">
              {list.map((t) => (
                <button key={t.slug} className="topic" style={{ '--c': t.color }} onClick={() => onOpenTopic(t)}>
                  <span className="topic-emoji">{t.emoji}</span>
                  <span className="topic-name">{t.name}</span>
                  <span className="topic-meta">{t.mastered}/{t.total} mastered</span>
                  <span className="mini-bar"><i style={{ width: `${(t.mastered / t.total) * 100}%` }} /></span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Profile({ user, stats, onLogout }) {
  return (
    <section className="screen-body center">
      <Mascot mood="cheer" size={110} />
      <h2>{user.name}</h2>
      <p className="muted">{user.email}</p>
      <div className="stat-row">
        <div className="stat card"><b>🔥 {user.streak}</b><span>Day streak</span></div>
        <div className="stat card"><b>⭐ {user.xp}</b><span>Total XP</span></div>
        <div className="stat card"><b>📚 {stats.learned}</b><span>Words learned</span></div>
      </div>
      <button className="btn btn-white" onClick={onLogout}>Log out</button>
    </section>
  );
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ due: 0, learned: 0 });
  const [topics, setTopics] = useState([]);
  const [tab, setTab] = useState('learn');
  const [lesson, setLesson] = useState(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [me, t] = await Promise.all([api.me(), api.topics()]);
    setUser(me.user);
    setStats({ due: me.due, learned: me.learned });
    setTopics(t);
  }, []);

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
    if (!getToken()) return setBooting(false);
    refresh()
      .catch((e) => { if (e.status === 401) setToken(null); else setError('Can’t reach the server. Pull down to retry.'); })
      .finally(() => setBooting(false));
  }, [refresh]);

  const openLesson = async (loader, title, mode) => {
    setError('');
    try {
      const data = await loader();
      if (!data.words.length) return setError('Nothing to review right now 🎉');
      let words = data.words;
      if (mode === 'learn' && words.length > SET_SIZE) {
        // Long topics: study the 10 least-learned words (earliest in the list on ties).
        words = words.map((w, i) => ({ w, i })).sort((x, y) => (x.w.box - y.w.box) || (x.i - y.i))
          .slice(0, SET_SIZE).map((x) => x.w).sort((x, y) => x.id - y.id);
      }
      setLesson({ title, mode, words, distractors: [...data.words.filter((w) => !words.includes(w)), ...data.distractors] });
    } catch (e) {
      setError(e.message);
    }
  };

  const logout = () => { setToken(null); setUser(null); setTab('learn'); };

  if (booting) return <main className="screen auth"><Mascot mood="think" size={110} /></main>;
  if (!user) {
    return <Auth config={config} onAuthed={(u) => { setUser(u); refresh(); }} />;
  }
  if (lesson) {
    return (
      <Lesson {...lesson} onUser={setUser}
        onClose={() => { setLesson(null); refresh(); }} />
    );
  }

  return (
    <div className="app">
      <Header user={user} />
      {error && <p className="toast" onClick={() => setError('')}>{error}</p>}
      {tab === 'learn' && (
        <Home user={user} stats={stats} topics={topics}
          onOpenTopic={(t) => openLesson(() => api.topicWords(t.slug), t.name, 'learn')}
          onReview={() => openLesson(api.review, 'Review', 'review')} />
      )}
      {tab === 'profile' && <Profile user={user} stats={stats} onLogout={logout} />}
      <nav className="tabbar">
        <button className={tab === 'learn' ? 'on' : ''} onClick={() => setTab('learn')}><span>🏠</span>Learn</button>
        <button onClick={() => openLesson(api.review, 'Review', 'review')}>
          <span>🔁</span>Review{stats.due > 0 && <em className="badge">{stats.due}</em>}
        </button>
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}><span>🙂</span>Me</button>
      </nav>
    </div>
  );
}
