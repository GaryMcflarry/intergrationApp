'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const paint = require('../app/paint/paint');

const dir = path.join(__dirname, '..', 'app', 'paint');
const css = fs.readFileSync(path.join(dir, 'paint.css'), 'utf8');
const gallery = fs.readFileSync(path.join(dir, 'gallery.html'), 'utf8');

test('Paint UI: the three filters the CSS refers to are defined, each once', () => {
  for (const id of ['pt-rough', 'pt-bleed', 'pt-gouache']) {
    assert.equal(paint.FILTERS.split(`<filter id="${id}"`).length - 1, 1, id);
  }
  const used = new Set([...css.matchAll(/url\(#(pt-[a-z-]+)\)/g)].map((m) => m[1]));
  for (const id of used) assert.ok(paint.FILTERS.includes(`id="${id}"`), `paint.css uses #${id}, which paint.js does not define`);
});

test('Paint UI: every scene is drawable: known shapes, and every gradient a shape names exists', () => {
  assert.deepEqual(paint.scenes, ['valley', 'coast', 'dusk']);
  for (const [name, sc] of Object.entries(paint.SCENES)) {
    for (const [tag, attrs] of sc.shapes) {
      assert.ok(['rect', 'ellipse', 'circle', 'polygon', 'path'].includes(tag), `${name}: ${tag}`);
      for (const k of ['fill', 'stroke']) {
        const v = attrs[k];
        if (typeof v === 'string' && v.startsWith('#g:')) assert.ok(sc.gradients[v.slice(3)], `${name}: gradient ${v.slice(3)} is missing`);
      }
    }
  }
});

test('Paint UI: the gallery shows every component, and its scenes are ones paint.js knows', () => {
  for (const cls of ['pt-card', 'pt-number', 'pt-diamond', 'pt-caption', 'pt-actions', 'pt-action', 'pt-btn', 'pt-chip', 'pt-panel', 'pt-toggle', 'pt-slider', 'pt-input', 'pt-drip']) {
    assert.ok(new RegExp(`class="[^"]*\\b${cls}\\b`).test(gallery), `${cls} is not in the gallery`);
    assert.ok(css.includes('.' + cls), `${cls} has no style`);
  }
  for (const m of gallery.matchAll(/data-pt-scene="([a-z]+)"/g)) assert.ok(paint.SCENES[m[1]], m[1]);
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(gallery), 'the gallery has inline script');
});

test('Paint UI: reduced motion stops every animation the kit defines', () => {
  const animated = [...css.matchAll(/animation:\s*pt-([a-z-]+)/g)].map((m) => m[1]);
  assert.ok(animated.length >= 6);
  const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const sel of ['.pt-reveal', '.pt-wash', '.pt-ink-line rect', '.pt-splash', '.pt-drift', '.pt-swell']) assert.ok(still.includes(sel), sel);
});

test('Paint UI: nothing is fetched from the network', () => {
  for (const f of ['paint.css', 'paint.js', 'gallery.html', 'gallery.css', 'gallery.js']) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(text), `${f} refers to the network`);
  }
});
