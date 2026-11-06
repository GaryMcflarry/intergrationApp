'use strict';
/* What the island may ask of the app (nothing else of the computer): shared values, the window, the set-up guides, Discord. */
const { contextBridge, ipcRenderer } = require('electron');

const on = {};
function listen(channel) { on[channel] = []; ipcRenderer.on(channel, (_e, d) => on[channel].forEach((f) => f(d))); return (f) => { on[channel].push(f); }; }
const onKv = listen('kv-changed'), onSettings = listen('settings'), onStatus = listen('discord-status'), onFeed = listen('discord-feed');
const onReflow = listen('island-reflow'), onPoke = listen('island-poke'), onPlace = listen('island-place'), onSummon = listen('island-summon');

contextBridge.exposeInMainWorld('desktop', {
  isApp: true,
  kv: {
    get: (key) => ipcRenderer.sendSync('kv-get', String(key)),
    set: (key, value) => ipcRenderer.send('kv-set', String(key), value == null ? null : String(value)),
    onChange: onKv
  },
  settings: { get: () => ipcRenderer.invoke('settings-get'), set: (patch) => ipcRenderer.invoke('settings-set', patch), onChange: onSettings },
  island: {
    size: (w, h) => ipcRenderer.send('island', 'size', Number(w), Number(h)),
    ignore: (on) => ipcRenderer.send('island', 'ignore', !!on),   // the overlay: let clicks through to the desktop (the mouse is off the island)
    drag: (phase) => ipcRenderer.send('island', 'drag', phase === 'start' ? 'start' : 'end'),   // the window follows the mouse until 'end'
    state: (level) => ipcRenderer.send('island', 'state', Number(level) || 0),   // how open it is (Follow the mouse moves only the closed pill)
    full: (on2) => ipcRenderer.invoke('island-full', !!on2),
    focus: () => ipcRenderer.send('island', 'focus'),
    blur: () => ipcRenderer.send('island', 'blur'),
    onReflow, onPoke, onPlace, onSummon
  },
  openGuide: (what) => ipcRenderer.send('open-guide', String(what || 'index')),
  window: { openSetup: (url) => ipcRenderer.send('open-guide', String(url)) },   // the player's set-up links: their guide, in the browser
  discord: {
    update: (track) => ipcRenderer.send('discord-update', track || null),
    share: (track) => ipcRenderer.invoke('discord-share', track),
    status: () => ipcRenderer.invoke('discord-status'),
    onStatus,
    feed: () => ipcRenderer.invoke('discord-feed'),
    refresh: () => ipcRenderer.invoke('discord-refresh'),
    onFeed
  }
});
