/* The guides talk to Astrum on this computer: what is set up, and handing over what you connect. */
window.IA = (function () {
  'use strict';
  function api(path, data) {
    var o = data === undefined ? { headers: { 'X-IA': '1' } } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-IA': '1' }, body: JSON.stringify(data) };
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('The app answered ' + r.status)); return j; });
    }, function () { throw new Error('Astrum is not running on this computer: start it, then reload this page.'); });
  }
  function $(id) { return document.getElementById(id); }
  function say(el, text, ok) { el.textContent = text; el.classList.toggle('ok', !!ok); }
  function copy(text, el) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { say(el, 'Copied.', true); }, function () { window.prompt('Copy this:', text); });
    else window.prompt('Copy this:', text);
  }
  // the page must be on this address (Spotify returns to 127.0.0.1, Google signs in on localhost)
  function onHost(host) { if (location.hostname !== host) { location.replace(location.protocol + '//' + host + ':' + location.port + location.pathname + location.search); return false; } return true; }
  var ICON = {
    sp: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.5 9.3c3.8-1.2 8-.9 11.2 1M7.2 12.4c3.1-.9 6.4-.6 9 .9M7.9 15.3c2.4-.7 4.8-.5 6.8.7" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>',
    yt: '<svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="5" fill="#ff4e45"/><path d="M10 8v8l6-4z" fill="#fff"/></svg>',
    dc: '<svg viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="7" fill="#5865f2"/><path d="M8.3 7.6c1.2-.5 2.4-.7 3.7-.7s2.5.2 3.7.7c1.2 1.7 1.8 3.6 1.7 5.7-1.1.9-2.3 1.4-3.6 1.7l-.7-1.1c.6-.2 1.1-.5 1.6-.8-2 .9-3.8.9-5.4 0 .5.3 1 .6 1.6.8l-.7 1.1c-1.3-.3-2.5-.8-3.6-1.7-.1-2.1.5-4 1.7-5.7z" fill="#fff"/><circle cx="10" cy="11.4" r="1" fill="#5865f2"/><circle cx="14" cy="11.4" r="1" fill="#5865f2"/></svg>',
    app: '<svg viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1ed760"/><stop offset=".5" stop-color="#5865f2"/><stop offset="1" stop-color="#ff4e45"/></linearGradient></defs><rect x="2" y="7" width="20" height="10" rx="5" fill="#000" stroke="url(#g)" stroke-width="1.6"/><circle cx="7.5" cy="12" r="2.2" fill="url(#g)"/></svg>'
  };
  return { api: api, status: function () { return api('/api/status'); }, $: $, say: say, copy: copy, onHost: onHost, ICON: ICON };
})();
