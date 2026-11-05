'use strict';
/* A small JSON file in the app's data folder: the app's settings, and the few values the widget and the sign-in
   windows share (the widget runs on 127.0.0.1, Google signs in on localhost, and each address has its own storage). */
const fs = require('node:fs');
const path = require('node:path');

const SHARED_KEYS = new Set(['yt-library-v1', 'yt-client', 'yt-token']);
const DEFAULTS = { alwaysOnTop: true, openAtLogin: false, closeToTray: true, discordId: '', presence: true, webhook: '', bounds: null };

function createStore(dir) {
  const file = path.join(dir, 'store.json');
  let data = { settings: { ...DEFAULTS }, kv: {} };
  try {
    const read = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { settings: { ...DEFAULTS, ...(read.settings || {}) }, kv: read.kv && typeof read.kv === 'object' ? read.kv : {} };
  } catch { /* first run, or an unreadable file: start fresh */ }
  let timer = null;
  function flush() {
    timer = null;
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }
    catch (e) { console.error('Could not save settings:', e.message); }
  }
  function later() { if (!timer) timer = setTimeout(flush, 300); }
  return {
    settings: () => ({ ...data.settings }),
    setSettings(patch) {
      for (const [k, v] of Object.entries(patch || {})) if (k in DEFAULTS) data.settings[k] = v;
      later(); return { ...data.settings };
    },
    get: (key) => (SHARED_KEYS.has(key) && key in data.kv ? data.kv[key] : null),
    set(key, value) {
      if (!SHARED_KEYS.has(key)) return false;
      if (value === null || value === undefined) delete data.kv[key]; else data.kv[key] = String(value);
      later(); return true;
    },
    flush
  };
}

module.exports = { createStore, SHARED_KEYS, DEFAULTS };
