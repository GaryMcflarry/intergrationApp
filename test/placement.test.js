'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/placement');

// two screens side by side: the main one (1440×900, a 40 px taskbar), and a smaller one to its right
const A = { id: 1, workArea: { x: 0, y: 0, width: 1440, height: 860 } };
const B = { id: 2, workArea: { x: 1440, y: 0, width: 1280, height: 800 } };
const screens = [A, B], pill = { width: 216, height: 66 }, open = { width: 484, height: 216 };

test('first time: the top middle of the main screen, opening downwards', () => {
  assert.deepEqual(P.islandBounds(screens, A, null, pill), { x: 612, y: 0, width: 216, height: 66, up: false });
  const o = P.islandBounds(screens, A, null, open);
  assert.equal(o.y, 0); assert.equal(o.up, false); assert.equal(o.x + o.width / 2, 720);
});

test('dropped low on a screen: it stays there and opens upwards, its bottom where it was', () => {
  const win = { x: 400, y: 800, width: 216, height: 66 };   // let go near the bottom of screen A
  const a = P.anchorFromWindow(screens, win, false, 'spot');
  assert.equal(a.display, 1);
  const closed = P.islandBounds(screens, A, a, pill), opened = P.islandBounds(screens, A, a, open);
  assert.equal(closed.up, true);
  assert.equal(closed.y + closed.height, 860);                       // snapped to the bottom edge
  assert.equal(opened.y + opened.height, closed.y + closed.height);  // grows upwards from there
  assert.equal(opened.x + opened.width / 2, closed.x + closed.width / 2);
});

test('dropped by the right edge of the second screen: opens inwards, whole on that screen', () => {
  const a = P.anchorFromWindow(screens, { x: 2650, y: 300, width: 216, height: 66 }, false, 'spot');
  assert.equal(a.display, 2);
  const o = P.islandBounds(screens, A, a, open);
  assert.equal(o.x + o.width, 1440 + 1280);   // pushed in from the edge, not off it
  assert.ok(o.x >= 1440);
  assert.equal(o.up, false);
});

test('This screen: wherever it is dropped, the top middle of that screen', () => {
  const a = P.anchorFromWindow(screens, { x: 1500, y: 600, width: 216, height: 66 }, false, 'screen');
  assert.deepEqual(P.islandBounds(screens, A, a, pill), { x: 1440 + 532, y: 0, width: 216, height: 66, up: false });
});

test('Follow the mouse keeps the same spot on the other screen; a removed screen falls back to the main one', () => {
  const a = P.anchorFromWindow(screens, { x: 300, y: 400, width: 216, height: 66 }, false, 'spot');
  const f = P.followTo(B, a);
  assert.equal(f.display, 2); assert.equal(f.fx, a.fx); assert.equal(f.fy, a.fy);
  const gone = P.islandBounds([A], A, f, pill);   // screen 2 unplugged
  assert.ok(gone.x >= 0 && gone.x + gone.width <= 1440);
  assert.deepEqual(P.topMiddle(B), { display: 2, fx: 0.5, fy: (6 + 18) / 800 });
});

test('snapping: near the middle, the top or the bottom it lines up exactly', () => {
  const a = P.anchorFromWindow(screens, { x: 720 - 108 + 30, y: 40, width: 216, height: 66 }, false, 'spot');
  const b = P.islandBounds(screens, A, a, pill);
  assert.equal(b.x, 612); assert.equal(b.y, 0);
});
