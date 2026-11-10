'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// the panel is a browser script that sets window.AiPanel; the pace needs no page to run
global.window = {};
require('../app/ai-panel.js');
const pace = window.AiPanel._pace;

const H = 3600 * 1000, D = 24 * H, NOW = Date.parse('2026-11-10T12:00:00Z');
const WEEK = 7 * D, SESSION = 5 * H;
// a window with `used` percent used and `elapsed` ms gone of `len`
const win = (used, elapsed, len) => ({ pct: used, resetsAt: NOW + len - elapsed });

test('within 2 points of an even rate is on pace', () => {
  const p = pace(win(51, WEEK / 2, WEEK), WEEK, NOW, false);
  assert.equal(p.label, 'On pace'); assert.equal(Math.round(p.expected), 50);
});

test('used less than an even rate is a reserve, and lasts until reset', () => {
  const p = pace(win(40, WEEK / 2, WEEK), WEEK, NOW, false);
  assert.equal(p.label, '10% in reserve'); assert.equal(p.projection, 'Lasts until reset');
});

test('used more than an even rate is a deficit, and runs out before the reset', () => {
  const p = pace(win(80, WEEK / 2, WEEK), WEEK, NOW, false);   // 80% in 3.5 d: the other 20% lasts 21 h
  assert.equal(p.label, '30% in deficit'); assert.equal(p.projection, 'Runs out in 21h 0m');
  const s = pace(win(60, 2 * H, SESSION), SESSION, NOW, true);   // 60% in 2 h: the other 40% lasts 1 h 20 m
  assert.equal(s.label, '20% in deficit'); assert.equal(s.projection, 'Projected empty in 1h 20m');
});

test('a used-up week runs out now; nothing used lasts until reset', () => {
  assert.equal(pace(win(100, WEEK / 2, WEEK), WEEK, NOW, false).projection, 'Runs out now');
  assert.equal(pace(win(0, WEEK / 2, WEEK), WEEK, NOW, false).projection, 'Lasts until reset');
});

test('no pace without the numbers to support it', () => {
  assert.equal(pace(null, WEEK, NOW, false), null);
  assert.equal(pace({ pct: null, resetsAt: NOW + D }, WEEK, NOW, false), null);
  assert.equal(pace({ pct: 10, resetsAt: null }, WEEK, NOW, false), null);
  assert.equal(pace({ pct: 10, resetsAt: NOW - 1 }, WEEK, NOW, false), null);            // already reset
  assert.equal(pace({ pct: 10, resetsAt: NOW + WEEK + H }, WEEK, NOW, false), null);     // longer than the window
  assert.equal(pace(win(10, 0, WEEK), WEEK, NOW, false), null);                          // used, with no time gone
  assert.equal(pace(win(10, 5 * 60000, SESSION), SESSION, NOW, true), null);              // session: under 3% gone
  assert.equal(pace(win(100, 2 * H, SESSION), SESSION, NOW, true), null);                 // session: nothing left
  assert.equal(pace(win(10, H, 0), 0, NOW, false), null);
});
