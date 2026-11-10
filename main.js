'use strict';
/* Astrum: a Dynamic Island at the top of your desktop, for Spotify, YouTube and Discord.
   - the island: a small pill (what plays, or Discord) that opens into tabs, then the full player, then the whole screen
   - set-up happens in your browser: guide pages served by this app connect each service and hand the result over
   - Discord: Rich Presence follows what plays, a bot of yours brings in the latest messages, Share posts a song */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen, dialog, safeStorage, globalShortcut, session } = require('electron');
const path = require('node:path');
const server = require('./lib/server');
const { createStore } = require('./lib/store');
const discord = require('./lib/discord');
const { createBot } = require('./lib/discordbot');
const { createSocial } = require('./lib/discord-social');
const { createSpotifyAuth } = require('./lib/spotify-auth');
const { createApi } = require('./lib/api');
const ICON = require('./lib/icon');
const systemControls = require('./lib/system');
const { createAiUsage, PROVIDERS: AI_PROVIDERS } = require('./lib/ai-usage');

const ORIGIN = `http://127.0.0.1:${server.PORT}`;     // the island, the guides, Spotify's return address
const GOOGLE = `http://localhost:${server.PORT}`;     // the YouTube guide (Google signs in here)
const GUIDES = { index: ORIGIN + '/guide/', spotify: ORIGIN + '/guide/spotify.html', youtube: GOOGLE + '/guide/youtube.html', discord: ORIGIN + '/guide/discord.html' };

// The app was called integrationApp: keep its data folder (sign-ins, settings, the island's storage) under the new name
app.setPath('userData', path.join(app.getPath('appData'), 'integrationApp'));
// Google refuses sign-in inside apps that say they are Electron: present as the Chrome it is built on
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/\S+/, '').replace(/\s?(integrationApp|Astrum)\/\S+/i, '');
if (!app.requestSingleInstanceLock()) app.quit();
// the island is a see-through window that is always on screen: Chromium must not treat it as hidden ("occluded") or put it
// to sleep in the background, or what plays stops updating until the mouse passes over it
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const MAC = process.platform === 'darwin';
// Menu bar mode (Top bar mode on Windows): the island flush at the very top of a screen (ASTRUM_NOTCH=1 tries it on Linux)
const NOTCH_OK = MAC || process.platform === 'win32' || process.env.ASTRUM_NOTCH === '1';
let island = null, tray = null, store = null, presence = null, bot = null, quitting = false, full = null, lastStatus = { text: 'Starting…', ok: false };
let social = null, aiUsage = null;

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

/* ---------- AI usage: your Claude and ChatGPT sign-ins, each in a session of its own ---------- */
/* The sites are signed in to in windows of this app (persisted partitions, apart from the island and from each other);
   lib/ai-usage.js reads the usage with those cookies. The island only ever gets numbers: never a cookie or a token. */
const AI_PARTS = { claude: 'persist:ai-claude', chatgpt: 'persist:ai-chatgpt' };
const aiWins = {};
function aiFetch(provider, url, opts) {
  return session.fromPartition(AI_PARTS[provider]).fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json', ...(opts.headers || {}) } });
}
const AI_WEB = { sandbox: true, contextIsolation: true, nodeIntegration: false };
function aiSignIn(id) {
  if (!AI_PARTS[id]) return false;
  const open = aiWins[id];
  if (open && !open.isDestroyed()) { open.show(); open.focus(); return true; }
  const w = new BrowserWindow({ width: 480, height: 720, title: 'Sign in to ' + AI_PROVIDERS[id].name, autoHideMenuBar: true,
    icon: nativeImage.createFromDataURL(ICON), webPreferences: { ...AI_WEB, partition: AI_PARTS[id] } });
  aiWins[id] = w;
  // sign-in with Google or Apple opens a popup: it stays in this account's session; anything that is not a web page is refused
  w.webContents.setWindowOpenHandler(({ url }) => (/^https:\/\//.test(url)
    ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { ...AI_WEB, partition: AI_PARTS[id] } } }
    : { action: 'deny' }));
  w.webContents.on('will-navigate', (e, url) => { if (!/^https:\/\//.test(url)) e.preventDefault(); });
  // signed in: the site leaves its log-in pages; the usage is read then, and the window closes by itself once it answers
  let checkT = 0;
  const check = (_e, url) => {
    if (/\/(login|auth|log-in|sign-?in)/i.test(String(url))) return;
    clearTimeout(checkT);
    checkT = setTimeout(() => aiUsage.refresh(id).then((s) => {
      const p = s.providers.find((x) => x.provider === id);
      if (p && p.phase === 'ready' && !w.isDestroyed()) w.close();
    }), 1500);
  };
  w.webContents.on('did-navigate', check);
  w.webContents.on('did-navigate-in-page', check);
  w.on('closed', () => { clearTimeout(checkT); if (aiWins[id] !== w) return; aiWins[id] = null; aiUsage.refresh(id); });   // not after a sign-out
  w.loadURL(AI_PROVIDERS[id].login);
  return true;
}
async function aiSignOut(id) {
  if (!AI_PARTS[id]) return aiUsage.state();
  const w = aiWins[id]; aiWins[id] = null; if (w && !w.isDestroyed()) w.destroy();
  aiUsage.signedOut(id);   // first: a refresh on its way is dropped
  try { await session.fromPartition(AI_PARTS[id]).clearStorageData(); } catch (e) { console.error('Could not clear the sign-in:', e.message); }
  return aiUsage.state();
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
function setAnchorFromDrag(start, origin) {
  const b = island.getBounds(), from = origin || place.anchorAt(screen.getAllDisplays(), screen.getPrimaryDisplay(), anchor);
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
// (in the menu bar it is always on top: below other windows it could not be seen there)
function applyOnTop() { const s = store.settings(); if (island) island.setAlwaysOnTop(!!s.alwaysOnTop || s.placement === 'notch', 'screen-saver'); }

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
const DRAG_PAD = 28;   // room around the island while it is carried (its shadow and glow)
function dragIsland(phase, box) {
  if (phase === 'start' && !full && !drag && store.settings().placement !== 'notch') {   // Menu bar mode stays on the notch
    const c = screen.getCursorScreenPoint();
    let b = island.getBounds();
    let origin = null;
    /* the overlay is a big window: carrying all of it is slow (and macOS stops a tall window at the top of the screen),
       so for the drag the window shrinks to the island itself, and goes back to the overlay when it is let go */
    const ok = (v) => Number.isFinite(v) && v >= -4000 && v <= 8000;
    if (OVERLAY && box && ok(box.x) && ok(box.y) && ok(box.w) && ok(box.h) && box.w > 0 && box.h > 0) {
      origin = { x: c.x, y: c.y };
      const nb = { x: Math.round(c.x - box.w / 2 - DRAG_PAD), y: Math.round(c.y - box.h / 2 - DRAG_PAD),
        width: Math.round(Math.min(b.width, box.w) + DRAG_PAD * 2), height: Math.round(Math.min(b.height, box.h) + DRAG_PAD * 2) };
      lastPlace = '';   // the overlay's place is sent again on the drop
      island.webContents.send('island-place', { drag: true, x: DRAG_PAD, y: DRAG_PAD });
      island.setBounds(nb); b = nb;
    }
    // the window follows the mouse, keeping its size: moved between screens of different scaling, Windows would
    // otherwise resize it on the way (and the island would jump away from the mouse)
    setClickThrough(false);
    drag = { start: { x: b.x, y: b.y }, origin, dx: c.x - b.x, dy: c.y - b.y, w: b.width, h: b.height, timer: setInterval(() => {
      if (!island) return; const p = screen.getCursorScreenPoint();
      island.setBounds({ x: p.x - drag.dx, y: p.y - drag.dy, width: drag.w, height: drag.h });
    }, 16) };
  } else if (phase === 'end' && drag) {   // let go: it stays there, on that screen
    const start = drag.start, origin = drag.origin;
    stopDrag();
    setAnchorFromDrag(start, origin);
    placeIsland();
  }
}
function createIsland() {
  islandSize = { width: 300, height: place.PILL + place.TOP + place.BOTTOM }; growUp = null;
  const saved = store.settings().bounds;
  anchor = saved && Number.isFinite(saved.fx) && Number.isFinite(saved.fy) ? saved : null;
  if (store.settings().placement === 'notch') anchor = place.notchAt(anchorDisplay());
  else if (anchor && anchor.notch) anchor = place.topMiddle(anchorDisplay());
  const first = windowBounds(); lastPlace = '';
  island = new BrowserWindow({
    x: first.x, y: first.y, width: first.width, height: first.height,
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    hasShadow: false, skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Astrum', backgroundColor: '#00000000',
    enableLargerThanScreen: NOTCH_OK,   // macOS: lets it sit over the menu bar (In the menu bar), where windows are otherwise kept below it
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

/* the tray: on a Mac, a plain white star in the menu bar (a template image, lib/trayicon.js) that just sits there; clicking
   it calls the island, and the right button gives the menu. Elsewhere, the app's icon. */
function media(what) { if (island) island.webContents.send('island-media', what); }
function buildTray() {
  tray = new Tray(MAC ? require('./lib/trayicon').menuBarIcon(nativeImage) : nativeImage.createFromDataURL(ICON));
  tray.setToolTip('Astrum');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Show the island', click: () => { if (!island) createIsland(); else island.showInactive(); } },
    { label: 'Hide the island', click: () => island && island.hide() },
    { type: 'separator' },
    // what plays, without opening the island
    { label: 'Play / Pause', click: () => media('play') },
    { label: 'Next', click: () => media('next') },
    { label: 'Previous', click: () => media('prev') },
    ...(NOTCH_OK ? [{ label: MAC ? 'Menu bar mode' : 'Top bar mode', type: 'checkbox', checked: store.settings().placement === 'notch',
      click: (m) => { applySettings({ placement: m.checked ? 'notch' : 'screen' }); } }] : []),
    { type: 'separator' },
    { label: 'Set up (opens in your browser)…', click: () => openGuide('index') },
    { label: 'Spotify…', click: () => openGuide('spotify') },
    { label: 'YouTube…', click: () => openGuide('youtube') },
    { label: 'Discord…', click: () => openGuide('discord') },
    { type: 'separator' },
    { label: 'Start with this computer', type: 'checkbox', checked: store.settings().openAtLogin, click: (m) => applySettings({ openAtLogin: m.checked }) },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
  if (MAC) {   // a click calls the island; the menu is on the right button (a menu set on a Mac's tray takes every click)
    tray.on('click', () => summon());
    tray.on('right-click', () => tray.popUpContextMenu(menu()));
    tray.refresh = () => {};
    return;
  }
  tray.setContextMenu(menu());
  tray.on('click', () => { if (!island) createIsland(); else if (island.isVisible()) island.webContents.send('island-poke'); else island.showInactive(); });
  tray.refresh = () => tray.setContextMenu(menu());
}

function applySettings(patch) {
  const before = store.settings(), now = store.setSettings(patch);
  if ('openAtLogin' in patch) { try { app.setLoginItemSettings({ openAtLogin: !!now.openAtLogin }); } catch { /* not here */ } if (tray) tray.refresh(); }
  if (now.discordId !== before.discordId) { if (social) social.stop(); presence.connect(now.discordId); }
  if (now.presence !== before.presence) presence.setEnabled(now.presence);
  if ('channels' in patch) bot.refresh().catch(() => {});
  if ('alwaysOnTop' in patch) applyOnTop();
  if ('shortcut' in patch) registerShortcut();
  if (patch.placement === 'screen' && before.placement !== 'screen') pinToScreen();
  if (patch.placement === 'notch' && before.placement !== 'notch') { anchor = place.notchAt(anchorDisplay()); store.setSettings({ bounds: anchor }); placeIsland(); }
  if (patch.placement && patch.placement !== 'notch' && before.placement === 'notch') pinToScreen();   // down from the menu bar, to the top middle
  if ('placement' in patch) { applyOnTop(); if (tray) tray.refresh(); }
  sendAll('settings', publicSettings());
  return now;
}
// the screens, for Menu bar mode's screen picker (which one the island hangs from)
function screensInfo() {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, name: d.label || (d.id === prim ? 'Main screen' : 'Screen ' + (i + 1)), size: d.size.width + '×' + d.size.height, primary: d.id === prim }));
}
function publicSettings() { const s = store.settings(); return { screens: screensInfo(), screen: anchorDisplay().id, alwaysOnTop: s.alwaysOnTop, placement: s.placement, shortcut: s.shortcut, shortcutOk, mac: MAC, notchOk: NOTCH_OK, openAtLogin: s.openAtLogin, discordId: !!s.discordId, presence: s.presence, webhook: !!s.webhook, bot: !!s.botToken, channels: s.channels }; }
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
  /* Settings › Controls: the computer's own sound, brightness, dark mode, Wi-Fi, Bluetooth (lib/system.js: fixed commands,
     known controls and values only), asked only by the island's own page */
  const sys = systemControls.create({ open: (u) => shell.openExternal(u), dataDir: app.getPath('userData') });
  const fromIsland = (e) => { try { return new URL(e.senderFrame.url).origin === ORIGIN && island && BrowserWindow.fromWebContents(e.sender) === island; } catch { return false; } };
  ipcMain.handle('system-get', (e) => (fromIsland(e) ? sys.get() : null));
  ipcMain.handle('system-set', (e, k, v) => (fromIsland(e) ? sys.set(String(k), v) : { ok: false }));
  ipcMain.handle('system-act', (e, a) => (fromIsland(e) ? sys.act(String(a)) : { ok: false }));
  ipcMain.handle('settings-set', (e, patch) => {   // the island's own settings: where it stays, on top or not, the shortcut, starting with the computer
    if (!fromApp(e) || !patch || typeof patch !== 'object') return null;
    const clean = {};
    if (['spot', 'screen', 'roam'].concat(NOTCH_OK ? ['notch'] : []).includes(patch.placement)) clean.placement = patch.placement;
    if ('alwaysOnTop' in patch) clean.alwaysOnTop = !!patch.alwaysOnTop;
    if (typeof patch.shortcut === 'string' && SHORTCUTS.has(patch.shortcut)) clean.shortcut = patch.shortcut;
    if ('openAtLogin' in patch) clean.openAtLogin = !!patch.openAtLogin;
    // Menu bar mode: which screen's notch (it cannot be dragged there)
    if (Number.isFinite(patch.notchScreen) && store.settings().placement === 'notch') {
      const d = screen.getAllDisplays().find((x) => x.id === patch.notchScreen);
      if (d) { anchor = place.notchAt(d); store.setSettings({ bounds: anchor }); placeIsland(); }
    }
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
    else if (what === 'drag') dragIsland(a, b);
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
  ipcMain.on('discord-update', (e, track) => {   // what plays: Discord's Rich Presence
    if (!fromApp(e)) return;
    const t = track && typeof track === 'object' ? track : null;
    presence.update(t);
  });
  ipcMain.handle('discord-share', (e, track) => (fromApp(e) ? discord.share(store.settings().webhook, track) : { ok: false, error: 'not allowed' }));
  ipcMain.handle('discord-status', () => lastStatus);
  ipcMain.handle('discord-feed', () => bot.feed());
  ipcMain.handle('discord-refresh', (e) => (fromApp(e) ? bot.refresh().catch((er) => ({ configured: true, messages: [], channels: [], error: er.message })) : null));
  ipcMain.handle('discord-social-state', (e) => fromIsland(e) ? social.state() : null);
  ipcMain.handle('discord-social-connect', (e) => fromIsland(e) ? social.connect() : null);
  ipcMain.handle('discord-social-disconnect', (e) => fromIsland(e) ? social.stop() : null);
  ipcMain.handle('discord-social-conversations', (e) => fromIsland(e) ? social.conversations() : null);
  ipcMain.handle('discord-social-history', (e, id) => fromIsland(e) ? social.openConversation(id) : null);
  ipcMain.handle('discord-social-send', (e, id, text) => fromIsland(e) ? social.sendMessage(id, text) : { ok: false });
  ipcMain.handle('discord-social-message-open', (e, id) => { if (fromIsland(e)) social.openMessage(id); });
  ipcMain.handle('discord-social-voice', (e, action, value) => fromIsland(e) ? social.voice(action, value) : null);
  // AI usage: the island asks; only numbers come back
  const aiId = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(AI_PARTS, v) ? v : null);
  ipcMain.handle('ai-state', (e) => (fromIsland(e) ? aiUsage.state() : null));
  ipcMain.handle('ai-refresh', (e, id) => (fromIsland(e) ? aiUsage.refresh(aiId(id) || undefined) : null));
  ipcMain.handle('ai-signin', (e, id) => (fromIsland(e) && aiId(id) ? aiSignIn(aiId(id)) : false));
  ipcMain.handle('ai-signout', (e, id) => (fromIsland(e) && aiId(id) ? aiSignOut(aiId(id)) : null));
}

app.whenReady().then(async () => {
  store = createStore(app.getPath('userData'));
  presence = discord.createPresence({ onStatus: (st) => { lastStatus = st; sendAll('discord-status', st); } });
  social = createSocial({
    executable: process.platform === 'win32' ? path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, 'dist'), 'discord-social', 'astrum-discord-social.exe') : null,
    getClientId: () => store.settings().discordId,
    onState: (state) => { if (island && !island.isDestroyed()) island.webContents.send('discord-social-state', state); }
  });
  aiUsage = createAiUsage({
    fetchFor: aiFetch, dataDir: app.getPath('userData'),
    onState: (s) => { if (island && !island.isDestroyed()) island.webContents.send('ai-usage', s); }
  });
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
  screen.on('display-removed', () => { placeIsland(); sendAll('settings', publicSettings()); });
  screen.on('display-added', () => sendAll('settings', publicSettings()));   // its screen is gone: the main screen, until it comes back
  createIsland();
  buildTray();
  registerShortcut();
  const s = store.settings();
  presence.setEnabled(s.presence);
  presence.connect(s.discordId);
  if (s.botToken) bot.start();
  aiUsage.start();
  // first run: nothing set up yet, so the set-up guide opens in your browser
  if (!store.get('np-client') && !store.get('yt-client') && !s.discordId && !s.botToken) setTimeout(() => openGuide('index'), 1500);
});
app.on('second-instance', () => { if (island) { island.showInactive(); island.webContents.send('island-poke'); } });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { quitting = true; if (social) social.stop(); if (aiUsage) aiUsage.stop(); if (store) store.flush(); if (presence) presence.stop(); if (bot) bot.stop(); });
app.on('window-all-closed', () => { /* stays in the tray */ });
