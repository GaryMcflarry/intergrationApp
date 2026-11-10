/* Runs inside YouTube's own page (the MAIN world), the only place its player can be reached. Kept small on purpose:
   it reads the player and the side panels, posts that to bridge.js, and carries out a fixed list of commands on the
   player. YouTube does not document any of this, so every read is guarded and a missing piece just comes back empty. */
(function () {
  'use strict';
  if (window.__astrumYouTube) return;
  window.__astrumYouTube = true;
  var TAG = 'astrum-yt', MAX = 25;

  function player() { var p = document.getElementById('movie_player'); return p && typeof p.getVideoData === 'function' ? p : null; }
  function call(p, fn, a, b) { try { return p && typeof p[fn] === 'function' ? p[fn](a, b) : undefined; } catch (e) { return undefined; } }
  function text(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function videoOf(href) {
    try { var u = new URL(href, location.origin); return u.pathname === '/watch' ? u.searchParams.get('v') || '' : ''; } catch (e) { return ''; }
  }
  function each(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }

  // the playlist or mix beside the video: the ones after the current one
  function queue() {
    var rows = each('ytd-playlist-panel-renderer#playlist ytd-playlist-panel-video-renderer'), out = [], after = false;
    rows.forEach(function (r) {
      if (r.hasAttribute('selected')) { after = true; return; }
      if (!after || out.length >= MAX) return;
      var a = r.querySelector('a#wc-endpoint, a[href*="/watch"]'), v = videoOf(a && a.getAttribute('href'));
      if (v) out.push({ v: v, t: text(r.querySelector('#video-title')), c: text(r.querySelector('#byline')) });
    });
    return out;
  }
  // YouTube's own "Up next" suggestions beside the video
  function upNext(current) {
    var out = [], seen = {};
    each('#secondary #related ytd-compact-video-renderer, #secondary #related yt-lockup-view-model').forEach(function (r) {
      if (out.length >= MAX) return;
      var a = r.querySelector('a[href*="/watch?v="]'), v = videoOf(a && a.getAttribute('href'));
      if (!v || v === current || seen[v]) return;
      seen[v] = 1;
      var t = text(r.querySelector('#video-title, .yt-lockup-metadata-view-model__title, h3'));
      var c = text(r.querySelector('ytd-channel-name #text, #channel-name #text, .yt-content-metadata-view-model__metadata-text'));
      out.push({ v: v, t: t, c: c });
    });
    return out;
  }
  function state() {
    var p = player(), d = (p && call(p, 'getVideoData')) || {}, st = p ? call(p, 'getPlayerState') : -1;
    var index = call(p, 'getPlaylistIndex');
    return {
      video: typeof d.video_id === 'string' ? d.video_id : '', title: d.title || '', channel: d.author || '',
      playing: st === 1 || st === 3,   // playing, or buffering on the way to it
      position: Number(call(p, 'getCurrentTime')) || 0, duration: Number(call(p, 'getDuration')) || 0,
      volume: call(p, 'isMuted') ? 0 : Number(call(p, 'getVolume')),
      list: call(p, 'getPlaylistId') || '', index: typeof index === 'number' ? index : -1,
      queue: queue(), upNext: upNext(d.video_id)
    };
  }

  var last = '', lastAt = 0;
  function report() {
    var s = state(), key = JSON.stringify(s), now = Date.now();
    // on a change at once; otherwise once a second while playing and every 3 s while not
    if (key === last && now - lastAt < (s.playing ? 1000 : 3000)) return;
    last = key; lastAt = now;
    window.postMessage({ tag: TAG, kind: 'state', state: s }, location.origin);
  }
  setInterval(report, 500);

  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin) return;
    var m = e.data;
    if (!m || m.tag !== TAG || m.kind !== 'cmd' || !m.cmd) return;
    var p = player(); if (!p) return;
    var n = typeof m.cmd.arg === 'number' && isFinite(m.cmd.arg) ? m.cmd.arg : null;
    switch (m.cmd.name) {
      case 'play': call(p, 'playVideo'); break;
      case 'pause': call(p, 'pauseVideo'); break;
      case 'toggle': if (call(p, 'getPlayerState') === 1) call(p, 'pauseVideo'); else call(p, 'playVideo'); break;
      case 'next': call(p, 'nextVideo'); break;
      case 'prev': call(p, 'previousVideo'); break;
      case 'seek': if (n != null) call(p, 'seekTo', Math.max(0, n), true); break;
      case 'volume': if (n != null) { call(p, 'setVolume', Math.max(0, Math.min(100, n))); if (n > 0) call(p, 'unMute'); } break;
      default: return;
    }
    last = ''; setTimeout(report, 250);   // the change shows straight away
  });
})();
