'use strict';
/* The app's small local API, for the set-up guide pages that open in your browser: they connect Spotify, YouTube Music
   and Discord and hand the results to the app. Only pages served by this app can change anything: a change must come
   from one of its own addresses (the browser's Origin), say so in a header other sites cannot send without asking, and
   be JSON. Nothing secret is ever sent back. */

const { validWebhook } = require('./discord');

const KV_FROM_BROWSER = new Set(['yt-library-v1', 'yt-client', 'yt-token']);

function createApi({ origins, store, spotifyAuth, bot, presence, applySettings, setKv, setBotToken, hasBotToken, presenceStatus }) {
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const redirect = (res, to) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };
  function trusted(req) {
    return origins.includes(String(req.headers.origin || '')) && req.headers['x-ia'] === '1' && /^application\/json\b/.test(String(req.headers['content-type'] || ''));
  }
  function body(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('not JSON')); } });
      req.on('error', reject);
    });
  }
  function status() {
    const s = store.settings(), lib = (() => { try { return JSON.parse(store.get('yt-library-v1') || 'null'); } catch { return null; } })();
    let tok = null; try { tok = JSON.parse(store.get('np-spotify-v1') || 'null'); } catch { tok = null; }
    return {
      spotify: { client: !!store.get('np-client'), connected: !!(tok && tok.refresh) },
      youtube: { client: !!store.get('yt-client'), library: lib ? { playlists: (lib.pls || []).length, liked: (lib.liked || []).length, t: lib.t } : null },
      discord: { appId: !!s.discordId, presence: !!s.presence, presenceStatus: presenceStatus(), webhook: !!s.webhook, bot: hasBotToken(), botName: (bot.feed() && bot.feed().bot) || '', channels: s.channels || [], feedError: (bot.feed() && bot.feed().error) || '' },
      app: { alwaysOnTop: !!s.alwaysOnTop, openAtLogin: !!s.openAtLogin, closeToTray: !!s.closeToTray }
    };
  }

  // returns true when it answered the request
  return async function handle(req, res, url) {
    const path = url.pathname, method = req.method;
    if (path === '/spotify/login' && method === 'GET') {
      const to = spotifyAuth.login();
      redirect(res, to || '/guide/spotify.html?error=' + encodeURIComponent('Add your Client ID first'));
      return true;
    }
    if (path === '/spotify/callback' && method === 'GET') {
      try { await spotifyAuth.callback(url.searchParams); redirect(res, '/guide/spotify.html?connected=1'); }
      catch (e) { redirect(res, '/guide/spotify.html?error=' + encodeURIComponent(e.message)); }
      return true;
    }
    if (!path.startsWith('/api/')) return false;
    if (method === 'GET' && path === '/api/status') { send(res, 200, status()); return true; }
    if (method === 'GET' && path === '/api/discord/channels') {
      if (req.headers['x-ia'] !== '1') { send(res, 403, { error: 'not allowed' }); return true; }
      try { send(res, 200, { guilds: await bot.listChannels() }); } catch (e) { send(res, 400, { error: e.message }); }
      return true;
    }
    if (method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    if (!trusted(req)) { send(res, 403, { error: 'only Astrum\'s own pages can do this' }); return true; }
    let b; try { b = await body(req); } catch (e) { send(res, 400, { error: e.message }); return true; }
    try {
      switch (path) {
        case '/api/spotify/client': {
          const id = String(b.clientId || '').trim();
          if (!/^[0-9a-f]{32}$/i.test(id)) { send(res, 400, { error: 'A Spotify Client ID is 32 letters and numbers' }); return true; }
          setKv('np-client', id); send(res, 200, { ok: true }); return true;
        }
        case '/api/spotify/signout': setKv('np-spotify-v1', null); send(res, 200, { ok: true }); return true;
        case '/api/kv': {
          const key = String(b.key || '');
          if (!KV_FROM_BROWSER.has(key)) { send(res, 400, { error: 'not a value this page may set' }); return true; }
          setKv(key, b.value == null ? null : String(b.value)); send(res, 200, { ok: true }); return true;
        }
        case '/api/discord': {
          const patch = {};
          if ('appId' in b) { const id = String(b.appId || '').trim(); if (id && !/^\d{15,22}$/.test(id)) { send(res, 400, { error: 'An Application ID is a long number' }); return true; } patch.discordId = id; }
          if ('presence' in b) patch.presence = !!b.presence;
          if ('webhook' in b) { const w = String(b.webhook || '').trim(); if (w && !validWebhook(w)) { send(res, 400, { error: 'That is not a Discord webhook address' }); return true; } patch.webhook = w; }
          applySettings(patch); send(res, 200, { ok: true, status: status().discord }); return true;
        }
        case '/api/discord/bot': {
          const token = String(b.token || '').trim();
          if (!token) { setBotToken(''); send(res, 200, { ok: true }); return true; }
          const r = await setBotToken(token);
          send(res, r.ok ? 200 : 400, r); return true;
        }
        case '/api/discord/channels': {
          const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x) => /^\d{15,22}$/.test(x)).slice(0, 8);
          applySettings({ channels: ids }); bot.refresh().catch(() => {}); send(res, 200, { ok: true, channels: ids }); return true;
        }
        case '/api/app': {
          const patch = {};
          ['alwaysOnTop', 'openAtLogin', 'closeToTray'].forEach((k) => { if (k in b) patch[k] = !!b[k]; });
          applySettings(patch); send(res, 200, { ok: true, status: status().app }); return true;
        }
        default: send(res, 404, { error: 'no such thing' }); return true;
      }
    } catch (e) { send(res, 500, { error: e.message }); return true; }
  };
}

module.exports = { createApi, KV_FROM_BROWSER };
