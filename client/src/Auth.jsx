import { useEffect, useRef, useState } from 'react';
import { api, setToken } from './api.js';
import { Mascot } from './components.jsx';

export default function Auth({ config, onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const googleRef = useRef(null);

  const finish = ({ token, user }) => { setToken(token); onAuthed(user); };

  useEffect(() => {
    if (!config?.googleClientId) return;
    const init = () => {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async ({ credential }) => {
          try { finish(await api.google(credential)); } catch (e) { setError(e.message); }
        },
      });
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300,
      });
    };
    if (window.google?.accounts) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [config?.googleClientId]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      finish(mode === 'login' ? await api.login(form) : await api.register(form));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="screen auth">
      <Mascot mood="cheer" size={128} />
      <h1 className="logo">Vocab <span>Buddy</span></h1>
      <p className="muted">Learn new words with pictures!</p>

      <form className="card form" onSubmit={submit}>
        {mode === 'register' && (
          <input placeholder="Your name" value={form.name} onChange={set('name')} autoComplete="name" />
        )}
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} autoComplete="email" required />
        <input type="password" placeholder="Password (6+ chars)" value={form.password} onChange={set('password')}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-green btn-big" disabled={busy}>
          {mode === 'login' ? 'Let’s go!' : 'Create account'}
        </button>
        {config?.googleClientId && <div className="google" ref={googleRef} />}
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'New here? Sign up' : 'Have an account? Log in'}
        </button>
      </form>
    </main>
  );
}
