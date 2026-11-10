/* Astrum: the island's look and its few live touches.
   - the theme: the accent (a preset, your own hex, the playing source's colour, or cycling through the presets), the glow,
     and which effects are on; kept in this window's storage and applied as CSS variables (--acc, --glow)
   - sky: an optional slow constellation behind the open island (after React Bits' Particles), drawn toward the mouse
   - idle: the pill when nothing plays: small dots light up in turn, and now and then become the word "astrum" */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- the theme ---------- */
  var PRESETS = ['#7C4DFF', '#3B82F6', '#2DD4BF', '#A3E635', '#F59E0B', '#FF6B3D', '#F43F5E', '#EC4899', '#A855F7', '#7DD3FC', '#22C55E', '#94A3B8'];
  var SOURCE = { sp: '#1ED760', yt: '#FF4E45', dc: '#5865F2' };
  var KEY = 'astrum-theme-v1', DEF = { accent: '#1ED760', glow: 25, fullOpacity: 70, follow: true, cycle: false, every: 8, aura: false, sky: false, intro: false, glass: true, clarity: 50, cards: true, cardSong: true, cardMsg: true, cardPing: true, cardSecs: 7, cardMute: [], snooze: 0, msize: 100, mside: 0, tabSp: true, tabYt: true, tabDc: true, tabAi: true, aiRotate: true, aiAlert: true, v: 2 };
  var T = load(), src = null, cycleT = 0, subs = [];

  function load() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
    var t = {}; Object.keys(DEF).forEach(function (k) { t[k] = s && s[k] != null ? s[k] : DEF[k]; });
    if (s && !s.v) { t.sky = false; t.v = 2; }   // the backdrop became optional (off) after the first version
    if (!/^#[0-9a-f]{6}$/i.test(t.accent)) t.accent = DEF.accent;
    t.fullOpacity = Math.max(0, Math.min(100, Number.isFinite(+t.fullOpacity) ? +t.fullOpacity : DEF.fullOpacity));
    if (!Array.isArray(t.cardMute)) t.cardMute = [];
    if ([4, 7, 12].indexOf(+t.cardSecs) < 0) t.cardSecs = 7;
    t.msize = Math.max(70, Math.min(150, Number.isFinite(+t.msize) ? +t.msize : DEF.msize));   // Menu bar mode: the closed island's size (%)
    t.mside = Math.max(0, Math.min(420, Number.isFinite(+t.mside) ? +t.mside : 0));          // ... and each side's width (0: fits the name)
    return t;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch (e) { } }
  function accentNow() { return T.follow && src && SOURCE[src] ? SOURCE[src] : T.accent; }
  function paint() {   // the colour only; it fades over (--acc is a registered colour, so it can be transitioned)
    root.style.setProperty('--acc', accentNow());
    subs.forEach(function (fn) { fn(T); });
  }
  function apply() {
    root.style.setProperty('--glow', (T.glow / 100).toFixed(2));
    root.style.setProperty('--full-opacity', (T.fullOpacity / 100).toFixed(2));
    root.classList.toggle('no-aura', !T.aura);
    root.classList.toggle('glass', !!T.glass);
    root.style.setProperty('--glass-a', (0.88 - 0.6 * Math.max(0, Math.min(100, +T.clarity || 0)) / 100).toFixed(2));   // clearer: more of the desktop shows
    clearInterval(cycleT);
    if (T.cycle && !T.follow) cycleT = setInterval(nextPreset, Math.max(2, +T.every || 8) * 1000);
    paint(); sky.refresh();
  }
  function nextPreset() {
    var i = PRESETS.indexOf(T.accent.toUpperCase());
    T.accent = PRESETS[(i + 1) % PRESETS.length]; save(); paint();
  }
  var theme = {
    get: function () { return T; },
    set: function (patch) { Object.keys(patch).forEach(function (k) { T[k] = patch[k]; }); save(); apply(); },
    source: function (k) { if (k === src) return; src = k; if (T.follow) paint(); },   // what the island shows: sp, yt, dc
    onChange: function (fn) { subs.push(fn); }
  };

  /* ---------- sky: the optional constellation behind the open island ---------- */
  var sky = (function () {
    var cv = null, ctx = null, raf = 0, want = false, on = false, pts = [], mouse = null, col = '#a3e635', n = 0, w = 0, h = 0;
    function seed() {
      var c = Math.max(14, Math.min(46, Math.round(w * h / 9000)));
      while (pts.length < c) pts.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .16, vy: (Math.random() - .5) * .16, k: Math.random() < .18 ? 2 : Math.random() < .3 ? 1 : 0 });
      pts.length = c;
    }
    function frame(now) {
      raf = 0; if (!on || document.hidden) return;
      raf = requestAnimationFrame(frame);
      var dpr = window.devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight;
      if (!cw || !ch) return;
      if (cw !== w || ch !== h) { w = cw; h = ch; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      if (n++ % 12 === 0) col = getComputedStyle(root).getPropertyValue('--acc').trim() || col;   // follows the accent as it fades
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); seed();
      var t = now / 1000, i, j, a, b, dx, dy, d, R = 96;
      for (i = 0; i < pts.length; i++) {
        a = pts[i]; a.x += a.vx; a.y += a.vy;
        if (a.x < -10) a.x = w + 10; else if (a.x > w + 10) a.x = -10;
        if (a.y < -10) a.y = h + 10; else if (a.y > h + 10) a.y = -10;
      }
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = .7;
      for (i = 0; i < pts.length; i++) for (j = i + 1; j < pts.length; j++) {
        a = pts[i]; b = pts[j]; dx = a.x - b.x; dy = a.y - b.y; d = dx * dx + dy * dy;
        if (d < R * R) { ctx.globalAlpha = (1 - Math.sqrt(d) / R) * .32; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      if (mouse) for (i = 0; i < pts.length; i++) {   // the mouse joins the constellation
        a = pts[i]; dx = a.x - mouse.x; dy = a.y - mouse.y; d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) { ctx.globalAlpha = (1 - d / 130) * .5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
      }
      for (i = 0; i < pts.length; i++) {
        a = pts[i]; ctx.globalAlpha = .55 + .35 * Math.sin(t * 1.3 + i);
        if (a.k === 2) { ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.2, -2.2, 4.4, 4.4); ctx.restore(); }
        else if (a.k === 1) { ctx.beginPath(); ctx.arc(a.x, a.y, 3.2, 0, 6.283); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(a.x, a.y, 1.3, 0, 6.283); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
    window.addEventListener('mousemove', function (e) {
      if (!on) return; var r = cv.getBoundingClientRect();
      mouse = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
    });
    document.addEventListener('visibilitychange', function () { sky.refresh(); });
    return {
      mount: function (c) { cv = c; ctx = c.getContext('2d'); this.refresh(); },
      run: function (v) { want = !!v; this.refresh(); },
      refresh: function () {
        if (!cv) return; on = want && T.sky && !reduce;
        cv.classList.toggle('on', on);
        if (on && !raf && !document.hidden) raf = requestAnimationFrame(frame);
      }
    };
  })();

  /* ---------- idle: dots, and now and then the word ---------- */
  // six dots light up one after another (as if waiting); every so often each dot opens into a letter of "astrum"
  function Idle(box) {
    var timer = 0, on = false;
    function later(ms, fn) { clearTimeout(timer); timer = setTimeout(fn, ms); }
    function dots() { box.classList.remove('word-on'); if (T.intro) later(9000, word); }
    function word() { box.classList.add('word-on'); later(5000, dots); }
    return {
      run: function (v) {
        if (v === on) return; on = v; clearTimeout(timer);
        if (on) { box.classList.remove('word-on'); later(reduce ? 0 : 2600, T.intro ? word : dots); }
      }
    };
  }

  /* ---------- the settings panel ---------- */
  var TOGGLES = [['.s-follow', 'follow'], ['.s-cycle', 'cycle'], ['.s-aura', 'aura'], ['.s-sky', 'sky'], ['.s-intro', 'intro'], ['.s-glass', 'glass'], ['.s-cards', 'cards'], ['.s-csong', 'cardSong'], ['.s-cmsg', 'cardMsg'], ['.s-cping', 'cardPing'],
    ['.s-tabsp', 'tabSp'], ['.s-tabyt', 'tabYt'], ['.s-tabdc', 'tabDc'], ['.s-tabai', 'tabAi'], ['.s-airot', 'aiRotate'], ['.s-aialert', 'aiAlert']];
  function mountSettings(p) {
    function q(c) { return p.querySelector(c); }
    var sw = q('.sw');
    PRESETS.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'swc'; b.style.setProperty('--c', c); b.dataset.c = c;
      b.title = c; b.setAttribute('aria-label', 'Accent ' + c);
      b.addEventListener('click', function () { theme.set({ accent: c, follow: false }); });
      sw.appendChild(b);
    });
    var hex = q('.s-hex'), pick = q('.s-pick');
    function setHex(v) { v = String(v || '').trim(); if (v[0] !== '#') v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) theme.set({ accent: v.toUpperCase(), follow: false }); }
    hex.addEventListener('change', function () { setHex(hex.value); });
    hex.addEventListener('keydown', function (e) { if (e.key === 'Enter') setHex(hex.value); });
    pick.addEventListener('input', function () { setHex(pick.value); });
    var glow = q('.s-glow');
    glow.addEventListener('input', function () { theme.set({ glow: +glow.value }); });
    var clarity = q('.s-clarity');
    if (clarity) clarity.addEventListener('input', function () { theme.set({ clarity: +clarity.value }); });
    var fullOpacity = q('.s-full-opacity');
    fullOpacity.addEventListener('input', function () { theme.set({ fullOpacity: +fullOpacity.value }); });
    var every = q('.s-every');
    every.addEventListener('change', function () { theme.set({ every: Math.max(2, Math.min(120, Math.round(+every.value) || 8)) }); });
    TOGGLES.forEach(function (x) {
      q(x[0]).addEventListener('click', function () {
        var o = {}; o[x[1]] = !T[x[1]]; if (x[1] === 'cycle' && o.cycle) o.follow = false; if (x[1] === 'follow' && o.follow) o.cycle = false;
        // Settings › Tabs: one tab always stays
        if (/^tab/.test(x[1]) && !o[x[1]] && ['tabSp', 'tabYt', 'tabDc', 'tabAi'].filter(function (k) { return k !== x[1] && T[k]; }).length === 0) return;
        theme.set(o);
      });
    });
    function sync() {
      var a = T.accent.toUpperCase();
      Array.prototype.forEach.call(sw.children, function (b) { b.setAttribute('aria-pressed', String(!T.follow && b.dataset.c === a)); });
      if (document.activeElement !== hex) hex.value = a;
      pick.value = a.toLowerCase(); q('.s-chip').style.setProperty('--c', a);
      glow.value = T.glow; glow.style.setProperty('--v', T.glow); q('.s-glowv').textContent = T.glow;
      if (clarity) { clarity.value = T.clarity; clarity.style.setProperty('--v', T.clarity); q('.s-clarityv').textContent = T.clarity; clarity.disabled = !T.glass; }
      fullOpacity.value = T.fullOpacity; fullOpacity.style.setProperty('--v', T.fullOpacity); q('.s-full-opacityv').textContent = T.fullOpacity + '%';
      if (document.activeElement !== every) every.value = T.every;
      TOGGLES.forEach(function (x) { q(x[0]).setAttribute('aria-checked', String(!!T[x[1]])); });
      q('.every').classList.toggle('off', !T.cycle);
    }
    theme.onChange(sync); sync();
  }

  window.Astrum = { theme: theme, sky: sky, Idle: Idle, mountSettings: mountSettings, PRESETS: PRESETS };
  apply();
})();
