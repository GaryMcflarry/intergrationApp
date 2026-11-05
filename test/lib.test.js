'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { activityFor, validWebhook, shareMessage, share, createPresence } = require('../lib/discord');
const { createStore } = require('../lib/store');
const server = require('../lib/server');

const song = { source: 'spotify', title: 'Asymmetry', artist: 'Babbage', album: 'Spacetime', art: 'https://i.scdn.co/image/abc', url: 'https://open.spotify.com/track/1', playing: true, start: 1000, duration: 204000 };

test('Rich Presence: a playing song becomes a Listening activity; nothing playing clears it', () => {
  const a = activityFor(song);
  assert.equal(a.type, 2);
  assert.equal(a.details, 'Asymmetry');
  assert.equal(a.state, 'by Babbage');
  assert.equal(a.largeImageKey, song.art);
  assert.equal(a.largeImageText, 'Spacetime');
  assert.equal(a.startTimestamp, 1000);
  assert.equal(a.endTimestamp, 205000);
  assert.deepEqual(a.buttons, [{ label: 'Open in Spotify', url: song.url }]);
  assert.equal(activityFor({ ...song, playing: false }), null);
  assert.equal(activityFor(null), null);
  const yt = activityFor({ ...song, source: 'youtube', artist: '', art: 'http://not-https/x.jpg', url: 'javascript:alert(1)', title: 'x'.repeat(300) });
  assert.equal(yt.state, 'YouTube Music');
  assert.equal(yt.largeImageKey, undefined);
  assert.equal(yt.buttons, undefined);
  assert.equal(yt.details.length, 128);
  assert.equal(activityFor({ ...song, title: 'A' }).details.length, 2);   // Discord wants at least 2 characters
});

test('Sharing: only Discord webhook addresses; the message carries the song', async () => {
  assert.ok(validWebhook('https://discord.com/api/webhooks/123/abc-DEF_1'));
  assert.ok(validWebhook('https://canary.discord.com/api/webhooks/123/abc'));
  assert.equal(validWebhook('http://discord.com/api/webhooks/123/abc'), false);
  assert.equal(validWebhook('https://discord.com.evil.example/api/webhooks/123/abc'), false);
  assert.equal(validWebhook('https://example.com/api/webhooks/123/abc'), false);
  const m = shareMessage(song);
  assert.equal(m.embeds[0].title, 'Asymmetry');
  assert.equal(m.embeds[0].url, song.url);
  assert.deepEqual(m.allowed_mentions, { parse: [] });
  let sent = null;
  const ok = await share('https://discord.com/api/webhooks/1/a', song, async (u, o) => { sent = { u, o }; return { ok: true }; });
  assert.deepEqual(ok, { ok: true });
  assert.equal(JSON.parse(sent.o.body).embeds[0].description, 'by Babbage');
  assert.equal((await share('', song)).ok, false);
  assert.equal((await share('https://example.com/x', song)).ok, false);
});

test('Rich Presence connection: sends the latest song once connected, clears when it stops', async () => {
  const calls = [];
  class FakeClient {
    constructor(o) { this.o = o; this.h = {}; this.user = { setActivity: async (a) => calls.push(['set', a.details]), clearActivity: async () => calls.push(['clear']) }; }
    on(n, f) { this.h[n] = f; }
    async login() { setTimeout(() => this.h.ready(), 5); }
    async destroy() {}
  }
  const statuses = [];
  const p = createPresence({ Client: FakeClient, onStatus: (s) => statuses.push(s.text) });
  await p.connect('123456789012345678');
  p.update(song);
  await new Promise((r) => setTimeout(r, 900));
  p.update({ ...song, playing: false });
  await new Promise((r) => setTimeout(r, 900));
  assert.deepEqual(calls, [['set', 'Asymmetry'], ['clear']]);
  assert.ok(statuses.includes('Connected to Discord'));
  await p.connect('nope');
  assert.match(statuses.at(-1), /does not look right/);
  await p.stop();
});

test('Store: settings persist; only the shared keys can be stored', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
  const s = createStore(dir);
  s.setSettings({ discordId: '42', nope: 1 });
  assert.equal(s.set('yt-library-v1', '{"pls":[]}'), true);
  assert.equal(s.set('np-spotify-v1', '{"refresh":"r"}'), true);   // the Spotify sign-in is shared with the island
  assert.equal(s.set('anything-else', 'x'), false);
  s.flush();
  const again = createStore(dir);
  assert.equal(again.settings().discordId, '42');
  assert.equal('nope' in again.settings(), false);
  assert.equal(again.get('yt-library-v1'), '{"pls":[]}');
  assert.equal(again.get('anything-else'), null);
});

test('Server: serves the app on its own addresses only, nothing outside the app folder', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-app-'));
  fs.writeFileSync(path.join(root, 'island.html'), '<p>hi</p>');
  fs.writeFileSync(path.join(path.dirname(root), 'secret.txt'), 'no');
  const port = 43000 + Math.floor(Math.random() * 500);
  const srv = await server.start(root, port);
  const get = (p, host) => new Promise((res) => http.get({ host: '127.0.0.1', port, path: p, headers: { Host: host || `127.0.0.1:${port}` } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ s: r.statusCode, b, t: r.headers['content-type'] })); }));
  assert.deepEqual(await get('/'), { s: 200, b: '<p>hi</p>', t: 'text/html; charset=utf-8' });
  assert.equal((await get('/', `localhost:${port}`)).s, 200);
  assert.equal((await get('/', 'evil.example')).s, 421);
  assert.equal((await get('/../secret.txt')).s, 404);
  assert.equal((await get('/%2e%2e/secret.txt')).s, 404);
  srv.close();
});
