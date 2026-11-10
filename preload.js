'use strict';
/* What the island may ask of the app (nothing else of the computer): shared values, the window, the set-up guides, Discord. */
const { contextBridge, ipcRenderer } = require('electron');

const on = {};
function listen(channel) { on[channel] = []; ipcRenderer.on(channel, (_e, d) => on[channel].forEach((f) => f(d))); return (f) => { on[channel].push(f); }; }
const onKv = listen('kv-changed'), onSettings = listen('settings'), onStatus = listen('discord-status'), onFeed = listen('discord-feed');
const onSocial = listen('discord-social-state'), onAi = listen('ai-usage');
const onReflow = listen('island-reflow'), onPoke = listen('island-poke'), onPlace = listen('island-place'), onSummon = listen('island-summon'), onMedia = listen('island-media');

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
    // the window follows the mouse until 'end'; box: where the island is in the window (the overlay carries only that part)
    drag: (phase, box) => ipcRenderer.send('island', 'drag', phase === 'start' ? 'start' : 'end', box && typeof box === 'object'
      ? { x: Number(box.x), y: Number(box.y), w: Number(box.w), h: Number(box.h) } : null),
    state: (level) => ipcRenderer.send('island', 'state', Number(level) || 0),   // how open it is (Follow the mouse moves only the closed pill)
    full: (on2) => ipcRenderer.invoke('island-full', !!on2),
    focus: () => ipcRenderer.send('island', 'focus'),
    blur: () => ipcRenderer.send('island', 'blur'),
    onReflow, onPoke, onPlace, onSummon, onMedia
  },
  // Settings › Controls: the computer's own sound, brightness, dark mode, Wi-Fi, Bluetooth, and lock / screenshot / Focus
  system: {
    get: () => ipcRenderer.invoke('system-get'),
    set: (key, value) => ipcRenderer.invoke('system-set', String(key), typeof value === 'boolean' ? value : Number(value)),
    act: (what) => ipcRenderer.invoke('system-act', String(what))
  },
  // AI usage: Claude and ChatGPT limits (sign-in happens in a window of the app; only numbers come back)
  ai: {
    state: () => ipcRenderer.invoke('ai-state'),
    refresh: (id) => ipcRenderer.invoke('ai-refresh', id ? String(id) : null),
    signIn: (id) => ipcRenderer.invoke('ai-signin', String(id)),
    signOut: (id) => ipcRenderer.invoke('ai-signout', String(id)),
    onState: onAi
  },
  openGuide: (what) => ipcRenderer.send('open-guide', String(what || 'index')),
  window: { openSetup: (url) => ipcRenderer.send('open-guide', String(url)) },   // the player's set-up links: their guide, in the browser
  discord: {
    social: {
      state: () => ipcRenderer.invoke('discord-social-state'),
      connect: () => ipcRenderer.invoke('discord-social-connect'),
      disconnect: () => ipcRenderer.invoke('discord-social-disconnect'),
      conversations: () => ipcRenderer.invoke('discord-social-conversations'),
      history: (id) => ipcRenderer.invoke('discord-social-history', id),
      send: (id, text) => ipcRenderer.invoke('discord-social-send', id, text),
      openMessage: (id) => ipcRenderer.invoke('discord-social-message-open', id),
      voice: (action, value) => ipcRenderer.invoke('discord-social-voice', action, value),
      onState: onSocial
    },
    update: (track) => ipcRenderer.send('discord-update', track || null),
    share: (track) => ipcRenderer.invoke('discord-share', track),
    status: () => ipcRenderer.invoke('discord-status'),
    onStatus,
    feed: () => ipcRenderer.invoke('discord-feed'),
    refresh: () => ipcRenderer.invoke('discord-refresh'),
    onFeed
  }
});
