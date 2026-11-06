'use strict';
/* Astrum: a Dynamic Island at the top of your desktop, for Spotify, YouTube and Discord.
   - the island: a small pill (what plays, or Discord) that opens into tabs, then the full player, then the whole screen
   - set-up happens in your browser: guide pages served by this app connect each service and hand the result over
   - Discord: Rich Presence follows what plays, a bot of yours brings in the latest messages, Share posts a song */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen, dialog, safeStorage, globalShortcut } = require('electron');
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
/* Where the island sits: an anchor, the closed pill's centre on one screen (kept as a share of that screen's work area,
   so it survives a change of resolution, and saved for next time). It stays on that screen until you drag it to
   another. Opening grows away from the nearer edge: downwards in the top half of the screen, upwards in the bottom half,
   and near a side it opens towards the middle, so it is always whole on the screen. */
const place = require('./lib/placement');
let islandSize = { width: 300, height: place.PILL + place.TOP + place.BOTTOM }, anchor = null, growUp = null;
function anchorDisplay() { return place.anchorDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay(), anchor); }
function islandBounds() { return place.islandBounds(screen.getAllDisplays(), screen.getPrimaryDisplay(), anchor, islandSize); }
/* Windows and macOS: the overlay. The window keeps one size and the island opens and closes inside it with CSS alone;
   its empty parts let clicks through (the page says when the mouse is over the island). Smooth, where resizing a
   transparent window on every step flickers. Linux cannot pass clicks through and still see the mouse, so there the
   window follows the island's size (ASTRUM_OVERLAY=1 tries the overlay anyway). */
const OVERLAY = process.platform !== 'linux' || process.env.ASTRUM_OVERLAY === '1';
const CLICK_THROUGH = OVERLAY && process.platform !== 'linux';
const OVERLAY_SIZE = { width: 940, height: 900 };
let lastPlace = '';
function windowBounds() {
  return OVERLAY ? place.overlayBounds(screen.getAllDisplays(), screen.getPrimaryDisplay(), anchor, OVERLAY_SIZE.width, OVERLAY_SIZE.height) : islandBounds();
}
function placeIsland() {
  if (!island || full || drag) return;
  const b = windowBounds();
  // which way the island page grows, and (overlay) where in the window the pill sits
  const info = OVERLAY ? { overlay: true, ...b.place } : { up: b.up };
  const key = JSON.stringify(info);
  if (key !== lastPlace) { lastPlace = key; growUp = b.up; island.webContents.send('island-place', info); }
  const cur = island.getBounds();
  if (cur.x !== b.x || cur.y !== b.y || cur.width !== b.width || cur.height !== b.height) island.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
}
function setClickThrough(on) { if (island && CLICK_THROUGH) island.setIgnoreMouseEvents(!!on, { forward: true }); }
// a drop: the anchor moves by as much as the window was dragged (snapped to an edge or the middle, lib/placement.js), kept for next time
function setAnchorFromDrag(start) {
  const b = island.getBounds(), from = place.anchorAt(screen.getAllDisplays(), screen.getPrimaryDisplay(), anchor);
  anchor = place.anchorFromPoint(screen.getAllDisplays(), { x: from.x + b.x - start.x, y: from.y + b.y - start.y }, store.settings().placement);
  store.setSettings({ bounds: anchor });
}

// Position › Follow the mouse: the closed pill goes to the screen the mouse is on, at the same spot on it
let islandLevel = 0;
setInterval(() => {
  if (!island || full || drag || islandLevel > 0 || !island.isVisible() || store.settings().placement !== 'roam') return;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (d.id === anchorDisplay().id) return;
  anchor = place.followTo(d, anchor);
  placeIsland();
}, 350);
// Position › This screen: straight to the top middle of the screen it is on
function pinToScreen() {
  anchor = place.topMiddle(anchorDisplay());
  store.setSettings({ bounds: anchor }); placeIsland();
}
// Stay on top of other apps (or be an ordinary window that apps can cover)
function applyOnTop() { if (island) island.setAlwaysOnTop(!!store.settings().alwaysOnTop, 'screen-saver'); }

/* ---------- the shortcut: calls the island from anywhere (Ctrl+Shift+Space, or ⌘⇧Space on a Mac, by default) ---------- */
const SHORTCUTS = new Set(['CommandOrControl+Shift+Space', 'Alt+Space', 'CommandOrControl+Shift+M', '']);
let shortcutOk = true;
function summon() {
  if (!island) { createIsland(); return; }
  if (!island.isVisible()) island.showInactive();
  island.moveTop();
  island.webContents.send('island-summon');   // closed: it opens (and takes the keyboard); open: it closes to the pill
}
function registerShortcut() {
  globalShortcut.unregisterAll(); shortcutOk = true;
  const acc = store.settings().shortcut; if (!acc) return;
  try { shortcutOk = globalShortcut.register(acc, summon); } catch { shortcutOk = false; }   // false: another app has it
}

/* ---------- moving the island: dragged by its grip ---------- */
let drag = null;
function stopDrag() { if (drag) { clearInterval(drag.timer); drag = null; } }
function dragIsland(phase) {
  if (phase === 'start' && !full && !drag) {
    const c = screen.getCursorScreenPoint(), b = island.getBounds();
    // the window follows the mouse, keeping its size: moved between screens of different scaling, Windows would
    // otherwise resize it on the way (and the island would jump away from the mouse)
    setClickThrough(false);
    drag = { start: { x: b.x, y: b.y }, dx: c.x - b.x, dy: c.y - b.y, w: b.width, h: b.height, timer: setInterval(() => {
      if (!island) return; const p = screen.getCursorScreenPoint();
      island.setBounds({ x: p.x - drag.dx, y: p.y - drag.dy, width: drag.w, height: drag.h });
    }, 16) };
  } else if (phase === 'end' && drag) {   // let go: it stays there, on that screen
    const start = drag.start;
    stopDrag();
    setAnchorFromDrag(start);
    placeIsland();
  }
}
function createIsland() {
  islandSize = { width: 300, height: place.PILL + place.TOP + place.BOTTOM }; growUp = null;
  const saved = store.settings().bounds;
  anchor = saved && Number.isFinite(saved.fx) && Number.isFinite(saved.fy) ? saved : null;
  const first = windowBounds(); lastPlace = '';
  island = new BrowserWindow({
    x: first.x, y: first.y, width: first.width, height: first.height,
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    hasShadow: false, skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Astrum', backgroundColor: '#00000000',
    icon: nativeImage.createFromDataURL(ICON),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  applyOnTop();
  if (process.platform === 'darwin') island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  island.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  island.webContents.on('will-navigate', (e, url) => {   // the island never leaves; set-up pages open in your browser
    e.preventDefault();
    let u; try { u = new URL(url); } catch { return; }
    if (u.origin === ORIGIN || u.origin === GOOGLE) openGuide(url); else shell.openExternal(url);
  });
  island.loadURL(ORIGIN + '/island.html');
  island.webContents.on('did-finish-load', () => { growUp = null; lastPlace = ''; placeIsland(); setClickThrough(true); });   // tells the page which way it grows
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
  if ('alwaysOnTop' in patch) applyOnTop();
  if ('shortcut' in patch) registerShortcut();
  if (patch.placement === 'screen' && before.placement !== 'screen') pinToScreen();
  sendAll('settings', publicSettings());
  return now;
}
function publicSettings() { const s = store.settings(); return { alwaysOnTop: s.alwaysOnTop, placement: s.placement, shortcut: s.shortcut, shortcutOk, mac: process.platform === 'darwin', openAtLogin: s.openAtLogin, discordId: !!s.discordId, presence: s.presence, webhook: !!s.webhook, bot: !!s.botToken, channels: s.channels }; }
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
  ipcMain.handle('settings-set', (e, patch) => {   // the island's own settings: where it stays, on top or not, the shortcut, starting with the computer
    if (!fromApp(e) || !patch || typeof patch !== 'object') return null;
    const clean = {};
    if (['spot', 'screen', 'roam'].includes(patch.placement)) clean.placement = patch.placement;
    if ('alwaysOnTop' in patch) clean.alwaysOnTop = !!patch.alwaysOnTop;
    if (typeof patch.shortcut === 'string' && SHORTCUTS.has(patch.shortcut)) clean.shortcut = patch.shortcut;
    if ('openAtLogin' in patch) clean.openAtLogin = !!patch.openAtLogin;
    applySettings(clean);
    return publicSettings();
  });
  ipcMain.on('island', (e, what, a, b) => {
    if (!fromApp(e) || !island || BrowserWindow.fromWebContents(e.sender) !== island) return;
    if (what === 'ignore') { if (!drag && !full) setClickThrough(!!a); return; }
    if (what === 'size' && OVERLAY) return;   // the overlay keeps its size
    if (what === 'size' && Number.isFinite(a) && Number.isFinite(b)) {
      islandSize = { width: Math.max(120, Math.round(a)), height: Math.max(40, Math.round(b)) };
      placeIsland();
    }
    else if (what === 'drag') dragIsland(a);
    else if (what === 'state') islandLevel = Number(a) || 0;
    else if (what === 'focus') island.focus();
    else if (what === 'blur') island.blur();
  });
  ipcMain.handle('island-full', (e, on) => {
    if (!fromApp(e) || !island || BrowserWindow.fromWebContents(e.sender) !== island) return false;
    if (on) {
      if (!full) full = island.getBounds();
      stopDrag(); setClickThrough(false);
      const bounds = screen.getDisplayMatching(full).bounds;
      island.setBounds(bounds);
      island.focus();
      return { width: bounds.width, height: bounds.height };
    } else if (full) {
      full = null; placeIsland();
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
  screen.on('display-removed', () => placeIsland());   // its screen is gone: the main screen, until it comes back
  createIsland();
  buildTray();
  registerShortcut();
  const s = store.settings();
  presence.setEnabled(s.presence);
  presence.connect(s.discordId);
  if (s.botToken) bot.start();
  // first run: nothing set up yet, so the set-up guide opens in your browser
  if (!store.get('np-client') && !store.get('yt-client') && !s.discordId && !s.botToken) setTimeout(() => openGuide('index'), 1500);
});
app.on('second-instance', () => { if (island) { island.showInactive(); island.webContents.send('island-poke'); } });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { quitting = true; if (store) store.flush(); if (presence) presence.stop(); if (bot) bot.stop(); });
app.on('window-all-closed', () => { /* stays in the tray */ });
