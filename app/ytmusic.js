/* YouTube Music, as a tab of the wallpapers' Spotify player (same card, bands and lists), from your own YouTube account.
   Signing in uses Google's own sign-in (just your app's Client ID, no secret). It reads your playlists and liked songs
   (read-only) and keeps them in the Worlds database, so every wallpaper, Lively included, has your library without
   signing in again. YouTube gives apps no recommendations feed, so "For you" is YouTube's own mixes (radio) started
   from songs you like: those mixes are personal when you are signed in to YouTube in that browser.

   Playback is YouTube's embedded player, shown as the Now band's cover, and needs no sign-in at all. Search (typing)
   uses the sign-in and YouTube's daily allowance. Setting up and signing in happen once, on youtube.html. */
window.YTMusic = (function () {
  'use strict';
  var API = 'https://www.googleapis.com/youtube/v3/', SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
  var LIB = 'yt-library-v1';   // synced through the Worlds database (no secrets in it: names, ids and titles)
  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  var SETUP = window.YT_SETUP_URL || new URL('youtube.html', HERE).href;
  var SIGNIN_HERE = !window.YT_SETUP_URL || new URL(window.YT_SETUP_URL).origin === location.origin;   // Google allows sign-in on this address
  var LIVELY = /[?&]wallpaper\b/.test(location.search) && !/[?&]npsite=1\b/.test(location.search);

  var ICON = {
    prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="12" y="11" width="7" height="6" rx="1"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.8-3.4M14 7h6M17 4l3 3-3 3M17 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mix: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8.5v7l6-3.5z"/></svg>',
    wide: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    narrow: '<svg viewBox="0 0 24 24"><path d="M19 11h-6V5M5 13h6v6M13 11l7-7M11 13l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { } }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function cid() { try { return localStorage.getItem('yt-client') || ''; } catch (e) { return ''; } }
  function thumb(v) { return 'https://i.ytimg.com/vi/' + encodeURIComponent(v) + '/mqdefault.jpg'; }
  function library() { var l = read(LIB); return l && typeof l === 'object' ? l : null; }

  /* ---------- signing in: Google's own sign-in window gives a read-only pass for an hour; it is kept in this browser only ---------- */
  var gisP = null;
  function gis() {
    if (gisP) return gisP;
    gisP = new Promise(function (res, rej) {
      if (window.google && google.accounts && google.accounts.oauth2) { res(); return; }
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { res(); }; s.onerror = function () { gisP = null; rej(new Error('Could not reach Google sign-in')); };
      document.head.appendChild(s);
    });
    return gisP;
  }
  function token() { var t = read('yt-token'); return t && t.access && Date.now() < t.exp ? t.access : ''; }
  // needs a click (it opens Google's window); prompt '' lets an account already allowed through without asking again
  function signIn(prompt) {
    if (!SIGNIN_HERE) {   // the widget: sign in on the YouTube page, which opens in its own window
      if (window.desktop) window.desktop.window.openSetup(SETUP); else location.href = SETUP;
      return Promise.reject(new Error('Sign in on the YouTube page (it just opened), then try again'));
    }
    if (!cid()) return Promise.reject(new Error('Add your Client ID on the YouTube page first'));
    return gis().then(function () {
      return new Promise(function (res, rej) {
        var c = google.accounts.oauth2.initTokenClient({
          client_id: cid(), scope: SCOPE, prompt: prompt == null ? '' : prompt,
          callback: function (r) { if (r.error) { rej(new Error(r.error_description || r.error)); return; } store('yt-token', { access: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 }); res(r.access_token); },
          error_callback: function (e) { rej(new Error(e && e.type === 'popup_closed' ? 'The Google window was closed' : (e && e.message) || 'Sign-in did not finish')); }
        });
        c.requestAccessToken();
      });
    });
  }
  function signedIn() { return !!library(); }
  function disconnect() { var t = token(); store('yt-token', null); store(LIB, null); if (t && window.google && google.accounts) try { google.accounts.oauth2.revoke(t); } catch (e) { } }
  function api(path, tok) {
    return fetch(API + path, { headers: { Authorization: 'Bearer ' + tok } }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error && j.error.message) || ('HTTP ' + r.status)); e.status = r.status; e.reason = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason; throw e; }
        return j;
      });
    });
  }
  function withToken(fn, prompt) { var t = token(); return (t ? Promise.resolve(t) : signIn(prompt)).then(fn); }
  // the library: your playlists (with up to 50 song ids each) and liked songs, kept small enough for the database
  function fetchLibrary(prompt) {
    return withToken(function (tok) {
      return Promise.all([
        api('playlists?part=snippet,contentDetails&mine=true&maxResults=50', tok),
        api('playlistItems?part=snippet&maxResults=50&playlistId=LL', tok).catch(function () { return { items: [] }; })
      ]).then(function (r) {
        var pls = (r[0].items || []).map(function (p) {
          var th = p.snippet && p.snippet.thumbnails, m = th && (th.medium || th.default);
          return { id: p.id, t: p.snippet.title, n: p.contentDetails ? p.contentDetails.itemCount : null, th: m ? m.url : '' };
        });
        var liked = (r[1].items || []).map(function (x) { var sn = x.snippet || {}; return { v: sn.resourceId && sn.resourceId.videoId, t: sn.title, c: (sn.videoOwnerChannelTitle || '').replace(/ - Topic$/, '') }; })
          .filter(function (x) { return x.v && x.t !== 'Deleted video' && x.t !== 'Private video'; });
        return Promise.all(pls.slice(0, 15).map(function (p) {
          return api('playlistItems?part=contentDetails&maxResults=50&playlistId=' + encodeURIComponent(p.id), tok).then(function (j) { return (j.items || []).map(function (x) { return x.contentDetails && x.contentDetails.videoId; }).filter(Boolean); }, function () { return []; });
        })).then(function (ids) {
          var lib = { t: Date.now(), pls: pls, liked: liked, items: {} };
          pls.slice(0, 15).forEach(function (p, i) { lib.items[p.id] = ids[i]; });
          while (JSON.stringify(lib).length > 60000 && lib.liked.length > 10) lib.liked.pop();
          Object.keys(lib.items).forEach(function (k) { while (JSON.stringify(lib).length > 60000 && lib.items[k].length > 10) lib.items[k] = lib.items[k].slice(0, -5); });
          store(LIB, lib);
          return lib;
        });
      });
    }, prompt);
  }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 90 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }

  /* ---------- YouTube's embedded player ---------- */
  var apiP = null;
  function ytApi() {
    if (apiP) return apiP;
    apiP = new Promise(function (res, rej) {
      if (window.YT && YT.Player) { res(); return; }
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) { } res(); };
      var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
      s.onerror = function () { apiP = null; rej(new Error('Could not reach YouTube')); };
      document.head.appendChild(s);
    });
    return apiP;
  }

  /* mount(container, host): YouTube Music as a tab of the Spotify player, in the same layout (the same small card,
     bands and lists). host: { setBig(on), isBig(), toggleWide(), isWide(), pauseOther(), canPip, pipHost, openFull(), onChange() } */
  function mount(root, host) {
    root.innerHTML = '<div class="np-mini"><img class="np-art" alt=""><div class="np-txt"><b class="np-t"><span>YouTube Music</span></b><span class="np-a"></span></div>' +
      '<div class="np-btns"><button type="button" class="np-prev" aria-label="Previous">' + ICON.prev + '</button><button type="button" class="np-play" aria-label="Play">' + ICON.play + '</button>' +
      '<button type="button" class="np-next" aria-label="Next">' + ICON.next + '</button><button type="button" class="np-pip" aria-label="Small window" title="Small window: a little player that stays on top">' + ICON.pip + '</button>' +
      '<button type="button" class="np-wide" aria-label="Expand" title="Expand">' + ICON.wide + '</button><button type="button" class="np-exp" aria-label="More" aria-expanded="false">' + ICON.open + '</button></div>' +
      '<span class="np-line" aria-hidden="true"><i></i></span></div>' +
      '<div class="np-more"><div class="np-bands" role="tablist" aria-label="YouTube Music">' +
      [['now', 'Now'], ['you', 'For you'], ['pl', 'Playlists'], ['search', 'Search']].map(function (b, i) { return '<button type="button" role="tab" data-p="' + b[0] + '" aria-selected="' + (i ? 'false' : 'true') + '">' + b[1] + '</button>'; }).join('') + '</div>' +
      '<section class="np-pane on" data-pane="now" role="tabpanel" aria-label="Now"><div class="np-hero yt-vid"><div class="yt-ph"><span>' + ICON.mix + '<em>Pick a mix or a playlist</em></span></div></div>' +
      '<div class="np-acts"><button type="button" class="yt-mixnow">' + ICON.mix + 'Mix from this song</button><button type="button" class="yt-shuf">' + ICON.shuffle + 'Shuffle my likes</button></div>' +
      '<div class="np-foot"><span class="yt-ch"></span><a class="np-link yt-link" target="_blank" rel="noopener" href="https://music.youtube.com">Open in YouTube Music ↗</a></div><div class="np-acts np-shares" hidden><button type="button" class="yt-share">' + ICON.share + 'Share to Discord</button></div></section>' +
      '<section class="np-pane" data-pane="you" role="tabpanel" aria-label="For you"><ul class="np-list yt-yl"></ul></section>' +
      '<section class="np-pane" data-pane="pl" role="tabpanel" aria-label="Playlists"><ul class="np-list yt-pl"></ul><div class="np-foot"><span class="yt-when"></span><span class="np-acts"><button type="button" class="yt-refresh">' + ICON.redo + 'Refresh library</button></span></div></section>' +
      '<section class="np-pane" data-pane="search" role="tabpanel" aria-label="Search"><form class="np-gform yt-sform"><input type="search" class="np-q" placeholder="Songs, artists…" aria-label="Search YouTube Music" autocomplete="off" spellcheck="false"><button type="submit">Search</button></form><ul class="np-list yt-sl"></ul></section></div>';
    function $(c) { return root.querySelector(c); }
    function $$(c) { return Array.prototype.slice.call(root.querySelectorAll(c)); }
    var NOTE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#3a1418"/><circle cx="20" cy="20" r="11" fill="none" stroke="#ff8a84" stroke-width="2"/><path d="M17 15v10l8-5z" fill="#ff8a84"/></svg>');
    $('.np-art').src = NOTE; $('.np-art').onerror = function () { if (this.getAttribute('src') !== NOTE) this.src = NOTE; };
    var player = null, ready = null, playing = false, cur = null, pane = 'now';

    var flashT = 0;
    function flash(msg, ok) { var a = $('.np-a'); clearTimeout(flashT); a.textContent = msg; a.classList.add('fl'); a.classList.toggle('bad', !ok); flashT = setTimeout(function () { a.classList.remove('fl', 'bad'); paint(); }, 4500); }

    function getPlayer() {   // made on first use, inside the Now band's cover
      if (ready) return ready;
      ready = ytApi().then(function () {
        return new Promise(function (res) {
          var holder = el('div'); $('.yt-vid').appendChild(holder);
          player = new YT.Player(holder, {
            width: '100%', height: '100%', playerVars: { playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin },
            events: {
              onReady: function () { var ph = $('.yt-ph'); if (ph) ph.remove(); res(player); },
              onStateChange: function (e) { playing = e.data === 1; if (playing) host.pauseOther(); paint(); if (playing) keep(); },
              onError: function (e) { flash(e.data === 101 || e.data === 150 ? 'That one cannot play outside YouTube: skipping' : 'YouTube could not play that: skipping'); setTimeout(function () { try { player.nextVideo(); } catch (er) { } }, 1200); }
            }
          });
        });
      }, function (e) { ready = null; flash(e.message); throw e; });
      return ready;
    }
    var lastEmit = null;
    function trackObj() {
      var d = player && player.getVideoData ? player.getVideoData() : null; if (!d || !d.video_id) return null;
      var cur2 = player.getCurrentTime ? player.getCurrentTime() || 0 : 0, dur = player.getDuration ? player.getDuration() || 0 : 0;
      return { source: 'youtube', id: d.video_id, title: d.title || '', artist: (d.author || '').replace(/ - Topic$/, ''), album: 'YouTube Music',
        art: 'https://i.ytimg.com/vi/' + d.video_id + '/hqdefault.jpg', url: 'https://music.youtube.com/watch?v=' + d.video_id, playing: playing, start: Date.now() - cur2 * 1000, duration: dur * 1000 };
    }
    function emitTrack() {
      var t = trackObj(), id = t ? t.id : '', on = !!(t && playing);
      if (lastEmit && lastEmit.id === id && lastEmit.on === on && (!t || Math.abs(lastEmit.start - t.start) < 4000)) return;
      lastEmit = { id: id, on: on, start: t ? t.start : 0 };
      window.dispatchEvent(new CustomEvent('np:track', { detail: t || { source: 'youtube', playing: false } }));
    }
    function paint() {
      root.classList.toggle('playing', playing);
      var p = $('.np-play'); p.innerHTML = playing ? ICON.pause : ICON.play; p.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      var d = player && player.getVideoData ? player.getVideoData() : null, fl = $('.np-a').classList.contains('fl');
      if (d && d.video_id) {
        cur = d; $('.np-t span').textContent = d.title || 'YouTube Music';
        var who = (d.author || '').replace(/ - Topic$/, '');
        if (!fl) $('.np-a').textContent = who;
        $('.yt-ch').textContent = who; $('.yt-link').href = 'https://music.youtube.com/watch?v=' + encodeURIComponent(d.video_id);
        var t = thumb(d.video_id); if ($('.np-art').getAttribute('src') !== t) $('.np-art').src = t;
      } else if (!fl) $('.np-a').textContent = library() ? 'Pick a mix or a playlist' : (LIVELY ? 'Set up on the YouTube page in your PC\'s browser' : 'Set up on the YouTube page');
      $('.yt-mixnow').hidden = !(cur && cur.video_id);
      var lib = library(); $('.yt-shuf').hidden = !(lib && lib.liked.length);
      pipPaint(); if (host.onChange) host.onChange(); emitTrack();
    }
    setInterval(function () {   // progress
      if (!player || !player.getDuration) return; var d = player.getDuration(), t = player.getCurrentTime();
      var pc = d ? Math.min(100, t / d * 100).toFixed(2) + '%' : '0';
      $('.np-line i').style.width = pc; if (pipWin) pipWin.document.querySelector('.bar i').style.width = pc;
    }, 500);
    // where you were, so a restart (Lively, the rotation) can carry on with the same mix or playlist
    function keep() {
      if (!player || !player.getPlaylistIndex) return;
      var last = read('yt-last') || {}; last.i = player.getPlaylistIndex(); last.s = Math.floor(player.getCurrentTime() || 0); store('yt-last', last);
    }
    setInterval(function () { if (playing) keep(); }, 10000);
    function start(src, label, at) {   // src: { ids: [...] } or { list: 'PL…' / 'RD…' }; at: where in it to start
      at = at || 0; store('yt-last', { src: src, i: at, s: 0 });
      return getPlayer().then(function (p) {
        if (src.ids) p.loadPlaylist(src.ids, at); else p.loadPlaylist({ list: src.list, listType: 'playlist', index: at });
        setTimeout(function () { try { p.setShuffle(!!src.shuffle); if (src.shuffle) p.playVideoAt(0); } catch (e) { } }, 900);
        flash('Playing ' + label, true); return true;
      }, function () { return false; });
    }
    function startFull(src, label, at) { start(src, label, at).then(function (ok) { if (ok && host.openFull) host.openFull(); }); }

    // lists, in the same rows as Spotify's
    function list(ul, rows) {
      ul.textContent = '';
      rows.forEach(function (r) {
        var li = el('li');
        if (r.head) { li.className = 'np-head'; li.textContent = r.head; ul.appendChild(li); return; }
        if (r.bar) {
          li.className = 'np-bar'; var top = el('div', 'np-bt'), bk = el('button', 'np-back'); bk.type = 'button'; bk.innerHTML = ICON.back; bk.setAttribute('aria-label', 'Back'); bk.title = 'Back'; bk.addEventListener('click', r.back);
          top.appendChild(bk); top.appendChild(el('b', null, r.bar)); li.appendChild(top);
          var acts = el('div', 'np-acts'); r.acts.forEach(function (a) { var ab = el('button'); ab.type = 'button'; ab.innerHTML = a[1]; ab.appendChild(document.createTextNode(a[0])); ab.addEventListener('click', a[2]); acts.appendChild(ab); }); li.appendChild(acts);
          ul.appendChild(li); return;
        }
        if (r.empty != null) {
          li.className = 'np-empty'; li.textContent = r.empty;
          if (r.setup) { li.appendChild(document.createTextNode(' ')); var a = el('a', null, 'YouTube page ↗'); a.href = SETUP + '?back=' + encodeURIComponent((window.top || window).location.href); a.target = '_top'; li.appendChild(a); }
          ul.appendChild(li); return;
        }
        var b = el('button', 'np-item'); b.type = 'button'; b.setAttribute('aria-label', 'Play ' + r.t); b.addEventListener('click', r.go);
        if (r.icon) { var ic = el('span', 'np-ico'); ic.innerHTML = r.icon; b.appendChild(ic); }
        else { var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.onerror = function () { this.removeAttribute('src'); }; if (r.img) im.src = r.img; b.appendChild(im); }
        var tx = el('span', 'np-it'); tx.appendChild(el('b', null, r.t)); tx.appendChild(el('small', null, r.s || '')); b.appendChild(tx); li.appendChild(b);
        if (r.full) { var fu = el('button', 'np-add'); fu.type = 'button'; fu.innerHTML = ICON.full; fu.setAttribute('aria-label', 'Play ' + r.t + ' in the full view'); fu.title = 'Full view'; fu.addEventListener('click', r.full); li.appendChild(fu); }
        ul.appendChild(li);
      });
    }
    function noLib(ul) { list(ul, [{ empty: LIVELY ? 'Sign in on the YouTube page in your PC\'s browser: your library then shows up here by itself.' : 'Sign in once to bring in your playlists and liked songs.', setup: !LIVELY }]); }
    function likedIds(lib) { return lib.liked.map(function (x) { return x.v; }); }
    // For you: liked songs, and YouTube's own mixes started from them (personal when you are signed in to YouTube here)
    function fillYou() {
      var lib = library(), ul = $('.yt-yl'); if (!lib) return noLib(ul);
      var rows = [];
      if (lib.liked.length) {
        rows.push({ head: 'Your likes' });
        rows.push({ t: 'Liked songs, shuffled', s: lib.liked.length + ' songs', icon: ICON.shuffle, go: function () { start({ ids: likedIds(lib), shuffle: true }, 'your liked songs'); } });
        if (cur && cur.video_id) rows.push({ t: 'Mix from this song', s: cur.title, icon: ICON.mix, go: function () { start({ list: 'RD' + cur.video_id }, 'a mix from ' + cur.title); } });
        rows.push({ head: 'Mixes from songs you like' });
        lib.liked.slice(0, 12).forEach(function (x) { rows.push({ t: 'Mix · ' + x.t, s: x.c || 'YouTube mix', img: thumb(x.v), go: function () { start({ list: 'RD' + x.v }, 'a mix from ' + x.t); }, full: function () { startFull({ list: 'RD' + x.v }, 'a mix from ' + x.t); } }); });
      } else rows.push({ empty: 'Like some songs on YouTube Music and their mixes appear here.' });
      list(ul, rows);
    }
    function openPl(e, name, ids, src, known) {
      var ul = e && e.currentTarget && e.currentTarget.closest('ul'); if (!ul) { start(src, name); return; }
      var keep = document.createDocumentFragment(), top = ul.scrollTop; while (ul.firstChild) keep.appendChild(ul.firstChild);
      function back() { ul.textContent = ''; ul.appendChild(keep); ul.scrollTop = top; }
      var bar = { bar: name, back: back, acts: [['Play', ICON.play, function () { start(src, name); }], ['Shuffle', ICON.shuffle, function () { start(Object.assign({}, src, { shuffle: true }), name); }], ['Full view', ICON.full, function () { startFull(src, name); }]] };
      function rows(titles) {
        list(ul, [bar].concat(ids.length ? ids.map(function (v, i) {
          var k = titles[v] || {};
          return { t: k.t || 'Song ' + (i + 1), s: k.c || '', img: thumb(v), go: function () { start(src, name, i); }, full: function () { startFull(src, name, i); } };
        }) : [{ empty: 'No songs saved for this playlist yet: press Play, or Refresh library.' }]));
      }
      var titles = known || {}; rows(titles); ul.scrollTop = 0;
      var tok = token(), missing = ids.filter(function (v) { return !titles[v]; });
      if (tok && missing.length && src.list) {   // names for the songs, while the sign-in lasts
        api('playlistItems?part=snippet&maxResults=50&playlistId=' + encodeURIComponent(src.list), tok).then(function (j) {
          (j.items || []).forEach(function (x) { var sn = x.snippet || {}, v = sn.resourceId && sn.resourceId.videoId; if (v) titles[v] = { t: sn.title, c: (sn.videoOwnerChannelTitle || '').replace(/ - Topic$/, '') }; });
          if (ul.querySelector('.np-bar')) rows(titles);
        }, function () { });
      }
    }
    function fillPl() {
      var lib = library(), ul = $('.yt-pl'); $('.yt-when').textContent = lib ? 'Updated ' + ago(lib.t) : '';
      $('.yt-refresh').hidden = LIVELY; if (!lib) return noLib(ul);
      var rows = [{ head: 'Your playlists' }];
      if (lib.liked.length) {
        var lk = {}; lib.liked.forEach(function (x) { lk[x.v] = { t: x.t, c: x.c }; });
        rows.push({ t: 'Liked songs', s: lib.liked.length + ' songs', img: thumb(lib.liked[0].v), go: function (e) { openPl(e, 'Liked songs', likedIds(lib), { ids: likedIds(lib) }, lk); }, full: function () { startFull({ ids: likedIds(lib) }, 'your liked songs'); } });
      }
      lib.pls.forEach(function (p) {
        var ids = lib.items[p.id] || [], src = ids.length ? { ids: ids, list: p.id } : { list: p.id };
        rows.push({ t: p.t, s: p.n != null ? p.n + ' songs' : 'Playlist', img: p.th, go: function (e) { openPl(e, p.t, ids, src); }, full: function () { startFull(src, p.t); } });
      });
      if (rows.length === 1) rows.push({ empty: 'No playlists yet.' });
      list(ul, rows);
    }
    function fill(p) {
      if (!host.isBig()) return; p = p || pane;
      if (p === 'you') fillYou(); else if (p === 'pl') fillPl();
      else if (p === 'search' && !$('.yt-sl').firstChild) list($('.yt-sl'), [{ empty: 'Search YouTube Music. A result plays, then a mix carries on from it.' }]);
    }
    $('.yt-refresh').addEventListener('click', function () {
      $('.yt-when').textContent = 'Updating…';
      fetchLibrary('').then(function () { fillPl(); flash('Library updated', true); }, function (e) { $('.yt-when').textContent = e.message; });
    });
    $('.yt-mixnow').addEventListener('click', function () { if (cur && cur.video_id) start({ list: 'RD' + cur.video_id }, 'a mix from ' + cur.title); });
    $('.yt-shuf').addEventListener('click', function () { var lib = library(); if (lib && lib.liked.length) start({ ids: likedIds(lib), shuffle: true }, 'your liked songs'); });
    // Search: typed, uses the sign-in (and YouTube's daily allowance); a result plays and its mix carries on
    $('.yt-sform').addEventListener('submit', function (e) {
      e.preventDefault(); var q = $('.yt-sform input').value.trim(), ul = $('.yt-sl'); if (q.length < 2) return;
      list(ul, [{ empty: 'Searching…' }]);
      withToken(function (tok) { return api('search?part=snippet&type=video&videoCategoryId=10&maxResults=12&q=' + encodeURIComponent(q), tok); }, '').then(function (j) {
        var rows = (j.items || []).filter(function (x) { return x.id && x.id.videoId; }).map(function (x) {
          var v = x.id.videoId, t = el('textarea'); t.innerHTML = x.snippet.title; var title = t.value;   // YouTube sends titles HTML-escaped
          return { t: title, s: (x.snippet.channelTitle || '').replace(/ - Topic$/, ''), img: thumb(v), go: function () { start({ list: 'RD' + v }, title); }, full: function () { startFull({ list: 'RD' + v }, title); } };
        });
        list(ul, rows.length ? rows : [{ empty: 'Nothing found for “' + q + '”.' }]);
      }).catch(function (er) { list(ul, [{ empty: er.reason === 'quotaExceeded' ? 'YouTube\'s daily search allowance is used up: try again tomorrow.' : er.message, setup: /Client ID/.test(er.message) }]); });
    });

    function setPane(p) {
      pane = p;
      $$('.np-bands button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-p') === p)); });
      $$('.np-pane').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-pane') === p); });
      fill(p);
    }
    $$('.np-bands button').forEach(function (b) { b.addEventListener('click', function () { setPane(b.getAttribute('data-p')); }); });
    // the opened / wide state is the player's own, shared with the Spotify tab
    function sync() {
      var big = host.isBig(), b = $('.np-exp'), w = $('.np-wide'), wide = host.isWide();
      b.innerHTML = big ? ICON.close : ICON.open; b.setAttribute('aria-expanded', String(big)); b.setAttribute('aria-label', big ? 'Less' : 'More');
      w.innerHTML = wide ? ICON.narrow : ICON.wide; w.setAttribute('aria-label', wide ? 'Make narrower' : 'Expand'); w.title = w.getAttribute('aria-label');
    }
    $('.np-exp').addEventListener('click', function () { host.setBig(!host.isBig()); });
    $('.np-wide').addEventListener('click', function () { host.toggleWide(); });

    $('.np-play').addEventListener('click', function () {
      if (!player) {   // nothing loaded yet: carry on from last time, or open the choices
        var last = read('yt-last');
        if (last && last.src) getPlayer().then(function (p) { if (last.src.ids) p.loadPlaylist(last.src.ids, last.i || 0, last.s || 0); else p.loadPlaylist({ list: last.src.list, listType: 'playlist', index: last.i || 0, startSeconds: last.s || 0 }); });
        else { host.setBig(true); setPane('you'); }
        return;
      }
      if (playing) player.pauseVideo(); else player.playVideo();
    });
    $('.np-next').addEventListener('click', function () { if (player) player.nextVideo(); });
    if (window.desktop && window.desktop.discord) {
      $('.np-shares').hidden = false;
      $('.yt-share').addEventListener('click', function () {
        var t = trackObj(); if (!t) { flash('Nothing playing to share'); return; }
        window.desktop.discord.share(t).then(function (r) { flash(r && r.ok ? 'Shared to Discord: ' + t.title : 'Discord: ' + (r && r.error || 'could not share'), r && r.ok); });
      });
    }
    $('.np-art').addEventListener('click', function () { if (host.openFull) host.openFull(); });
    $('.np-prev').addEventListener('click', function () { if (player) player.previousVideo(); });

    /* the small window: the browser's picture-in-picture window with the controls (the video stays on the page) */
    var pipWin = null;
    var PIPCSS = 'html,body{margin:0;height:100%;background:#07070d;color:#f5f3ff;font:500 13px/1.35 "Chakra Petch","Trebuchet MS",system-ui,sans-serif;overflow:hidden}' +
      '.pp{position:relative;height:100%;display:grid;grid-template-rows:minmax(0,1fr) auto auto auto;gap:10px;padding:14px;box-sizing:border-box}' +
      '.bg{position:absolute;inset:-20%;width:140%;height:140%;object-fit:cover;filter:blur(40px) saturate(1.4);opacity:.5;pointer-events:none}.bg:not([src]){display:none}.pp>*:not(.bg){position:relative}' +
      '.cv{width:100%;height:100%;min-height:0;object-fit:contain;filter:drop-shadow(0 12px 28px rgba(0,0,0,.5))}.cv:not([src]){visibility:hidden}' +
      '.tx{display:grid;min-width:0;text-align:center}.tx b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tx span{color:rgba(245,243,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bar{height:3px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden}.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,transparent,#ff4e45);box-shadow:0 0 8px #ff4e45}' +
      '.ct{display:flex;justify-content:center;align-items:center;gap:6px}button{font:inherit;color:inherit;background:none;border:0;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer}' +
      'button:hover{background:rgba(255,255,255,.14)}button:focus-visible{outline:2px solid #ff4e45}button svg{width:19px;height:19px;fill:currentColor}.play{width:48px;height:48px;background:#f5f3ff;color:#111}.play:hover{background:#fff}' +
      '@media (max-height:190px){.cv{display:none}.pp{grid-template-rows:1fr auto auto auto}}';
    function pipPaint() {
      if (!pipWin) return; var d = pipWin.document, v = cur && cur.video_id;
      ['.cv', '.bg'].forEach(function (c) { var im = d.querySelector(c); if (v) { var u = 'https://i.ytimg.com/vi/' + v + '/hqdefault.jpg'; if (im.getAttribute('src') !== u) im.src = u; } else im.removeAttribute('src'); });
      d.querySelector('.tx b').textContent = cur && cur.title || 'YouTube Music';
      d.querySelector('.tx span').textContent = cur ? (cur.author || '').replace(/ - Topic$/, '') : 'Pick a mix on the page';
      var p = d.querySelector('.play'); p.innerHTML = playing ? ICON.pause : ICON.play; p.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      d.title = cur && cur.title ? cur.title + ' · Worlds' : 'YouTube Music';
    }
    $('.np-pip').addEventListener('click', function () {
      if (!host.canPip) return;
      if (pipWin) { pipWin.close(); return; }
      host.pipHost.documentPictureInPicture.requestWindow({ width: 320, height: 380 }).then(function (w) {
        pipWin = w; var d = w.document;
        Array.prototype.forEach.call(document.querySelectorAll('link[rel=stylesheet][href*="fonts.googleapis"]'), function (l) { d.head.appendChild(l.cloneNode()); });
        var s2 = d.createElement('style'); s2.textContent = PIPCSS; d.head.appendChild(s2);
        d.body.innerHTML = '<div class="pp"><img class="bg" alt=""><img class="cv" alt=""><div class="tx"><b></b><span></span></div><div class="bar"><i></i></div><div class="ct">' +
          '<button type="button" class="prev" aria-label="Previous">' + ICON.prev + '</button><button type="button" class="play" aria-label="Play">' + ICON.play + '</button>' +
          '<button type="button" class="next" aria-label="Next">' + ICON.next + '</button><button type="button" class="back" aria-label="Back to the page" title="Back to the page">' + ICON.pip + '</button></div></div>';
        d.querySelector('.play').addEventListener('click', function () { $('.np-play').click(); });
        d.querySelector('.next').addEventListener('click', function () { $('.np-next').click(); });
        d.querySelector('.prev').addEventListener('click', function () { $('.np-prev').click(); });
        d.querySelector('.back').addEventListener('click', function () { w.close(); });
        w.addEventListener('pagehide', function () { pipWin = null; });
        pipPaint();
      }, function (e) { flash('The small window could not open: ' + e.message); });
    });

    // ready from last time: the cover shows the song you stopped on
    var last = read('yt-last');
    if (last && last.src && last.src.ids && last.src.ids[last.i || 0]) { $('.yt-vid').style.backgroundImage = 'url("' + thumb(last.src.ids[last.i || 0]) + '")'; $('.np-art').src = thumb(last.src.ids[last.i || 0]); }
    if (last && last.src) $('.yt-ph em').textContent = 'Press play to carry on';
    window.addEventListener('pagehide', function () { if (pipWin) try { pipWin.close(); } catch (e) { } });
    window.addEventListener('storage', function (e) { if (e.key === LIB) { paint(); fill(); } });   // signed in on the YouTube page in another tab
    paint(); sync();
    return {
      fill: fill, sync: sync, vidEl: $('.yt-vid'),
      info: function () {
        var d = player && player.getVideoData ? player.getVideoData() : null;
        return { title: d && d.title || '', author: d ? (d.author || '').replace(/ - Topic$/, '') : '', vid: d && d.video_id || '', playing: playing,
          cur: player && player.getCurrentTime ? player.getCurrentTime() || 0 : 0, dur: player && player.getDuration ? player.getDuration() || 0 : 0 };
      },
      track: trackObj,
      toggle: function () { $('.np-play').click(); }, next: function () { $('.np-next').click(); }, prev: function () { $('.np-prev').click(); }, pip: function () { $('.np-pip').click(); },
      pause: function () { if (player && playing) try { player.pauseVideo(); } catch (e) { } },
      playing: function () { return playing; }
    };
  }

  return { mount: mount, signIn: signIn, signedIn: signedIn, disconnect: disconnect, fetchLibrary: fetchLibrary, library: library, ago: ago, setup: SETUP,
    clientId: cid, setClientId: function (v) { store('yt-client', v || null); } };
})();
