/* The popup: the pairing code from Astrum, kept in this browser's extension storage, and how the link is doing. */
'use strict';
var form = document.querySelector('form'), input = form.querySelector('input'), st = document.querySelector('.st');

function show(s) {
  st.textContent = s ? s.text : 'Waiting for a YouTube tab';
  st.className = 'st' + (s ? (s.ok ? ' ok' : ' bad') : '');
}
chrome.storage.local.get('code').then(function (r) { if (r && r.code) input.placeholder = 'Saved. Paste a new code to replace it'; });
chrome.storage.session.get('status').then(function (r) { show(r && r.status); });
chrome.storage.onChanged.addListener(function (c, area) { if (area === 'session' && c.status) show(c.status.newValue); });

form.addEventListener('submit', function (e) {
  e.preventDefault();
  var code = input.value.trim();
  if (!/^[\w-]{24}$/.test(code)) { show({ text: 'That is not an Astrum pairing code', ok: false }); return; }
  chrome.storage.local.set({ code: code }).then(function () {
    input.value = ''; input.placeholder = 'Saved. Paste a new code to replace it';
    show({ text: 'Saved. Play something on YouTube (reload tabs that were already open).', ok: true });
  });
});
