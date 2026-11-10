'use strict';
/* YouTube in your browser, as a remote: Astrum's browser extension reports what the YouTube tab plays (the video, where
   it is, the queue and "Up next") and collects the commands waiting for it, in one request about once a second.
   Only the extension can do this: it must send the pairing code (made here, copied to the clipboard by main.js, never
   shown to a page) and come from an extension's own address. Everything it sends is cut to a fixed shape before it
   reaches the island, and the commands are a fixed list. */
const crypto = require('node:crypto');

// The extension reports about once a second while a YouTube tab is open, says at once when the last one closes, and
// beats every 30 s besides (Chrome slows a hidden, paused tab's timers to about once a minute)
const STALE = 45000;         // no report for this long: the browser is gone
const COMMAND_TTL = 10000;   // a command the extension has not collected by then is dropped
const MAX_ITEMS = 25, MAX_PENDING = 20, MAX_TIME = 10 * 24 * 3600;
const VIDEO = /^[\w-]{11}$/, LIST = /^[\w-]{2,64}$/;
const EXTENSION = /^(chrome|moz)-extension:\/\/[\w-]{1,64}$/;

/* ---------- the shape of what comes in ---------- */
function text(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function num(v, lo, hi) { return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; }
function video(v) { return typeof v === 'string' && VIDEO.test(v) ? v : ''; }
function list(v) { return typeof v === 'string' && LIST.test(v) ? v : ''; }
function item(x) {
  if (!x || typeof x !== 'object' || !video(x.v)) return null;
  return { v: x.v, t: text(x.t, 200) || 'YouTube video', c: text(x.c, 100) };
}
function items(a) { return Array.isArray(a) ? a.slice(0, MAX_ITEMS * 2).map(item).filter(Boolean).slice(0, MAX_ITEMS) : []; }
function clean(s) {
  if (!s || typeof s !== 'object') return null;
  const index = Number.isInteger(s.index) && s.index >= 0 && s.index < 5000 ? s.index : -1;
  return {
    video: video(s.video), title: text(s.title, 200), channel: text(s.channel, 100), playing: s.playing === true,
    position: num(s.position, 0, MAX_TIME) || 0, duration: num(s.duration, 0, MAX_TIME) || 0, volume: num(s.volume, 0, 100),
    list: list(s.list), index, queue: items(s.queue), upNext: items(s.upNext)
  };
}
// a command as the extension will get it, or null when it is not one of the fixed list
function command(name, arg) {
  switch (name) {
    case 'play': case 'pause': case 'toggle': case 'next': case 'prev': return { name };
    case 'seek': { const n = num(arg, 0, MAX_TIME); return n == null ? null : { name, arg: n }; }
    case 'volume': { const n = num(arg, 0, 100); return n == null ? null : { name, arg: Math.round(n) }; }
    case 'open': {
      if (!arg || typeof arg !== 'object') return null;
      const v = video(arg.v), l = list(arg.list);
      if (!v && !l) return null;
      const out = { v, list: l };
      if (l && Number.isInteger(arg.index) && arg.index >= 0 && arg.index < 5000) out.index = arg.index;
      return { name, arg: out };
    }
    default: return null;
  }
}

// the address that plays an `open` command's video or playlist on youtube.com (an already-checked argument)
function watchUrl(arg) {
  const u = new URL(arg.v ? 'https://www.youtube.com/watch' : 'https://www.youtube.com/playlist');
  if (arg.v) u.searchParams.set('v', arg.v);
  if (arg.list) u.searchParams.set('list', arg.list);
  if (arg.v && arg.list && Number.isInteger(arg.index)) u.searchParams.set('index', String(arg.index + 1));
  return u.href;
}

function blank() { return { video: '', title: '', channel: '', playing: false, position: 0, duration: 0, volume: null, list: '', index: -1, queue: [], upNext: [] }; }

function createYtBridge({ getCode, setCode, onState = () => {}, now = Date.now, interval = 2000 }) {
  let last = blank(), at = 0, pending = [], wasConnected = false, timer = null;

  function code() { let c = getCode(); if (!c) { c = crypto.randomBytes(18).toString('base64url'); setCode(c); } return c; }
  function newCode() { const c = crypto.randomBytes(18).toString('base64url'); setCode(c); pending = []; at = 0; publish(); return c; }
  function connected() { return at > 0 && now() - at < STALE; }
  // what the island sees: the numbers and titles, and whether a tab is connected (never the code)
  function state() { const on = connected(); return { connected: on, at, ...(on ? last : blank()) }; }
  function publish() { wasConnected = connected(); onState(state()); }

  return {
    code, newCode, state,
    // is this request the paired extension? (the Origin header, and "Authorization: Bearer <code>")
    authorize(headers) {
      const origin = String((headers && headers.origin) || '');
      if (!EXTENSION.test(origin)) return 'origin';
      const m = /^Bearer (\S{1,200})$/.exec(String((headers && headers.authorization) || ''));
      const want = Buffer.from(code()), got = Buffer.from(m ? m[1] : '');
      return got.length === want.length && crypto.timingSafeEqual(got, want) ? 'ok' : 'code';
    },
    // the extension's report; it gets back the commands waiting for it
    report(body) {
      const t = now();
      if (body && body.closed === true) {   // the last YouTube tab closed
        const was = connected(); at = 0; last = blank(); pending = [];
        if (was) publish();
        return { commands: [] };
      }
      const s = clean(body && body.state);
      if (s) {
        const changed = JSON.stringify(s) !== JSON.stringify(last) || !connected();
        last = s; at = t;
        if (changed) publish();
      } else at = t;   // a tab with nothing on it yet: still connected
      const out = pending.filter((c) => t - c.t <= COMMAND_TTL).map((c) => c.cmd);
      pending = [];
      return { commands: out };
    },
    // from the island: queued for the extension, when one is connected
    send(name, arg) {
      const c = command(name, arg);
      if (!c || !connected()) return false;
      pending.push({ cmd: c, t: now() });
      if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
      return true;
    },
    // the tab going away shows within a couple of seconds
    start() { if (!timer) { timer = setInterval(() => { if (wasConnected && !connected()) publish(); }, interval); if (timer.unref) timer.unref(); } },
    stop() { clearInterval(timer); timer = null; }
  };
}

module.exports = { createYtBridge, command, clean, watchUrl, STALE, COMMAND_TTL };
