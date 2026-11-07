const test = require('node:test');
const assert = require('node:assert/strict');
const clock = require('../app/playback-clock');

function track(progress, extra = {}) {
  return { item: { id: 'song', duration_ms: 10000 }, progress_ms: progress, is_playing: true, repeat_state: 'off', ...extra };
}

test('empty player responses and unknown durations are safe', () => {
  assert.equal(clock.position(null, 0, 1000), 0);
  assert.deepEqual(clock.reconcile(track(1000), 0, null, 1000, false, false), { progress: 0, lagged: false });
  assert.equal(clock.position(track(1000, { item: {} }), 0, 1000), 2000);
});

test('playing advances, paused stays still, and ordinary playback stops at its duration', () => {
  assert.equal(clock.position(track(1000), 1000, 3000), 3000);
  assert.equal(clock.position(track(1000, { is_playing: false }), 1000, 3000), 1000);
  assert.equal(clock.position(track(9000), 0, 2000), 10000);
});

test('repeat wraps locally and accepts a restart on a short track', () => {
  const before = track(1800, { item: { id: 'loop', duration_ms: 2000 }, repeat_state: 'track' });
  assert.equal(clock.position(before, 0, 500), 300);
  const next = { ...before, progress_ms: 200 };
  assert.deepEqual(clock.reconcile(before, 0, next, 500, false, false), { progress: 200, lagged: false });
  assert.equal(clock.reconcile(before, 0, { ...next, progress_ms: 1800 }, 2000, true, false).progress, 1800);
});

test('lag is smoothed, a confirmed backward seek is accepted, and device switches reset timing', () => {
  assert.equal(clock.reconcile(track(4000), 0, track(4000), 2000, true, false).progress, 6000);
  assert.deepEqual(clock.reconcile(track(4000), 0, track(3000), 1000, false, false), { progress: 5000, lagged: true });
  assert.equal(clock.reconcile(track(5000), 0, track(3000), 1000, false, true).progress, 3000);
  assert.equal(clock.reconcile(track(8000, { device: { id: 'phone' } }), 0, track(1000, { device: { id: 'desktop' } }), 500, false, false).progress, 1000);
});
