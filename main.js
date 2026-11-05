'use strict';
/* Astrum: a Dynamic Island at the top of your desktop, for Spotify, YouTube and Discord.
   - the island: a small pill (what plays, or Discord) that opens into tabs, then the full player, then the whole screen
   - set-up happens in your browser: guide pages served by this app connect each service and hand the result over
   - Discord: Rich Presence follows what plays, a bot of yours brings in the latest messages, Share posts a song */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen, dialog, safeStorage } = require('electron');
const path = require('node:path');
const server = require('./lib/server');
const { createStore } = require('./lib/store');
const discord = require('./lib/discord');
const { createBot } = require('./lib/discordbot');
const { createSpotifyAuth } = require('./lib/spotify-auth');
const { createApi } = require('./lib/api');
const ICON = require('./lib/icon');

const ORIGIN = `http://127.0.0.1:${server.PORT}`;     // the island, the guides, Spotify's return address
const GOOGLE = `http://localhost:${server.PORT}`;     // the YouTube guide (Google signs in here)
const GUIDES = { index: ORIGIN + '/guide/', spotify: ORIGIN + '/guide/spotify.html', youtube: GOOGLE + '/guide/youtube.html', discord: ORIGIN + '/guide/discord.html' };

// The app was called integrationApp: keep its data folder (sign-ins, settings, the island's storage) under the new name
app.setPath('userData', path.join(app.getPath('appData'), 'integrationApp'));
// Google refuses sign-in inside apps that say they are Electron: present as the Chrome it is built on
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/\S+/, '').replace(/\s?(integrationApp|Astrum)\/\S+/i, '');
if (!app.requestSingleInstanceLock()) app.quit();

let island = null, tray = null, store = null, presence = null, bot = null, quitting = false, full = null, lastStatus = { text: 'Starting…', ok: false };

function sendAll(channel, payload) { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload); }

/* ---------- the guide pages open in your browser ---------- */
function openGuide(what) {
  let url = GUIDES[what] || GUIDES.index;
  if (typeof what === 'string' && /^https?:\/\//.test(what)) {   // a page of this app (e.g. from the player's Sign in): its guide
    try {
      const u = new URL(what);
      if (/youtube/.test(u.pathname)) url = GUIDES.youtube;
      else if (/spotify/.test(u.pathname)) url = GUIDES.spotify + (u.searchParams.get('signin') === '1' ? '?signin=1' : '');
      else if (/discord/.test(u.pathname)) url = GUIDES.discord;
    } catch { /* the hub */ }
  }
  shell.openExternal(url);
}

/* ---------- the bot token: encrypted with the system keychain where there is one ---------- */
function getBotToken() {
  const v = store.settings().botToken; if (!v) return '';
  try { return v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : v.replace(/^raw:/, ''); } catch { return ''; }
}
async function setBotToken(token) {
  if (!token) { store.setSettings({ botToken: '' }); bot.refresh().catch(() => {}); return { ok: true }; }
  const before = store.settings().botToken;
  store.setSettings({ botToken: safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(token).toString('base64') : 'raw:' + token });
  try { const me = await bot.whoami(); bot.start(); return { ok: true, name: me.username }; }
  catch (e) { store.setSettings({ botToken: before }); return { ok: false, error: e.status === 401 ? 'Discord did not accept that token' : e.message }; }
}

/* ---------- the island window ---------- */
let islandSize = { width: 300, height: 64 };
function workArea() { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea; }
function islandBounds(d) {
  const width = Math.min(d.width, islandSize.width), height = Math.min(d.height, islandSize.height);
  return { x: Math.round(d.x + (d.width - width) / 2), y: d.y, width, height };
}
function islandDisplay() { return screen.getDisplayMatching(island.getBounds()); }
function placeIsland(display) {   // at the top middle of a screen (its own, unless another is given)
  if (!island || full || drag) return;
  island.setBounds(islandBounds((display || islandDisplay()).workArea));
}

/* ---------- moving the island: dragged by its handle, or following the mouse to another screen ---------- */
// roam: the island goes to whichever screen the mouse is on (only while it is a closed pill); the island page says
// whether that is wanted (a setting) and how open it is
let roam = false, islandLevel = 0, drag = null;
function stopDrag() { if (drag) { clearInterval(drag.timer); drag = null; } }
function dragIsland(phase) {
  if (phase === 'start' && !full && !drag) {
    const c = screen.getCursorScreenPoint(), b = island.getBounds();
    // the window follows the mouse, keeping its size: moved between screens of different scaling, Windows would
    // otherwise resize it on the way (and the island would jump away from the mouse)
    drag = { dx: c.x - b.x, dy: c.y - b.y, w: b.width, h: b.height, timer: setInterval(() => {
      if (!island) return; const p = screen.getCursorScreenPoint();
      island.setBounds({ x: p.x - drag.dx, y: p.y - drag.dy, width: drag.w, height: drag.h });
    }, 16) };
  } else if (phase === 'end' && drag) {   // let go: to the top middle of the screen it was dropped on
    stopDrag();
    placeIsland(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
  }
}
setInterval(() => {
  if (!island || full || drag || !roam || islandLevel > 0 || !island.isVisible()) return;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (d.id !== islandDisplay().id) placeIsland(d);
}, 350);
function createIsland() {
  islandSize = { width: 300, height: 64 };
  island = new BrowserWindow({
    ...islandBounds(workArea()),
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    hasShadow: false, skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Astrum', backgroundColor: '#00000000',
    icon: nativeImage.createFromDataURL(ICON),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  island.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  island.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  island.webContents.on('will-navigate', (e, url) => {   // the island never leaves; set-up pages open in your browser
    e.preventDefault();
    let u; try { u = new URL(url); } catch { return; }
    if (u.origin === ORIGIN || u.origin === GOOGLE) openGuide(url); else shell.openExternal(url);
  });
  island.loadURL(ORIGIN + '/island.html');
  island.once('ready-to-show', () => island.showInactive());
  island.on('closed', () => { stopDrag(); island = null; full = null; });
}

function buildTray() {
  tray = new Tray(nativeImage.createFromDataURL(ICON));
  tray.setToolTip('Astrum');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Show the island', click: () => { if (!island) createIsland(); else island.showInactive(); } },
    { label: 'Hide the island', click: () => island && island.hide() },
    { type: 'separator' },
    { label: 'Set up (opens in your browser)…', click: () => openGuide('index') },
    { label: 'Spotify…', click: () => openGuide('spotify') },
    { label: 'YouTube…', click: () => openGuide('youtube') },
    { label: 'Discord…', click: () => openGuide('discord') },
    { type: 'separator' },
    { label: 'Start with this computer', type: 'checkbox', checked: store.settings().openAtLogin, click: (m) => applySettings({ openAtLogin: m.checked }) },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => { if (!island) createIsland(); else if (island.isVisible()) island.webContents.send('island-poke'); else island.showInactive(); });
  tray.refresh = () => tray.setContextMenu(menu());
}

function applySettings(patch) {
  const before = store.settings(), now = store.setSettings(patch);
  if ('openAtLogin' in patch) { try { app.setLoginItemSettings({ openAtLogin: !!now.openAtLogin }); } catch { /* not here */ } if (tray) tray.refresh(); }
  if (now.discordId !== before.discordId) presence.connect(now.discordId);
  if (now.presence !== before.presence) presence.setEnabled(now.presence);
  if ('channels' in patch) bot.refresh().catch(() => {});
  sendAll('settings', publicSettings());
  return now;
}
function publicSettings() { const s = store.settings(); return { alwaysOnTop: s.alwaysOnTop, openAtLogin: s.openAtLogin, discordId: !!s.discordId, presence: s.presence, webhook: !!s.webhook, bot: !!s.botToken, channels: s.channels }; }
function setKv(key, value) { if (store.set(key, value)) sendAll('kv-changed', { key, value: value == null ? null : String(value) }); }

/* ---------- what the island may ask ---------- */
function fromApp(e) { try { const o = new URL(e.senderFrame.url).origin; return o === ORIGIN || o === GOOGLE; } catch { return false; } }
function wire() {
  ipcMain.on('kv-get', (e, key) => { e.returnValue = fromApp(e) ? store.get(String(key)) : null; });
  ipcMain.on('kv-set', (e, key, value) => {
    if (!fromApp(e) || !store.set(String(key), value)) return;
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== e.sender) w.webContents.send('kv-changed', { key: String(key), value: value == null ? null : String(value) });
  });
  ipcMain.handle('settings-get', (e) => (fromApp(e) ? publicSettings() : null));
  ipcMain.on('island', (e, what, a, b) => {
    if (!fromApp(e) || !island || BrowserWindow.fromWebContents(e.sender) !== island) return;
    if (what === 'size' && Number.isFinite(a) && Number.isFinite(b)) {
      islandSize = { width: Math.max(120, Math.round(a)), height: Math.max(40, Math.round(b)) };
      placeIsland();
    }
    else if (what === 'drag') dragIsland(a);
    else if (what === 'state') { roam = !!a; islandLevel = Number(b) || 0; }
    else if (what === 'focus') island.focus();
    else if (what === 'blur') island.blur();
  });
  ipcMain.handle('island-full', (e, on) => {
    if (!fromApp(e) || !island || BrowserWindow.fromWebContents(e.sender) !== island) return false;
    if (on) {
      if (!full) full = island.getBounds();
      stopDrag();
      const bounds = screen.getDisplayMatching(full).bounds;
      island.setBounds(bounds);
      island.focus();
      return { width: bounds.width, height: bounds.height };
    } else if (full) {
      const previousDisplay = screen.getDisplayMatching(full);
      full = null; placeIsland(previousDisplay);
    }
    return true;
  });
  ipcMain.on('open-guide', (e, what) => { if (fromApp(e)) openGuide(String(what || 'index')); });
  ipcMain.on('discord-update', (e, track) => { if (fromApp(e)) presence.update(track && typeof track === 'object' ? track : null); });
  ipcMain.handle('discord-share', (e, track) => (fromApp(e) ? discord.share(store.settings().webhook, track) : { ok: false, error: 'not allowed' }));
  ipcMain.handle('discord-status', () => lastStatus);
  ipcMain.handle('discord-feed', () => bot.feed());
  ipcMain.handle('discord-refresh', (e) => (fromApp(e) ? bot.refresh().catch((er) => ({ configured: true, messages: [], channels: [], error: er.message })) : null));
}

app.whenReady().then(async () => {
  store = createStore(app.getPath('userData'));
  presence = discord.createPresence({ onStatus: (st) => { lastStatus = st; sendAll('discord-status', st); } });
  bot = createBot({ getToken: getBotToken, getChannels: () => store.settings().channels, onFeed: (f) => sendAll('discord-feed', f) });
  const spotifyAuth = createSpotifyAuth({
    getClientId: () => store.get('np-client'), redirectUri: ORIGIN + '/spotify/callback',
    saveToken: (t) => setKv('np-spotify-v1', JSON.stringify(t))
  });
  const api = createApi({
    origins: [ORIGIN, GOOGLE], store, spotifyAuth, bot, presence, applySettings, setKv, setBotToken,
    hasBotToken: () => !!store.settings().botToken, presenceStatus: () => lastStatus
  });
  const installer = process.platform === 'win32' && !app.isPackaged
    ? path.join(__dirname, 'dist', `Astrum Setup ${app.getVersion()}.exe`) : null;
  try { await server.start(path.join(__dirname, 'app'), server.PORT, api, installer); }
  catch (e) {
    dialog.showErrorBox('Astrum', `Port ${server.PORT} on this computer is in use (${e.code || e.message}). Is Astrum already open? Close the other copy and try again.`);
    app.quit(); return;
  }
  wire();
  screen.on('display-metrics-changed', () => { placeIsland(); if (island) island.webContents.send('island-reflow'); });
  createIsland();
  buildTray();
  const s = store.settings();
  presence.setEnabled(s.presence);
  presence.connect(s.discordId);
  if (s.botToken) bot.start();
  // first run: nothing set up yet, so the set-up guide opens in your browser
  if (!store.get('np-client') && !store.get('yt-client') && !s.discordId && !s.botToken) setTimeout(() => openGuide('index'), 1500);
});
app.on('second-instance', () => { if (island) { island.showInactive(); island.webContents.send('island-poke'); } });
app.on('before-quit', () => { quitting = true; if (store) store.flush(); if (presence) presence.stop(); if (bot) bot.stop(); });
app.on('window-all-closed', () => { /* stays in the tray */ });
