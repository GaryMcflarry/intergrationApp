'use strict';
/* What the app's pages may ask of the app (nothing else of the computer): shared values, settings, the window, Discord. */
const { contextBridge, ipcRenderer } = require('electron');

const listeners = { kv: [], settings: [], discord: [] };
ipcRenderer.on('kv-changed', (_e, d) => listeners.kv.forEach((f) => f(d)));
ipcRenderer.on('settings', (_e, d) => listeners.settings.forEach((f) => f(d)));
ipcRenderer.on('discord-status', (_e, d) => listeners.discord.forEach((f) => f(d)));

contextBridge.exposeInMainWorld('desktop', {
  isApp: true,
  kv: {
    get: (key) => ipcRenderer.sendSync('kv-get', String(key)),
    set: (key, value) => ipcRenderer.send('kv-set', String(key), value == null ? null : String(value)),
    onChange: (f) => { listeners.kv.push(f); }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings-get'),
    set: (patch) => ipcRenderer.invoke('settings-set', patch),
    onChange: (f) => { listeners.settings.push(f); }
  },
  window: {
    minimize: () => ipcRenderer.send('window', 'minimize'),
    close: () => ipcRenderer.send('window', 'close'),
    setOnTop: (on) => ipcRenderer.send('window', 'on-top', !!on),
    fit: (w, h) => ipcRenderer.send('window', 'fit', Number(w), Number(h)),
    full: (on) => ipcRenderer.send('window', 'full', !!on),
    openSetup: (url) => ipcRenderer.send('window', 'open-setup', String(url))
  },
  discord: {
    update: (track) => ipcRenderer.send('discord-update', track || null),
    share: (track) => ipcRenderer.invoke('discord-share', track),
    status: () => ipcRenderer.invoke('discord-status'),
    onStatus: (f) => { listeners.discord.push(f); }
  }
});
