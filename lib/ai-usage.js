'use strict';
/* AI usage: how much of your Claude and ChatGPT plan limits you have used, for the session (5 hours) and the week.
   Neither service publishes this, so it reads the same endpoints their own websites use, with the cookies of a sign-in
   kept in the app's own session for each (main.js). Only numbers and short labels leave this module: no cookie, token
   or raw response ever reaches the island, a log or the history file. The endpoints are unofficial and can change, so
   every field is read defensively and a mismatch shows as an error, never a crash. */
const fs = require('node:fs');
const path = require('node:path');

const PROVIDERS = {
  claude: { name: 'Claude', login: 'https://claude.ai/login' },
  chatgpt: { name: 'ChatGPT', login: 'https://chatgpt.com/auth/login' }
};
const IDS = Object.keys(PROVIDERS);
const HISTORY_MAX = 288;   // a day of samples at one every 5 minutes
const INTERVAL = 5 * 60 * 1000;

class SignedOut extends Error {}

/* ---------- reading the answers ---------- */
function pct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 10) / 10 : null;
}
// a reset time as milliseconds: an ISO date, Unix seconds or milliseconds, or "in so many seconds"
function when(at, after, now) {
  if (typeof at === 'string' && at) { const t = Date.parse(at); if (Number.isFinite(t)) return t; }
  if (typeof at === 'number' && Number.isFinite(at) && at > 0) return at > 1e12 ? at : at * 1000;
  if (after === null || after === undefined || after === '') return null;
  const s = Number(after);
  return Number.isFinite(s) && s >= 0 ? now + s * 1000 : null;
}
function label(v) { return typeof v === 'string' && v ? v.replace(/[^\w .+-]/g, '').slice(0, 30) || null : null; }

async function getJson(fetchFor, provider, url, opts) {
  let res;
  try { res = await fetchFor(provider, url, opts || {}); }
  catch { throw new Error('Could not reach ' + PROVIDERS[provider].name + '.'); }
  if (res.status === 401) throw new SignedOut();
  if (res.status === 403) {
    // a browser check (Cloudflare) answers 403 with a page; a signed-out API call answers 403 with JSON
    const type = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
    if (/html/i.test(type)) throw new Error(PROVIDERS[provider].name + ' asked for a browser check. Open Sign in once, then refresh.');
    throw new SignedOut();
  }
  if (!res.ok) throw new Error(PROVIDERS[provider].name + ' answered ' + res.status + '.');
  try { return await res.json(); } catch { throw new Error(PROVIDERS[provider].name + ' sent an unexpected answer.'); }
}

/* Claude: the organisations you belong to, then the usage of the one you chat in.
   /usage answers { five_hour: { utilization, resets_at }, seven_day: { utilization, resets_at } } */
async function readClaude(fetchFor, now) {
  const orgs = await getJson(fetchFor, 'claude', 'https://claude.ai/api/organizations');
  if (!Array.isArray(orgs)) throw new SignedOut();
  const valid = orgs.filter((o) => o && typeof o.uuid === 'string' && /^[\w-]{8,64}$/.test(o.uuid));
  const caps = (o) => (Array.isArray(o.capabilities) ? o.capabilities : []);
  const org = valid.find((o) => caps(o).includes('chat')) || valid[0];
  if (!org) throw new SignedOut();
  const u = await getJson(fetchFor, 'claude', 'https://claude.ai/api/organizations/' + org.uuid + '/usage');
  if (!u || typeof u !== 'object') throw new Error('Claude sent an unexpected answer.');
  const win = (w) => (w && typeof w === 'object' ? { pct: pct(w.utilization), resetsAt: when(w.resets_at, null, now) } : null);
  const plan = caps(org).includes('claude_max') ? 'Max' : caps(org).includes('claude_pro') ? 'Pro' : null;
  return { plan, session: win(u.five_hour), weekly: win(u.seven_day) };
}

/* ChatGPT: the site's session gives a short-lived access token (kept only for the next call), then the usage.
   /wham/usage answers { plan_type, rate_limit: { primary_window, secondary_window } }, each { used_percent, reset_at |
   reset_after_seconds, limit_window_seconds }. The shorter window is the session, the longer one the week. */
async function readChatgpt(fetchFor, now) {
  const s = await getJson(fetchFor, 'chatgpt', 'https://chatgpt.com/api/auth/session');
  const token = s && typeof s.accessToken === 'string' ? s.accessToken : '';
  if (!token) throw new SignedOut();
  const u = await getJson(fetchFor, 'chatgpt', 'https://chatgpt.com/backend-api/wham/usage', { headers: { Authorization: 'Bearer ' + token } });
  const rl = u && typeof u === 'object' && u.rate_limit && typeof u.rate_limit === 'object' ? u.rate_limit : null;
  if (!rl) throw new Error('ChatGPT sent an unexpected answer.');
  const win = (w) => (w && typeof w === 'object' ? { pct: pct(w.used_percent), resetsAt: when(w.reset_at, w.reset_after_seconds, now), span: Number(w.limit_window_seconds) || 0 } : null);
  let a = win(rl.primary_window), b = win(rl.secondary_window);
  if (a && b && a.span && b.span && a.span > b.span) [a, b] = [b, a];
  const strip = (w) => (w ? { pct: w.pct, resetsAt: w.resetsAt } : null);
  return { plan: label(u.plan_type), session: strip(a), weekly: strip(b) };
}
const READERS = { claude: readClaude, chatgpt: readChatgpt };

/* ---------- the file: which accounts you registered, and a sample per refresh (numbers only) ---------- */
function loadData(file) {
  const out = { accounts: {}, history: {} };
  for (const id of IDS) { out.accounts[id] = false; out.history[id] = []; }
  try {
    const read = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const id of IDS) {
      out.accounts[id] = !!(read.accounts && read.accounts[id] === true);
      const h = read.history && read.history[id];
      if (Array.isArray(h)) out.history[id] = h.filter((x) => x && Number.isFinite(x.t)).slice(-HISTORY_MAX).map((x) => ({ t: x.t, s: pct(x.s), w: pct(x.w) }));
    }
  } catch { /* first run, or an unreadable file: start fresh */ }
  return out;
}
function saveData(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }
  catch (e) { console.error('Could not save AI usage:', e.message); }
}

/* ---------- the engine ---------- */
function blank(id, phase) { return { provider: id, name: PROVIDERS[id].name, phase, plan: null, session: null, weekly: null, updatedAt: 0, error: '' }; }

function createAiUsage({ fetchFor, dataDir, onState = () => {}, interval = INTERVAL, now = Date.now }) {
  const file = path.join(dataDir, 'ai-usage.json');
  const data = loadData(file);
  // a registered account is checked at start and every few minutes; one never signed in to is never asked
  const states = {}; for (const id of IDS) states[id] = blank(id, data.accounts[id] ? 'loading' : 'signed-out');
  const running = {}, gen = {}; for (const id of IDS) gen[id] = 0;
  let timer = null;

  function snapshot() { return { providers: IDS.map((id) => ({ ...states[id], registered: data.accounts[id], history: data.history[id].slice() })) }; }
  function publish() { const s = snapshot(); onState(s); return s; }
  function set(id, patch) { states[id] = { ...states[id], ...patch }; }

  function refreshOne(id) {
    if (running[id]) return running[id];
    const g = gen[id];
    set(id, { phase: states[id].phase === 'ready' ? 'ready' : 'loading', error: '' }); publish();
    running[id] = (async () => {
      try {
        const r = await READERS[id](fetchFor, now());
        if (g !== gen[id]) return snapshot();   // signed out while this was on its way: drop it
        const t = now();
        set(id, { phase: 'ready', plan: r.plan, session: r.session, weekly: r.weekly, updatedAt: t, error: '' });
        data.accounts[id] = true;
        data.history[id] = data.history[id].concat({ t, s: r.session ? r.session.pct : null, w: r.weekly ? r.weekly.pct : null }).slice(-HISTORY_MAX);
        saveData(file, data);
      } catch (e) {
        if (g !== gen[id]) return snapshot();
        if (e instanceof SignedOut) set(id, blank(id, 'signed-out'));   // its history stays: signing in again carries on
        else set(id, { phase: states[id].updatedAt ? 'ready' : 'error', error: e.message });   // the last good numbers stay
      } finally { if (g === gen[id]) running[id] = null; }
      return publish();
    })();
    return running[id];
  }
  const registered = () => IDS.filter((id) => data.accounts[id] && states[id].phase !== 'signed-out');

  return {
    state: snapshot,
    // one provider (also one not registered yet: a sign-in has just finished), or every registered one
    async refresh(id) {
      if (id && !PROVIDERS[id]) return snapshot();
      await Promise.all((id ? [id] : registered()).map(refreshOne));
      return snapshot();
    },
    start() {
      if (timer) return;
      this.refresh();
      timer = setInterval(() => { for (const id of registered()) refreshOne(id); }, interval);
      if (timer.unref) timer.unref();
    },
    stop() { clearInterval(timer); timer = null; },
    // signing out unregisters the account and forgets its numbers and history
    signedOut(id) {
      if (!PROVIDERS[id]) return snapshot();
      gen[id]++; running[id] = null;
      set(id, blank(id, 'signed-out'));
      data.accounts[id] = false; data.history[id] = []; saveData(file, data);
      return publish();
    }
  };
}

module.exports = { createAiUsage, PROVIDERS, HISTORY_MAX };
