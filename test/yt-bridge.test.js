'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createYtBridge, command, clean, watchUrl, STALE, COMMAND_TTL } = require('../lib/yt-bridge');
const { createApi } = require('../lib/api');
const { createStore } = require('../lib/store');
const server = require('../lib/server');

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
function bridge(extra = {}) {
  let code = '', t = 1000;
  const states = [];
  const b = createYtBridge({ getCode: () => code, setCode: (c) => { code = c; }, onState: (s) => states.push(s), now: () => t, ...extra });
  return { b, states, code: () => code, tick: (ms) => { t += ms; } };
}
const auth = (c, origin = EXT) => ({ origin, authorization: 'Bearer ' + c });
const STATE = { video: 'dQw4w9WgXcQ', title: 'A song', channel: 'Someone', playing: true, position: 12.5, duration: 200, volume: 80, list: 'PL123', index: 2,
  queue: [{ v: 'aaaaaaaaaaa', t: 'One', c: 'X' }], upNext: [{ v: 'bbbbbbbbbbb', t: 'Two', c: 'Y' }] };

test('pairing: a code is made once and kept; only the extension with it gets in', () => {
  const f = bridge();
  const c = f.b.code();
  assert.match(c, /^[\w-]{24}$/); assert.equal(f.b.code(), c);
  assert.equal(f.b.authorize(auth(c)), 'ok');
  assert.equal(f.b.authorize(auth(c, 'moz-extension://0f0e0d0c-0b0a-0908-0706-050403020100')), 'ok');
  assert.equal(f.b.authorize(auth(c, 'https://www.youtube.com')), 'origin');   // a web page, even with the code
  assert.equal(f.b.authorize(auth(c, '')), 'origin');
  assert.equal(f.b.authorize(auth('wrong')), 'code');
  assert.equal(f.b.authorize({ origin: EXT }), 'code');
  const n = f.b.newCode();
  assert.notEqual(n, c); assert.equal(f.b.authorize(auth(c)), 'code'); assert.equal(f.b.authorize(auth(n)), 'ok');
});

test('what the extension sends is cut to a fixed shape', () => {
  const s = clean({ ...STATE, title: 'x'.repeat(500) + '\u0000', volume: 400, position: -3, duration: 'long', index: 1.5, list: 'bad list!',
    queue: [{ v: 'short', t: 'no' }, { v: 'ccccccccccc', t: '' }, null].concat(Array.from({ length: 80 }, () => ({ v: 'ddddddddddd', t: 'x' }))), extra: 'dropped' });
  assert.equal(s.title.length, 200); assert.equal(s.volume, 100); assert.equal(s.position, 0); assert.equal(s.duration, 0);
  assert.equal(s.index, -1); assert.equal(s.list, '');
  assert.equal(s.queue.length, 25); assert.deepEqual(s.queue[0], { v: 'ccccccccccc', t: 'YouTube video', c: '' });
  assert.equal('extra' in s, false);
  assert.equal(clean({ video: '<script>' }).video, '');
  assert.equal(clean(null), null);
});

test('commands are a fixed list', () => {
  assert.deepEqual(command('next'), { name: 'next' });
  assert.deepEqual(command('seek', 30), { name: 'seek', arg: 30 });
  assert.deepEqual(command('volume', 140.4), { name: 'volume', arg: 100 });
  assert.deepEqual(command('open', { v: 'dQw4w9WgXcQ', list: 'PL123', index: 3 }), { name: 'open', arg: { v: 'dQw4w9WgXcQ', list: 'PL123', index: 3 } });
  assert.equal(command('open', { v: 'javascript:x' }), null);
  assert.equal(command('seek', '30'), null);
  assert.equal(command('eval', 'x'), null);
});

test('a report connects the tab and collects the waiting commands; a quiet tab goes stale', () => {
  const f = bridge();
  f.b.code();
  assert.equal(f.b.send('play'), false);   // nothing connected: nothing queued
  assert.deepEqual(f.b.report({ state: STATE }), { commands: [] });
  const s = f.b.state();
  assert.equal(s.connected, true); assert.equal(s.title, 'A song'); assert.equal(s.queue.length, 1);
  assert.equal(JSON.stringify(f.states).includes(f.code()), false);   // the code never reaches the island
  assert.equal(f.b.send('pause'), true); assert.equal(f.b.send('rm -rf'), false);
  assert.deepEqual(f.b.report({ state: STATE }), { commands: [{ name: 'pause' }] });
  assert.deepEqual(f.b.report({ state: STATE }), { commands: [] });   // collected once
  f.b.send('next'); f.tick(COMMAND_TTL + 1);
  assert.deepEqual(f.b.report({ state: STATE }).commands, []);   // too old: dropped
  f.tick(STALE);
  const gone = f.b.state();
  assert.equal(gone.connected, false); assert.equal(gone.title, ''); assert.equal(f.b.send('play'), false);
  f.b.report({ state: STATE }); f.b.send('play');
  assert.deepEqual(f.b.report({ closed: true }), { commands: [] });   // the last tab closed: at once, and its commands go too
  assert.equal(f.b.state().connected, false); assert.equal(f.states[f.states.length - 1].connected, false);
  f.b.report({}); assert.equal(f.b.state().connected, true);   // a heartbeat with nothing on: still connected
});

test('an open command plays on youtube.com only', () => {
  assert.equal(watchUrl(command('open', { v: 'dQw4w9WgXcQ' }).arg), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(watchUrl(command('open', { v: 'dQw4w9WgXcQ', list: 'PL123', index: 0 }).arg), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=1');
  assert.equal(watchUrl(command('open', { list: 'PL123' }).arg), 'https://www.youtube.com/playlist?list=PL123');
});

test('the local API: /api/yt/bridge takes the paired extension only', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-bridge-'));
  const store = createStore(dir);
  const yb = createYtBridge({ getCode: () => store.settings().ytBridgeCode, setCode: (c) => store.setSettings({ ytBridgeCode: c }) });
  const port = 43900 + Math.floor(Math.random() * 90), O = `http://127.0.0.1:${port}`;
  const api = createApi({
    origins: [O], store, presence: {}, presenceStatus: () => ({}), spotifyAuth: {}, bot: { feed: () => ({}) },
    applySettings: () => {}, setKv: () => {}, setBotToken: async () => ({}), hasBotToken: () => false, ytBridge: yb
  });
  const srv = await server.start(fs.mkdtempSync(path.join(os.tmpdir(), 'yt-root-')), port, api);
  const req = (method, body, headers) => new Promise((res) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/api/yt/bridge', method, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (x) => {
      let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => res({ s: x.statusCode, b }));
    });
    if (body) r.write(JSON.stringify(body)); r.end();
  });
  const code = yb.code(), json = { 'Content-Type': 'application/json' };
  try {
    assert.equal((await req('POST', { state: STATE }, { ...json, Origin: 'https://evil.example', Authorization: 'Bearer ' + code })).s, 403);
    assert.equal((await req('POST', { state: STATE }, { ...json, Origin: O, 'X-IA': '1', Authorization: 'Bearer ' + code })).s, 403);   // Astrum's own pages are not the extension
    assert.equal((await req('POST', { state: STATE }, { ...json, Origin: EXT, Authorization: 'Bearer nope' })).s, 401);
    assert.equal((await req('POST', { state: STATE }, { Origin: EXT, Authorization: 'Bearer ' + code, 'Content-Type': 'text/plain' })).s, 415);
    assert.equal((await req('GET', null, { Origin: EXT, Authorization: 'Bearer ' + code })).s, 405);
    const ok = await req('POST', { state: STATE }, { ...json, Origin: EXT, Authorization: 'Bearer ' + code });
    assert.equal(ok.s, 200); assert.deepEqual(JSON.parse(ok.b), { commands: [] });
    assert.equal(yb.state().connected, true);
    const st = (await new Promise((res) => http.get({ host: '127.0.0.1', port, path: '/api/status', headers: { Host: `127.0.0.1:${port}` } }, (x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => res(b)); })));
    assert.equal(st.includes(code), false);   // the status page never shows the code
  } finally { srv.close(); }
});
