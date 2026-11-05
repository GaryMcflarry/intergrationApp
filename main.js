'use strict';
/* integrationApp: the Worlds music player (Spotify and YouTube Music) as a desktop widget, with Discord.
   - a small frameless window that fits the player (and goes full screen for the full view / DJ mode)
   - a tray icon: show / hide, always on top, settings, quit
   - Spotify and YouTube sign-in pages open in their own windows
   - Discord Rich Presence follows what plays; the Share button posts the song to a channel webhook */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen, dialog } = require('electron');
const path = require('node:path');
const server = require('./lib/server');
const { createStore } = require('./lib/store');
const discord = require('./lib/discord');
const ICON = require('./lib/icon');

const ORIGIN = `http://127.0.0.1:${server.PORT}`;     // the widget (Spotify returns here after signing in)
const GOOGLE = `http://localhost:${server.PORT}`;     // the YouTube page (Google signs in here)
const SETUP_PAGES = new Set(['/spotify.html', '/youtube.html', '/settings.html']);

// Google refuses to sign in inside apps that say they are Electron: present as the Chrome it is built on
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/\S+/, '').replace(/\s?integrationApp\/\S+/i, '');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, tray = null, store = null, presence = null, quitting = false, fullBounds = null;
const setupWins = new Map();

function sendAll(channel, payload) { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload); }

function webPrefs() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false };
}

// links to elsewhere open in your browser; Google's sign-in popup stays in the app (it reports back to the page)
function guard(w, { allowGoogle = false } = {}) {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (allowGoogle && /^https:\/\/accounts\.google\.com\//.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 500, height: 680, autoHideMenuBar: true } };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createWidget() {
  const s = store.settings(), b = s.bounds;
  win = new BrowserWindow({
    width: 396, height: 180, x: b && b.x, y: b && b.y, minWidth: 300, minHeight: 120,
    frame: false, transparent: true, resizable: false, hasShadow: false, show: false,
    alwaysOnTop: s.alwaysOnTop, skipTaskbar: false, title: 'integrationApp', icon: nativeImage.createFromDataURL(ICON),
    backgroundColor: '#00000000', webPreferences: webPrefs()
  });
  guard(win);
  // the sign-in and settings pages open in their own windows; Spotify's sign-in itself may pass through this one
  win.webContents.on('will-navigate', (e, url) => {
    let u; try { u = new URL(url); } catch { return; }
    if ((u.origin === ORIGIN || u.origin === GOOGLE) && SETUP_PAGES.has(u.pathname)) { e.preventDefault(); openSetup(url); return; }
    if (u.origin !== ORIGIN) { e.preventDefault(); shell.openExternal(url); }
  });
  win.loadURL(ORIGIN + '/index.html');
  win.once('ready-to-show', () => win.show());
  win.on('moved', () => { if (!win.isFullScreen() && !fullBounds) { const { x, y } = win.getBounds(); store.setSettings({ bounds: { x, y } }); } });
  win.on('close', (e) => { if (!quitting && store.settings().closeToTray) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

function openSetup(url) {
  let u; try { u = new URL(url, ORIGIN); } catch { return; }
  if (!SETUP_PAGES.has(u.pathname)) return;
  if (u.pathname === '/youtube.html') u = new URL(GOOGLE + u.pathname + u.search);   // Google's sign-in wants localhost
  const key = u.pathname, open = setupWins.get(key);
  if (open && !open.isDestroyed()) { open.loadURL(u.href); open.show(); open.focus(); return; }
  const w = new BrowserWindow({ width: 760, height: 860, title: 'integrationApp', autoHideMenuBar: true, backgroundColor: '#07080d', icon: nativeImage.createFromDataURL(ICON), webPreferences: webPrefs() });
  guard(w, { allowGoogle: key === '/youtube.html' });
  w.webContents.on('will-navigate', (e, to) => {
    // these pages may go to Spotify's sign-in and back; anything else opens in your browser
    if (/^https:\/\/accounts\.spotify\.com\//.test(to) || to.startsWith(ORIGIN + '/') || to.startsWith(GOOGLE + '/')) return;
    e.preventDefault(); shell.openExternal(to);
  });
  w.loadURL(u.href);
  setupWins.set(key, w);
  w.on('closed', () => setupWins.delete(key));
}

function toggleWidget() { if (!win) return createWidget(); if (win.isVisible() && win.isFocused()) win.hide(); else { win.show(); win.focus(); } }

function buildTray() {
  tray = new Tray(nativeImage.createFromDataURL(ICON));
  tray.setToolTip('integrationApp');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Show / hide the player', click: toggleWidget },
    { label: 'Always on top', type: 'checkbox', checked: store.settings().alwaysOnTop, click: (m) => setOnTop(m.checked) },
    { label: 'Start with this computer', type: 'checkbox', checked: store.settings().openAtLogin, click: (m) => setLogin(m.checked) },
    { type: 'separator' },
    { label: 'Settings (Discord, app)…', click: () => openSetup(ORIGIN + '/settings.html') },
    { label: 'Spotify sign-in…', click: () => openSetup(ORIGIN + '/spotify.html') },
    { label: 'YouTube Music sign-in…', click: () => openSetup(ORIGIN + '/youtube.html') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('click', toggleWidget);
  tray.refresh = () => tray.setContextMenu(menu());
}

function setOnTop(on) { store.setSettings({ alwaysOnTop: !!on }); if (win) win.setAlwaysOnTop(!!on, 'floating'); sendAll('settings', store.settings()); if (tray) tray.refresh(); }
function setLogin(on) { store.setSettings({ openAtLogin: !!on }); try { app.setLoginItemSettings({ openAtLogin: !!on }); } catch { /* not on this system */ } sendAll('settings', store.settings()); if (tray) tray.refresh(); }

/* ---------- what the pages may ask ---------- */
function fromApp(e) { try { const o = new URL(e.senderFrame.url).origin; return o === ORIGIN || o === GOOGLE; } catch { return false; } }
function wire() {
  ipcMain.on('kv-get', (e, key) => { e.returnValue = fromApp(e) ? store.get(String(key)) : null; });
  ipcMain.on('kv-set', (e, key, value) => {
    if (!fromApp(e) || !store.set(String(key), value)) return;
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== e.sender) w.webContents.send('kv-changed', { key: String(key), value: value == null ? null : String(value) });
  });
  ipcMain.handle('settings-get', (e) => (fromApp(e) ? store.settings() : null));
  ipcMain.handle('settings-set', (e, patch) => {
    if (!fromApp(e) || !patch || typeof patch !== 'object') return null;
    const before = store.settings(), clean = {};
    if ('alwaysOnTop' in patch) setOnTop(patch.alwaysOnTop);
    if ('openAtLogin' in patch) setLogin(patch.openAtLogin);
    if ('closeToTray' in patch) clean.closeToTray = !!patch.closeToTray;
    if ('discordId' in patch) clean.discordId = String(patch.discordId || '').trim();
    if ('presence' in patch) clean.presence = !!patch.presence;
    if ('webhook' in patch) clean.webhook = String(patch.webhook || '').trim();
    const now = store.setSettings(clean);
    if (now.discordId !== before.discordId) presence.connect(now.discordId);
    if (now.presence !== before.presence) presence.setEnabled(now.presence);
    sendAll('settings', now);
    return now;
  });
  ipcMain.on('window', (e, what, a, b) => {
    const w = BrowserWindow.fromWebContents(e.sender); if (!w || !fromApp(e)) return;
    if (what === 'minimize') w.minimize();
    else if (what === 'close') w.close();
    else if (what === 'on-top') setOnTop(a);
    else if (what === 'fit' && w === win && !w.isFullScreen() && !fullBounds) {   // the window follows the player's size
      const width = Math.max(300, Math.min(1200, Math.round(a))), height = Math.max(120, Math.min(1400, Math.round(b)));
      const cur = w.getBounds(); if (cur.width === width && cur.height === height) return;
      const wa = screen.getDisplayMatching(cur).workArea;   // growing never pushes the widget off the screen
      const x = Math.max(wa.x, Math.min(cur.x, wa.x + wa.width - width)), y = Math.max(wa.y, Math.min(cur.y, wa.y + wa.height - height));
      w.setBounds({ x, y, width, height });
    } else if (what === 'full' && w === win) {   // the full view / DJ mode covers the screen
      if (a && !fullBounds) { fullBounds = w.getBounds(); const d = screen.getDisplayMatching(fullBounds).bounds; w.setResizable(true); w.setBounds(d); w.setAlwaysOnTop(true, 'screen-saver'); }
      else if (!a && fullBounds) { w.setBounds(fullBounds); fullBounds = null; w.setResizable(false); w.setAlwaysOnTop(store.settings().alwaysOnTop, 'floating'); }
    } else if (what === 'open-setup') openSetup(String(a || ''));
  });
  ipcMain.on('discord-update', (e, track) => { if (fromApp(e)) presence.update(track && typeof track === 'object' ? track : null); });
  ipcMain.handle('discord-share', (e, track) => (fromApp(e) ? discord.share(store.settings().webhook, track) : { ok: false, error: 'not allowed' }));
  ipcMain.handle('discord-status', () => lastStatus);
}
let lastStatus = { text: 'Starting…', ok: false };

app.whenReady().then(async () => {
  store = createStore(app.getPath('userData'));
  try { await server.start(path.join(__dirname, 'app')); }
  catch (e) {
    dialog.showErrorBox('integrationApp', `Port ${server.PORT} on this computer is in use (${e.code || e.message}). Is integrationApp already open? Close the other copy and try again.`);
    app.quit(); return;
  }
  presence = discord.createPresence({ onStatus: (st) => { lastStatus = st; sendAll('discord-status', st); } });
  wire();
  createWidget();
  buildTray();
  const s = store.settings();
  presence.setEnabled(s.presence);
  presence.connect(s.discordId);
});
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; if (store) store.flush(); if (presence) presence.stop(); });
app.on('window-all-closed', () => { /* stays in the tray */ });
app.on('activate', () => { if (!win) createWidget(); else win.show(); });
