// ── Radio Venus Admin ────────────────────────────────────────────────────────
// Password-gated tool: paste a YouTube/Spotify link, preview the resolved
// artist + Last.fm-similar candidates, pick which to add, commit to seed.
// Orchestrates the .github/workflows/admin-add-artist.yml GH Actions job —
// this Worker never scrapes/enriches itself, it just dispatches + polls.

const OWNER = 'nejurgis';
const REPO = 'Radio-Venus';
const WORKFLOW_FILE = 'admin-add-artist.yml';
const REF = 'master';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      return json({ error: err.message ?? 'Internal error' }, 500);
    }
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  // Callback from GH Actions — bearer-secret authed, not cookie-authed.
  if (pathname.startsWith('/api/jobs/') && pathname.endsWith('/result') && request.method === 'POST') {
    return handleJobResult(request, env, pathname);
  }

  if (pathname === '/login' && request.method === 'POST') return handleLogin(request, env);
  if (pathname === '/logout' && request.method === 'POST') return handleLogout();

  const authed = await isAuthed(request, env);

  if (pathname === '/' ) {
    return authed ? htmlResponse(renderApp()) : htmlResponse(renderLogin(url.searchParams.get('error')));
  }

  // Everything else requires a session cookie.
  if (!authed) return json({ error: 'Unauthorized' }, 401);

  if (pathname === '/api/lookup' && request.method === 'POST') return handleLookup(request, env, url);
  if (pathname === '/api/commit' && request.method === 'POST') return handleCommit(request, env, url);
  if (pathname.startsWith('/api/jobs/') && request.method === 'GET') return handleJobGet(request, env, pathname);
  if (pathname === '/api/log' && request.method === 'GET') return handleLog(env);

  return new Response('Not found', { status: 404 });
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function isAuthed(request, env) {
  const cookie = getCookie(request, 'session');
  if (!cookie) return false;
  const [expiry, sig] = cookie.split('.');
  if (!expiry || !sig) return false;
  if (Date.now() > parseInt(expiry, 10)) return false;
  const expected = await hmac(env.SESSION_SECRET, expiry);
  return timingSafeEqual(sig, expected);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handleLogin(request, env) {
  const form = await request.formData();
  const password = form.get('password') ?? '';
  if (!timingSafeEqual(String(password), env.ADMIN_PASSWORD)) {
    return Response.redirect(new URL('/?error=1', request.url), 302);
  }
  const expiry = String(Date.now() + SESSION_MAX_AGE * 1000);
  const sig = await hmac(env.SESSION_SECRET, expiry);
  const cookie = `session=${encodeURIComponent(`${expiry}.${sig}`)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
  return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': cookie } });
}

function handleLogout() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' },
  });
}

// ── GitHub Actions orchestration ────────────────────────────────────────────

async function dispatchWorkflow(env, inputs) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'radio-venus-admin-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: REF, inputs }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

async function handleLookup(request, env, url) {
  const { url: link } = await request.json();
  if (!link || typeof link !== 'string') return json({ error: 'Missing url' }, 400);

  const jobId = crypto.randomUUID();
  await env.JOBS.put(`job:${jobId}`, JSON.stringify({ status: 'pending' }), { expirationTtl: 3600 });
  await dispatchWorkflow(env, { mode: 'lookup', job_id: jobId, url: link, callback_url: url.origin });
  return json({ job_id: jobId });
}

async function handleCommit(request, env, url) {
  const { entries } = await request.json();
  if (!Array.isArray(entries) || !entries.length) return json({ error: 'No entries selected' }, 400);

  const jobId = crypto.randomUUID();
  await env.JOBS.put(`job:${jobId}`, JSON.stringify({ status: 'pending' }), { expirationTtl: 3600 });
  await dispatchWorkflow(env, { mode: 'commit', job_id: jobId, payload: JSON.stringify(entries), callback_url: url.origin });
  return json({ job_id: jobId });
}

async function handleJobGet(request, env, pathname) {
  const id = pathname.split('/').pop();
  const raw = await env.JOBS.get(`job:${id}`);
  if (!raw) return json({ status: 'unknown' }, 404);
  return new Response(raw, { headers: { 'content-type': 'application/json' } });
}

async function handleJobResult(request, env, pathname) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!timingSafeEqual(auth.replace(/^Bearer\s+/, ''), env.CALLBACK_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const id = pathname.split('/')[3]; // /api/jobs/{id}/result
  const body = await request.text();
  await env.JOBS.put(`job:${id}`, body, { expirationTtl: 3600 });
  return json({ ok: true });
}

// scripts/addition-log.jsonl, read straight from GitHub — the Worker never
// writes it (GH Actions does, at commit time), just displays it.
async function handleLog(env) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/scripts/addition-log.jsonl?ref=${REF}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'radio-venus-admin-worker',
      },
    }
  );
  if (res.status === 404) return json({ entries: [] }); // no additions logged yet
  if (!res.ok) return json({ error: `GitHub fetch failed (${res.status})` }, 502);

  const text = await res.text();
  const entries = text.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean).reverse(); // newest first

  return json({ entries });
}

// ── Responses ────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function htmlResponse(html) {
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── Pages ────────────────────────────────────────────────────────────────────

function renderLogin(error) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radio Venus Admin</title>
<style>${baseCSS()}
.login-box { max-width: 320px; margin: 18vh auto; padding: 32px; }
.login-box h1 { font-size: 1.1rem; margin: 0 0 24px; letter-spacing: 0.02em; }
</style>
</head><body>
<div class="login-box">
  <h1>⊹ Radio Venus Admin</h1>
  ${error ? '<p class="error">Wrong password.</p>' : ''}
  <form method="POST" action="/login">
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">Enter</button>
  </form>
</div>
</body></html>`;
}

function renderApp() {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radio Venus Admin</title>
<style>${baseCSS()}${appCSS()}</style>
</head><body>
<header>
  <h1>⊹ Radio Venus Admin</h1>
  <nav class="tabs">
    <button class="tab-btn active" data-tab="add">Add artist</button>
    <button class="tab-btn" data-tab="log">Log</button>
  </nav>
  <form method="POST" action="/logout"><button class="ghost" type="submit">Log out</button></form>
</header>

<main>
  <section id="tab-add" class="tab-panel">
    <section class="lookup">
      <input id="link-input" type="text" placeholder="Paste a link, or search &quot;Artist - Song&quot; / just an artist name…" autofocus>
      <button id="lookup-btn">Look up</button>
    </section>

    <section id="status" class="status" hidden></section>

    <section id="result" hidden>
      <h2>Artist</h2>
      <div id="main-card"></div>

      <h2>Similar artists — Last.fm <span id="similar-count" class="muted"></span></h2>
      <div id="similar-grid" class="grid"></div>

      <h2>Similar sounding — cosine.club <span id="similar-audio-count" class="muted"></span></h2>
      <div id="similar-audio-grid" class="grid"></div>

      <div class="commit-bar">
        <button id="commit-btn">Add selected</button>
        <span id="commit-status" class="muted"></span>
      </div>
    </section>
  </section>

  <section id="tab-log" class="tab-panel" hidden>
    <div class="log-toolbar">
      <label class="muted">Since <input id="log-since" type="date"></label>
      <button id="log-draft-btn" class="ghost">Generate newsletter draft</button>
    </div>

    <textarea id="log-draft" hidden readonly rows="14"></textarea>

    <h2>Additions <span id="log-count" class="muted"></span></h2>
    <div id="log-list"></div>
  </section>
</main>

<script>${appJS()}</script>
</body></html>`;
}

function baseCSS() {
  return `
:root { color-scheme: light dark; --bg:#0d0d12; --fg:#eee; --muted:#888; --card:#1a1a22; --accent:#c9a9ff; --border:#2a2a35; }
@media (prefers-color-scheme: light) {
  :root { --bg:#faf9fc; --fg:#161616; --muted:#777; --card:#fff; --accent:#7c4fd6; --border:#e3e0ea; }
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; }
input, button { font: inherit; }
input[type=text], input[type=password] {
  background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 14px; width: 100%;
}
button {
  background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 10px 18px;
  cursor: pointer; font-weight: 600;
}
button:disabled { opacity: 0.5; cursor: default; }
button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); font-weight: 400; }
.error { color: #e5484d; margin: 0 0 12px; font-size: 0.9rem; }
.muted { color: var(--muted); font-size: 0.85rem; font-weight: 400; }
`;
}

function appCSS() {
  return `
header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--border); }
header h1 { font-size: 1rem; margin: 0; }
main { max-width: 900px; margin: 0 auto; padding: 24px; }
.lookup { display: flex; gap: 10px; }
.lookup button { flex-shrink: 0; }
.status { margin: 20px 0; padding: 14px 16px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); font-size: 0.9rem; }
.status.error { border-color: #e5484d; color: #e5484d; }
h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 28px 0 10px; }
.card {
  display: flex; gap: 14px; align-items: center; background: var(--card); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px 14px;
}
.card a.thumb { position: relative; flex-shrink: 0; display: block; }
.card a.thumb img { width: 64px; height: 48px; border-radius: 6px; object-fit: cover; display: block; background: #000; }
.card a.thumb::after {
  content: "▶"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 0.7rem; background: rgba(0,0,0,0.25); border-radius: 6px; opacity: 0; transition: opacity 0.15s;
}
.card a.thumb:hover::after { opacity: 1; }
.card .info .listen { font-size: 0.78rem; }
.card .info { flex: 1; min-width: 0; }
.card .info .name { font-weight: 600; }
.card .info .meta { color: var(--muted); font-size: 0.82rem; margin-top: 2px; }
.card .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tag { background: var(--border); border-radius: 4px; padding: 1px 6px; font-size: 0.72rem; color: var(--muted); }
.card input[type=checkbox] { width: 20px; height: 20px; flex-shrink: 0; }
.card.disabled { opacity: 0.45; }
.card .already { font-size: 0.75rem; color: var(--accent); }
.grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
@media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }
.commit-bar { display: flex; align-items: center; gap: 14px; margin: 24px 0 60px; }

.tabs { display: flex; gap: 4px; }
.tab-btn { background: transparent; color: var(--muted); font-weight: 600; padding: 6px 12px; border-radius: 6px; }
.tab-btn.active { background: var(--card); color: var(--fg); border: 1px solid var(--border); }

.log-toolbar { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
.log-toolbar label { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
.log-toolbar input[type=date] { background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; }
#log-draft { width: 100%; margin: 16px 0; background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font: 13px/1.5 ui-monospace, monospace; }
#log-list { display: flex; flex-direction: column; gap: 6px; }
.log-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; font-size: 0.88rem; }
.log-row .log-date { color: var(--muted); font-size: 0.78rem; flex-shrink: 0; width: 78px; }
.log-row .log-name { font-weight: 600; flex-shrink: 0; }
.log-row .log-meta { color: var(--muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-row .log-source { font-size: 0.7rem; color: var(--accent); flex-shrink: 0; }
`;
}

function appJS() {
  return `
const $ = sel => document.querySelector(sel);
const linkInput = $('#link-input'), lookupBtn = $('#lookup-btn'), statusEl = $('#status');
const resultEl = $('#result'), mainCard = $('#main-card');
const similarGrid = $('#similar-grid'), similarCount = $('#similar-count');
const similarAudioGrid = $('#similar-audio-grid'), similarAudioCount = $('#similar-audio-count');
const commitBtn = $('#commit-btn'), commitStatus = $('#commit-status');

let currentArtist = null, currentSimilar = [], currentSimilarAudio = [];

function setStatus(msg, isError) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', !!isError);
}

async function pollJob(jobId, onDone) {
  const started = Date.now();
  const tick = async () => {
    const res = await fetch('/api/jobs/' + jobId);
    const data = await res.json();
    if (data.status === 'pending' || data.status === 'unknown') {
      const secs = Math.round((Date.now() - started) / 1000);
      setStatus('Working… (' + secs + 's, this runs on GitHub Actions and usually takes 30–90s)');
      setTimeout(tick, 2500);
      return;
    }
    onDone(data);
  };
  tick();
}

function thumb(videoId) {
  return videoId ? 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg' : '';
}

function tagsHTML(genres) {
  return (genres || []).map(g => '<span class="tag">' + g + '</span>').join('');
}

function thumbHTML(a) {
  if (!a.youtubeVideoId) return '';
  const img = '<img src="' + thumb(a.youtubeVideoId) + '">';
  return a.songUrl
    ? '<a class="thumb" href="' + a.songUrl + '" target="_blank" rel="noopener">' + img + '</a>'
    : img;
}

function listenLinkHTML(a) {
  return a.songUrl ? ' · <a class="listen" href="' + a.songUrl + '" target="_blank" rel="noopener">listen ↗</a>' : '';
}

function renderMainCard(artist) {
  const disabled = artist.alreadyInSeed;
  mainCard.innerHTML = \`
    <div class="card \${disabled ? 'disabled' : ''}">
      <input type="checkbox" id="main-check" \${disabled ? 'disabled' : 'checked'}>
      \${thumbHTML(artist)}
      <div class="info">
        <div class="name">\${artist.name} \${disabled ? '<span class="already">already in library</span>' : ''}</div>
        <div class="meta">\${artist.birthDate} · Venus in \${artist.venus}\${artist.handpickedTrack ? ' · "' + artist.handpickedTrack + '"' : ''}\${listenLinkHTML(artist)}</div>
        <div class="tags">\${tagsHTML(artist.genres)}</div>
      </div>
    </div>\`;
}

function renderGrid(gridEl, countEl, checkClass, list) {
  countEl.textContent = '(' + list.length + ')';
  if (!list.length) { gridEl.innerHTML = '<p class="muted">No candidates found.</p>'; return; }
  gridEl.innerHTML = list.map((a, i) => \`
    <div class="card">
      <input type="checkbox" class="\${checkClass}" data-i="\${i}">
      \${thumbHTML(a)}
      <div class="info">
        <div class="name">\${a.name}</div>
        <div class="meta">\${a.birthDate} · Venus in \${a.venus} · match \${(a.match * 100).toFixed(0)}%\${a.matchedTrack ? ' · via "' + a.matchedTrack + '"' : ''}\${listenLinkHTML(a)}</div>
        <div class="tags">\${tagsHTML(a.genres)}</div>
      </div>
    </div>\`).join('');
}

lookupBtn.addEventListener('click', async () => {
  const url = linkInput.value.trim();
  if (!url) return;
  lookupBtn.disabled = true;
  resultEl.hidden = true;
  setStatus('Starting lookup…');

  try {
    const res = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    if (!res.ok) throw new Error((await res.json()).error || 'Lookup failed to start');
    const { job_id } = await res.json();
    pollJob(job_id, data => {
      lookupBtn.disabled = false;
      if (data.status === 'error') { setStatus(data.message || 'Lookup failed', true); return; }
      setStatus('');
      currentArtist = data.artist;
      currentSimilar = data.similar || [];
      currentSimilarAudio = data.similarAudio || [];
      renderMainCard(currentArtist);
      renderGrid(similarGrid, similarCount, 'similar-check', currentSimilar);
      renderGrid(similarAudioGrid, similarAudioCount, 'similar-audio-check', currentSimilarAudio);
      resultEl.hidden = false;
    });
  } catch (e) {
    lookupBtn.disabled = false;
    setStatus(e.message, true);
  }
});

commitBtn.addEventListener('click', async () => {
  const entries = [];
  const mainCheck = document.getElementById('main-check');
  if (mainCheck && mainCheck.checked) entries.push(currentArtist);
  document.querySelectorAll('.similar-check:checked').forEach(cb => entries.push(currentSimilar[parseInt(cb.dataset.i, 10)]));
  document.querySelectorAll('.similar-audio-check:checked').forEach(cb => entries.push(currentSimilarAudio[parseInt(cb.dataset.i, 10)]));

  if (!entries.length) { commitStatus.textContent = 'Nothing selected.'; return; }

  commitBtn.disabled = true;
  commitStatus.textContent = 'Starting…';

  try {
    const res = await fetch('/api/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
    if (!res.ok) throw new Error((await res.json()).error || 'Commit failed to start');
    const { job_id } = await res.json();
    pollJob(job_id, data => {
      commitBtn.disabled = false;
      if (data.status === 'error') { commitStatus.textContent = 'Failed: ' + (data.message || 'unknown error'); return; }
      commitStatus.textContent = 'Done — ' + entries.length + ' artist(s) added' + (data.sha && data.sha !== 'none' ? ' (' + data.sha.slice(0, 7) + ')' : ' (site rebuilding, live shortly)') + '.';
    });
  } catch (e) {
    commitBtn.disabled = false;
    commitStatus.textContent = e.message;
  }
});

linkInput.addEventListener('keydown', e => { if (e.key === 'Enter') lookupBtn.click(); });

// ── Tabs ─────────────────────────────────────────────────────────────────────

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = { add: $('#tab-add'), log: $('#tab-log') };
let logLoaded = false;

tabBtns.forEach(btn => btn.addEventListener('click', () => {
  tabBtns.forEach(b => b.classList.toggle('active', b === btn));
  Object.entries(tabPanels).forEach(([name, el]) => { el.hidden = name !== btn.dataset.tab; });
  if (btn.dataset.tab === 'log' && !logLoaded) loadLog();
}));

// ── Log ──────────────────────────────────────────────────────────────────────

const logSince = $('#log-since'), logDraftBtn = $('#log-draft-btn'), logDraft = $('#log-draft');
const logList = $('#log-list'), logCount = $('#log-count');
let logEntries = [];

const GENRE_LABELS = {
  ambient: 'Ambient', dnb: 'Drum & Bass', idm: 'IDM', electronica: 'Electronica',
  techno: 'Techno', house: 'House', dubstep: 'Dubstep', triphop: 'Trip-Hop',
  classical: 'Classical', experimental: 'Experimental', pop: 'Pop', rock: 'Rock',
  folk: 'Folk', jazz: 'Jazz', hiphop: 'Hip-Hop',
};
const genreLabel = g => GENRE_LABELS[g] || (g.charAt(0).toUpperCase() + g.slice(1));

async function loadLog() {
  logList.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch('/api/log');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    logEntries = data.entries || [];
    logLoaded = true;
    renderLogList(logEntries);
  } catch (e) {
    logList.innerHTML = '<p class="muted">Failed to load: ' + e.message + '</p>';
  }
}

function renderLogList(entries) {
  logCount.textContent = '(' + entries.length + ')';
  if (!entries.length) { logList.innerHTML = '<p class="muted">Nothing logged yet.</p>'; return; }
  logList.innerHTML = entries.map(e => {
    const date = e.timestamp ? e.timestamp.slice(0, 10) : '';
    const genres = (e.genres || []).join(', ');
    const listen = e.youtubeVideoId ? ' · <a href="https://www.youtube.com/watch?v=' + e.youtubeVideoId + '" target="_blank" rel="noopener">listen ↗</a>' : '';
    return '<div class="log-row">' +
      '<span class="log-date">' + date + '</span>' +
      '<span class="log-name">' + e.name + '</span>' +
      '<span class="log-meta">' + (e.venus ? 'Venus in ' + e.venus + ' · ' : '') + genres + listen + '</span>' +
      '<span class="log-source">' + e.source + '</span>' +
      '</div>';
  }).join('');
}

logSince.addEventListener('change', () => {
  const since = logSince.value ? new Date(logSince.value) : null;
  renderLogList(since ? logEntries.filter(e => new Date(e.timestamp) >= since) : logEntries);
});

logDraftBtn.addEventListener('click', () => {
  const since = logSince.value ? new Date(logSince.value) : new Date(0);
  const filtered = logEntries.filter(e => new Date(e.timestamp) >= since);
  if (!filtered.length) { logDraft.hidden = false; logDraft.value = 'No additions in this range.'; return; }

  const byGenre = {};
  for (const e of filtered) {
    const primary = (e.genres && e.genres[0]) || 'other';
    (byGenre[primary] = byGenre[primary] || []).push(e);
  }
  const genreKeys = Object.keys(byGenre).sort((a, b) => byGenre[b].length - byGenre[a].length);

  let md = '# Radio Venus — new arrivals\\n\\n';
  md += filtered.length + ' artist' + (filtered.length === 1 ? '' : 's') + ' added\\n\\n';
  for (const key of genreKeys) {
    md += '## ' + genreLabel(key) + '\\n\\n';
    for (const e of byGenre[key].sort((a, b) => a.name.localeCompare(b.name))) {
      const venusPart = e.venus ? ' — Venus in ' + e.venus : '';
      const listenPart = e.youtubeVideoId ? ' — [listen](https://www.youtube.com/watch?v=' + e.youtubeVideoId + ')' : '';
      const trackPart = e.handpickedTrack ? ' ("' + e.handpickedTrack + '")' : '';
      md += '- **' + e.name + '**' + trackPart + venusPart + listenPart + '\\n';
    }
    md += '\\n';
  }
  logDraft.hidden = false;
  logDraft.value = md;
  logDraft.focus();
  logDraft.select();
});
`;
}
