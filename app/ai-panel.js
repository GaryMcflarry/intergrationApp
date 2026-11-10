/* Astrum's AI usage panel: your Claude and ChatGPT plan limits, for the session (5 hours) and the week, laid out like
   CodexBar's menu card: how much is left, the pace against the window, and when it resets.
   main.js signs in and reads the numbers (lib/ai-usage.js); this page only shows them. Everything is rendered as text,
   never HTML. */
window.AiPanel = (function () {
  'use strict';
  var HOUR = 3600 * 1000, DAY = 24 * HOUR;
  // used when a provider does not say how long its window is (Claude never does)
  var SESSION_LEN = 5 * HOUR, WEEK_LEN = 7 * DAY;

  /* ---------- helpers ---------- */
  function node(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(cls, text, fn) { var b = node('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function span(ms) {
    var m = Math.max(1, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), r = m % 60;
    return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + r + 'm' : r + 'm';
  }
  function resets(at, now) { if (!at) return ''; return at - now <= 30000 ? 'Resetting now' : 'Resets in ' + span(at - now); }
  function ago(t, now) { if (!t) return ''; var s = now - t; return s < 60000 ? 'Updated just now' : 'Updated ' + span(s) + ' ago'; }
  function leftOf(w) { return w && w.pct != null ? Math.max(0, 100 - w.pct) : null; }
  function heat(left) { return left == null ? '' : left <= 10 ? 'hi' : left <= 25 ? 'warn' : ''; }

  /* The pace, as CodexBar works it out: the share of the window gone by is the share you would have used at an even
     rate. Within 2 points of that is on pace; more is a deficit, less a reserve. The projection carries today's rate
     on to the reset. Nothing is shown when the numbers cannot support it. */
  function pace(w, len, now, session) {
    if (!w || w.pct == null || !w.resetsAt || !(len > 0)) return null;
    var left = w.resetsAt - now;
    if (left <= 0 || left > len) return null;
    var elapsed = len - left, used = Math.min(100, Math.max(0, w.pct)), expected = Math.min(100, elapsed / len * 100);
    if (elapsed === 0 && used > 0) return null;
    if (session && (used >= 100 || expected < 3)) return null;
    var delta = used - expected, n = Math.round(Math.abs(delta));
    var label = Math.abs(delta) <= 2 || n === 0 ? 'On pace' : n + (delta > 0 ? '% in deficit' : '% in reserve');
    var eta = null;
    if (used >= 100) eta = 0;
    else if (used > 0 && elapsed > 0) { var t = (100 - used) / (used / elapsed); if (t < left) eta = t; }
    var projection = eta == null ? 'Lasts until reset'
      : (session ? 'Projected empty ' : 'Runs out ') + (eta < 60000 ? 'now' : 'in ' + span(eta));
    return { expected: expected, delta: delta, label: label, projection: projection };
  }

  // a bar of what is left, with a tick where an even pace would be
  function bar(label, left, p) {
    var b = node('div', 'ai-bar ' + heat(left)); b.setAttribute('role', 'progressbar');
    b.setAttribute('aria-label', label + ' left'); b.setAttribute('aria-valuemin', '0'); b.setAttribute('aria-valuemax', '100');
    if (left != null) b.setAttribute('aria-valuenow', String(Math.round(left)));
    var fill = node('i'); fill.style.width = (left || 0) + '%'; b.appendChild(fill);
    if (p) { var tick = node('em'); tick.style.left = (100 - p.expected) + '%'; b.appendChild(tick); }
    return b;
  }
  // a window in full: its bar, then what is left and the pace, and when it resets and how long it lasts
  function usage(title, w, len, now, session) {
    var sec = node('section', 'ai-sec'), left = leftOf(w), p = pace(w, w && w.windowMs || len, now, session);
    sec.append(node('h3', null, title), bar(title, left, p));
    var det = node('div', 'ai-det'), l = node('div'), r = node('div', 'r');
    l.appendChild(node('b', null, left == null ? 'Not reported' : Math.round(left) + '% left'));
    if (p) l.appendChild(node('span', null, p.label));
    r.appendChild(node('b', null, w ? resets(w.resetsAt, now) : ''));
    if (p) r.appendChild(node('span', null, p.projection));
    det.append(l, r); sec.appendChild(det);
    return sec;
  }
  // a window in a peek row: the label, what is left, and the bar
  function mini(title, w, len, now, session) {
    var row = node('div', 'ai-mini'), left = leftOf(w), p = pace(w, w && w.windowMs || len, now, session);
    var top = node('div', 'ai-mtop'); top.append(node('span', null, title), node('b', null, left == null ? '—' : Math.round(left) + '% left'));
    row.append(top, bar(title, left, p));
    return row;
  }
  // the last 24 hours: the session's highest point in each hour
  function hours(history, now) {
    var peak = [], seen = 0, i;
    for (i = 0; i < 24; i++) peak.push(null);
    (history || []).forEach(function (x) {
      var at = 23 - Math.floor((now - x.t) / HOUR);
      if (at < 0 || at > 23 || x.s == null) return;
      peak[at] = Math.max(peak[at] || 0, x.s); seen++;
    });
    if (seen < 2) return null;
    var box = node('div', 'ai-hist'), bars = node('div', 'ai-bars');
    bars.setAttribute('role', 'img'); bars.setAttribute('aria-label', 'Session peak per hour, last 24 hours');
    peak.forEach(function (v) { var b = node('i', v == null ? 'none' : null); if (v != null) b.style.height = Math.max(4, v) + '%'; bars.appendChild(b); });
    box.append(bars, node('small', null, 'Session peak per hour · last 24 h'));
    return box;
  }

  /* ---------- the panel ---------- */
  function mount(root, api, opts) {
    opts = opts || {};
    root.innerHTML = '<div class="aip-scroll"><div class="aip-in"><header class="ai-head"><div><b>AI usage</b><p>Session and weekly limits · checked every 5 minutes</p></div>' +
      '<button type="button" class="ai-all">Refresh</button></header><div class="ai-cards"></div>' +
      '<p class="ai-note">Read with your own sign-in from claude.ai and chatgpt.com. These are not official APIs, so a number can go missing if a site changes.</p></div></div>';
    var state = { providers: [] }, active = false, waiting = {};
    var $ = function (s) { return root.querySelector(s); };

    function signIn(id) { waiting[id] = true; paint(); api.signIn(id); }
    function signOut(id) { waiting[id] = false; api.signOut(id).then(update); }
    function refresh(id) { api.refresh(id).then(update); }

    function line(p) {
      if (p.phase === 'signed-out') return waiting[p.provider] ? 'Finish signing in in the window that opened. It closes by itself.' : 'Not connected';
      if (p.phase === 'loading' && !p.updatedAt) return 'Checking…';
      return p.error || ago(p.updatedAt, Date.now());
    }
    function card(p) {
      var now = Date.now(), c = node('section', 'ai-card'); c.dataset.p = p.provider;
      var head = node('header'), who = node('div');
      who.appendChild(node('b', null, p.name));
      var st = node('small', 'ai-st' + (p.error ? ' err' : ''), line(p)); st.setAttribute('role', 'status'); who.appendChild(st);
      head.appendChild(who);
      if (p.plan) head.appendChild(node('small', 'ai-plan', p.plan));
      c.appendChild(head);
      if (p.phase !== 'signed-out' && (p.updatedAt || p.session || p.weekly)) {
        c.append(usage('Session', p.session, SESSION_LEN, now, true), usage('Weekly', p.weekly, WEEK_LEN, now, false));
        var h = hours(p.history, now); if (h) c.appendChild(h);
      }
      var menu = node('div', 'ai-menu');
      if (p.phase === 'signed-out') menu.appendChild(button('ai-go', waiting[p.provider] ? 'Open sign-in…' : 'Sign in…', function () { signIn(p.provider); }));
      else menu.append(button(null, '↻ Refresh now', function () { refresh(p.provider); }), button(null, 'Sign out', function () { signOut(p.provider); }));
      c.appendChild(menu);
      return c;
    }
    function paint() {
      var list = $('.ai-cards'); list.textContent = '';
      state.providers.forEach(function (p) { list.appendChild(card(p)); });
      if (!state.providers.length) list.appendChild(node('p', 'ai-st', 'Loading…'));
    }
    // 1 · peek: a line per account
    function peek(box) {
      var wrap = node('div', 'ai-peek');
      state.providers.forEach(function (p) {
        var row = node('div', 'ai-prow'), name = node('b', null, p.name); row.appendChild(name);
        if (p.phase === 'signed-out') {
          row.appendChild(node('span', 'ai-st', waiting[p.provider] ? 'Signing in…' : 'Not connected'));
          row.appendChild(button('ai-go', 'Sign in', function () { signIn(p.provider); }));
        } else if (!p.updatedAt) {
          row.appendChild(node('span', 'ai-st wide' + (p.error ? ' err' : ''), p.error || 'Checking…'));
        } else {
          var now = Date.now();
          row.append(mini('Session', p.session, SESSION_LEN, now, true), mini('Weekly', p.weekly, WEEK_LEN, now, false));
          if (p.error) row.title = p.error;
        }
        wrap.appendChild(row);
      });
      if (!state.providers.length) wrap.appendChild(node('span', 'ai-st', 'Loading…'));
      if (opts.expand) wrap.appendChild(button('ai-more', 'Details and history', opts.expand));
      box.appendChild(wrap);
    }
    function update(s) {
      if (!s || !Array.isArray(s.providers)) return;
      state = s;
      s.providers.forEach(function (p) { if (p.phase !== 'signed-out') waiting[p.provider] = false; });
      if (active) paint();
      if (opts.onChange) opts.onChange();
    }
    $('.ai-all').addEventListener('click', function () { refresh(); });
    api.onState(update);
    api.state().then(update);
    setInterval(function () { if (active) paint(); }, 30000);   // the countdowns, the pace and "updated … ago"

    return {
      show: function () { if (!active) { active = true; paint(); } },
      hide: function () { active = false; },
      peek: peek,
      // the closed island's line: each connected account's session left, and how low the lowest is (null: none connected)
      summary: function () {
        var parts = [], lowest = null, accounts = [];
        state.providers.forEach(function (p) {
          var left = p.phase === 'signed-out' ? null : leftOf(p.session);
          if (left == null) return;
          parts.push(p.name + ' ' + Math.round(left) + '%');
          accounts.push({ id: p.provider, name: p.name, left: left, resetsAt: p.session.resetsAt || 0 });
          lowest = lowest == null ? left : Math.min(lowest, left);
        });
        return parts.length ? { text: parts.join(' · ') + ' left', heat: heat(lowest), accounts: accounts } : null;
      }
    };
  }
  // _pace is exposed for the tests only
  return { mount: mount, _pace: pace };
})();
