'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAiUsage, HISTORY_MAX } = require('../lib/ai-usage');

const NOW = Date.parse('2026-11-10T12:00:00Z');
const ORG = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';

function reply(status, body, type = 'application/json') {
  return { status, ok: status >= 200 && status < 300, headers: { get: () => type }, json: async () => { if (body instanceof Error) throw body; return body; } };
}
// answers by URL; records every call (and its headers) so a test can see what was sent
function fixture(routes, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-')), calls = [], states = [];
  const fetchFor = async (provider, url, opts) => {
    calls.push({ provider, url, opts });
    const r = routes[url]; if (!r) throw new Error('offline');
    return typeof r === 'function' ? r(opts) : r;
  };
  const usage = createAiUsage({ fetchFor, dataDir: dir, onState: (s) => states.push(s), now: () => NOW, ...extra });
  return { usage, calls, states, dir, find: (s, id) => s.providers.find((p) => p.provider === id) };
}
const CLAUDE_OK = {
  'https://claude.ai/api/organizations': reply(200, [{ uuid: 'api-org-00000001', capabilities: ['api'] }, { uuid: ORG, capabilities: ['chat', 'claude_pro'] }]),
  ['https://claude.ai/api/organizations/' + ORG + '/usage']: reply(200, { five_hour: { utilization: 42.25, resets_at: '2026-11-10T14:00:00Z' }, seven_day: { utilization: 130, resets_at: '2026-11-14T00:00:00Z' } })
};
const GPT_OK = {
  'https://chatgpt.com/api/auth/session': reply(200, { accessToken: 'secret-token', user: { email: 'x@y.z' } }),
  'https://chatgpt.com/backend-api/wham/usage': (opts) => opts.headers && opts.headers.Authorization === 'Bearer secret-token'
    ? reply(200, { plan_type: 'plus', rate_limit: {
      primary_window: { used_percent: 61, limit_window_seconds: 604800, reset_at: 1763200000 },
      secondary_window: { used_percent: 12, limit_window_seconds: 18000, reset_after_seconds: 3600 } } })
    : reply(401, {})
};

test('Claude: picks the chat organisation and normalises both windows', async () => {
  const f = fixture(CLAUDE_OK);
  const c = f.find(await f.usage.refresh('claude'), 'claude');
  assert.equal(c.phase, 'ready'); assert.equal(c.plan, 'Pro');
  assert.deepEqual(c.session, { pct: 42.3, resetsAt: Date.parse('2026-11-10T14:00:00Z') });
  assert.deepEqual(c.weekly, { pct: 100, resetsAt: Date.parse('2026-11-14T00:00:00Z') });   // clamped
  assert.equal(c.updatedAt, NOW);
  assert.deepEqual(c.history, [{ t: NOW, s: 42.3, w: 100 }]);
  assert.ok(f.calls.some((x) => x.url.endsWith(ORG + '/usage')));
});

test('ChatGPT: sends the token, orders windows by length, never exposes the token', async () => {
  const f = fixture(GPT_OK);
  const s = await f.usage.refresh('chatgpt'), g = f.find(s, 'chatgpt');
  assert.equal(g.phase, 'ready'); assert.equal(g.plan, 'plus');
  assert.deepEqual(g.session, { pct: 12, resetsAt: NOW + 3600 * 1000 });   // the 5-hour window, though it came second
  assert.deepEqual(g.weekly, { pct: 61, resetsAt: 1763200000 * 1000 });
  const everything = JSON.stringify(f.states) + fs.readFileSync(path.join(f.dir, 'ai-usage.json'), 'utf8');
  assert.equal(everything.includes('secret-token'), false);
  assert.equal(everything.includes('x@y.z'), false);
});

test('401, a 403 with JSON, or no token means signed out', async () => {
  const f = fixture({
    'https://claude.ai/api/organizations': reply(403, { error: 'permission' }),
    'https://chatgpt.com/api/auth/session': reply(200, {})
  });
  await f.usage.refresh('claude'); const s = await f.usage.refresh('chatgpt');
  assert.equal(f.find(s, 'claude').phase, 'signed-out');
  assert.equal(f.find(s, 'chatgpt').phase, 'signed-out');
  assert.equal(f.calls.length, 2);   // no usage call without a sign-in
});

test('a browser-check page is an error, not a sign-out', async () => {
  const f = fixture({ 'https://claude.ai/api/organizations': reply(403, new Error('not json'), 'text/html') });
  const c = f.find(await f.usage.refresh('claude'), 'claude');
  assert.equal(c.phase, 'error'); assert.match(c.error, /browser check/);
});

test('a failure keeps the last good numbers; malformed answers do not throw', async () => {
  const routes = { ...CLAUDE_OK };
  const f = fixture(routes);
  await f.usage.refresh('claude');
  routes['https://claude.ai/api/organizations/' + ORG + '/usage'] = reply(500, {});
  let c = f.find(await f.usage.refresh('claude'), 'claude');
  assert.equal(c.phase, 'ready'); assert.equal(c.session.pct, 42.3); assert.match(c.error, /500/);
  routes['https://claude.ai/api/organizations/' + ORG + '/usage'] = reply(200, new Error('bad json'));
  c = f.find(await f.usage.refresh('claude'), 'claude');
  assert.match(c.error, /unexpected/);
  const g = fixture({ ...GPT_OK, 'https://chatgpt.com/backend-api/wham/usage': reply(200, { rate_limit: 'nope' }) });
  assert.equal(g.find(await g.usage.refresh('chatgpt'), 'chatgpt').phase, 'error');
  const m = fixture({ ...CLAUDE_OK, ['https://claude.ai/api/organizations/' + ORG + '/usage']: reply(200, { five_hour: { utilization: 'x' } }) });
  const mc = m.find(await m.usage.refresh('claude'), 'claude');
  assert.deepEqual(mc.session, { pct: null, resetsAt: null }); assert.equal(mc.weekly, null);
});

test('an unreachable site is an error message', async () => {
  const f = fixture({});
  const c = f.find(await f.usage.refresh('claude'), 'claude');
  assert.equal(c.phase, 'error'); assert.equal(c.error, 'Could not reach Claude.');
});

test('history persists, is capped, and is forgotten on sign-out', async () => {
  const f = fixture(CLAUDE_OK);
  for (let i = 0; i < 3; i++) await f.usage.refresh('claude');
  const again = createAiUsage({ fetchFor: async () => { throw new Error('offline'); }, dataDir: f.dir, now: () => NOW });
  assert.equal(f.find(again.state(), 'claude').history.length, 3);
  fs.writeFileSync(path.join(f.dir, 'ai-usage.json'), JSON.stringify({ accounts: { claude: true }, history: { claude: Array.from({ length: HISTORY_MAX + 50 }, (_, i) => ({ t: i, s: 1, w: 2, junk: 'x' })) } }));
  const capped = createAiUsage({ fetchFor: async () => { throw new Error('offline'); }, dataDir: f.dir, now: () => NOW });
  const h = f.find(capped.state(), 'claude').history;
  assert.equal(h.length, HISTORY_MAX); assert.deepEqual(h[0], { t: 50, s: 1, w: 2 });
  const out = capped.signedOut('claude');
  assert.equal(f.find(out, 'claude').phase, 'signed-out'); assert.equal(f.find(out, 'claude').history.length, 0);
  const saved = JSON.parse(fs.readFileSync(path.join(f.dir, 'ai-usage.json'), 'utf8'));
  assert.deepEqual(saved.history.claude, []); assert.equal(saved.accounts.claude, false);
});

test('refreshes of the same provider share one request', async () => {
  const f = fixture(CLAUDE_OK);
  await Promise.all([f.usage.refresh('claude'), f.usage.refresh('claude')]);
  assert.equal(f.calls.filter((x) => x.url === 'https://claude.ai/api/organizations').length, 1);
  assert.equal(f.find(await f.usage.refresh('nope'), 'claude').phase, 'ready');   // unknown provider: just the state
});

test('only registered accounts are asked; a sign-in registers one', async () => {
  const f = fixture({ ...CLAUDE_OK, ...GPT_OK });
  let s = f.usage.state();
  assert.equal(f.find(s, 'claude').phase, 'signed-out'); assert.equal(f.find(s, 'claude').registered, false);
  await f.usage.refresh();
  assert.equal(f.calls.length, 0);   // nothing registered: no traffic at all
  await f.usage.refresh('claude');   // a sign-in window closed
  s = await f.usage.refresh();
  assert.equal(f.find(s, 'claude').registered, true);
  assert.equal(f.calls.filter((x) => x.provider === 'chatgpt').length, 0);
  const later = createAiUsage({ fetchFor: async () => { throw new Error('offline'); }, dataDir: f.dir, now: () => NOW });
  assert.equal(f.find(later.state(), 'claude').phase, 'loading');   // registered: checked again at start
  assert.equal(f.find(later.state(), 'chatgpt').phase, 'signed-out');
});

test('a result that arrives after sign-out is dropped', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const f = fixture({ ...CLAUDE_OK, 'https://claude.ai/api/organizations': () => gate.then(() => CLAUDE_OK['https://claude.ai/api/organizations']) });
  const pending = f.usage.refresh('claude');
  f.usage.signedOut('claude');
  release(); await pending;
  const c = f.find(f.usage.state(), 'claude');
  assert.equal(c.phase, 'signed-out'); assert.equal(c.registered, false); assert.equal(c.history.length, 0);
});
