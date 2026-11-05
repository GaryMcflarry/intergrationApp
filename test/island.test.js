'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSpotifyAuth } = require('../lib/spotify-auth');
const { createApi } = require('../lib/api');
const { mapMessage, readable } = require('../lib/discordbot');
const { createStore } = require('../lib/store');
const server = require('../lib/server');

test('Spotify sign-in: a PKCE link to Spotify, and the code swapped for the sign-in on return', async () => {
  let saved = null, sentBody = null;
  const auth = createSpotifyAuth({
    getClientId: () => 'a'.repeat(32), redirectUri: 'http://127.0.0.1:43210/spotify/callback', saveToken: (t) => { saved = t; },
    fetchImpl: async (u, o) => { sentBody = new URLSearchParams(o.body); return { ok: true, json: async () => ({ access_token: 'A', refresh_token: 'R', expires_in: 3600, scope: 'x' }) }; }
  });
  const link = new URL(auth.login());
  assert.equal(link.origin + link.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(link.searchParams.get('redirect_uri'), 'http://127.0.0.1:43210/spotify/callback');
  assert.equal(link.searchParams.get('code_challenge_method'), 'S256');
  const state = link.searchParams.get('state');
  await assert.rejects(auth.callback(new URLSearchParams({ code: 'c', state: 'not-mine' })), /did not start here/);
  const tok = await auth.callback(new URLSearchParams({ code: 'c', state }));
  assert.equal(tok.refresh, 'R'); assert.equal(saved.access, 'A');
  assert.equal(sentBody.get('grant_type'), 'authorization_code'); assert.ok(sentBody.get('code_verifier').length >= 43);
  await assert.rejects(auth.callback(new URLSearchParams({ code: 'c', state })), /did not start here/);   // once only
  await assert.rejects(auth.callback(new URLSearchParams({ error: 'access_denied' })), /access_denied/);
  assert.equal(createSpotifyAuth({ getClientId: () => '', redirectUri: 'x', saveToken() {} }).login(), null);
});

test('Discord messages read as people write them', () => {
  const m = mapMessage({ id: '9', content: 'hi <@1> see <#5> <:wave:123>', mentions: [{ id: '1', username: 'gary', global_name: 'Gary' }], author: { id: '2', username: 'sam', avatar: 'abc' }, timestamp: '2026-11-05T10:00:00Z' },
    { id: '5', name: 'general', guild_id: '7', guildName: 'Home' }, { 5: { name: 'general' } });
  assert.equal(m.content, 'hi @Gary see #general :wave:');
  assert.equal(m.author.avatar, 'https://cdn.discordapp.com/avatars/2/abc.png?size=64');
  assert.equal(m.url, 'https://discord.com/channels/7/5/9');
  assert.equal(mapMessage({ id: '1', content: '', attachments: [{}, {}], author: { id: '3', username: 'x' }, timestamp: '' }, { id: '5', name: 'g' }).content, '📎 2 attachments');
  assert.equal(readable('<@&4> ping', {}, {}), '@role ping');
});

test('The local API: only the app\'s own pages can change things; nothing secret comes back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-api-'));
  const store = createStore(dir), applied = [], kv = {};
  const port = 43600 + Math.floor(Math.random() * 300), O = `http://127.0.0.1:${port}`;
  const api = createApi({
    origins: [O, `http://localhost:${port}`], store, presence: {}, presenceStatus: () => ({ text: 'x', ok: false }),
    spotifyAuth: { login: () => 'https://accounts.spotify.com/authorize?x=1', callback: async () => ({}) },
    bot: { feed: () => ({}), listChannels: async () => [], refresh: async () => {} },
    applySettings: (p) => { applied.push(p); store.setSettings(p); }, setKv: (k, v) => { kv[k] = v; store.set(k, v); },
    setBotToken: async () => ({ ok: true, name: 'bot' }), hasBotToken: () => false
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-root-'));
  const srv = await server.start(root, port, api);
  const req = (method, p, body, headers = {}) => new Promise((res) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => res({ s: x.statusCode, b, loc: x.headers.location })); });
    if (body) r.write(JSON.stringify(body)); r.end();
  });
  const good = { Origin: O, 'X-IA': '1', 'Content-Type': 'application/json' };
  assert.equal((await req('POST', '/api/spotify/client', { clientId: 'a'.repeat(32) }, { Origin: 'https://evil.example', 'X-IA': '1', 'Content-Type': 'application/json' })).s, 403);
  assert.equal((await req('POST', '/api/spotify/client', { clientId: 'a'.repeat(32) }, { Origin: O, 'Content-Type': 'application/json' })).s, 403);
  assert.equal((await req('POST', '/api/spotify/client', { clientId: 'nope' }, good)).s, 400);
  assert.equal((await req('POST', '/api/spotify/client', { clientId: 'a'.repeat(32) }, good)).s, 200);
  assert.equal(kv['np-client'], 'a'.repeat(32));
  assert.equal((await req('POST', '/api/kv', { key: 'np-spotify-v1', value: 'x' }, good)).s, 400);   // the browser cannot set the Spotify sign-in
  assert.equal((await req('POST', '/api/kv', { key: 'yt-library-v1', value: '{"pls":[],"liked":[]}' }, good)).s, 200);
  assert.equal((await req('POST', '/api/discord', { webhook: 'https://example.com/x' }, good)).s, 400);
  assert.equal((await req('POST', '/api/discord', { appId: '123456789012345678', webhook: 'https://discord.com/api/webhooks/1/abc' }, good)).s, 200);
  assert.equal((await req('POST', '/api/discord/channels', { ids: ['123456789012345678', 'bad', '223456789012345678'] }, good)).s, 200);
  assert.deepEqual(store.settings().channels, ['123456789012345678', '223456789012345678']);
  const st = JSON.parse((await req('GET', '/api/status')).b);
  assert.equal(st.spotify.client, true); assert.equal(st.discord.webhook, true); assert.equal(st.youtube.library.playlists, 0);
  assert.equal(JSON.stringify(st).includes('webhooks/1/abc'), false);   // never sent back
  assert.equal((await req('GET', '/api/discord/channels')).s, 403);   // only with the app's header
  const login = await req('GET', '/spotify/login'); assert.equal(login.s, 302); assert.match(login.loc, /^https:\/\/accounts\.spotify\.com\//);
  const back = await req('GET', '/spotify/callback?code=c&state=s'); assert.equal(back.loc, '/guide/spotify.html?connected=1');
  srv.close();
});
