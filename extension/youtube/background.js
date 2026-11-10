/* The extension's service worker: sends the YouTube tab's state to Astrum on this computer and carries out the commands
   Astrum has waiting. It talks only to Astrum's own address, with the pairing code you pasted in the popup.
   With several YouTube tabs, the one playing wins; otherwise the one that reported last. */
'use strict';
var ASTRUM = 'http://127.0.0.1:43210/api/yt/bridge';
var VIDEO = /^[\w-]{11}$/, LIST = /^[\w-]{2,64}$/;
var FRESH = 10000;   // a tab that has not reported for this long no longer wins

var tabs = {};       // tab id -> { state, at }
var chosen = null, posting = false, lastPost = 0;

function setStatus(text, ok) { chrome.storage.session.set({ status: { text: text, ok: ok, at: Date.now() } }).catch(function () { }); }
function pick() {
  var now = Date.now(), best = null;
  Object.keys(tabs).forEach(function (id) {
    var t = tabs[id]; if (now - t.at > FRESH) return;
    if (!best || (t.state.playing && !best.state.playing) || (t.state.playing === best.state.playing && t.at > best.at)) best = { id: +id, state: t.state, at: t.at };
  });
  return best;
}

function post(body) {
  return chrome.storage.local.get('code').then(function (r) {
    var code = r && r.code;
    if (!code) { setStatus('Paste the pairing code from Astrum', false); return; }
    posting = true;
    return fetch(ASTRUM, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + code }, body: JSON.stringify(body) })
      .then(function (res) {
        if (res.status === 401) { setStatus('Astrum did not accept the pairing code. Copy it again from Astrum.', false); return; }
        if (!res.ok) { setStatus('Astrum answered ' + res.status, false); return; }
        return res.json().then(function (j) {
          setStatus('Connected to Astrum', true);
          (Array.isArray(j && j.commands) ? j.commands : []).forEach(run);
        });
      }, function () { setStatus('Astrum is not running on this computer', false); })
      .finally(function () { posting = false; });
  });
}
function report() {
  var t = pick(); if (!t) return;
  if (posting || Date.now() - lastPost < 700) return;   // the next report carries the latest anyway
  lastPost = Date.now(); chosen = t.id;
  post({ state: t.state });
}

// a command from Astrum: `open` loads a video or playlist in the YouTube tab (or a new one); the rest go to the player
function run(cmd) {
  if (!cmd || typeof cmd.name !== 'string') return;
  if (cmd.name === 'open') {
    var a = cmd.arg || {}, v = VIDEO.test(a.v || '') ? a.v : '', l = LIST.test(a.list || '') ? a.list : '';
    if (!v && !l) return;
    var u = new URL(v ? 'https://www.youtube.com/watch' : 'https://www.youtube.com/playlist');
    if (v) u.searchParams.set('v', v);
    if (l) u.searchParams.set('list', l);
    if (v && l && Number.isInteger(a.index)) u.searchParams.set('index', String(a.index + 1));
    if (chosen != null) chrome.tabs.update(chosen, { url: u.href, active: false }).catch(function () { chrome.tabs.create({ url: u.href }); });
    else chrome.tabs.create({ url: u.href });
    return;
  }
  if (chosen == null) return;
  chrome.tabs.sendMessage(chosen, { kind: 'cmd', cmd: { name: cmd.name, arg: typeof cmd.arg === 'number' ? cmd.arg : null } }).catch(function () { });
}

chrome.runtime.onMessage.addListener(function (m, sender) {
  if (!m || m.kind !== 'state' || !sender.tab || sender.id !== chrome.runtime.id) return;
  tabs[sender.tab.id] = { state: m.state, at: Date.now() };
  report();
});
chrome.tabs.onRemoved.addListener(function (id) {
  if (!tabs[id]) return;
  delete tabs[id]; if (chosen === id) chosen = null;
  if (!pick()) post({ closed: true }); else report();
});

// every 30 s: keeps Astrum's link alive while a hidden, paused tab's timers are slowed, and collects waiting commands
chrome.alarms.create('beat', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(function (a) {
  if (a.name !== 'beat') return;
  chrome.tabs.query({ url: 'https://www.youtube.com/*' }).then(function (list) {
    if (!list.length) { tabs = {}; chosen = null; post({ closed: true }); return; }
    if (chosen == null || !list.some(function (t) { return t.id === chosen; })) chosen = list[0].id;
    var t = pick(); post(t ? { state: t.state } : {});
  });
});
