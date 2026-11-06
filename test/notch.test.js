'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { match, measure } = require('../lib/notch');

const mbp = { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 } };     // a 14" MacBook Pro
const ext = { id: 2, bounds: { x: 1512, y: 0, width: 2560, height: 1440 } };  // an external screen

test('the notch width is what lies between the areas left and right of it; none on a screen without one', () => {
  const list = [{ x: 0, w: 1512, h: 982, top: 32, lw: 662, rw: 664 }, { x: 1512, w: 2560, h: 1440, top: 0, lw: 0, rw: 0 }];
  assert.deepEqual(match(list, [mbp, ext]), { 1: 186, 2: 0 });
});

test('a screen macOS did not list is left unknown; a failed or odd answer gives nothing', async () => {
  assert.deepEqual(match([{ x: 0, w: 1512, h: 982, top: 32, lw: 662, rw: 664 }], [ext]), {});
  assert.deepEqual(await measure([mbp], (cb) => cb(new Error('no osascript'))), {});
  assert.deepEqual(await measure([mbp], (cb) => cb(null, 'not json')), {});
  assert.deepEqual(await measure([mbp], (cb) => cb(null, JSON.stringify([{ x: 0, w: 1512, h: 982, top: 32, lw: 662, rw: 664 }]))), { 1: 186 });
});
