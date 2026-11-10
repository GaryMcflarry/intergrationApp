/* YouTube as a remote, like the Spotify tab: what plays on YouTube in your browser (Astrum's extension reports it through
   the app, lib/yt-bridge.js), its controls, the queue and YouTube's "Up next". Nothing plays here. Google sign-in gives
   read-only access to your playlists and likes, and the Data API for search; a row you press plays in your browser. */
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
    shuffle: '<svg viewBox="0 0 24 24"><path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.8-3.4M14 7h6M17 4l3 3-3 3M17 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mix: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8.5v7l6-3.5z"/></svg>',
    wide: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    narrow: '<svg viewBox="0 0 24 24"><path d="M19 11h-6V5M5 13h6v6M13 11l7-7M11 13l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { } }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function cid() { try { return localStorage.getItem('yt-client') || ''; } catch (e) { return ''; } }
  function thumb(v) { return 'https://i.ytimg.com/vi/' + encodeURIComponent(v) + '/mqdefault.jpg'; }
  function watchUrl(v) { return 'https://www.youtube.com/watch?v=' + encodeURIComponent(v); }
  function videoLink(value) {
    var url;
    try { url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value); } catch (e) { return ''; }
    var host = url.hostname, path = url.pathname.split('/'), id = '';
    if (host === 'youtu.be') id = path[1];
    if (/^(?:(?:www|m|music)\.)?youtube\.com$/.test(host)) {
      if (path[1] === 'watch') id = url.searchParams.get('v');
      else if (/^(shorts|live|embed)$/.test(path[1])) id = path[2];
    }
    return /^[a-z0-9_-]{11}$/i.test(id || '') ? id : '';
  }
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
  function withToken(fn, prompt) { var t = token(); return (t && prompt !== 'select_account' ? Promise.resolve(t) : signIn(prompt)).then(fn); }
  function playlistSummary(p) {
    var th = p.snippet.thumbnails, m = th && (th.medium || th.default);
    return { id: p.id, t: p.snippet.title, n: p.contentDetails ? p.contentDetails.itemCount : null, th: m ? m.url : '' };
  }
  // The library keeps playlist summaries, recent likes and a small preview cache for an expired sign-in.
  function fetchLibrary(prompt) {
    return withToken(function (tok) {
      return Promise.all([
        api('playlists?part=snippet,contentDetails&mine=true&maxResults=50', tok),
        api('videos?part=snippet,status&myRating=like&maxResults=50', tok).catch(function () { return { items: [] }; })
      ]).then(function (r) {
        var pls = (r[0].items || []).map(playlistSummary);
        var liked = (r[1].items || []).filter(function (x) { return x.id && x.snippet && (!x.status || x.status.embeddable); })
          .map(function (x) { return { v: x.id, t: x.snippet.title, c: x.snippet.channelTitle || '' }; });
        return Promise.all(pls.slice(0, 15).map(function (p) {
          return api('playlistItems?part=contentDetails&maxResults=50&playlistId=' + encodeURIComponent(p.id), tok).then(function (j) { return (j.items || []).map(function (x) { return x.contentDetails && x.contentDetails.videoId; }).filter(Boolean); }, function () { return []; });
        })).then(function (ids) {
          var lib = { t: Date.now(), pls: pls, liked: liked, items: {}, next: r[0].nextPageToken || '' };
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

  /* mount(container, host): YouTube as a tab of the Spotify player, in the same layout (the same small card, bands and
     lists). host: { setBig(on), isBig(), toggleWide(), isWide(), pauseOther(), openFull(), onChange() } */
  function mount(root, host) {
    var remote = window.desktop && window.desktop.yt;   // the app only: a website copy of the player has no browser to reach
    root.innerHTML = '<div class="np-mini"><img class="np-art" alt=""><div class="np-txt"><b class="np-t"><span>YouTube</span></b><span class="np-a"></span></div>' +
      '<div class="np-btns"><button type="button" class="np-prev" aria-label="Previous">' + ICON.prev + '</button><button type="button" class="np-play" aria-label="Play">' + ICON.play + '</button>' +
      '<button type="button" class="np-next" aria-label="Next">' + ICON.next + '</button>' +
      '<button type="button" class="np-wide" aria-label="Expand" title="Expand">' + ICON.wide + '</button><button type="button" class="np-exp" aria-label="More" aria-expanded="false">' + ICON.open + '</button></div>' +
      '<span class="np-line" aria-hidden="true"><i></i></span></div>' +
      '<div class="np-more"><div class="np-bands" role="tablist" aria-label="YouTube">' +
      [['now', 'Now'], ['queue', 'Queue'], ['next', 'Up next'], ['pl', 'Playlists'], ['search', 'Search']].map(function (b, i) { return '<button type="button" role="tab" data-p="' + b[0] + '" aria-selected="' + (i ? 'false' : 'true') + '">' + b[1] + '</button>'; }).join('') + '</div>' +
      '<section class="np-pane on" data-pane="now" role="tabpanel" aria-label="Now"><img class="np-hero yt-cover" alt="" hidden>' +
      '<div class="yt-connect" hidden><b>Connect your browser</b><ol><li>In Chrome, Edge or Brave, open <em>Extensions</em>, turn on <em>Developer mode</em>, choose <em>Load unpacked</em> and pick the <em>extension/youtube</em> folder in Astrum\'s folder.</li>' +
      '<li>Press <em>Copy pairing code</em> below and paste it into the extension\'s popup.</li><li>Play something on youtube.com. It shows up here.</li></ol>' +
      '<div class="np-acts"><button type="button" class="yt-code">' + ICON.share + 'Copy pairing code</button><button type="button" class="yt-newcode">' + ICON.redo + 'New code</button></div></div>' +
      '<div class="np-acts yt-nowacts"><button type="button" class="yt-mixnow">' + ICON.mix + 'Mix from this video</button></div>' +
      '<p class="np-note yt-error" role="status"></p><div class="np-foot"><span class="yt-ch"></span><a class="np-link yt-link" target="_blank" rel="noopener" href="https://www.youtube.com">Open in YouTube ↗</a></div>' +
      '<div class="np-acts np-shares" hidden><button type="button" class="yt-share">' + ICON.share + 'Share to Discord</button></div></section>' +
      '<section class="np-pane" data-pane="queue" role="tabpanel" aria-label="Queue"><ul class="np-list yt-ql"></ul></section>' +
      '<section class="np-pane" data-pane="next" role="tabpanel" aria-label="Up next"><ul class="np-list yt-nl"></ul></section>' +
      '<section class="np-pane" data-pane="pl" role="tabpanel" aria-label="Playlists"><ul class="np-list yt-pl"></ul><div class="np-foot"><span class="yt-when"></span><span class="np-acts"><button type="button" class="yt-refresh">' + ICON.redo + 'Refresh library</button></span></div></section>' +
      '<section class="np-pane" data-pane="search" role="tabpanel" aria-label="Search"><form class="np-gform yt-sform"><input type="search" class="np-q" placeholder="Search or paste a video link" aria-label="Search YouTube or paste a video link" autocomplete="off" spellcheck="false"><button type="submit">Search</button></form><ul class="np-list yt-sl"></ul></section></div>';
    function $(c) { return root.querySelector(c); }
    function $$(c) { return Array.prototype.slice.call(root.querySelectorAll(c)); }
    var NOTE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#3a1418"/><circle cx="20" cy="20" r="11" fill="none" stroke="#ff8a84" stroke-width="2"/><path d="M17 15v10l8-5z" fill="#ff8a84"/></svg>');
    $('.np-art').src = NOTE; $('.np-art').onerror = function () { if (this.getAttribute('src') !== NOTE) this.src = NOTE; };
    // what the browser's YouTube tab plays (lib/yt-bridge.js's shape), and when it was heard
    // via: 'extension' (all of it), or 'system' (the computer's media controls: what plays and the buttons, nothing else)
    var S = { connected: false, via: '', video: '', title: '', channel: '', playing: false, position: 0, duration: 0, volume: null, list: '', index: -1, queue: [], upNext: [] };
    var heard = Date.now(), pane = 'now', wasPlaying = false;

    var flashT = 0;
    function flash(msg, ok) { var a = $('.np-a'); clearTimeout(flashT); a.textContent = msg; a.classList.add('fl'); a.classList.toggle('bad', !ok); flashT = setTimeout(function () { a.classList.remove('fl', 'bad'); paint(); }, 4500); }
    function position() { return Math.min(S.duration || Infinity, S.position + (S.playing ? (Date.now() - heard) / 1000 : 0)); }
    function cmd(name, arg) {
      if (!remote) { flash('Open Astrum on your computer to control YouTube'); return; }
      if (!S.connected) { flash('Connect your browser first'); setPane('now'); host.setBig(true); return; }
      remote.command(name, arg).then(function (ok) { if (!ok) flash('Your browser did not answer. Is the YouTube tab still open?'); });
    }
    // plays in your browser's YouTube tab; with no tab connected, in a new one of your default browser
    function start(src, label) {
      var arg = { v: src.video || (src.ids && src.ids[src.at || 0]) || '', list: src.list || '', index: src.list && src.at ? src.at : undefined };
      if (!remote) { if (arg.v) window.open(watchUrl(arg.v), '_blank', 'noopener'); return; }
      if (S.connected && S.via === 'extension') { remote.command('open', arg).then(function (ok) { flash(ok ? 'Playing ' + label + ' in your browser' : 'Your browser did not answer', ok); }); return; }
      remote.openExternal(arg).then(function (ok) { flash(ok ? 'Opened ' + label + ' in your browser' : 'Could not open your browser', ok); });
    }

    var lastEmit = null;
    function playingSomething() { return S.connected && !!(S.video || S.title); }
    function trackObj() {
      if (!playingSomething()) return null;
      return { source: 'youtube', id: S.video || 'system:' + S.title, title: S.title || 'YouTube video', artist: S.channel || '', album: 'YouTube',
        art: S.video ? 'https://i.ytimg.com/vi/' + encodeURIComponent(S.video) + '/hqdefault.jpg' : '', url: S.video ? watchUrl(S.video) : '', playing: S.playing,
        audio: S.playing && S.volume !== 0, start: Date.now() - position() * 1000, duration: S.duration * 1000 };
    }
    function emitTrack() {
      var t = trackObj(), id = t ? t.id : '', on = !!(t && t.playing);
      if (lastEmit && lastEmit.id === id && lastEmit.on === on && lastEmit.audio === !!(t && t.audio) && (!t || Math.abs(lastEmit.start - t.start) < 4000)) return;
      lastEmit = { id: id, on: on, audio: !!(t && t.audio), start: t ? t.start : 0 };
      window.dispatchEvent(new CustomEvent('np:track', { detail: t || { source: 'youtube', playing: false } }));
    }
    function paint() {
      var on = playingSomething(), fl = $('.np-a').classList.contains('fl');
      root.classList.toggle('playing', on && S.playing);
      root.classList.toggle('yt-empty', !on);
      var p = $('.np-play'); p.innerHTML = S.playing ? ICON.pause : ICON.play; p.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
      $('.np-t span').textContent = on ? S.title || 'YouTube video' : 'YouTube';
      if (!fl) $('.np-a').textContent = on ? S.channel : !remote ? 'Open Astrum on your computer' : S.connected ? 'Play something on YouTube in your browser' : 'Connect your browser';
      var t = on && S.video ? thumb(S.video) : NOTE; if ($('.np-art').getAttribute('src') !== t) $('.np-art').src = t;
      var cover = $('.yt-cover'), big = on && S.video ? 'https://i.ytimg.com/vi/' + encodeURIComponent(S.video) + '/hqdefault.jpg' : '';
      cover.hidden = !big; if (big && cover.getAttribute('src') !== big) cover.src = big;
      $('.yt-connect').hidden = !remote || (S.connected && S.via === 'extension');   // the system's controls: the extension still adds more
      $('.yt-nowacts').hidden = !(on && S.video);
      $('.yt-ch').textContent = on ? S.channel : '';
      $('.yt-link').href = on && S.video ? watchUrl(S.video) : 'https://www.youtube.com';
      $('.yt-error').textContent = on && S.via === 'system' ? 'Seen through your computer\'s media controls. Connect the browser extension for the queue and suggestions.' : '';
      if (host.onChange) host.onChange(); emitTrack();
    }
    setInterval(function () {   // progress
      var pc = S.connected && S.duration ? Math.min(100, position() / S.duration * 100).toFixed(2) + '%' : '0';
      $('.np-line i').style.width = pc;
      emitTrack();
    }, 500);
    function update(s) {
      if (!s || typeof s !== 'object') return;
      var listsBefore = JSON.stringify([S.connected, S.video, S.list, S.queue, S.upNext]);
      S = s; heard = Date.now();
      if (S.playing && !wasPlaying) host.pauseOther();   // YouTube started: Spotify pauses
      wasPlaying = S.playing;
      paint();
      if (listsBefore !== JSON.stringify([S.connected, S.video, S.list, S.queue, S.upNext]) && (pane === 'queue' || pane === 'next')) fill(pane);
    }
    if (remote) { remote.onState(update); remote.state().then(update); }

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
        var b = el('button', 'np-item'); b.type = 'button'; b.setAttribute('aria-label', r.verb ? r.t : 'Play ' + r.t); b.addEventListener('click', r.go);
        if (r.on) b.setAttribute('aria-current', 'true');
        if (r.icon) { var ic = el('span', 'np-ico'); ic.innerHTML = r.icon; b.appendChild(ic); }
        else { var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.onerror = function () { this.removeAttribute('src'); }; if (r.img) im.src = r.img; b.appendChild(im); }
        var tx = el('span', 'np-it'); tx.appendChild(el('b', null, r.t)); tx.appendChild(el('small', null, r.s || '')); b.appendChild(tx); li.appendChild(b);
        ul.appendChild(li);
      });
    }
    function noLib(ul) { list(ul, [{ empty: LIVELY ? 'Sign in on the YouTube page in your PC\'s browser to bring in your library.' : 'Sign in to bring in your playlists and liked videos.', setup: !LIVELY }]); }
    function likedIds(lib) { return lib.liked.map(function (x) { return x.v; }); }
    function videoRow(v, title, channel, src) {
      return { t: title, s: channel, img: thumb(v), go: function () { start(src || { video: v }, title); } };
    }
    function dataError(e) {
      if (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded') return { empty: 'The YouTube Data API quota is used up for now.' };
      var needsSignIn = e.status === 401 || !token();
      return { empty: needsSignIn ? 'Sign in to YouTube in your browser, then try again.' : e.message, setup: needsSignIn && !LIVELY };
    }
    function notHere(ul) {
      list(ul, [{ empty: !remote ? 'Open Astrum on your computer to see what plays in your browser.' : S.connected ? 'Your computer\'s media controls do not tell the queue or suggestions. Connect the browser extension on the Now band to see them.' : 'Connect your browser on the Now band to see this.' }]);
    }
    // Queue: what plays, then the rest of its playlist or mix; pressing one plays it
    function fillQueue() {
      var ul = $('.yt-ql');
      if (!S.connected || S.via !== 'extension') { notHere(ul); return; }
      var rows = [];
      if (S.video) rows.push({ head: 'Playing now' }, { t: S.title || 'YouTube video', s: S.channel, img: thumb(S.video), on: true, go: function () { cmd('toggle'); } });
      rows.push({ head: S.list ? 'Next in this playlist' : 'Up next' });
      if (S.queue.length) S.queue.forEach(function (x) { rows.push(videoRow(x.v, x.t, x.c, S.list ? { video: x.v, list: S.list } : null)); });
      else rows.push({ empty: S.list ? 'Nothing after this one in the playlist.' : 'Nothing queued. Play a playlist or a mix to see what comes next.' });
      list(ul, rows);
    }
    // Up next: YouTube's own suggestions beside the video, then some of your liked videos
    function fillNext() {
      var ul = $('.yt-nl');
      if (!S.connected || S.via !== 'extension') { notHere(ul); return; }
      var rows = [{ head: 'Recommended by YouTube' }];
      if (S.upNext.length) S.upNext.forEach(function (x) { rows.push(videoRow(x.v, x.t, x.c)); });
      else rows.push({ empty: S.video ? 'YouTube has not shown suggestions for this video yet.' : 'Suggestions show up once a video plays in your browser.' });
      var lib = library(), liked = lib && Array.isArray(lib.liked) ? lib.liked.filter(function (x) { return x.v && x.v !== S.video; }) : [];
      liked.sort(function (a, b) { return Number(b.c === S.channel) - Number(a.c === S.channel); });
      if (liked.length) rows.push({ head: 'From your liked videos' });
      liked.slice(0, 8).forEach(function (x) { rows.push(videoRow(x.v, x.t, x.c)); });
      list(ul, rows);
    }
    function openPl(e, name, ids, src, known) {
      var ul = e && e.currentTarget && e.currentTarget.closest('ul'); if (!ul) { start(src, name); return; }
      var keep = document.createDocumentFragment(), top = ul.scrollTop; while (ul.firstChild) keep.appendChild(ul.firstChild);
      function back() { ul.textContent = ''; ul.appendChild(keep); ul.scrollTop = top; }
      var titles = known || {}, detail, nextPage = '', loading = false, error = null;
      function source(at) { return { list: src.list, ids: ids.length ? ids : null, at: at || 0 }; }
      var bar = { bar: name, back: back, acts: [['Play', ICON.play, function () { start(source(0), name); }]] };
      function rows() {
        var items = ids.map(function (v, i) {
          var k = titles[v] || {};
          return { t: k.t || 'Video ' + (i + 1), s: k.c || '', img: thumb(v), go: function () { start(source(i), k.t || name); } };
        });
        if (loading) items.push({ empty: 'Loading videos…' });
        else if (error) items.push(error);
        else if (nextPage) items.push({ t: 'Load more videos', icon: ICON.redo, verb: 'Open', go: function () { loadPage(nextPage); } });
        else if (!items.length) items.push({ empty: 'No videos found in this playlist.' });
        list(ul, [bar].concat(items)); detail = ul.firstChild;
      }
      function loadPage(page) {
        var tok = token();
        if (!tok) { error = { empty: 'Sign in to browse the full playlist.', setup: !LIVELY }; rows(); return; }
        loading = true; rows();
        var url = 'playlistItems?part=snippet&maxResults=50&playlistId=' + encodeURIComponent(src.list);
        if (page) url += '&pageToken=' + encodeURIComponent(page);
        api(url, tok).then(function (j) {
          var videos = (j.items || []).map(function (x) { return x.snippet || {}; }).filter(function (sn) {
            return sn.resourceId && sn.resourceId.videoId && sn.title !== 'Private video' && sn.title !== 'Deleted video';
          });
          videos.forEach(function (sn) { titles[sn.resourceId.videoId] = { t: sn.title, c: sn.videoOwnerChannelTitle || '' }; });
          ids = (page ? ids : []).concat(videos.map(function (sn) { return sn.resourceId.videoId; }));
          nextPage = j.nextPageToken || '';
        }, function (e) { error = dataError(e); }).finally(function () {
          loading = false;
          if (ul.firstChild === detail) rows();
        });
      }
      if (src.list && !src.known) loadPage(''); else rows();
      ul.scrollTop = 0;
    }
    var playlistPages = null;
    function loadMorePlaylists(pages) {
      var tok = token();
      if (!tok) { pages.error = { empty: 'Sign in to load more playlists.', setup: !LIVELY }; fillPl(); return; }
      pages.loading = true; fillPl();
      api('playlists?part=snippet,contentDetails&mine=true&maxResults=50&pageToken=' + encodeURIComponent(pages.next), tok).then(function (j) {
        pages.items = pages.items.concat((j.items || []).map(playlistSummary)); pages.next = j.nextPageToken || '';
      }, function (e) { pages.error = dataError(e); }).finally(function () { pages.loading = false; if (pages === playlistPages && pane === 'pl') fillPl(); });
    }
    function fillPl() {
      var lib = library(), ul = $('.yt-pl'); $('.yt-when').textContent = lib ? 'Updated ' + ago(lib.t) : '';
      $('.yt-refresh').hidden = LIVELY; if (!lib) { playlistPages = null; return noLib(ul); }
      if (!playlistPages || playlistPages.t !== lib.t) playlistPages = { t: lib.t, items: lib.pls, next: lib.next };
      var pages = playlistPages;
      var rows = [{ head: 'Your playlists' }];
      if (lib.liked.length) {
        var lk = {}; lib.liked.forEach(function (x) { lk[x.v] = { t: x.t, c: x.c }; });
        rows.push({ t: 'Liked videos', s: lib.liked.length + ' videos', img: thumb(lib.liked[0].v), go: function (e) { openPl(e, 'Liked videos', likedIds(lib), { list: 'LL', known: true }, lk); } });
      }
      pages.items.forEach(function (p) {
        var ids = (lib.items && lib.items[p.id]) || [];
        rows.push({ t: p.t, s: p.n != null ? p.n + ' videos' : 'Playlist', img: p.th, go: function (e) { openPl(e, p.t, ids, { list: p.id }); } });
      });
      if (pages.loading) rows.push({ empty: 'Loading playlists…' });
      else if (pages.error) rows.push(pages.error);
      else if (pages.next) rows.push({ t: 'Load more playlists', icon: ICON.redo, verb: 'Open', go: function () { loadMorePlaylists(pages); } });
      if (rows.length === 1) rows.push({ empty: 'No playlists yet.' });
      list(ul, rows);
    }
    function fill(p) {
      if (!host.isBig()) return; p = p || pane;
      if (p === 'pl') fillPl(); else if (p === 'queue') fillQueue(); else if (p === 'next') fillNext();
      else if (p === 'search' && !$('.yt-sl').firstChild) list($('.yt-sl'), [{ empty: 'Search for videos and music, or paste a YouTube video link. It plays in your browser.' }]);
    }
    $('.yt-refresh').addEventListener('click', function () {
      $('.yt-when').textContent = 'Updating…';
      fetchLibrary('').then(function () { fillPl(); flash('Library updated', true); }, function (e) { $('.yt-when').textContent = e.message; });
    });
    $('.yt-mixnow').addEventListener('click', function () { if (S.video) start({ video: S.video, list: 'RD' + S.video }, 'a mix from ' + (S.title || 'this video')); });
    $('.yt-code').addEventListener('click', function () { remote.copyCode().then(function (ok) { flash(ok ? 'Pairing code copied. Paste it into the extension' : 'Could not copy the code', ok); }); });
    $('.yt-newcode').addEventListener('click', function () { remote.newCode().then(function (ok) { flash(ok ? 'New pairing code copied. The old one no longer works' : 'Could not make a new code', ok); }); });
    var searchSerial = 0;
    function search(q, page, previous) {
      var ul = $('.yt-sl'), serial = ++searchSerial;
      list(ul, previous.concat([{ empty: 'Searching…' }]));
      var path = 'search?part=snippet&type=video&maxResults=15&q=' + encodeURIComponent(q);
      if (page) path += '&pageToken=' + encodeURIComponent(page);
      withToken(function (tok) { return api(path, tok); }, '').then(function (j) {
        if (serial !== searchSerial) return;
        var rows = previous.concat((j.items || []).filter(function (x) { return x.id && x.id.videoId && x.snippet; }).map(function (x) {
          var title = el('textarea'); title.innerHTML = x.snippet.title;
          return videoRow(x.id.videoId, title.value, x.snippet.channelTitle);
        }));
        var more = j.nextPageToken ? [{ t: 'More results', icon: ICON.redo, verb: 'Open', go: function () { search(q, j.nextPageToken, rows); } }] : [];
        list(ul, rows.length || more.length ? rows.concat(more) : [{ empty: 'Nothing found for “' + q + '”.' }]);
      }).catch(function (e) { if (serial === searchSerial) list(ul, previous.concat(dataError(e))); });
    }
    $('.yt-sform').addEventListener('submit', function (e) {
      e.preventDefault(); var q = $('.yt-sform input').value.trim(), video = videoLink(q);
      if (video) { searchSerial++; start({ video: video }, 'the video'); }
      else if (q) search(q, '', []);
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
      if (!playingSomething()) { if (host.closeFull) host.closeFull(); host.setBig(true); setPane(S.connected ? 'search' : 'now'); return; }
      cmd(S.playing ? 'pause' : 'play');
    });
    $('.np-next').addEventListener('click', function () { cmd('next'); });
    $('.np-prev').addEventListener('click', function () { cmd('prev'); });
    if (window.desktop && window.desktop.discord) {
      $('.np-shares').hidden = false;
      $('.yt-share').addEventListener('click', function () {
        var t = trackObj(); if (!t) { flash('Nothing playing to share'); return; }
        window.desktop.discord.share(t).then(function (r) { flash(r && r.ok ? 'Shared to Discord: ' + t.title : 'Discord: ' + (r && r.error || 'could not share'), r && r.ok); });
      });
    }
    $('.np-art').addEventListener('click', function () { if (S.video && host.openFull) host.openFull(); });

    window.addEventListener('storage', function (e) {
      if (e.key === 'yt-token') fill();
      if (e.key === LIB) { paint(); fill(); }
    });
    paint(); sync(); setPane('now');
    return {
      fill: fill, sync: sync,
      info: function () {
        return { title: S.connected ? S.title : '', author: S.connected ? S.channel : '', vid: S.connected ? S.video || '' : '', playing: S.connected && S.playing,
          error: !remote || S.connected ? '' : 'Connect your browser on the YouTube tab', cur: S.connected ? position() : 0, dur: S.connected ? S.duration : 0 };
      },
      track: trackObj,
      toggle: function () { $('.np-play').click(); }, next: function () { cmd('next'); }, prev: function () { cmd('prev'); },
      pause: function () { if (S.connected && S.playing && remote) remote.command('pause'); },
      playing: function () { return S.connected && S.playing; },
      // the island's type bar: a search in the Search band (a video link plays straight away, in your browser)
      search: function (q) {
        q = String(q || '').trim(); if (!q) return;
        setPane('search'); $('.yt-sform input').value = q;
        var video = videoLink(q);
        if (video) { searchSerial++; start({ video: video }, 'the video'); } else search(q, '', []);
      },
      // the island's volume tile (0-100; null when no tab is connected)
      volume: function (v) {
        if (!S.connected || !remote || S.via !== 'extension') return null;
        if (v != null) { var n = Math.max(0, Math.min(100, +v)); remote.command('volume', n); S.volume = n; return n; }
        return S.volume;
      }
    };
  }

  return { mount: mount, signIn: signIn, signedIn: signedIn, disconnect: disconnect, fetchLibrary: fetchLibrary, library: library, ago: ago, setup: SETUP,
    clientId: cid, setClientId: function (v) { store('yt-client', v || null); } };
})();
