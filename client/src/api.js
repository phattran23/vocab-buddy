const KEY = 'vocab-token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

export const api = {
  config: () => request('/config'),
  register: (b) => request('/auth/register', { method: 'POST', body: b }),
  login: (b) => request('/auth/login', { method: 'POST', body: b }),
  google: (credential) => request('/auth/google', { method: 'POST', body: { credential } }),
  me: () => request('/me'),
  topics: () => request('/topics'),
  topicWords: (slug) => request(`/topics/${slug}/words`),
  review: () => request('/review'),
  answer: (wordId, correct) => request('/answer', { method: 'POST', body: { wordId, correct } }),
};
