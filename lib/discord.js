'use strict';
/* Discord: Rich Presence ("Listening to …" on your profile, through the Discord app on this computer) and sharing the
   song to a channel through a webhook. Rich Presence needs a Discord application of your own (its Application ID);
   its name is what Discord shows as "Listening to <name>". */

const LABEL = { spotify: 'Spotify', youtube: 'YouTube Music' };

// Discord wants 2 to 128 characters in these fields
function clip(text, max = 128) {
  let t = String(text || '').trim();
  if (t.length > max) t = t.slice(0, max - 1) + '…';
  if (t.length === 1) t += ' ';
  return t;
}
const https = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u);

// a playing song -> a Rich Presence activity; nothing playing -> null (clears it)
function activityFor(t) {
  if (!t || !t.playing || !t.title) return null;
  const from = LABEL[t.source] || 'Music';
  const a = { type: 2, details: clip(t.title), state: clip(t.artist ? 'by ' + t.artist : from), statusDisplayType: 2, instance: false };
  if (https(t.art)) { a.largeImageKey = t.art; a.largeImageText = clip(t.album || from); }
  if (t.start > 0 && t.duration > 0) { a.startTimestamp = Math.round(t.start); a.endTimestamp = Math.round(t.start + t.duration); }
  if (https(t.url)) a.buttons = [{ label: 'Open in ' + from, url: t.url }];
  return a;
}

// only Discord's own webhook addresses
function validWebhook(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /^(?:canary\.|ptb\.)?discord(?:app)?\.com$/.test(x.hostname) && /^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(x.pathname);
  } catch { return false; }
}
function shareMessage(t) {
  const from = LABEL[t.source] || 'Music';
  const embed = { title: clip(t.title, 256), description: clip(t.artist ? 'by ' + t.artist : from, 2048), color: t.source === 'youtube' ? 0xff4e45 : 0x1ed760, footer: { text: 'Shared from ' + from } };
  if (https(t.url)) embed.url = t.url;
  if (https(t.art)) embed.thumbnail = { url: t.art };
  return { username: 'integrationApp', embeds: [embed], allowed_mentions: { parse: [] } };
}

/* the connection to the Discord app: reconnects on its own (Discord may start after this app), and keeps only the
   latest song, so a burst of changes becomes one update */
function createPresence({ Client, onStatus = () => {} } = {}) {
  let client = null, id = '', ready = false, want = null, retry = null, enabled = true, sent = '';
  function status(text, ok) { onStatus({ text, ok: !!ok }); }
  function schedule(ms) { clearTimeout(retry); retry = setTimeout(() => connect(id), ms); }
  async function connect(clientId) {
    clearTimeout(retry);
    if (client && clientId === id && ready) return;
    await stop();
    id = clientId || '';
    if (!id || !enabled) { status(id ? 'Rich Presence is off' : 'Add your Discord Application ID to show what you play', false); return; }
    if (!/^\d{15,22}$/.test(id)) { status('That Application ID does not look right (it is a long number)', false); return; }
    try {
      const Make = Client || require('@xhayper/discord-rpc').Client;
      client = new Make({ clientId: id });
      client.on('ready', () => { ready = true; sent = ''; status('Connected to Discord', true); push(); });
      client.on('disconnected', () => { ready = false; status('Discord closed: trying again', false); schedule(15000); });
      status('Connecting to Discord…', false);
      await client.login();
    } catch (e) {
      ready = false; client = null;
      status('Discord is not running (or not reachable): trying again in 30 s', false); schedule(30000);
    }
  }
  async function push() {
    if (!ready || !client || !client.user) return;
    const a = enabled ? activityFor(want) : null, key = JSON.stringify(a);
    if (key === sent) return;
    sent = key;
    try { if (a) await client.user.setActivity(a); else await client.user.clearActivity(); }
    catch (e) { sent = ''; status('Discord: ' + e.message, false); }
  }
  let t = null;
  function update(track) { want = track; clearTimeout(t); t = setTimeout(push, 800); }
  async function stop() {
    clearTimeout(retry); ready = false;
    if (client) { const c = client; client = null; try { await c.user?.clearActivity(); } catch { /* gone */ } try { await c.destroy(); } catch { /* gone */ } }
  }
  function setEnabled(on) { enabled = !!on; if (!enabled) { push(); stop().then(() => status('Rich Presence is off', false)); } else connect(id); }
  return { connect, update, stop, setEnabled, activityFor };
}

async function share(webhook, track, fetchImpl = fetch) {
  if (!webhook) return { ok: false, error: 'add a channel webhook in Settings first' };
  if (!validWebhook(webhook)) return { ok: false, error: 'that is not a Discord webhook address' };
  if (!track || !track.title) return { ok: false, error: 'nothing playing' };
  try {
    const r = await fetchImpl(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shareMessage(track)), signal: AbortSignal.timeout(10000) });
    return r.ok ? { ok: true } : { ok: false, error: 'Discord said ' + r.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { activityFor, validWebhook, shareMessage, createPresence, share, clip };
