/* Runs beside YouTube's page in the extension's own world: passes what page.js reads to the extension, and the
   extension's commands to page.js. Astrum checks everything again; this only keeps out what is plainly not ours. */
(function () {
  'use strict';
  var TAG = 'astrum-yt', NAMES = { play: 1, pause: 1, toggle: 1, next: 1, prev: 1, seek: 1, volume: 1 };

  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin) return;
    var m = e.data;
    if (!m || m.tag !== TAG || m.kind !== 'state' || !m.state || typeof m.state !== 'object') return;
    try { chrome.runtime.sendMessage({ kind: 'state', state: m.state }).catch(function () { }); }
    catch (err) { /* the extension was reloaded: this tab's bridge is gone until the page reloads */ }
  });

  chrome.runtime.onMessage.addListener(function (m) {
    if (!m || m.kind !== 'cmd' || !m.cmd || !NAMES[m.cmd.name]) return;
    window.postMessage({ tag: TAG, kind: 'cmd', cmd: { name: m.cmd.name, arg: typeof m.cmd.arg === 'number' ? m.cmd.arg : null } }, location.origin);
  });
})();
