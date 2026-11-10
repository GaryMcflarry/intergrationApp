/* Astrum's AI usage panel: your Claude and ChatGPT plan limits, for the session (5 hours) and the week.
   main.js signs in and reads the numbers (lib/ai-usage.js); this page only shows them. Everything is rendered as text,
   never HTML. */
window.AiPanel = (function () {
  'use strict';
  var SVG = 'http://www.w3.org/2000/svg', DAY = 24 * 3600 * 1000;

  /* ---------- helpers ---------- */
  function node(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(cls, text, fn) { var b = node('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function span(ms) {
    var m = Math.max(1, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), r = m % 60;
    return d ? d + ' d ' + h + ' h' : h ? h + ' h ' + r + ' m' : r + ' m';
  }
  function resets(at, now) { if (!at) return ''; return at - now <= 30000 ? 'Resetting now' : 'Resets in ' + span(at - now); }
  function ago(t, now) { if (!t) return ''; var s = now - t; return s < 60000 ? 'Updated just now' : 'Updated ' + span(s) + ' ago'; }
  function heat(p) { return p == null ? '' : p >= 90 ? 'hi' : p >= 75 ? 'warn' : ''; }
  function shown(p) { return p == null ? '—' : Math.round(p) + '%'; }

  // a meter: the label, how much is used, and when it resets
  function meter(label, w, now, compact) {
    var row = node('div', 'ai-meter'), p = w ? w.pct : null;
    var top = node('div', 'ai-mtop'); top.append(node('span', null, label), node('b', null, shown(p)));
    var bar = node('div', 'ai-bar ' + heat(p)); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', label);
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); if (p != null) bar.setAttribute('aria-valuenow', String(Math.round(p)));
    var fill = node('i'); fill.style.width = (p || 0) + '%'; bar.appendChild(fill);
    row.append(top, bar);
    if (!compact) row.appendChild(node('small', null, w ? resets(w.resetsAt, now) || (p == null ? 'Not reported' : '') : 'Not reported'));
    return row;
  }
  // the last 24 hours: the session in the accent, the week dashed
  function spark(history, now) {
    var pts = (history || []).filter(function (x) { return x.t > now - DAY; });
    if (pts.length < 2) return null;
    var svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 100 28'); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'ai-spark'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Usage over the last 24 hours');
    ['w', 's'].forEach(function (k) {
      var line = pts.filter(function (x) { return x[k] != null; }).map(function (x) {
        return (100 - (now - x.t) / DAY * 100).toFixed(2) + ',' + (27 - x[k] / 100 * 26).toFixed(2);
      });
      if (line.length < 2) return;
      var pl = document.createElementNS(SVG, 'polyline'); pl.setAttribute('points', line.join(' ')); pl.setAttribute('class', 'ai-l' + k);
      svg.appendChild(pl);
    });
    var box = node('div', 'ai-trend'); box.appendChild(svg);
    var key = node('div', 'ai-key'); key.append(node('span', 'ks', 'Session'), node('span', 'kw', 'Week'), node('span', null, 'last 24 h'));
    box.appendChild(key);
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
      var head = node('header'), name = node('div', 'ai-name');
      name.appendChild(node('b', null, p.name)); if (p.plan) name.appendChild(node('small', 'ai-plan', p.plan));
      var acts = node('div', 'ai-acts');
      if (p.phase === 'signed-out') acts.appendChild(button('ai-go', waiting[p.provider] ? 'Open sign-in' : 'Sign in', function () { signIn(p.provider); }));
      else { acts.append(button(null, 'Refresh', function () { refresh(p.provider); }), button(null, 'Sign out', function () { signOut(p.provider); })); }
      head.append(name, acts); c.appendChild(head);
      var st = node('p', 'ai-st' + (p.error ? ' err' : ''), line(p)); st.setAttribute('role', 'status'); c.appendChild(st);
      if (p.phase !== 'signed-out' && (p.updatedAt || p.session || p.weekly)) {
        var m = node('div', 'ai-meters'); m.append(meter('Session · 5 h', p.session, now), meter('Week', p.weekly, now)); c.appendChild(m);
        var t = spark(p.history, now); if (t) c.appendChild(t);
      }
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
          row.append(meter('Session', p.session, now, true), meter('Week', p.weekly, now, true));
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
    setInterval(function () { if (active) paint(); }, 30000);   // the countdowns and "updated … ago"

    return {
      show: function () { if (!active) { active = true; paint(); } },
      hide: function () { active = false; },
      peek: peek
    };
  }
  return { mount: mount };
})();
