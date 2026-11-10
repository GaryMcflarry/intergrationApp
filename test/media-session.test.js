'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMediaSession, parse } = require('../lib/media-session');

// a fake computer: answers by command, and remembers what was run
function fake(answer) {
  const ran = [];
  return { ran, run: async (cmd, args) => { ran.push([cmd, ...args]); return typeof answer === 'function' ? answer(cmd, args) : answer; } };
}
const psScript = (args) => Buffer.from(args[args.length - 1], 'base64').toString('utf16le');

test('Windows: a browser that plays wins; other apps are left out', () => {
  const out = JSON.stringify([
    { app: 'Spotify.exe', title: 'Song', artist: 'Band', status: 'Playing', position: 1, duration: 2 },
    { app: 'chrome', title: 'Paused video', artist: 'A', status: 'Paused', position: 0, duration: 0 },
    { app: 'msedge', title: 'A video\u0007', artist: 'Channel', status: 'Playing', position: 12.5, duration: 300 }
  ]);
  assert.deepEqual(parse.win(out), { title: 'A video', channel: 'Channel', playing: true, position: 12.5, duration: 300, app: 'msedge' });
  assert.deepEqual(parse.win(JSON.stringify({ app: 'chrome', title: 'One', artist: '', status: 'Paused' })).title, 'One');   // one session comes as an object
  assert.equal(parse.win(JSON.stringify([{ app: 'Spotify.exe', title: 'Song', status: 'Playing' }])), null);
  assert.equal(parse.win('not json'), null);
});

test('Linux: only players on youtube.com, with the video id', () => {
  const out = 'spotify\tPlaying\thttps://open.spotify.com/x\tSong\tBand\t1\t2\n' +
    'chromium.instance1\tPaused\thttps://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3\tA video\tChannel\t12000000\t300000000';
  assert.deepEqual(parse.linux(out), { title: 'A video', channel: 'Channel', playing: false, position: 12, duration: 300, player: 'chromium.instance1', video: 'dQw4w9WgXcQ' });
  assert.equal(parse.linux('firefox\tPlaying\thttps://evil.example/youtube.com/\tX\tY\t0\t0'), null);
  assert.equal(parse.linux(''), null);
});

test('macOS: the adapter\'s answer, browsers only', () => {
  assert.deepEqual(parse.mac(JSON.stringify({ bundleIdentifier: 'com.google.Chrome', title: 'A video', artist: 'Channel', playing: true, elapsedTime: 5, duration: 60 })),
    { title: 'A video', channel: 'Channel', playing: true, position: 5, duration: 60, app: 'com.google.Chrome' });
  assert.equal(parse.mac(JSON.stringify({ bundleIdentifier: 'com.spotify.client', title: 'Song' })), null);
});

test('macOS without the adapter\'s files: not available, nothing is run', async () => {
  const f = fake('');
  const m = createMediaSession({ platform: 'darwin', run: f.run, exists: () => false });
  assert.equal(m.available(), false);
  await m.poll(); assert.equal(await m.send('play'), false); assert.equal(f.ran.length, 0);
  const m2 = createMediaSession({ platform: 'darwin', run: f.run, exists: () => true, adapterDir: '/x' });
  assert.equal(m2.available(), true);
});

test('polling reports a change once; commands are a fixed list, sent to the session that was read', async () => {
  const states = [];
  const f = fake((cmd, args) => (args.includes('metadata') ? 'chromium\tPlaying\thttps://www.youtube.com/watch?v=dQw4w9WgXcQ\tA video\tChannel\t0\t0' : ''));
  const m = createMediaSession({ platform: 'linux', run: f.run, onState: (s) => states.push(s) });
  await m.poll(); await m.poll();
  assert.equal(states.length, 1); assert.equal(states[0].connected, true); assert.equal(states[0].via, 'system'); assert.equal(states[0].video, 'dQw4w9WgXcQ');
  assert.equal(await m.send('next'), true); assert.deepEqual(f.ran[f.ran.length - 1], ['playerctl', '-p', 'chromium', 'next']);
  assert.equal(await m.send('seek'), false); assert.equal(await m.send('rm'), false);
  m.stop(); assert.equal(states[states.length - 1].connected, false);
});

test('Windows: the command goes to the same app, and an odd app id is refused', async () => {
  let sessions = [{ app: 'chrome', title: 'A video', artist: 'C', status: 'Playing' }];
  const f = fake((cmd, args) => (psScript(args).includes('ConvertTo-Json') ? JSON.stringify(sessions) : ''));
  const m = createMediaSession({ platform: 'win32', run: f.run });
  await m.poll();
  assert.equal(await m.send('toggle'), true);
  const script = psScript(f.ran[f.ran.length - 1]);
  assert.match(script, /SourceAppUserModelId -eq 'chrome'/); assert.match(script, /TryTogglePlayPauseAsync/);
  sessions = [{ app: "chrome'; Remove-Item x; '", title: 'A video', status: 'Playing' }];
  await m.poll();
  assert.equal(await m.send('play'), false);
});
