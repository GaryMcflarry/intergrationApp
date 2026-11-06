/* Now playing: a small Spotify player that sits over the wallpaper.
   It signs in with Spotify's own login (PKCE: no secret, nothing stored anywhere but this browser), asks Spotify what is
   playing every few seconds, and shows a glass card in a corner: cover, track and artist, back / play-pause / forward,
   with a faint starfield drifting behind and the song's progress as a glowing trail. It opens up into bands: Now (the
   cover with the album and year over it, the artist, seek, shuffle, repeat, like, volume), Queue (what plays next),
   Search (play or queue anything), Explore (fresh songs by genre and era, and recommended playlists, picked by
   tapping), Library (playlists, recently played, top songs and artists) and Devices (move playback, or make the
   wallpaper itself a Spotify speaker). DJ mode covers the page: the wallpaper stays visible behind a large cover, and
   the DJ keeps the queue topped up with new songs in the chosen vibe, so the music carries on by itself.

   NowPlaying.attach(id, row)  puts the player on a wallpaper and wires its settings row (a switch per wallpaper).
   Signing in happens once, on spotify.html (the one address to register with Spotify), and every wallpaper shares it.
   Controls (play, skip, seek, volume, queue, devices ...) need Spotify Premium; reading what is playing does not. */
/* Astrum: this is the Worlds wallpapers' player, running as a desktop widget. opts.app sets the app mode (the
   player fills the widget, no wallpaper speaker: Electron has no Widevine), and it tells the app what is playing through
   'np:track' events (for Discord) and when its full view opens ('np:view', so the window can go full screen). */
window.NowPlaying = (function () {
  'use strict';
  var API = 'https://api.spotify.com/v1', AUTH = 'https://accounts.spotify.com';
  var SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify ' +
    'user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public streaming user-read-email user-read-private';
  var KEY = 'np-spotify-v1';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ICON = {
    prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.8-3.4M14 7h6M17 4l3 3-3 3M17 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    repeat: '<svg viewBox="0 0 24 24"><path d="M5 11V9a3 3 0 0 1 3-3h11M16 3l3 3-3 3M19 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M4 6h11M4 11h11M4 16h7M18 13v8M14 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dj: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M17.5 4.5l2-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wide: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    narrow: '<svg viewBox="0 0 24 24"><path d="M19 11h-6V5M5 13h6v6M13 11l7-7M11 13l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="12" y="11" width="7" height="6" rx="1"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12l8-8M16 7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
  };
  var DEV = {   // device types, drawn in the list
    Computer: '<svg viewBox="0 0 24 24"><path d="M3 5h18v11H3zM9 20h6M12 16v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    Smartphone: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 18h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    TV: '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3zM8 3l4 3 4-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    Speaker: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="7" r="1" fill="currentColor"/></svg>'
  };
  var CSS = [
    '.np{position:fixed;z-index:20;width:min(340px,calc(100vw - 32px));color:#f5f3ff;font:500 13px/1.4 "Chakra Petch","Trebuchet MS",system-ui,sans-serif;--np-acc:#1ed760;--np-hi:color-mix(in srgb,var(--np-acc) 50%,#fff);--np-ink2:rgba(245,243,255,.62);--np-edge:rgba(255,255,255,.12);--np-r:18px;--np-r2:12px;opacity:0;transform:translateY(-8px) scale(.98);transition:opacity .45s ease,transform .45s ease;pointer-events:none;cursor:default}',
    '.np.on{opacity:1;transform:none;pointer-events:auto}',
    '.np.tr{top:16px;right:16px}.np.tl{top:16px;left:68px}.np.br{bottom:16px;right:16px}.np.bl{bottom:16px;left:16px}',
    '/* the corner arrow: a slim tab at the screen edge that pulls the player out and tucks it away */',
    '.np.tabbed.tr,.np.tabbed.br{right:24px}.np.tabbed.tl,.np.tabbed.bl{left:24px}',
    '.np.on.tucked{opacity:0;pointer-events:none;transform:translateX(18px)}.np.on.tucked.tl,.np.on.tucked.bl{transform:translateX(-18px)}',
    '.np-tab{position:fixed;z-index:21;width:16px;height:44px;padding:0;border:0;display:grid;place-items:center;cursor:pointer;color:#f5f3ff;background:rgba(18,12,26,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .4s ease,background .2s,width .2s}',
    '.np-tab.on{opacity:.45;pointer-events:auto}.np-tab.on.site{opacity:.85;width:20px;height:52px}.np-tab.on:hover,.np-tab.on:focus-visible{opacity:1;width:20px}',
    '.np-tab.tr{top:16px;right:0;border-radius:8px 0 0 8px}.np-tab.br{bottom:16px;right:0;border-radius:8px 0 0 8px}.np-tab.tl{top:16px;left:0;border-radius:0 8px 8px 0}.np-tab.bl{bottom:16px;left:0;border-radius:0 8px 8px 0}',
    '.np-tab svg{width:12px;height:12px;transition:transform .3s ease}.np-tab.tr svg,.np-tab.br svg{transform:rotate(180deg)}.np-tab.out.tr svg,.np-tab.out.br svg{transform:none}.np-tab.out.tl svg,.np-tab.out.bl svg{transform:rotate(180deg)}',
    '.np-tab.sk-normandy{border-radius:0;background:rgba(30,14,36,.55);color:var(--acc,#ffb38a);box-shadow:inset 1px 0 0 color-mix(in srgb,var(--acc,#ffb38a) 40%,transparent)}',
    '.np-tab.sk-normandy.tl,.np-tab.sk-normandy.bl{box-shadow:inset -1px 0 0 color-mix(in srgb,var(--acc,#ffb38a) 40%,transparent)}',
    '.np-card{position:relative;overflow:hidden;border-radius:var(--np-r);background:rgba(10,10,20,.72);border:1px solid var(--np-edge);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);box-shadow:0 10px 30px rgba(0,0,0,.35)}',
    '.np-card::before{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--np-acc) 30%,transparent),transparent 70%);pointer-events:none}',
    '/* a faint starfield drifting slowly behind everything */',
    '.np-in{position:relative}',
    '.np-in::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.6;background-image:radial-gradient(1px 1px at 12% 22%,#fff,transparent),radial-gradient(1px 1px at 68% 14%,rgba(255,255,255,.8),transparent),radial-gradient(1.4px 1.4px at 84% 62%,#fff,transparent),radial-gradient(1px 1px at 32% 78%,rgba(255,255,255,.7),transparent),radial-gradient(1px 1px at 52% 44%,rgba(255,255,255,.55),transparent),radial-gradient(1px 1px at 93% 90%,rgba(255,255,255,.7),transparent),radial-gradient(1.2px 1.2px at 5% 64%,rgba(255,255,255,.75),transparent);background-size:190px 130px;animation:np-drift 120s linear infinite}',
    '@keyframes np-drift{to{background-position:-190px 0}}',
    '.np-lk{position:absolute;left:46px;top:44px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:rgba(10,10,20,.85);color:var(--np-hi);box-shadow:0 0 0 1px rgba(255,255,255,.12),0 0 10px color-mix(in srgb,var(--np-acc) 50%,transparent);opacity:0;transform:scale(.5);transition:opacity .25s,transform .25s;pointer-events:none}',
    '.np-lk svg{width:11px;height:11px;fill:currentColor}.np.is-liked .np-lk{opacity:1;transform:none}.np.sk-normandy .np-lk{left:36px;top:34px}.np.src-yt .np-lk{display:none}',
    '.np .np-heart.liked{color:var(--np-hi)}.np .np-heart.liked svg{filter:drop-shadow(0 0 6px color-mix(in srgb,var(--np-acc) 60%,transparent))}',
    '.np-mini{position:relative;display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 12px 15px}',
    '.np-art{width:48px;height:48px;border-radius:var(--np-r2);object-fit:cover;background:#222;display:block;box-shadow:0 2px 10px rgba(0,0,0,.45)}',
    '.np-txt{min-width:0}.np-t{display:block;font-weight:700;font-size:13.5px;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '/* a long track name scrolls slowly across and back, pausing at each end, so the whole name can be read */',
    '.np-t span{display:inline-block}.np-t.mq{text-overflow:clip;-webkit-mask:linear-gradient(90deg,#000 calc(100% - 14px),transparent);mask:linear-gradient(90deg,#000 calc(100% - 14px),transparent)}',
    '.np-t.mq span{animation:np-mq var(--mqd,10s) ease-in-out infinite alternate}',
    '@keyframes np-mq{0%,18%{transform:none}82%,100%{transform:translateX(var(--mq,0))}}',
    '.np-a{display:block;color:var(--np-ink2);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.np-a.fl{white-space:normal;color:#f5f3ff}.np-a.fl.bad{color:#ffd38a}',
    '.np-btns{display:flex;align-items:center;gap:2px}',
    '/* expanded: two columns, so the cover sits beside the controls and the lists run in pairs */',
    '.np.wide .np-pane[data-pane=now]{grid-template-columns:minmax(0,320px) minmax(0,1fr);align-items:start;column-gap:22px}',
    '.np.wide .np-pane[data-pane=now] .np-hero{grid-row:span 8}',
    '.np.wide .np-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none;column-gap:10px}',
    '.np.wide .np-head,.np.wide .np-empty{grid-column:1/-1}',
    '.np.wide .np-chips.scroll{flex-wrap:wrap;overflow:visible}',
    '.np button{font:inherit;color:inherit;background:none;border:0;padding:0;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;cursor:pointer;transition:background .2s,transform .12s,box-shadow .4s}',
    '.np button:hover{background:rgba(255,255,255,.12)}.np button:active{transform:scale(.92)}',
    '.np button:focus-visible{outline:2px solid var(--np-acc);outline-offset:1px}',
    '.np button svg{width:18px;height:18px;fill:currentColor}',
    '.np .np-play{width:36px;height:36px;background:#f5f3ff;color:#111}.np .np-play:hover{background:#fff}',
    '.np.playing .np-play{box-shadow:0 0 16px color-mix(in srgb,var(--np-acc) 60%,transparent)}',
    '.np .np-play svg{width:16px;height:16px}',
    '/* progress: a trail with a bright head, like something crossing the sky */',
    '.np-line{position:absolute;left:14px;right:14px;bottom:6px;height:2px;border-radius:2px;background:rgba(255,255,255,.1)}',
    '.np-line i{position:relative;display:block;height:100%;width:0;border-radius:2px;background:linear-gradient(90deg,transparent,var(--np-acc))}',
    '.np-line i::after{content:"";position:absolute;right:-3px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:#fff;box-shadow:0 0 8px 2px var(--np-acc)}',
    '/* opened: a row of bands, then one band at a time */',
    '.np-more{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:0 16px;max-height:0;overflow:hidden;opacity:0;transition:max-height .28s ease,opacity .2s ease,padding .28s ease}',
    '.np.big{width:min(400px,calc(100vw - 32px))}.np.big.wide{width:min(780px,calc(100vw - 56px))}',
    '.np{transition:opacity .45s ease,transform .45s ease,width .35s ease}',
    '.np .np-wide,.np .np-pip{display:none}.np.big .np-wide,.np.can-pip .np-pip,.np.can-mini .np-sp .np-pip{display:grid}.np-dj .dj-pip{display:none}.np-dj.can-pip .dj-pip,.np-dj.can-mini:not(.m-yt) .dj-pip{display:grid}',
    '.np .np-add.done{color:var(--np-hi)}.np-dj .dj-save.done{color:var(--np-hi)}',
    '.np .np-resign{margin-left:auto;width:auto;height:auto;border-radius:0;padding:3px 0 6px;display:inline-flex;gap:5px;align-items:center;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--np-ink2)}',
    '.np .np-resign:hover{background:none;color:#fff}.np .np-resign svg{width:13px;height:13px;fill:none}.np .np-resign[hidden]{display:none}',
    '/* mini.html: the player alone, filling a small popup window */',
    '.np.mini-page{top:0!important;left:0!important;right:0!important;bottom:auto!important;width:100%!important;opacity:1!important;transform:none!important}.np.mini-page .np-card{border-radius:0;min-height:100vh}.np-tab.mini-page{display:none}',
    '.np.big .np-more{max-height:calc(100vh - 130px);overflow-y:auto;opacity:1;padding:2px 16px 18px;scrollbar-width:thin}',
    '.np.big .np-line{display:none}',
    '.np-bands{display:flex;justify-content:space-between;gap:4px;border-bottom:1px solid var(--np-edge)}',
    '.np .np-bands button{position:relative;width:auto;height:auto;border-radius:0;padding:8px 2px 10px;font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--np-ink2)}',
    '.np .np-bands button:hover{background:none;color:#fff}',
    '.np-bands button::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--np-acc);box-shadow:0 0 10px var(--np-acc);transform:scaleX(0);transition:transform .3s ease}',
    '.np .np-bands button[aria-selected=true]{color:#fff}.np-bands button[aria-selected=true]::after{transform:none}',
    '.np-pane{display:none;gap:14px;min-width:0;grid-template-columns:minmax(0,1fr)}.np-pane.on{display:grid}',
    '/* Now: the cover, with the album and its year laid over it as a backdrop; the artist below */',
    '.np-hero{position:relative;border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.5);background:#222}',
    '.np-cover{width:100%;aspect-ratio:1;object-fit:cover;display:block}',
    '.np-yr{position:absolute;right:12px;top:6px;font-size:60px;font-weight:700;line-height:1;letter-spacing:.04em;color:#fff;opacity:.2;text-shadow:0 2px 20px rgba(0,0,0,.5);pointer-events:none}',
    '.np-back{position:absolute;left:0;right:0;bottom:0;display:grid;gap:2px;padding:48px 14px 12px;background:linear-gradient(transparent,rgba(4,4,12,.88))}',
    '.np-rel{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(245,243,255,.72)}',
    '.np-album{font-weight:700;font-size:15px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.np-artist{display:flex;align-items:center;gap:10px;min-width:0}',
    '.np-aimg{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none;background:#333;box-shadow:0 0 0 1px var(--np-edge),0 0 14px color-mix(in srgb,var(--np-acc) 40%,transparent)}.np-aimg:not([src]),.np-aimg[src=""]{display:none}',
    '.np-awho{display:grid;min-width:0}.np-aname{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.np-genre{font-size:11.5px;color:var(--np-ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.np-seek{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--np-ink2)}',
    '.np input[type=range]{width:100%;accent-color:var(--np-acc);margin:0;cursor:pointer}',
    '.np-tg{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 10px}',
    '.np .np-tog{color:var(--np-ink2)}.np .np-tog.on{color:var(--np-hi)}',
    '.np .np-tog.on::after{content:"";position:absolute;margin-top:26px;width:4px;height:4px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}',
    '.np-vol{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px}.np-vol svg{width:18px;height:18px;fill:currentColor;opacity:.7}',
    '.np-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11.5px;color:var(--np-ink2)}',
    '.np-foot a,.np-foot button{color:var(--np-hi);text-decoration:none;font-weight:700}',
    '.np .np-foot button{width:auto;height:auto;padding:4px 6px;border-radius:6px}',
    '.np-note{font-size:11.5px;color:#ffd38a;margin:0}.np-note:empty{display:none}',
    '/* the lists: queue, search results, library, devices */',
    '.np-list{list-style:none;margin:0;padding:0;display:grid;gap:2px;max-height:320px;overflow-y:auto;scrollbar-width:thin;min-width:0}',
    '.np-list li{display:flex;align-items:center;gap:4px;min-width:0}',
    '.np .np-item{flex:1;min-width:0;width:auto;height:auto;display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;align-items:center;justify-items:start;text-align:left;padding:6px;border-radius:var(--np-r2)}',
    '.np .np-item:hover{background:rgba(255,255,255,.08)}div.np-item{cursor:default}',
    '.np-item img,.np-ico{width:40px;height:40px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.06);display:grid;place-items:center}.np-item img.round{border-radius:50%}',
    '.np-ico svg{width:22px;height:22px;fill:none!important}',
    '.np-it{display:grid;min-width:0;width:100%}.np-it b{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.np-it small{font-size:11.5px;color:var(--np-ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.np-item.on b{color:var(--np-hi)}',
    '.np .np-add{flex:none;color:var(--np-ink2)}.np .np-add:hover{color:#fff}',
    '.np-head{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--np-ink2);padding:12px 6px 4px;display:flex!important;align-items:center;gap:10px}.np-head:first-child{padding-top:2px}',
    '.np-head::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--np-edge),transparent)}',
    '.np-empty{font-size:12px;color:var(--np-ink2);padding:12px 6px;display:block!important}.np-empty a{color:var(--np-hi)}',
    '.np-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.np .np-chips button{width:auto;height:auto;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--np-ink2);box-shadow:inset 0 0 0 1px var(--np-edge)}',
    '.np .np-chips button[aria-pressed=true]{color:#fff;background:color-mix(in srgb,var(--np-acc) 22%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--np-acc) 60%,transparent)}',
    '.np-chips[hidden]{display:none}',
    '.np-q{font:inherit;font-size:13px;color:#fff;background:rgba(255,255,255,.07);border:1px solid var(--np-edge);border-radius:var(--np-r2);padding:10px 12px;width:100%;box-sizing:border-box}',
    '.np-q::placeholder{color:var(--np-ink2)}.np-q:focus{outline:none;border-color:color-mix(in srgb,var(--np-acc) 70%,transparent);box-shadow:0 0 12px color-mix(in srgb,var(--np-acc) 30%,transparent)}',
    '.np-here{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:start;cursor:pointer;padding:12px;border-radius:var(--np-r2);box-shadow:inset 0 0 0 1px var(--np-edge)}',
    '.np-here input{margin:2px 0 0;accent-color:var(--np-acc)}.np-here b{display:block;font-size:13px}.np-here small{display:block;font-size:11.5px;color:var(--np-ink2)}',
    '.np-herenote{margin:0;font-size:11.5px;color:var(--np-hi)}.np-herenote:empty{display:none}',
    '.np.ro .np-btns button:not(.np-exp),.np.ro .np-ctl{display:none}',
    '.np.np-idle .np-btns,.np.np-idle .np-line,.np.np-idle .np-more{display:none}.np.np-idle{cursor:pointer}.np.np-idle .np-art{opacity:.75}',
    '.np-cta{display:block;text-decoration:none;color:inherit}.np-cta .np-mini{grid-template-columns:auto minmax(0,1fr)}',
    '.np-row{display:flex;justify-content:space-between;align-items:center;gap:10px}.np-row label{display:inline-flex;gap:8px;align-items:center;cursor:pointer}.np-row a{font-size:.85em;color:inherit;opacity:.8}',
    '/* the Normandy skin, kept minimal: a hairline cut-corner outline in the page\'s colours, cover, title, artist and a hairline of progress; the buttons appear on hover */',
    '.np.sk-normandy{width:min(300px,calc(100vw - 32px));--c-line:var(--line,#5e3366);--c-acc:var(--acc,#ffb38a);--c-ink:var(--ink,#fff1ea);--c-soft:var(--soft,#f3c9c0);--c-muted:var(--muted,#c08f9f);--np-acc:var(--c-acc);--np-hi:var(--c-acc);--np-ink2:var(--c-muted);--np-edge:color-mix(in srgb,var(--c-acc) 26%,transparent);--np-r:0;--np-r2:0;color:var(--c-ink);font-family:var(--f-display,"Chakra Petch",sans-serif)}',
    '.np.sk-normandy .np-card{border:0;padding:1px;background:color-mix(in srgb,var(--c-acc) 38%,transparent);clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);box-shadow:none}',
    '.np.sk-normandy .np-card::before{display:none}',
    '.np.sk-normandy .np-in{background:rgba(30,14,36,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);clip-path:polygon(9.6px 0,100% 0,100% calc(100% - 9.6px),calc(100% - 9.6px) 100%,0 100%,0 9.6px)}',
    '.np.sk-normandy .np-in::before{opacity:.45}',
    '.np.sk-normandy .np-mini{grid-template-columns:38px minmax(0,1fr) auto;gap:10px;padding:9px 10px 11px}',
    '.np.sk-normandy .np-art{width:38px;height:38px;box-shadow:none}',
    '.np.sk-normandy .np-hero{border-radius:0;box-shadow:none}',
    '.np.sk-normandy .np-t{font-weight:600;font-size:12.5px;letter-spacing:.03em}',
    '.np.sk-normandy .np-a{font-size:11px}',
    '.np.sk-normandy button{border-radius:0}.np.sk-normandy button:hover{background:color-mix(in srgb,var(--c-acc) 16%,transparent)}',
    '.np.sk-normandy .np-btns button,.np.sk-normandy .np-tog,.np.sk-normandy .np-add{width:28px;height:28px}',
    '.np.sk-normandy .np-btns button svg,.np.sk-normandy .np-tog svg,.np.sk-normandy .np-add svg{width:15px;height:15px}',
    '.np.sk-normandy .np-bands button{letter-spacing:.1em;font-size:10px}',
    '.np.sk-normandy .np-play{width:28px;height:28px;background:none;color:var(--c-acc)}.np.sk-normandy .np-play:hover{background:color-mix(in srgb,var(--c-acc) 16%,transparent)}',
    '.np.sk-normandy.playing .np-play{box-shadow:none;filter:drop-shadow(0 0 5px color-mix(in srgb,var(--c-acc) 70%,transparent))}',
    '.np.sk-normandy .np-play svg{width:15px;height:15px}',
    '.np.sk-normandy .np-btns{opacity:0;transition:opacity .35s ease}',
    '.np.sk-normandy:hover .np-btns,.np.sk-normandy:focus-within .np-btns,.np.sk-normandy.big .np-btns{opacity:1}',
    '@media (hover:none){.np.sk-normandy .np-btns{opacity:1}}',
    '.np.sk-normandy .np-line{left:0;right:0;bottom:0;height:1px;border-radius:0;background:color-mix(in srgb,var(--c-line) 70%,transparent)}',
    '.np.sk-normandy .np-line i{border-radius:0}.np.sk-normandy .np-line i::after{width:4px;height:4px;right:-2px;margin-top:-2px}',
    '.np.sk-normandy .np-bands button,.np.sk-normandy .np-chips button,.np.sk-normandy .np-add{border-radius:0}',
    '.np.sk-normandy .np-seek,.np.sk-normandy .np-foot{font-size:11px}',
    '.np.sk-normandy input[type=range]{-webkit-appearance:none;appearance:none;height:1px;background:color-mix(in srgb,var(--c-acc) 45%,transparent)}',
    '.np.sk-normandy input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:8px;height:8px;border-radius:50%;background:var(--c-acc);box-shadow:0 0 6px var(--c-acc)}',
    '.np.sk-normandy input[type=range]::-moz-range-thumb{width:8px;height:8px;border:0;border-radius:50%;background:var(--c-acc)}',
    '.np.sk-normandy .np-tog.on::after{margin-top:22px}',
    '.np.sk-normandy .np-foot a{color:var(--c-acc)}',
    '/* Explore: chips to tap, a row of actions, then songs and playlists */',
    '.np-chips.scroll{min-width:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.np-chips.scroll::-webkit-scrollbar{display:none}.np-chips.scroll button{flex:none}',
    '.np .np-acts{display:flex;gap:6px;flex-wrap:wrap}',
    '.np .np-acts button,.np .np-djgo{width:auto;height:auto;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:700;letter-spacing:.06em;display:inline-flex;gap:6px;align-items:center;box-shadow:inset 0 0 0 1px var(--np-edge)}',
    '.np .np-acts button svg,.np .np-djgo svg{width:14px;height:14px}',
    '.np .np-acts button:hover{color:#fff;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--np-acc) 65%,transparent)}',
    '/* the vibe: two dropdowns, and a box to type any genre for the DJ */',
    '.np-vibe{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:8px}',
    '.np-sel{font:inherit;font-size:12.5px;font-weight:600;color:#fff;width:100%;min-width:0;padding:9px 30px 9px 12px;border-radius:var(--np-r2);border:1px solid var(--np-edge);background:rgba(255,255,255,.07) url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 12 12%27%3E%3Cpath d=%27M2.5 4.5l3.5 3.5 3.5-3.5%27 fill=%27none%27 stroke=%27%23f5f3ff%27 stroke-width=%271.6%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E") no-repeat right 10px center/12px;-webkit-appearance:none;appearance:none;cursor:pointer;text-overflow:ellipsis}',
    '.np-sel:focus-visible{outline:none;border-color:color-mix(in srgb,var(--np-acc) 70%,transparent);box-shadow:0 0 12px color-mix(in srgb,var(--np-acc) 30%,transparent)}',
    '.np-sel option,.np-sel optgroup{background:#141220;color:#f5f3ff}',
    '.np-gform{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin:0}',
    '.np .np-gform button,.np-dj .np-gform button{width:auto;height:auto;border-radius:var(--np-r2);padding:0 14px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--np-hi);background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--np-acc) 45%,transparent)}',
    '.np .np-gform button:hover,.np-dj .np-gform button:hover{color:#fff;background:color-mix(in srgb,var(--np-acc) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--np-acc) 75%,transparent)}',
    '.np.sk-normandy .np-sel,.np.sk-normandy .np-gform button{border-radius:0}',
    '.np-lab{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--np-ink2);margin-bottom:-6px}',
    '.np.sk-normandy .np-acts button,.np.sk-normandy .np-djgo{border-radius:0}',
    '.np.sk-normandy.big{width:min(400px,calc(100vw - 32px))}.np.sk-normandy.big.wide{width:min(780px,calc(100vw - 56px))}',
    '/* the source tabs: Spotify or YouTube, in the same card */',
    '.np-src{display:flex;align-items:center;gap:4px;padding:8px 12px 0}.np-src[hidden]{display:none}.np-srctabs{display:flex;gap:14px}.np-srctabs[hidden]{display:none}',
    '.np .np-djbtn svg{fill:none;width:18px;height:18px}',
    '.np.playing .np-mini .np-art,.np-yt .np-mini .np-art{cursor:pointer}',
    '/* an opened playlist or album: back, its name, Play / Shuffle / Full view */',
    '.np-list li.np-bar{display:grid;gap:8px;padding:2px 2px 8px;position:sticky;top:0;z-index:1;background:linear-gradient(rgba(14,12,24,.96) 80%,transparent)}',
    '.np-bt{display:flex;align-items:center;gap:8px;min-width:0}.np-bt b{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.np.wide .np-list li.np-bar{grid-column:1/-1}',
    '.np .np-src button{position:relative;width:auto;height:auto;border-radius:0;padding:3px 0 6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--np-ink2)}.np .np-src button:hover{background:none;color:#fff}',
    '.np .np-src button::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:2px;background:var(--np-acc);box-shadow:0 0 8px var(--np-acc);transform:scaleX(0);transition:transform .3s ease}',
    '.np .np-src button[aria-selected=true]{color:#fff}.np .np-src button[aria-selected=true]::after{transform:none}',
    '.np.sk-normandy .np-src button{border-radius:0}',
    '.np-yt{display:none}.np.src-yt .np-yt{display:block}.np.src-yt .np-sp{display:none}.np.src-yt{--np-acc:#ff4e45!important}',
    '.np.src-yt.np-idle{cursor:default}.np.src-yt.np-idle .np-yt .np-btns{display:flex}.np.src-yt.np-idle .np-yt .np-line{display:block}.np.src-yt.np-idle .np-yt .np-more{display:grid}.np.src-yt.np-idle .np-yt .np-art{opacity:1}',
    '.np.big .np-yt .np-line{display:none}',
    '.yt-vid{aspect-ratio:16/9;background:#111 center/cover}.yt-vid iframe,.yt-vid>div{position:absolute;inset:0;width:100%;height:100%;border:0}',
    '.yt-ph{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:16px;color:var(--np-ink2);font-size:12px;background:radial-gradient(80% 80% at 50% 40%,rgba(255,78,69,.28),#0b0a12)}',
    '.yt-ph svg{width:34px;height:34px;fill:none;stroke:currentColor;color:var(--np-hi);margin:0 auto 6px;display:block}.yt-ph em{font-style:normal}',
    '.np .np-acts button[hidden]{display:none}',
    '.np-dj .dj-go{width:auto;height:auto;border-radius:999px;padding:9px 14px;gap:6px;display:inline-flex;align-items:center;font-size:11px;font-weight:700;letter-spacing:.14em;background:rgba(10,10,20,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}',
    '.np-dj .dj-go svg{width:16px;height:16px;fill:none}.np-dj:not(.m-now) .dj-go{display:none}.np-dj:not(.m-dj) .dj-vibe2{display:none}',
    '.np-dj.m-yt .dj-like,.np-dj.m-yt .dj-save{display:none}',
    '.np-dj .dj-share{background:rgba(10,10,20,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}.np-dj .dj-share svg{fill:none}.np-dj .dj-share[hidden]{display:none}',
    '.np .np-share svg{fill:none}.np-shares[hidden]{display:none}',
    '/* the desktop app: the player is the widget */',
    '.np.in-app .np-here,.np.in-app .np-herenote{display:none}',
    '.np.in-app.np-idle{cursor:default}.np.in-app.np-idle .np-btns{display:flex}.np.in-app.big.np-idle .np-more{display:grid}',
    '/* YouTube in the full view: the player card is hidden except its video, which moves to where the cover goes */',
    '.np-dj.m-yt{z-index:19}.np-dj.m-yt .dj-cover{visibility:hidden;aspect-ratio:16/9;height:auto;width:min(58vw,720px,calc((100vh - 280px) * 16 / 9))}',
    '.np.yt-full{visibility:hidden;opacity:1!important;transform:none!important;transition:none}',
    '.np.yt-full .np-card,.np.yt-full .np-in{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;clip-path:none!important;overflow:visible}',
    '.np.yt-full .np-yt .np-more{opacity:1;overflow:visible}.np.yt-full .np-yt .np-pane[data-pane=now]{display:grid}',
    '.np.yt-full .yt-vid{visibility:visible;position:fixed!important;z-index:5;border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.55)}',
    '.np.dj-hide,.np-tab.dj-hide{opacity:0!important;pointer-events:none!important}',
    '/* DJ mode: the whole page, with the wallpaper still showing through */',
    '.np-dj{position:fixed;inset:0;z-index:30;display:grid;grid-template-rows:auto 1fr auto;gap:12px;padding:max(18px,env(safe-area-inset-top)) clamp(16px,4vw,48px) max(18px,env(safe-area-inset-bottom));color:#f5f3ff;font:500 14px/1.4 "Chakra Petch","Trebuchet MS",system-ui,sans-serif;--np-acc:#1ed760;--np-hi:color-mix(in srgb,var(--np-acc) 50%,#fff);background:linear-gradient(transparent 62%,rgba(4,4,12,.86)),radial-gradient(120% 90% at 50% 50%,rgba(4,4,12,.18),rgba(4,4,12,.62));opacity:0;pointer-events:none;transition:opacity .6s ease;overflow:hidden}',
    '.np-dj.on{opacity:1;pointer-events:auto}',
    '.np-dj .dj-glow{position:absolute;left:50%;top:50%;width:70vmin;height:70vmin;transform:translate(-50%,-50%);object-fit:cover;filter:blur(70px) saturate(1.4);opacity:.45;pointer-events:none;border-radius:50%}.np-dj .dj-glow:not([src]),.np-dj .dj-glow[src=""]{display:none}',
    '.np-dj>*{position:relative}',
    '.np-dj button{font:inherit;color:inherit;background:none;border:0;padding:0;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;transition:background .2s,transform .12s,opacity .5s}',
    '.np-dj button:hover{background:rgba(255,255,255,.14)}.np-dj button:active{transform:scale(.92)}.np-dj button:focus-visible{outline:2px solid var(--np-acc);outline-offset:2px}',
    '.np-dj button svg{width:22px;height:22px;fill:currentColor}',
    '.dj-top{display:flex;align-items:center;gap:12px;min-width:0}',
    '.dj-yt-grab{display:none}',
    '.dj-tag{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:7px 12px;border-radius:999px;background:rgba(10,10,20,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}',
    '.dj-tag i{width:8px;height:8px;border-radius:50%;background:var(--np-acc);box-shadow:0 0 10px var(--np-acc)}.np-dj.playing .dj-tag i{animation:dj-pulse 1.6s ease-in-out infinite}',
    '@keyframes dj-pulse{50%{transform:scale(.55);opacity:.6}}',
    '.dj-vibe{flex:1;min-width:0;font-size:12px;color:rgba(245,243,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 8px rgba(0,0,0,.6)}',
    '.np-dj .dj-x,.np-dj .dj-pip{background:rgba(10,10,20,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}',
    '.dj-mid{display:flex;align-items:center;justify-content:center;gap:clamp(20px,5vw,64px);min-height:0}',
    '.dj-cover{display:block;width:min(46vh,40vw,520px);aspect-ratio:1;object-fit:cover;border-radius:22px;background:rgba(255,255,255,.06);box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);flex:none;transition:transform .8s ease}',
    '.dj-cover:not([src]){visibility:hidden}',
    '/* the cover as a card: it tilts toward the mouse with a sheen that follows, lifts on hover, and plays / pauses when pressed */',
    '.dj-card{position:relative;flex:none;border-radius:22px;cursor:pointer;transform:perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) scale(var(--cs,1));transition:transform .5s cubic-bezier(.2,.8,.2,1),filter .4s ease;will-change:transform}',
    '.dj-card.live{transition:transform .08s linear}.dj-card:hover{--cs:1.03}.dj-card:active{--cs:.98}',
    '.dj-card:hover .dj-cover{box-shadow:calc(var(--sx,0) * -1px) calc(30px + var(--sy,0) * -1px) 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.12),0 0 60px color-mix(in srgb,var(--np-acc) 30%,transparent)}',
    '.dj-glare{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .4s ease;background:radial-gradient(circle at var(--gx,50%) var(--gy,30%),rgba(255,255,255,.38),rgba(255,255,255,.08) 30%,transparent 60%);mix-blend-mode:overlay}',
    '.dj-card:hover .dj-glare{opacity:1}',
    '.dj-card.tap .dj-cover{animation:dj-tap .35s ease}@keyframes dj-tap{40%{filter:brightness(1.25)}}',
    '.np-dj.playing .dj-card:not(:hover){--cs:1.015}',
    '.np-dj.m-yt .dj-card{cursor:default;transform:none}.np-dj.m-yt .dj-glare{display:none}',
    '.dj-meta{display:grid;gap:10px;width:min(440px,100%);min-width:0;text-shadow:0 2px 14px rgba(0,0,0,.55)}',
    '.dj-line{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--np-hi)}',
    '.dj-t{font-size:clamp(26px,4.2vw,48px);line-height:1.05;font-weight:700;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.dj-a{font-size:clamp(15px,1.6vw,19px);color:rgba(245,243,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dj-prog{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;font-size:12px;font-variant-numeric:tabular-nums;color:rgba(245,243,255,.7);margin-top:6px}',
    '.dj-bar{height:3px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden}.dj-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,transparent,var(--np-acc));box-shadow:0 0 10px var(--np-acc)}',
    '.dj-ctl{display:flex;align-items:center;gap:6px;margin-left:-8px}',
    '.np-dj .dj-play{width:60px;height:60px;background:#f5f3ff;color:#111;margin:0 4px}.np-dj .dj-play:hover{background:#fff}.np-dj .dj-play svg{width:24px;height:24px}',
    '.np-dj.playing .dj-play{box-shadow:0 0 26px color-mix(in srgb,var(--np-acc) 60%,transparent)}',
    '.np-dj .dj-like.on{color:var(--np-hi)}',
    '.dj-toast{margin:0;min-height:1.4em;font-size:13px;color:var(--np-hi)}.dj-toast.bad{color:#ffd38a}',
    '.dj-bot{display:grid;gap:10px;justify-items:center;transition:opacity .6s ease}',
    '.dj-vibe2{display:grid;grid-template-columns:minmax(0,220px) minmax(0,130px) minmax(0,280px);gap:8px;width:min(660px,100%)}',
    '.np-dj .np-sel,.np-dj .np-q{background-color:rgba(10,10,20,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-color:rgba(255,255,255,.16);--np-edge:rgba(255,255,255,.16);--np-r2:999px}',
    '.np-dj .np-q{font:inherit;font-size:13px;color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 14px;width:100%;box-sizing:border-box}.np-dj .np-q::placeholder{color:rgba(245,243,255,.6)}',
    '.np-dj .np-gform button{border-radius:999px}',
    '@media (max-width:760px){.dj-vibe2{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}.dj-vibe2 .np-gform{grid-column:1/-1}}',
    '.dj-chips{display:flex;gap:8px;max-width:100%;overflow-x:auto;scrollbar-width:none;padding:2px}.dj-chips::-webkit-scrollbar{display:none}',
    '.np-dj .dj-chips button{flex:none;width:auto;height:auto;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.06em;color:rgba(245,243,255,.82);background:rgba(10,10,20,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}',
    '.np-dj .dj-chips button[aria-pressed=true]{color:#fff;background:color-mix(in srgb,var(--np-acc) 35%,rgba(10,10,20,.5));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--np-acc) 70%,transparent)}',
    '.dj-upnext{display:flex;align-items:center;gap:12px;max-width:100%;overflow:hidden;font-size:12px;color:rgba(245,243,255,.7)}.dj-upnext>span{flex:none;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}',
    '.dj-upnext ul{list-style:none;margin:0;padding:0;display:flex;gap:14px;min-width:0;overflow:hidden}',
    '.dj-upnext li{display:flex;align-items:center;gap:8px;min-width:0;max-width:220px}.dj-upnext img{width:28px;height:28px;border-radius:6px;object-fit:cover;flex:none;background:rgba(255,255,255,.08)}',
    '.dj-upnext li span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '/* quiet after a few seconds without the mouse: the cover and the song stay, the buttons fade */',
    '.np-dj.calm .dj-ctl,.np-dj.calm .dj-bot,.np-dj.calm .dj-x,.np-dj.calm .dj-pip{opacity:0}',
    '@media (max-width:760px),(max-aspect-ratio:1/1){.dj-mid{flex-direction:column;gap:18px;text-align:center}.dj-cover{width:min(62vw,40vh)}.dj-meta{justify-items:center}.dj-ctl{margin:0}.dj-prog{width:100%}}',
    '/* the playlist picker: a sheet to tap, no typing */',
    '.np-pick{position:fixed;inset:0;z-index:45;display:grid;place-items:center;padding:16px;background:rgba(4,4,12,.55);color:#f5f3ff;font:500 13px/1.4 "Chakra Petch","Trebuchet MS",system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .25s ease}',
    '.np-pick.on{opacity:1;pointer-events:auto}',
    '.np-pick .pk{width:min(360px,100%);max-height:min(560px,calc(100vh - 32px));display:grid;grid-template-rows:auto 1fr;gap:10px;padding:16px;border-radius:18px;background:rgba(14,12,24,.92);box-shadow:0 20px 60px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.12);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
    '.np-pick .pk-h{display:flex;align-items:center;gap:10px}.np-pick .pk-h b{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.np-pick button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;border-radius:10px}.np-pick button:hover{background:rgba(255,255,255,.1)}.np-pick button:focus-visible{outline:2px solid #1ed760}',
    '.np-pick .pk-x{width:32px;height:32px;display:grid;place-items:center;border-radius:50%}.np-pick .pk-x svg{width:16px;height:16px}',
    '.np-pick ul{list-style:none;margin:0;padding:0;overflow-y:auto;display:grid;gap:2px;scrollbar-width:thin}',
    '.np-pick li button{width:100%;display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;align-items:center;text-align:left;padding:6px}',
    '.np-pick li img,.np-pick li i{width:40px;height:40px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.08);display:grid;place-items:center;font-style:normal;font-size:20px}',
    '.np-pick li b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.np-pick li small{display:block;font-size:11.5px;color:rgba(245,243,255,.62)}',
    '.np-pick .pk-e{padding:12px 6px;color:rgba(245,243,255,.62)}',
    '@media (prefers-reduced-motion:reduce){.np,.np-more,.np-dj,.np-pick,.dj-cover{transition:none}.np-in::before,.np-t.mq span,.dj-tag i{animation:none}}'
  ].join('\n');

  function fmt(ms) { ms = Math.max(0, ms | 0); var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function b64url(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(t) { try { if (t) localStorage.setItem(KEY, JSON.stringify(t)); else localStorage.removeItem(KEY); } catch (e) { } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function names(list) { return (list || []).map(function (a) { return a.name; }).join(', '); }
  function pic(imgs) {   // the smallest image that is still sharp in a 34px row
    imgs = (imgs || []).filter(function (i) { return i && i.url; }); if (!imgs.length) return '';
    var ok = imgs.filter(function (i) { return !i.width || i.width >= 64; }); return (ok.length ? ok[ok.length - 1] : imgs[0]).url;
  }

  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  // the browser's small always-on-top window (Chrome, Edge) can only be opened by the top page: inside the rotation,
  // which shows each wallpaper in a frame of the same site, it is opened through the rotation page
  var PIPW = (function () {
    try { if (window.top !== window && window.top.location.origin === location.origin && window.top.documentPictureInPicture) return window.top; } catch (e) { }
    return window.top === window && 'documentPictureInPicture' in window ? window : null;
  })();
  var SETUP = window.NP_SETUP_URL || new URL('spotify.html', HERE).href;   // the one sign-in page: the only address to register with Spotify
  function cid() { try { return localStorage.getItem('np-client') || ''; } catch (e) { return ''; } }
  function corner() { try { return localStorage.getItem('np-corner') || 'tr'; } catch (e) { return 'tr'; } }

  /* ---------- sign in (PKCE): out to Spotify, back to the sign-in page, then back to where you were ---------- */
  // lively: a wallpaper address to make a Lively link for; that sign-in is Lively's own and is not kept in this browser
  function connect(back, lively) {
    var id = cid(); back = back || location.href;
    if (!id) { location.href = SETUP + '?back=' + encodeURIComponent(back); return; }
    var verifier = rand(64), state = rand(16);
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (h) {
      try { localStorage.setItem('np-pkce', JSON.stringify({ v: verifier, s: state, back: back, lively: lively || null })); } catch (e) { }
      location.href = AUTH + '/authorize?' + new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES, redirect_uri: SETUP, code_challenge_method: 'S256', code_challenge: b64url(h), state: state });
    });
  }
  function tokenCall(body, keep) {
    return fetch(AUTH + '/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error_description || j.error || 'token'); return j; }); })
      .then(function (j) {
        var old = keep === false ? null : load(), t = { access: j.access_token, refresh: j.refresh_token || (old && old.refresh), exp: Date.now() + (j.expires_in - 60) * 1000, scope: j.scope || (old && old.scope) || '' };
        if (keep !== false) save(t); return t;
      });
  }
  // on the sign-in page, back from Spotify: swap the code for tokens. Resolves to the address to go back to, or for a
  // Lively sign-in to { lively: link }: the wallpaper address carrying that sign-in, which this browser does not keep
  function handleCallback() {
    var q = new URLSearchParams(location.search), pk = null;
    try { pk = JSON.parse(localStorage.getItem('np-pkce') || 'null'); localStorage.removeItem('np-pkce'); } catch (e) { }
    if (q.get('error')) return Promise.reject(new Error('Spotify said: ' + q.get('error')));
    if (!q.get('code')) return Promise.resolve(null);
    if (!pk || q.get('state') !== pk.s) return Promise.reject(new Error('That sign-in did not start here; try again.'));
    var body = { grant_type: 'authorization_code', code: q.get('code'), redirect_uri: SETUP, client_id: cid(), code_verifier: pk.v };
    if (pk.lively) return tokenCall(body, false).then(function (t) { return { lively: String(pk.lively).split('#')[0] + '#sp=' + encodeURIComponent(t.refresh) + '~' + encodeURIComponent(cid()) }; });
    return tokenCall(body).then(function () { return pk.back; });
  }
  function signedIn() { var t = load(); return !!(t && t.refresh); }
  // signed in before the queue, library and speaker features: the sign-in lacks their permissions until done again
  function needsNewSignIn() { var t = load(); if (!t || !t.refresh || t.scope == null) return false; return SCOPES.split(' ').some(function (s) { return (' ' + t.scope + ' ').indexOf(' ' + s + ' ') < 0; }); }
  function disconnect() { save(null); }
  // a link carrying the sign-in, for Lively's own browser: #sp=<refresh token>~<client id>
  function livelyLink(url) {
    var t = load(); if (!t || !t.refresh) return '';
    var u = String(url).split('#')[0]; return u + '#sp=' + encodeURIComponent(t.refresh) + '~' + encodeURIComponent(cid());
  }
  (function () {   // any page opened with such a link keeps the sign-in
    var m = /(?:^#|&)sp=([^&~]+)~?([^&]*)/.exec(location.hash);
    if (!m) return;
    // Lively opens the same link every time it starts the wallpaper. Spotify replaces the sign-in each time it renews it
    // and the old one stops working, so the link's sign-in is taken only the first time; after that the renewed one is kept
    var given = decodeURIComponent(m[1]), seen = null; try { seen = localStorage.getItem('np-sp-seen'); } catch (e) { }
    if (given !== seen || !load()) { save({ refresh: given, access: null, exp: 0 }); try { localStorage.setItem('np-sp-seen', given); } catch (e) { } }
    if (m[2]) try { localStorage.setItem('np-client', decodeURIComponent(m[2])); } catch (e) { }
    history.replaceState(null, '', location.pathname + location.search);
  })();

  /* check(): asks Spotify what this browser's sign-in may do, without changing anything (for the Spotify page) */
  function check() {
    var t = load(); if (!t || !t.refresh) return Promise.resolve([['Signed in', false, 'Not signed in on this browser']]);
    var got = (t.scope || '').split(' ').filter(Boolean), need = SCOPES.split(' '), missing = need.filter(function (x) { return got.indexOf(x) < 0; });
    var out = [['Permissions', !missing.length, missing.length ? 'Missing: ' + missing.join(', ') + '. Press Sign in again.' : 'All granted']];
    function tok() { t = load(); if (t.access && Date.now() < t.exp) return Promise.resolve(t.access); return tokenCall({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: cid() }).then(function (n) { return n.access; }); }
    function get(path, method) {
      return tok().then(function (a) { return fetch(API + path, { method: method || 'GET', headers: { Authorization: 'Bearer ' + a } }); }).then(function (r) {
        return r.text().then(function (x) { var j = null; try { j = JSON.parse(x); } catch (e) { } return { ok: r.ok, status: r.status, j: j, msg: j && j.error ? (j.error.reason || j.error.message) : '' }; });
      });
    }
    var TRACK = '4cOdK2wGLETKBW3PvgPWqT';   // any well-known song: only asks whether it is in your library
    return get('/me').then(function (r) {
      out.push(['Account', r.ok, r.ok ? (r.j.display_name || r.j.id) + (r.j.product ? ' · Spotify ' + r.j.product : '') : r.status + ' ' + r.msg]);
      return get('/me/tracks/contains?ids=' + TRACK);
    }).then(function (r) {
      out.push(['Liked songs (/me/tracks)', r.ok, r.ok ? 'Works' : r.status + ' ' + r.msg]);
      return get('/me/library/contains?uris=' + encodeURIComponent('spotify:track:' + TRACK));
    }).then(function (r) {
      out.push(['Liked songs (/me/library)', r.ok, r.ok ? 'Works' : r.status + ' ' + r.msg]);
      return get('/me/playlists?limit=1');
    }).then(function (r) {
      out.push(['Your playlists', r.ok, r.ok ? 'Works' : r.status + ' ' + r.msg]);
      return out;
    }, function (e) { out.push(['Spotify', false, e.message]); return out; });
  }

  /* init({ id, interactive }): the player on a wallpaper. Its switch is kept per wallpaper (np-on-<id>), off until
     turned on; ?spotify=1 or 0 in the address overrides it. */
  function init(opts) {
    opts = opts || {};
    var key = 'np-on-' + (opts.id || 'page'), enabled = false;
    try { var kept = localStorage.getItem(key); enabled = kept === null ? !!opts.on : kept === '1'; } catch (e) { enabled = !!opts.on; }   // opts.on: the wallpaper's default
    var sp = new URLSearchParams(location.search).get('spotify'); if (sp === '1' || sp === '0') enabled = sp === '1';
    var tok = load(), status = 'off', statusFns = [], note = '';
    function setStatus(s, n) { status = s; if (n != null) note = n; statusFns.forEach(function (f) { f(status, note); }); }
    function refresh() { tok = load(); if (!tok || !tok.refresh) return Promise.reject(new Error('signed out')); return tokenCall({ grant_type: 'refresh_token', refresh_token: tok.refresh, client_id: cid() }).then(function (t) { tok = t; return t; }); }
    function access() { tok = load() || tok; if (tok && tok.access && Date.now() < tok.exp) return Promise.resolve(tok.access); return refresh().then(function (t) { return t.access; }); }
    var ready = Promise.resolve();

    /* ---------- the API ---------- */
    var inflight = 0, waiting = [], coolUntil = 0;
    var searchLimit = null, apiLimit = null;
    function slot() {
      return new Promise(function (res) {
        function take() { inflight++; res(); }
        if (inflight < 3) take(); else waiting.push(take);
      });
    }
    // Search can be limited separately from playback. Use a new key so old ten-minute delays expire with the update.
    var searchUntil = 0, searchRetryKey = 'np-search-retry', searchQuotaKey = 'np-search-quota-until';
    function searchResting() {
      var t = searchUntil;
      try { t = Math.max(t, +localStorage.getItem(searchRetryKey) || 0); } catch (e) { }
      return t > Date.now() ? t : 0;
    }
    function rateError(until, search) {
      var e = new Error('Spotify declined requests'); e.status = 429; e.retryAt = until; e.searchLimited = search;
      e.limit = search ? searchLimit : apiLimit; return e;
    }
    function retryMessage(until, search, limit) {
      var sec = Math.max(1, Math.ceil((until - Date.now()) / 1000));
      var wait = sec < 60 ? sec + ' sec' : Math.ceil(sec / 60) + ' min';
      var quota = limit && limit.quota;
      if (!limit && search) try { quota = +localStorage.getItem(searchQuotaKey) > Date.now(); } catch (e) { }
      if (quota && search && (!limit || !limit.hasRetryAfter)) return 'Spotify’s search quota is used up. The DJ can still use your library.';
      var message = quota ? 'Spotify reported a Development Mode quota limit.' : (search ? 'Spotify search' : 'Spotify') + ' is on cooldown.';
      if (limit && !limit.hasRetryAfter) return message + ' App pause: ' + wait + '.';
      return message + ' Try again in ' + wait + '.';
    }
    function release() { inflight--; var n = waiting.shift(); if (n) n(); }
    function call(method, path, body, again) {
      var search = /^\/search(?:\?|$)/.test(path);
      function checkCooldown() {
        if (coolUntil > Date.now()) throw rateError(coolUntil, false);
        if (search && searchResting()) throw rateError(searchResting(), true);
      }
      return slot().then(function () {
        return Promise.resolve().then(checkCooldown).then(access).then(function (a) {
          checkCooldown();
          return fetch(API + path, { method: method, headers: Object.assign({ Authorization: 'Bearer ' + a }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
        }).then(function (r) {
          if (r.status !== 429) return r;
          var header = r.headers.get('Retry-After'), sec = header == null || !header.trim() ? NaN : Number(header);
          var supplied = Number.isFinite(sec) && sec >= 0;
          var until = Date.now() + (supplied ? sec : 30) * 1000;
          if (search) {
            searchUntil = Math.max(searchResting(), until);
            try { localStorage.setItem(searchRetryKey, String(searchUntil)); } catch (e) { }
          } else coolUntil = Math.max(coolUntil, until);
          return r.json().catch(function () { return null; }).then(function (j) {
            var limit = { quota: !!(j && j.error && j.error.reason === 'QUOTA_EXCEEDED'), hasRetryAfter: supplied };
            if (search && !supplied && limit.quota) {
              searchUntil = Math.max(searchUntil, Date.now() + 15 * 60000);
              try { localStorage.setItem(searchRetryKey, String(searchUntil)); localStorage.setItem(searchQuotaKey, String(searchUntil)); } catch (e) { }
            }
            if (search) searchLimit = limit; else apiLimit = limit;
            throw rateError(search ? searchUntil : coolUntil, search);
          });
        }).finally(release);
      }).then(function (r) {
        if (r.status === 401 && !again) { var t = load(); if (t) { t.exp = 0; save(t); } tok = t; return call(method, path, body, true); }   // the access ran out early: once more with a fresh one
        if (r.status === 204 || r.status === 202) return null;
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) { var e = new Error((j && j.error && (j.error.reason || j.error.message)) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
    }
    // what went wrong, in a few words
    function why(e) {
      if (e.status === 401 || /signed out|invalid_grant/i.test(e.message)) return 'Sign in again on the Spotify page';
      if (e.status === 403 && /scope/i.test(e.message)) return 'Sign in again on the Spotify page to allow this';
      if (/PREMIUM/i.test(e.message)) return 'This needs Spotify Premium';   // Spotify says so itself (PREMIUM_REQUIRED)
      if (e.status === 403) return 'Spotify refused: ' + e.message;
      if (e.status === 404) return 'No active device: open Spotify first';
      if (e.status === 429) return retryMessage(e.retryAt, e.searchLimited, e.limit);
      return e.message;
    }

    /* ---------- the card ---------- */
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var npc = new URLSearchParams(location.search).get('npc'), box = document.createElement('div'), cor = /^(tr|tl|br|bl)$/.test(npc || '') ? npc : corner(); box.className = 'np ' + cor; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Now playing on Spotify');
    var BANDS = [['now', 'Now'], ['queue', 'Queue'], ['search', 'Search'], ['lib', 'Library'], ['dev', 'Devices']];
    box.innerHTML = '<div class="np-card"><div class="np-in">' +
      '<div class="np-src" hidden><span class="np-srctabs" role="tablist" aria-label="Music from" hidden><button type="button" role="tab" data-s="sp" aria-selected="true">Spotify</button><button type="button" role="tab" data-s="yt" aria-selected="false">YouTube</button></span>' +
      '<button type="button" class="np-resign" title="Sign in again">' + ICON.key + 'Sign in</button></div>' +
      '<div class="np-sp"><div class="np-mini"><img class="np-art" alt=""><span class="np-lk" aria-hidden="true">' + ICON.heartOn + '</span><div class="np-txt"><b class="np-t"><span>—</span></b><span class="np-a"></span></div>' +
      '<div class="np-btns"><button type="button" class="np-prev" aria-label="Previous">' + ICON.prev + '</button><button type="button" class="np-play" aria-label="Pause">' + ICON.pause + '</button>' +
      '<button type="button" class="np-next" aria-label="Next">' + ICON.next + '</button><button type="button" class="np-djbtn" aria-label="DJ mode" title="DJ mode: new songs in a vibe you pick, full page">' + ICON.dj + '</button><button type="button" class="np-pip" aria-label="Small window" title="Small window: a little player that stays on top">' + ICON.pip + '</button><button type="button" class="np-wide" aria-label="Expand" aria-pressed="false" title="Expand">' + ICON.wide + '</button><button type="button" class="np-exp" aria-label="More" aria-expanded="false">' + ICON.open + '</button></div>' +
      '<span class="np-line" aria-hidden="true"><i></i></span></div>' +
      '<div class="np-more"><div class="np-bands" role="tablist" aria-label="Player">' +
      BANDS.map(function (b, i) { return '<button type="button" role="tab" data-p="' + b[0] + '" aria-selected="' + (i ? 'false' : 'true') + '" tabindex="' + (i ? -1 : 0) + '">' + b[1] + '</button>'; }).join('') + '</div>' +
      '<section class="np-pane on" data-pane="now" role="tabpanel" aria-label="Now">' +
      '<div class="np-hero"><img class="np-cover" alt=""><span class="np-yr" aria-hidden="true"></span><div class="np-back"><span class="np-rel"></span><b class="np-album"></b></div></div>' +
      '<div class="np-artist"><img class="np-aimg" alt=""><span class="np-awho"><b class="np-aname"></b><span class="np-genre"></span></span></div>' +
      '<div class="np-seek np-ctl"><span class="np-cur">0:00</span><input type="range" class="np-pos" min="0" max="1000" value="0" aria-label="Position"><span class="np-dur">0:00</span></div>' +
      '<div class="np-tg np-ctl"><button type="button" class="np-tog np-shuf" aria-label="Shuffle" aria-pressed="false">' + ICON.shuffle + '</button>' +
      '<button type="button" class="np-tog np-rep" aria-label="Repeat: off">' + ICON.repeat + '</button>' +
      '<button type="button" class="np-tog np-like" aria-label="Save to your library" aria-pressed="false">' + ICON.heart + '</button></div>' +
      '<label class="np-vol np-ctl">' + ICON.vol + '<input type="range" class="np-volr" min="0" max="100" value="50" aria-label="Volume"></label>' +
      '<p class="np-note"></p><div class="np-foot"><button type="button" class="np-dev">Choose a device</button><a class="np-link" target="_blank" rel="noopener">Open in Spotify ↗</a></div><div class="np-acts np-shares" hidden><button type="button" class="np-share">' + ICON.share + 'Share to Discord</button></div></section>' +
      '<section class="np-pane" data-pane="queue" role="tabpanel" aria-label="Queue"><ul class="np-list np-ql"></ul></section>' +
      '<section class="np-pane" data-pane="search" role="tabpanel" aria-label="Search"><form class="np-gform np-searchform"><input type="search" class="np-q" placeholder="Songs, artists, albums…" aria-label="Search Spotify" autocomplete="off" spellcheck="false"><button type="submit">Search</button></form><ul class="np-list np-sl"></ul></section>' +
      '<section class="np-pane" data-pane="lib" role="tabpanel" aria-label="Library"><div class="np-chips np-lsub"><button type="button" data-l="pl" aria-pressed="true">Playlists</button><button type="button" data-l="liked" aria-pressed="false">Liked</button><button type="button" data-l="recent" aria-pressed="false">Recent</button><button type="button" data-l="tt" aria-pressed="false">Top songs</button><button type="button" data-l="ta" aria-pressed="false">Top artists</button></div>' +
      '<div class="np-chips np-lrange" hidden><button type="button" data-r="short_term" aria-pressed="true">4 weeks</button><button type="button" data-r="medium_term" aria-pressed="false">6 months</button><button type="button" data-r="long_term" aria-pressed="false">All time</button></div><ul class="np-list np-ll"></ul></section>' +
      '<section class="np-pane" data-pane="dev" role="tabpanel" aria-label="Devices"><ul class="np-list np-dl"></ul>' +
      '<div class="np-foot"><button type="button" class="np-devrefresh">Refresh devices</button><a class="np-link" href="https://open.spotify.com" target="_blank" rel="noopener">Open Spotify on this computer ↗</a></div>' +
      (opts.app ? '<p class="np-note">To play through this computer’s audio, open the Spotify desktop app or web player on the same account, refresh, and select it here.</p>' : '') +
      '<label class="np-here"><input type="checkbox" class="np-herecb"><span><b>Play on this wallpaper</b><small>Makes this page a Spotify speaker you can pick from your phone. Premium only.</small></span></label>' +
      '<label class="np-here"><input type="checkbox" class="np-keepcb"><span><b>Keep the music here</b><small>Every 5 seconds, if another device has the music, this wallpaper takes it back (playing or paused, as it was).</small></span></label><p class="np-herenote" aria-live="polite"></p></section>' +
      '</div></div><div class="np-yt"></div></div></div>';
    document.body.appendChild(box);
    var spEl = box.querySelector('.np-sp');   // Spotify's part of the card (YouTube has its own, in the same layout)
    function $(c) { return spEl.querySelector(c); }
    function $$(c) { return Array.prototype.slice.call(spEl.querySelectorAll(c)); }
    var S = null, at = 0, lastPlay = 0, art = '', liked = null, lastId = null, hold = 0, timer = null, busy = false, pane = 'now';
    var selectedDevice = null, deviceSettlesAt = 0;

    function setTitle(text) {
      var b = $('.np-t'), sp = b.firstChild; if (sp.textContent === text) return;
      sp.textContent = text; b.classList.remove('mq'); requestAnimationFrame(fitTitle);
    }
    function fitTitle() {   // too long for its space: scroll it, at a steady reading speed
      var b = $('.np-t'), d = b.firstChild.scrollWidth - b.clientWidth;
      if (d > 2 && !reduce && b.clientWidth) { b.style.setProperty('--mq', -(d + 16) + 'px'); b.style.setProperty('--mqd', Math.max(5, (d + 16) / 22 + 3).toFixed(1) + 's'); b.classList.add('mq'); }
    }
    var SITE = true, idleMode = null;
    // in Lively (?wallpaper, but not the website's own rotation): no keyboard, so signing in has to happen on the PC's browser
    var LIVELY = /[?&]wallpaper\b/.test(location.search) && !/[?&]npsite=1\b/.test(location.search);   // the same everywhere, ?wallpaper (Lively) included: the arrow and the Connect / Nothing playing cards always show
    // the corner arrow: the player starts tucked away (remembered per wallpaper; nptuck=0 starts it out)
    var tab = document.createElement('button'); tab.type = 'button'; tab.className = 'np-tab ' + cor + (opts.skin ? ' sk-' + opts.skin : '');
    if (SITE) tab.classList.add('site');
    tab.innerHTML = '<svg viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    document.body.appendChild(tab); box.classList.add('tabbed');
    var tk = 'np-tuck-' + (opts.id || 'page'), tucked = true, tq = new URLSearchParams(location.search).get('nptuck');
    try { var tv = localStorage.getItem(tk); if (tv !== null) tucked = tv === '1'; } catch (e) { }
    if (tq === '0' || tq === '1') tucked = tq === '1';
    function setTuck(t, keep) {
      tucked = t; box.classList.toggle('tucked', t); tab.classList.toggle('out', !t);
      tab.setAttribute('aria-expanded', String(!t)); tab.setAttribute('aria-label', t ? 'Show the Spotify player' : 'Tuck the Spotify player away'); tab.title = tab.getAttribute('aria-label');
      if (!t) requestAnimationFrame(fitTitle); else setBig(false);
      if (keep) try { localStorage.setItem(tk, t ? '1' : '0'); } catch (e) { }
    }
    tab.addEventListener('click', function () { setTuck(!tucked, true); });
    setTuck(tucked);
    function show() { box.classList.add('on'); tab.classList.add('on'); }
    function hide() { if (enabled && src === 'yt') { show(); return; } box.classList.remove('on'); tab.classList.remove('on'); setBig(false); }   // the YouTube tab stays up
    // the quiet states, on the website only (a wallpaper tucks the player away instead)
    var NOTE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#2b2238"/><path d="M16 12v13.5a4 4 0 1 1-2-3.5V14l12-3v11.5a4 4 0 1 1-2-3.5V9.4z" fill="#c9b8e8"/></svg>');
    function setIdle(mode) {
      if (mode === idleMode) { if (mode) show(); return; }
      idleMode = mode; box.classList.toggle('np-idle', !!mode);
      if (!mode) { art = ''; return; }
      if (!opts.app) setBig(false);
      art = NOTE; $('.np-art').src = NOTE;
      setTitle(mode === 'connect' ? 'Spotify' : 'Nothing playing');
      $('.np-a').textContent = mode === 'connect' ? (LIVELY ? 'Connect from your PC\'s browser: click for how' : 'Connect to show what is playing') : 'Play something on Spotify';
      show();
    }
    box.addEventListener('click', function (e) {   // a quiet card: click to connect, or to open Spotify
      if (src === 'yt' || e.target.closest('.np-src,.np-more')) return;
      if (here && here.activateElement) try { here.activateElement(); } catch (er) { }   // lets the wallpaper speaker play sound (browsers want a click first)
      if (!idleMode || e.target.closest('button')) return;
      if (idleMode === 'connect' && LIVELY) {   // a wallpaper cannot be typed into: point to the Spotify page on the PC, and copy its address
        var addr = SETUP.replace(/^https?:\/\//, '');
        var told = function (ok) { flash((ok ? 'Address copied. ' : '') + 'On your PC, open ' + addr + ', press Sign in for Lively, and paste the new link into Lively', true); };
        try { navigator.clipboard.writeText(SETUP).then(function () { told(true); }, function () { told(false); }); } catch (er) { told(false); }
        return;
      }
      if (idleMode === 'connect') { var w = window.top || window; try { w.location.href = SETUP + '?back=' + encodeURIComponent(w.location.href); } catch (er) { location.href = SETUP + '?back=' + encodeURIComponent(location.href); } }   // the whole tab, even from inside the rotation
      else if (idleMode === 'nothing') window.open('https://open.spotify.com', '_blank', 'noopener');
    });
    function paint() {
      if (!S || !S.item) return;
      var it = S.item, artists = (it.artists || it.show && [it.show] || []).map(function (a) { return a.name; }).join(', ');
      setTitle(it.name); if (!$('.np-a').classList.contains('fl')) $('.np-a').textContent = artists;
      if (it.id !== lastId) {
        lastId = it.id; liked = it.id in likes ? likes[it.id] : null; likePaint();
        if (it.type === 'track') checkLiked();   // the cover's heart badge, even with the player closed
        if (box.classList.contains('big') && (pane === 'now' || pane === 'queue')) fill(pane);
      }
      var img = it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : (it.images && it.images[0] ? it.images[0].url : '');
      if (img !== art) { art = img; $('.np-art').src = img; $('.np-cover').src = img; tint(img); }
      box.classList.toggle('playing', !!S.is_playing);
      $('.np-play').innerHTML = S.is_playing ? ICON.pause : ICON.play; $('.np-play').setAttribute('aria-label', S.is_playing ? 'Pause' : 'Play');
      $('.np-shuf').classList.toggle('on', !!S.shuffle_state); $('.np-shuf').setAttribute('aria-pressed', String(!!S.shuffle_state));
      $('.np-rep').classList.toggle('on', S.repeat_state !== 'off'); $('.np-rep').setAttribute('aria-label', 'Repeat: ' + (S.repeat_state === 'track' ? 'this track' : S.repeat_state === 'context' ? 'on' : 'off'));
      $('.np-rep').style.opacity = S.repeat_state === 'track' ? '1' : '';
      $('.np-dev').textContent = S.device ? 'On ' + S.device.name + ' · Change' : 'Choose a device';
      if (S.device && document.activeElement !== $('.np-volr') && S.device.volume_percent != null) $('.np-volr').value = S.device.volume_percent;
      $('.np-link').href = it.external_urls ? it.external_urls.spotify : 'https://open.spotify.com';
      $('.np-dur').textContent = fmt(it.duration_ms);
      $('.np-note').textContent = note;
      djPaint(); pipPaint(); emitTrack();
    }
    var lastEmit = null;
    function emitTrack() {
      var it = S && S.item, playing = !!(S && S.is_playing && it);
      var start = it ? at - (S.progress_ms || 0) : 0, id = it ? it.id || it.uri : '';
      if (lastEmit && lastEmit.id === id && lastEmit.playing === playing && Math.abs(lastEmit.start - start) < 4000) return;
      lastEmit = { id: id, playing: playing, start: start };
      var img = it && it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : (it && it.images && it.images[0] ? it.images[0].url : '');
      window.dispatchEvent(new CustomEvent('np:track', { detail: it ? {
        source: 'spotify', id: id, title: it.name, artist: (it.artists || it.show && [it.show] || []).map(function (a) { return a.name; }).join(', '),
        album: it.album ? it.album.name : it.show ? it.show.name : '', art: img, url: it.external_urls && it.external_urls.spotify || '', playing: playing, start: start, duration: it.duration_ms || 0
      } : { source: 'spotify', playing: false } }));
    }
    function currentTrack() { var it = S && S.item; if (!it) return null; lastEmit = null; var d = null; window.addEventListener('np:track', function f(e) { d = e.detail; window.removeEventListener('np:track', f); }); emitTrack(); return d; }
    var tickAt = 0;
    function tick(now) {   // the position, moved on locally between polls: every frame in the full view, four times a second otherwise
      requestAnimationFrame(tick);
      if ((document.hidden && !pipWin) || (!djOpen && now - tickAt < 250)) return;
      tickAt = now;
      if (S && S.item) {
        var pos = Math.min(S.item.duration_ms, S.progress_ms + (S.is_playing ? Date.now() - at : 0)), f = pos / S.item.duration_ms, pc = (f * 100).toFixed(2) + '%';
        $('.np-line i').style.width = pc;
        if (document.activeElement !== $('.np-pos')) { $('.np-pos').value = Math.round(f * 1000); $('.np-cur').textContent = fmt(pos); }
        if (djOpen) { djQ('.dj-bar i').style.width = pc; djQ('.dj-cur').textContent = fmt(pos); }
        if (pipWin) pipWin.document.querySelector('.bar i').style.width = pc;
      }
    }
    requestAnimationFrame(tick);
    function tint(url) {   // the card takes a colour from the cover (if the image allows it); a skin keeps its own
      if (!url || opts.skin) return;
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = c.height = 16; var x = c.getContext('2d'); x.drawImage(im, 0, 0, 16, 16);
          var d = x.getImageData(0, 0, 16, 16).data, best = null, bs = -1;
          for (var i = 0; i < d.length; i += 4) { var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, sc = sat * (mx / 255); if (sc > bs && mx > 70) { bs = sc; best = [r, g, b]; } }
          if (best) box.style.setProperty('--np-acc', 'rgb(' + best.join(',') + ')');
        } catch (e) { }
      };
      im.src = url;
    }

    /* ---------- polling ---------- */
    // Each page asks Spotify what is playing; the answer is shared through this browser's storage, so another page that
    // asked a moment ago (and after our last button press) saves this one a request: three open pages cost about one.
    var pollWho = rand(8), lastAction = 0, polling = false, panelActive = false, lagged = false, lastRaw = null;
    function shared() { try { var x = JSON.parse(localStorage.getItem('np-shared') || 'null'); return x && x.t ? x : null; } catch (e) { return null; } }
    function hereActive() { return !!(hereId && S && S.device && S.device.id === hereId); }
    function gap() {
      if (!tok) return 10000;
      if (opts.app && !panelActive) return S && S.is_playing ? 15000 : 30000;
      if (S && S.is_playing) return hereActive() ? 15000 : (box.classList.contains('big') || djOpen || keepHere ? 5000 : 8000);   // playing here: the speaker itself reports changes
      return S && S.item ? 6000 : 12000;
    }
    function poll() {
      if (polling) return;
      clearTimeout(timer);
      tok = load() || tok;
      if (!enabled || !tok || document.hidden) {
        if (!enabled || !tok) hide();
        if (enabled && !tok && SITE) setIdle('connect');   // on the website, signed out: a card to connect
        timer = setTimeout(poll, 4000); return;
      }
      polling = true;
      var requestedAt = Date.now(), sh = shared(), ask = sh && sh.who !== pollWho && sh.t > lastAction && Date.now() - sh.t < 2500
        ? Promise.resolve(sh.S)
        : call('GET', '/me/player?additional_types=episode').then(function (j) { try { localStorage.setItem('np-shared', JSON.stringify({ t: Date.now(), who: pollWho, S: j })); } catch (e) { } return j; });
      ask.then(function (j) {
        if (busy || requestedAt < lastAction || Date.now() < hold) return;   // a control was just pressed: let its result settle first
        var was = S && S.item && S.is_playing && j && j.item && j.is_playing && S.item.id === j.item.id ? S.progress_ms + (Date.now() - at) : null;
        var raw = j && j.item ? j.item.id + '@' + j.progress_ms : null, stale = raw && raw === lastRaw;
        lastRaw = raw;
        S = j; at = Date.now();
        // Spotify's position can be behind. A device that has stopped reporting (the Web Player in a background browser tab)
        // leaves Spotify repeating the very same position while "playing": that answer says nothing new, so the clock keeps
        // counting. And an answer a few seconds old (or a shared one, up to 2.5 s old) would make the time jump back and
        // forward again: a step back on one answer is lag and the clock keeps counting; if the next answer says the same,
        // it was a real rewind (from another device) and it is taken.
        var back = was == null ? 0 : was - j.progress_ms, dur = j.item && j.item.duration_ms || Infinity;
        if (was != null && stale) { S.progress_ms = Math.min(was, dur); lagged = false; }
        else if (back > 0 && back < 12000 && !(back > 1500 && lagged)) { S.progress_ms = Math.min(was, dur); lagged = back > 1500; }
        else lagged = false;
        if (j && j.device && j.device.id && (j.device.id === (selectedDevice && selectedDevice.id) || Date.now() >= deviceSettlesAt)) selectedDevice = null;
        if (j && j.item && j.is_playing) lastPlay = Date.now();
        setStatus(j && j.item ? (j.is_playing ? 'playing' : 'paused') : 'idle');
        djPaint(); djKeepGoing(); if (keepHere) grabCheck();
        if (j && j.item && (j.is_playing || SITE || Date.now() - lastPlay < 30000)) { setIdle(null); paint(); show(); }   // on the website a paused track stays, ready to resume
        else if (SITE) { setIdle('nothing'); S = null; emitTrack(); }   // on the website, nothing playing: a quiet card
        else hide();   // as a wallpaper, paused for 30 s or stopped: tuck away
      }).catch(function (e) {
        if (/signed out|invalid_grant|refresh token/i.test(e.message)) { tok = null; save(null); hide(); setStatus('off', 'Signed out. Connect again.'); return; }
        setStatus('error', why(e));
      }).finally(function () {
        polling = false;
        timer = setTimeout(poll, Math.min(2147483647, Math.max(gap(), coolUntil - Date.now())));
      });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });

    /* ---------- controls ---------- */
    // a short message in the small player itself, where the artist sits, so a button never fails silently
    var flashT = 0;
    function flash(msg, ok) {
      djToast(msg, ok);
      var a = $('.np-a'); clearTimeout(flashT); a.textContent = msg; a.classList.add('fl'); a.classList.toggle('bad', !ok);
      flashT = setTimeout(function () { a.classList.remove('fl', 'bad'); if (S && S.item) paint(); }, 4500);
    }
    function ctl(method, path, optimistic) {
      if (busy) return; busy = true; hold = Date.now() + 800; lastAction = Date.now();
      if (optimistic) { optimistic(); paint(); djPaint(); }
      call(method, path).then(function () { note = ''; }).catch(function (e) {
        note = why(e);
        paint(); flash(note);
      }).then(function () { busy = false; setTimeout(function () { hold = 0; poll(); }, 650); });
    }
    $('.np-play').addEventListener('click', function () {
      if (!S) return; var playing = S.is_playing;
      ctl('PUT', playing ? '/me/player/pause' : '/me/player/play', function () { S.progress_ms += playing ? Date.now() - at : 0; at = Date.now(); S.is_playing = !playing; });
    });
    $('.np-next').addEventListener('click', function () { ctl('POST', '/me/player/next'); });
    $('.np-prev').addEventListener('click', function () { ctl('POST', '/me/player/previous'); });
    function setBig(big) {
      if (box.classList.contains('big') === big) return;
      box.classList.toggle('big', big); var b = $('.np-exp');
      b.innerHTML = big ? ICON.close : ICON.open; b.setAttribute('aria-expanded', String(big)); b.setAttribute('aria-label', big ? 'Less' : 'More');
      if (big && src !== 'yt') { checkLiked(); fill(pane); }
      if (yt) { yt.sync(); if (big && src === 'yt') yt.fill(); }
    }
    $('.np-exp').addEventListener('click', function () { setBig(!box.classList.contains('big')); });
    // expand: a wide panel (remembered in this browser)
    function setWide(w, keep) {
      box.classList.toggle('wide', w); var b = $('.np-wide');
      b.innerHTML = w ? ICON.narrow : ICON.wide; b.setAttribute('aria-pressed', String(w)); b.setAttribute('aria-label', w ? 'Make narrower' : 'Expand'); b.title = b.getAttribute('aria-label');
      if (keep) try { localStorage.setItem('np-wide', w ? '1' : '0'); } catch (e) { }
      requestAnimationFrame(fitTitle); if (yt) yt.sync();
    }
    $('.np-wide').addEventListener('click', function () { setWide(!box.classList.contains('wide'), true); });
    var src = 'sp', yt = null;
    // sign in again: Spotify through its sign-in page (the whole tab, even from inside the rotation), or Google for YouTube
    // shown on every page: the website's "As a wallpaper" pages use the same ?wallpaper address as Lively, so they cannot be told apart
    box.querySelector('.np-src').hidden = false;
    box.querySelector('.np-resign').addEventListener('click', function () {
      if (src === 'yt' && window.YTMusic) {
        window.YTMusic.fetchLibrary('select_account').then(function () { if (yt) { yt.fill(); } }, function (e) { if (/Client ID/.test(e.message)) (window.top || window).location.href = window.YTMusic.setup; else alert(e.message); });
        return;
      }
      var w = window; try { if (window.top.location.origin === location.origin) w = window.top; } catch (e) { }
      w.location.href = SETUP + '?signin=1&back=' + encodeURIComponent(w.location.href);
    });
    try { setWide(localStorage.getItem('np-wide') === '1'); } catch (e) { setWide(false); }
    /* the source: Spotify, or YouTube (a tab in the same card, when ytmusic.js is on the page) */
    function setSrc(s2, keep) {
      var changed = src !== s2;
      src = s2; box.classList.toggle('src-yt', s2 === 'yt');
      Array.prototype.forEach.call(box.querySelectorAll('.np-srctabs button'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-s') === s2)); });
      box.setAttribute('aria-label', s2 === 'yt' ? 'YouTube' : 'Now playing on Spotify');
      if (keep) try { localStorage.setItem('np-src', s2); } catch (e) { }
      if (s2 === 'yt') { if (enabled) show(); if (yt) { yt.sync(); yt.fill(); } }
      else if (changed || !opts.app) { if (box.classList.contains('big')) { checkLiked(); fill(pane); } poll(); }
    }
    if (window.YTMusic && window.YTMusic.mount) {
      yt = window.YTMusic.mount(box.querySelector('.np-yt'), {
        setBig: function (b) { setBig(b); }, isBig: function () { return box.classList.contains('big'); },
        toggleWide: function () { setWide(!box.classList.contains('wide'), true); }, isWide: function () { return box.classList.contains('wide'); },
        pauseOther: function () { if (S && S.is_playing) ctl('PUT', '/me/player/pause', function () { S.progress_ms += Date.now() - at; at = Date.now(); S.is_playing = false; }); },   // YouTube started: Spotify pauses
        canPip: !!PIPW, pipHost: PIPW,
        openFull: function () { setView('yt'); }, closeFull: function () { if (view === 'yt') setView(null, true); }, onChange: function () { if (view === 'yt') djPaint(); }
      });
      box.querySelector('.np-srctabs').hidden = false;
      Array.prototype.forEach.call(box.querySelectorAll('.np-srctabs button'), function (b) { b.addEventListener('click', function () { setSrc(b.getAttribute('data-s'), true); }); });
      var ysq = new URLSearchParams(location.search).get('youtube'), ys = 'sp'; try { ys = localStorage.getItem('np-src') || 'sp'; } catch (e) { }
      if (ysq === '1' || ysq === '0') ys = ysq === '1' ? 'yt' : 'sp';
      if (ys === 'yt') setTimeout(function () { setSrc('yt'); }, 0);
    }
    // your library (the heart): /me/tracks, or Spotify's newer /me/library for apps it has moved over; whichever answers is remembered
    var libNew = false; try { libNew = localStorage.getItem('np-lib-new') === '1'; } catch (e) { }
    function libTry(oldWay, newWay) {
      var a = libNew ? newWay : oldWay, b = libNew ? oldWay : newWay;
      return a().catch(function (e) {
        if (e.status === 401 || e.status === 429 || /scope|PREMIUM/i.test(e.message)) throw e;
        return b().then(function (r) { libNew = !libNew; try { localStorage.setItem('np-lib-new', libNew ? '1' : '0'); } catch (er) { } return r; }, function () { throw e; });
      });
    }
    function libSave(id, on) {
      return libTry(function () { return call(on ? 'PUT' : 'DELETE', '/me/tracks?ids=' + id); }, function () { return call(on ? 'PUT' : 'DELETE', '/me/library?uris=' + encodeURIComponent('spotify:track:' + id)); });
    }
    function libHas(ids) {
      return libTry(function () { return call('GET', '/me/tracks/contains?ids=' + ids.join(',')); }, function () { return call('GET', '/me/library/contains?uris=' + ids.map(function (i) { return encodeURIComponent('spotify:track:' + i); }).join(',')); });
    }
    var likes = {};   // song id -> liked (true / false), as Spotify last said
    function checkLiked() { if (S && S.item && S.item.id && S.item.type === 'track') libHas([S.item.id]).then(function (j) { liked = !!(j && j[0]); likes[S.item.id] = liked; likePaint(); }).catch(function () { }); }
    // a heart on every song in a list: filled when liked; press it to like or unlike
    function heartPaint(b, on) { b.innerHTML = on ? ICON.heartOn : ICON.heart; b.classList.toggle('liked', !!on); b.setAttribute('aria-pressed', String(!!on)); b.title = on ? 'In your Liked Songs (press to remove)' : 'Like'; }
    function syncHearts(id) { Array.prototype.forEach.call(box.querySelectorAll('.np-heart[data-id="' + id + '"]'), function (b) { heartPaint(b, likes[id]); }); }
    function markLikes(ul) {
      var bs = Array.prototype.slice.call(ul.querySelectorAll('.np-heart')), ids = [];
      bs.forEach(function (b) { var id = b.getAttribute('data-id'); if (id in likes) heartPaint(b, likes[id]); else if (ids.indexOf(id) < 0) ids.push(id); });
      for (var i = 0; i < ids.length; i += 50) (function (chunk) {
        libHas(chunk).then(function (j) { chunk.forEach(function (id, k) { likes[id] = !!(j && j[k]); syncHearts(id); }); }, function () { });
      })(ids.slice(i, i + 50));
    }
    function toggleLike(id, label) {
      var was = !!likes[id]; likes[id] = !was; syncHearts(id);
      if (S && S.item && S.item.id === id) { liked = !was; likePaint(); }
      return libSave(id, !was).then(function () { flash(was ? 'Removed from your Liked Songs: ' + label : 'Liked: ' + label, true); }, function (e) {
        likes[id] = was; syncHearts(id); if (S && S.item && S.item.id === id) { liked = was; likePaint(); }
        flash(e.status === 401 || /scope/i.test(e.message) ? 'Sign in again on the Spotify page to allow saving songs' : 'Spotify would not save it: ' + e.message);
      });
    }
    $('.np-pos').addEventListener('change', function () {
      if (!S || !S.item) return; var ms = Math.round(this.value / 1000 * S.item.duration_ms);
      ctl('PUT', '/me/player/seek?position_ms=' + ms, function () { S.progress_ms = ms; at = Date.now(); });
    });
    $('.np-pos').addEventListener('input', function () { if (S && S.item) $('.np-cur').textContent = fmt(this.value / 1000 * S.item.duration_ms); });
    $('.np-shuf').addEventListener('click', function () { if (S) ctl('PUT', '/me/player/shuffle?state=' + !S.shuffle_state, function () { S.shuffle_state = !S.shuffle_state; }); });
    $('.np-rep').addEventListener('click', function () {
      if (!S) return; var nx = { off: 'context', context: 'track', track: 'off' }[S.repeat_state] || 'off';
      ctl('PUT', '/me/player/repeat?state=' + nx, function () { S.repeat_state = nx; });
    });
    var vt; $('.np-volr').addEventListener('input', function () { var v = this.value; clearTimeout(vt); vt = setTimeout(function () { ctl('PUT', '/me/player/volume?volume_percent=' + v, function () { if (S.device) S.device.volume_percent = +v; }); }, 250); });
    function likePaint() {
      var b = $('.np-like'); b.innerHTML = liked ? ICON.heartOn : ICON.heart; b.classList.toggle('on', !!liked); b.setAttribute('aria-pressed', String(!!liked));
      box.classList.toggle('is-liked', !!liked && !!(S && S.item)); if (S && S.item && S.item.id && liked != null) { likes[S.item.id] = !!liked; syncHearts(S.item.id); }
      if (djOpen) djPaint(); pipPaint();
    }
    $('.np-like').addEventListener('click', function () {
      if (!S || !S.item || !S.item.id) return;
      likes[S.item.id] = !!liked; toggleLike(S.item.id, S.item.name);
    });

    /* ---------- playing anything: a song, an album, a playlist, an artist ---------- */
    function play(body, label) {
      if (busy) { flash('Wait for the current Spotify control to finish.'); return Promise.resolve(false); }
      busy = true;
      hold = Date.now() + 1500; lastAction = Date.now();
      var chosen = selectedDevice, target = chosen || (S && S.device && !S.device.is_restricted ? S.device : null);
      function startOn(d) { return call('PUT', '/me/player/play' + (d && d.id ? '?device_id=' + encodeURIComponent(d.id) : ''), body); }
      return startOn(target).catch(function (e) {
        if (e.status !== 404) throw e;
        if (chosen) { selectedDevice = null; throw new Error(chosen.name + ' is unavailable. Choose a device again.'); }
        return call('GET', '/me/player/devices').then(function (j) {
          var ds = (j && j.devices || []).filter(function (d) { return d.id && !d.is_restricted; });
          var d = ds.find(function (x) { return x.is_active || x.id === hereId; }) || (ds.length === 1 ? ds[0] : null);
          if (!d || (target && d.id === target.id)) throw new Error('Choose an available Spotify player in Devices, then try again.');
          return startOn(d);
        });
      }).then(function () { flash('Playing ' + label, true); setTimeout(function () { hold = 0; poll(); }, 900); return true; },
        function (e) { hold = 0; flash(why(e)); return false; }).finally(function () { busy = false; });
    }
    var addedQ = {}, addedPl = {};   // songs added this visit: to the queue, and to a playlist (its name)
    function enqueue(uri, label) {
      return call('POST', '/me/player/queue?uri=' + encodeURIComponent(uri)).then(function () { addedQ[uri] = 1; flash('Added to the queue: ' + label, true); if (pane === 'queue') fill('queue'); return true; }, function (e) { flash(why(e)); return false; });
    }
    function markAdded(btn, what) { if (!btn) return; btn.innerHTML = ICON.check; btn.classList.add('done'); btn.title = what; btn.setAttribute('aria-label', what); }
    function year(d) { return d ? String(d).slice(0, 4) : ''; }
    // ctx: { context: a playlist or album uri, label } or { album: true } (search: the song's album); used with .map, the list it is in
    function playTrack(t, arr, ctx) {
      dj.on = false; djSave();   // a song picked by hand: the DJ steps back
      S = Object.assign({}, S || {}, { item: t, is_playing: true, progress_ms: 0 }); at = Date.now(); setIdle(null); paint(); djPaint();
      if (ctx && ctx.context) return play({ context_uri: ctx.context, offset: { uri: t.uri } }, t.name);
      if (ctx && ctx.album && t.album && t.album.uri) return play({ context_uri: t.album.uri, offset: { uri: t.uri } }, t.name);
      var us = (arr || []).filter(function (x) { return x && x.uri && x.type !== 'episode'; }).map(function (x) { return x.uri; }).slice(0, 100);
      if (us.length > 1 && us.indexOf(t.uri) >= 0) return play({ uris: us, offset: { uri: t.uri } }, t.name);
      return play({ uris: [t.uri] }, t.name);
    }
    function asTrack(t, i, arr, ctx) {
      if (!t) return null; var ep = t.type === 'episode', on = S && S.item && S.item.uri === t.uri;
      if (!Array.isArray(arr)) arr = null;
      return { t: t.name, s: ep ? (t.show ? t.show.name : 'Episode') : names(t.artists), img: pic(ep ? (t.images && t.images.length ? t.images : t.show && t.show.images) : t.album && t.album.images), on: on,
        go: on ? null : function () { playTrack(t, arr, ctx); },
        likeId: !ep && t.id ? t.id : null,
        full: function () { if (on) openNow(ctx && ctx.label); else playTrack(t, arr, ctx).then(function (ok) { if (ok) openNow(ctx && ctx.label); }); },
        add: on || !t.uri ? null : function (e) { var b = e.currentTarget; enqueue(t.uri, t.name).then(function (ok) { if (ok) markAdded(b, 'Added to the queue'); }); },
        addDone: addedQ[t.uri] ? 'Added to the queue' : '',
        save: ep || !t.uri ? null : function (e) { var b = e.currentTarget; pickList([t.uri], t.name, null, function (pl) { addedPl[t.uri] = pl; markAdded(b, 'Added to ' + pl); }); },
        saveDone: addedPl[t.uri] ? 'Added to ' + addedPl[t.uri] : '' };
    }
    function asArtist(a) { return { t: a.name, s: (a.genres || []).slice(0, 2).join(', ') || 'Artist', img: pic(a.images), round: true, go: function () { play({ context_uri: a.uri }, a.name); } }; }
    function asAlbum(a) { var c = { kind: 'album', id: a.id, uri: a.uri, name: a.name, images: a.images, n: a.total_tracks };
      return { t: a.name, s: [a.album_type === 'single' ? 'Single' : 'Album', names(a.artists), year(a.release_date)].filter(Boolean).join(' · '), img: pic(a.images), verb: 'Open', go: function (e) { openColl(e, c); }, full: function () { playColl(c).then(function (ok) { if (ok) openNow(c.name); }); } }; }
    function asList(p) { var n = (p.items || p.tracks || {}).total, c = { kind: 'playlist', id: p.id, uri: p.uri, name: p.name, images: p.images, n: n };
      return { t: p.name, s: ['Playlist', p.owner && p.owner.display_name, n != null ? n + ' songs' : ''].filter(Boolean).join(' · '), img: pic(p.images), verb: 'Open', go: function (e) { openColl(e, c); }, full: function () { playColl(c).then(function (ok) { if (ok) openNow(c.name); }); } }; }
    // a playlist or album, opened in place: its songs (pressing one plays the playlist from there), Play, Shuffle, full view, and back
    function playColl(c, shuf) {
      if (!c.uri && c.id) c.uri = 'spotify:' + c.kind + ':' + c.id;
      dj.on = false; djSave();
      var body = { context_uri: c.uri }; if (shuf && c.n) body.offset = { position: Math.floor(Math.random() * Math.min(c.n, 100)) };
      return play(body, c.name).then(function (ok) {
        if (ok) setTimeout(function () { call('PUT', '/me/player/shuffle?state=' + !!shuf).then(function () { if (S) S.shuffle_state = !!shuf; paint(); }, function () { }); }, 900);
        return ok;
      });
    }
    function playlistPage(id, offset) {
      var path = '/playlists/' + encodeURIComponent(id), query = '?limit=50&offset=' + offset;
      return call('GET', path + '/items' + query).catch(function (e) {
        if (e.status !== 404 && e.status !== 405) throw e;
        return call('GET', path + '/tracks' + query);
      });
    }
    function openColl(e, c) {
      if (!c.uri && c.id) c.uri = 'spotify:' + c.kind + ':' + c.id;
      var ul = e && e.currentTarget && e.currentTarget.closest('ul'); if (!ul) { playColl(c); return; }
      var keep = document.createDocumentFragment(), top = ul.scrollTop; while (ul.firstChild) keep.appendChild(ul.firstChild);
      function back() { ul.textContent = ''; ul.appendChild(keep); ul.scrollTop = top; }
      var bar = { bar: c.name, back: back, acts: [['Play', ICON.play, function () { playColl(c); }], ['Shuffle', ICON.shuffle, function () { playColl(c, true); }], ['Full view', ICON.full, function () { playColl(c).then(function (ok) { if (ok) openNow(c.name); }); }]] };
      var tracks = [], ctx = { context: c.uri, label: c.name }, detail;
      function draw(extra, scroll) {
        list(ul, [bar].concat(tracks.map(function (t) { return asTrack(t, 0, null, ctx); }), extra));
        detail = ul.firstChild; ul.scrollTop = scroll;
      }
      function loadPage(offset) {
        var scroll = offset ? ul.scrollTop : 0;
        draw([{ empty: 'Loading tracks…' }], scroll);
        var job = c.kind === 'album' ? call('GET', '/albums/' + encodeURIComponent(c.id) + '/tracks?limit=50&offset=' + offset) : playlistPage(c.id, offset);
        job.then(function (page) {
          if (ul.firstChild !== detail) return;
          var songs = (page && page.items || []).map(function (entry) {
            if (c.kind !== 'album') return entry && (entry.item || entry.track);
            return entry && Object.assign({ album: { uri: c.uri, images: c.images, name: c.name } }, entry);
          });
          tracks = tracks.concat(songs.filter(function (t) { return t && t.uri && t.type !== 'episode'; }));
          if (page && page.total != null) c.n = page.total;
          var extra = [];
          if (page && page.next) extra.push({ t: 'More tracks', icon: ICON.open, verb: 'Load', go: function () { loadPage(offset + (page.limit || 50)); } });
          else if (!tracks.length) extra.push({ empty: 'No tracks here yet.' });
          draw(extra, scroll);
        }, function (er) {
          if (ul.firstChild !== detail) return;
          var restricted = c.kind === 'playlist' && er.status === 403 && !/scope/i.test(er.message);
          draw([restricted ? { empty: 'Spotify lets this app browse playlists you own or collaborate on.', href: 'https://open.spotify.com/playlist/' + encodeURIComponent(c.id) } : { empty: why(er) }], scroll);
        });
      }
      loadPage(0);
    }

    // a list: rows to press (play, or move to a device), a + to queue a song, headings, and a line for when it is empty
    function list(ul, rows) {
      ul.textContent = '';
      rows.forEach(function (r) {
        if (!r) return;
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
          if (r.signin) { li.appendChild(document.createTextNode(' ')); var a = el('a', null, 'Spotify page ↗'); a.href = SETUP + '?back=' + encodeURIComponent(location.href); a.target = '_top'; li.appendChild(a); }
          if (r.href) { li.appendChild(document.createTextNode(' ')); var link = el('a', null, 'Open in Spotify ↗'); link.href = r.href; link.target = '_blank'; link.rel = 'noopener'; li.appendChild(link); }
          ul.appendChild(li); return;
        }
        var b = el(r.go ? 'button' : 'div', 'np-item' + (r.on ? ' on' : '') + (r.verb === 'Open' ? ' np-open' : ''));
        if (r.go) { b.type = 'button'; b.setAttribute('aria-label', (r.verb || 'Play') + ' ' + r.t); b.addEventListener('click', r.go); }
        if (r.icon) { var ic = el('span', 'np-ico'); ic.innerHTML = r.icon; b.appendChild(ic); }
        else { var im = el('img', r.round ? 'round' : null); im.alt = ''; im.loading = 'lazy'; if (r.img) im.src = r.img; b.appendChild(im); }
        var tx = el('span', 'np-it'); tx.appendChild(el('b', null, r.t)); tx.appendChild(el('small', null, r.s || '')); b.appendChild(tx); li.appendChild(b);
        if (r.likeId) { var hb = el('button', 'np-add np-heart'); hb.type = 'button'; hb.setAttribute('data-id', r.likeId); hb.setAttribute('aria-label', 'Like ' + r.t); heartPaint(hb, likes[r.likeId]); hb.addEventListener('click', function () { toggleLike(r.likeId, r.t); }); li.appendChild(hb); }
        if (r.full) { var fu = el('button', 'np-add'); fu.type = 'button'; fu.innerHTML = ICON.full; fu.setAttribute('aria-label', 'Play ' + r.t + ' in the full view'); fu.title = 'Full view'; fu.addEventListener('click', r.full); li.appendChild(fu); }
        if (r.save) { var sv = el('button', 'np-add'); sv.type = 'button'; sv.innerHTML = ICON.save; sv.setAttribute('aria-label', 'Add ' + r.t + ' to a playlist'); sv.title = 'Add to a playlist'; sv.addEventListener('click', r.save); if (r.saveDone) markAdded(sv, r.saveDone); li.appendChild(sv); }
        if (r.add) { var ad = el('button', 'np-add'); ad.type = 'button'; ad.innerHTML = ICON.plus; ad.setAttribute('aria-label', 'Add ' + r.t + ' to the queue'); ad.title = 'Add to the queue'; ad.addEventListener('click', r.add); if (r.addDone) markAdded(ad, r.addDone); li.appendChild(ad); }
        ul.appendChild(li);
      });
      if (ul.querySelector('.np-heart')) markLikes(ul);
    }
    function failed(ul, e) { var m = why(e); list(ul, [{ empty: m, signin: /Sign in again/.test(m) }]); }
    var seq = {};
    function fresh(k) { var n = seq[k] = (seq[k] || 0) + 1; return function () { return seq[k] === n; }; }   // drops answers that arrive after a newer request

    /* ---------- the bands ---------- */
    function setPane(p, focus) {
      pane = p;
      $$('.np-bands button').forEach(function (b) { var on = b.getAttribute('data-p') === p; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      $$('.np-pane').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-pane') === p); });
      fill(p);
    }
    $('.np-dev').addEventListener('click', function () { setPane('dev', true); });
    $('.np-devrefresh').addEventListener('click', fillDev);
    $$('.np-bands button').forEach(function (b, i, all) {
      b.addEventListener('click', function () { setPane(b.getAttribute('data-p')); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
        e.preventDefault(); setPane(all[(i + d + all.length) % all.length].getAttribute('data-p'), true);
      });
    });
    function fill(p) {
      if (!box.classList.contains('big')) return;
      if (p === 'now') nowInfo(); else if (p === 'queue') fillQueue(); else if (p === 'lib') fillLib(); else if (p === 'dev') fillDev();
      else if (p === 'search') { if (!$('.np-q').value) list($('.np-sl'), [{ empty: 'Find a song, artist, album or playlist. Press a result to play it, + to queue a song.' }]); setTimeout(function () { $('.np-q').focus(); }, 60); }
    }

    // Now: the album (name, year, kind, label) and the artist (photo, genres); the year sits behind as a backdrop
    var cache = {};
    function get(path) { if (!cache[path]) cache[path] = call('GET', path).catch(function (e) { delete cache[path]; throw e; }); return cache[path]; }
    function nowInfo() {
      if (!S || !S.item) return; var it = S.item, al = it.album, ar = it.artists && it.artists[0], id = it.id;
      $('.np-album').textContent = al ? al.name : it.show ? it.show.name : '';
      var yr = year(al ? al.release_date : it.release_date); $('.np-yr').textContent = yr;
      function rel(label) { $('.np-rel').textContent = [yr, al && al.album_type === 'single' ? 'Single' : al && al.album_type === 'compilation' ? 'Compilation' : al ? 'Album' : 'Episode', label].filter(Boolean).join(' · '); }
      rel(''); $('.np-aname').textContent = ar ? ar.name : it.show ? it.show.publisher || '' : ''; $('.np-aimg').removeAttribute('src'); $('.np-genre').textContent = '';
      if (al && al.id) get('/albums/' + al.id).then(function (a) { if (S && S.item && S.item.id === id && a) rel(a.label ? a.label + (a.total_tracks ? ' · ' + a.total_tracks + ' songs' : '') : ''); }).catch(function () { });
      if (ar && ar.id) get('/artists/' + ar.id).then(function (a) {
        if (!S || !S.item || S.item.id !== id || !a) return;
        var p = pic(a.images); if (p) $('.np-aimg').src = p;
        $('.np-genre').textContent = (a.genres || []).slice(0, 3).join(', ');
      }).catch(function () { });
    }

    // Queue: what is on, then the next songs; pressing one plays it now
    var recent = {};   // path -> { t, j }: the last answers, shown straight away while a fresh one comes
    function quick(path, show) {
      var c = recent[path], p2 = call('GET', path).then(function (j) { recent[path] = { t: Date.now(), j: j }; return j; });
      if (c && Date.now() - c.t < 60000) show(c.j, true);
      return p2;
    }
    function fillQueue() {
      var ok = fresh('queue'), ul = $('.np-ql');
      if (!ul.firstChild) list(ul, [{ empty: 'Loading…' }]);
      call('GET', '/me/player/queue').then(function (j) {
        if (!ok()) return; var q = (j && j.queue || []).slice(0, 20);
        list(ul, [j && j.currently_playing ? { head: 'Playing now' } : null, j && asTrack(j.currently_playing), { head: 'Up next' }]
          .concat(q.length ? q.map(asTrack) : [{ empty: 'Nothing queued. Find songs in Search and press + to add them.' }]));
      }, function (e) { if (ok()) failed(ul, e); });
    }

    // Submit one search for songs, artists, albums and playlists.
    $('.np-searchform').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('.np-q').value.trim(), ok = fresh('search'), ul = $('.np-sl');
      if (q.length < 2) { fill('search'); return; }
      call('GET', '/search?type=track,artist,album,playlist&limit=5&q=' + encodeURIComponent(q)).then(function (j) {
        if (!ok()) return; j = j || {};
        var tr = (j.tracks && j.tracks.items || []).filter(Boolean), ars = (j.artists && j.artists.items || []).filter(Boolean),
          als = (j.albums && j.albums.items || []).filter(Boolean), pls = (j.playlists && j.playlists.items || []).filter(Boolean);
        var rows = [];
        if (tr.length) rows = rows.concat([{ head: 'Songs' }], tr.map(function (t) { return asTrack(t, 0, null, { album: true, label: t.album && t.album.name }); }));
        if (ars.length) rows = rows.concat([{ head: 'Artists' }], ars.slice(0, 3).map(asArtist));
        if (als.length) rows = rows.concat([{ head: 'Albums' }], als.slice(0, 3).map(asAlbum));
        if (pls.length) rows = rows.concat([{ head: 'Playlists' }], pls.slice(0, 3).map(asList));
        rows.unshift({ t: 'DJ mode: play “' + q + '”', s: 'New ' + q + ' songs, and it carries on by itself', icon: ICON.dj, verb: 'Start', go: function () { dj.g = q.toLowerCase(); djEnter(true); } });
        list(ul, rows);
      }, function (e) { if (ok()) failed(ul, e); });
    });

    /* ---------- Explore: fresh songs and recommended playlists, picked by tapping (a wallpaper has no keyboard) ---------- */
    var GENRES = [['foryou', 'From my playlists'], ['pop', 'Pop'], ['indie', 'Indie'], ['hip hop', 'Hip hop'], ['r&b', 'R&B'], ['rock', 'Rock'], ['electronic', 'Electronic'],
      ['house', 'House'], ['lo-fi', 'Lo-fi'], ['jazz', 'Jazz'], ['soul', 'Soul'], ['afrobeats', 'Afrobeats'], ['amapiano', 'Amapiano'], ['latin', 'Latin'], ['k-pop', 'K-pop'],
      ['drum and bass', 'Drum & bass'], ['techno', 'Techno'], ['metal', 'Metal'], ['punk', 'Punk'], ['country', 'Country'], ['reggae', 'Reggae'], ['ambient', 'Ambient'], ['classical', 'Classical']];
    var Y = new Date().getFullYear();
    var ERAS = [['new', 'New', (Y - 1) + '-' + Y], ['2020s', '2020s', '2020-' + Y], ['2010s', '2010s', '2010-2019'], ['2000s', '2000s', '2000-2009'], ['1990s', '90s', '1990-1999'], ['any', 'Any time', '']];
    function gName(g) { var x = GENRES.filter(function (r) { return r[0] === g; })[0]; return x ? x[1] : g; }
    function era(e) { return ERAS.filter(function (r) { return r[0] === e; })[0] || ERAS[0]; }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    // the DJ's state is shared by every wallpaper (so it carries on through the rotation): on, the vibe, and the songs it chose
    var DJK = 'np-dj';
    function djLoad() { try { var d = JSON.parse(localStorage.getItem(DJK) || 'null'); if (d && typeof d === 'object') return { on: !!d.on, g: d.g || 'foryou', e: d.e || 'new', list: Array.isArray(d.list) ? d.list : [] }; } catch (e) { } return { on: false, g: 'foryou', e: 'new', list: [] }; }
    function djSave() { dj.list = dj.list.slice(-60); try { localStorage.setItem(DJK, JSON.stringify(dj)); } catch (e) { } }
    var dj = djLoad();
    // songs the DJ has already brought in, so each batch is new to you
    function seenGet() { try { return JSON.parse(localStorage.getItem('np-dj-seen') || '[]'); } catch (e) { return []; } }
    function seenAdd(ids) { var s = seenGet().concat(ids); try { localStorage.setItem('np-dj-seen', JSON.stringify(s.slice(-500))); } catch (e) { } }

    function me() { return get('/me'); }
    function topArtists() { return get('/me/top/artists?limit=20&time_range=medium_term').then(function (j) { return (j && j.items || []).filter(Boolean); }, function () { return []; }); }
    // your taste, read from your own playlists: the artists in them, and those artists' genres, most frequent first.
    // Kept for 12 hours so each wallpaper does not work it out again.
    var tasteP = null;
    function taste() {
      if (tasteP) return tasteP;
      try { var c = JSON.parse(localStorage.getItem('np-dj-taste') || 'null'); if (c && Date.now() - c.t < 12 * 3600e3) return (tasteP = Promise.resolve(c)); } catch (e) { }
      function items(id) {   // newer apps read /items, older ones /tracks
        return playlistPage(id, 0)
          .then(function (j) { return (j && j.items || []).map(function (x) { return x && (x.item || x.track); }).filter(djPlayable); }, function (e) { if (e.status === 429) throw e; return []; });
      }
      tasteP = Promise.all([me(), call('GET', '/me/playlists?limit=50')]).then(function (r) {
        var mine = (r[1] && r[1].items || []).filter(function (p) { return p && p.id && (p.collaborative || (p.owner && r[0] && p.owner.id === r[0].id)); }).slice(0, 2);
        return Promise.all(mine.map(function (p) { return items(p.id); }));
      }).then(function (lists) {
        var count = {}, info = {};
        try { localStorage.setItem('np-dj-own', JSON.stringify(shuffle([].concat.apply([], lists).filter(function (t) { return t && t.id && t.uri; })).slice(0, 150).map(slim))); } catch (e) { }
        [].concat.apply([], lists).forEach(function (t) { (t.artists || []).slice(0, 2).forEach(function (a) { if (!a.id) return; count[a.id] = (count[a.id] || 0) + 1; info[a.id] = a.name; }); });
        var ids = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
        return topArtists().then(function (artists) {
          var gc = {};
          artists.forEach(function (a) { (a.genres || []).forEach(function (g) { gc[g] = (gc[g] || 0) + (count[a.id] || 1); }); });
          var t = { t: Date.now(), genres: Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; }).slice(0, 12), artists: ids.slice(0, 20).map(function (id) { return info[id]; }) };
          if (!t.artists.length) t.artists = artists.map(function (a) { return a.name; });
          try { localStorage.setItem('np-dj-taste', JSON.stringify(t)); } catch (e) { }
          return t;
        });
      }).catch(function (e) { tasteP = null; throw e; });
      return tasteP;
    }
    // a song, kept small (for the pools in this browser)
    function djPlayable(t) { return t && t.id && /^spotify:track:[a-z0-9]+$/i.test(t.uri) && !t.is_local && t.is_playable !== false && !(t.restrictions && t.restrictions.reason); }
    function slim(t) { return { id: t.id, uri: t.uri, name: t.name, type: 'track', artists: (t.artists || []).map(function (a) { return { name: a.name, id: a.id }; }), album: t.album ? { name: t.album.name, uri: t.album.uri, release_date: t.album.release_date, images: (t.album.images || []).slice(0, 2) } : null }; }
    // Each search brings ten songs into a pool for that search (kept 6 hours); the DJ draws from the pools and only
    // searches again, for the next page, when a pool has nothing new left. So a batch of songs costs one search or none.
    var POOLK = 'np-dj-playable-pools';
    function pools() { try { var p = JSON.parse(localStorage.getItem(POOLK) || '{}'); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } }
    function poolsSave(p) {
      var keys = Object.keys(p).sort(function (a, b) { return p[b].t - p[a].t; });
      keys.slice(12).forEach(function (k) { delete p[k]; });   // the twelve most recent searches
      try { localStorage.setItem(POOLK, JSON.stringify(p)); } catch (e) { try { localStorage.removeItem(POOLK); } catch (er) { } }
    }
    function fresh2(items) { var seen = seenGet(), current = S && S.item && S.item.id; return items.filter(function (t) { return t.id !== current && seen.indexOf(t.id) < 0; }); }
    function searchTracks(q, want) {
      want = want || 6;
      var p = pools(), pool = p[q];
      if (pool && Date.now() - pool.t > 6 * 3600e3) pool = null;
      var have = pool ? fresh2(pool.items) : [];
      if (have.length >= want || (pool && pool.done) || searchResting()) return Promise.resolve(have);
      var page = pool ? pool.pages : 0;
      return call('GET', '/search?type=track&limit=10&offset=' + page * 10 + '&q=' + encodeURIComponent(q)).then(function (j) {
        var tracks = j && j.tracks, got = (tracks && tracks.items || []).filter(djPlayable).map(slim);
        p = pools(); var cur = p[q] && Date.now() - p[q].t < 6 * 3600e3 ? p[q] : { items: [], pages: 0 };
        var ids = {}; cur.items.forEach(function (t) { ids[t.id] = 1; });
        cur.items = cur.items.concat(got.filter(function (t) { return !ids[t.id]; })).slice(-80);
        cur.pages = (cur.pages || 0) + 1; cur.t = Date.now(); cur.done = !(tracks && tracks.next) || cur.pages >= 10;
        p[q] = cur; poolsSave(p);
        return fresh2(cur.items);
      }, function (e) { if (e.searchLimited) return have; throw e; });
    }
    function genreTracks(g, e, want) {   // Spotify's genre filter; the plain words only if that finds nothing at all
      var yr = era(e)[2] ? ' year:' + era(e)[2] : '';
      return searchTracks('genre:"' + g + '"' + yr, want).then(function (t) { return t.length || searchResting() ? t : searchTracks(g + yr, want); });
    }
    // the best known songs for a genre (the first page, at any time)
    function popularTracks(g) {
      function go(q) { return call('GET', '/search?type=track&limit=10&q=' + encodeURIComponent(q)).then(function (j) { return (j && j.tracks && j.tracks.items || []).filter(Boolean); }); }
      return go('genre:"' + g + '"').then(function (t) { return t.length ? t : go(g); }).catch(function () { return []; });
    }
    // fresh songs for a vibe: For you looks at what you listen to most; never songs already brought in, nor ones you have saved
    var reason = '';
    function newSongs(g, e, n) {
      n = n || 10; var job;
      if (g === 'foryou') {
        job = taste().then(function (t) {
          var yr = era(e)[2] ? ' year:' + era(e)[2] : '';
          if (t.genres.length) {   // one of your playlists' top genres (the most frequent come up most often), then another if that runs short
            var gs = shuffle(t.genres.slice(0, 5)); reason = 'your playlists lean ' + gs[0];
            return genreTracks(gs[0], e, n).then(function (a) { return a.length >= n || !gs[1] ? [a] : genreTracks(gs[1], e, n - a.length).then(function (b) { reason += ' and ' + gs[1]; return [a, b]; }); });
          }
          if (t.artists.length) { var a1 = pick(t.artists.slice(0, 12)); reason = 'from artists in your playlists: ' + a1; return searchTracks('artist:"' + a1 + '"' + yr, n).then(function (a) { return [a]; }); }
          reason = 'a bit of everything'; return genreTracks(pick(['pop', 'indie', 'electronic']), e, n).then(function (a) { return [a]; });
        });
      } else { reason = ''; job = genreTracks(g, e, n).then(function (a) { return [a]; }); }
      return job.then(function (lists) {
        var seen = seenGet(), ids = {}, out = [];
        shuffle([].concat.apply([], lists)).forEach(function (t) { if (djPlayable(t) && !ids[t.id] && seen.indexOf(t.id) < 0) { ids[t.id] = 1; out.push(t); } });
        if (out.length < Math.min(3, n) && searchResting()) {   // searching rests: songs from your own playlists keep the music going
          var own = []; try { own = JSON.parse(localStorage.getItem('np-dj-own') || '[]'); } catch (er) { }
          own = shuffle(fresh2(own.filter(function (t) { return djPlayable(t) && !ids[t.id]; })));
          if (own.length) { reason = 'from your playlists while Spotify\'s search rests'; out = out.concat(own); }
        }
        if (!out.length && searchResting()) return get('/me/top/tracks?limit=20&time_range=medium_term').then(function (j) {
          var tracks = fresh2((j && j.items || []).filter(djPlayable));
          if (tracks.length) reason = 'from your top tracks while Spotify\'s search rests';
          return shuffle(tracks);
        }, function (e) { if (e.status === 429) throw e; return out; });
        if (!out.length || searchResting()) return out;
        return libHas(out.slice(0, 50).map(function (t) { return t.id; })).then(function (has) {
          var left = out.filter(function (t, i) { return !(has && has[i]) || reason.indexOf('while') >= 0; }); return left.length ? left : out;
        }, function () { return out; });
      }).then(function (out) { return out.slice(0, n); });
    }
    // recommended playlists: Spotify's own made-for-you ones (Discover Weekly, Release Radar, Daily Mixes) where Spotify lets this app see
    // them, and public playlists for the genre and era
    var MFY = /discover weekly|release radar|daily mix|on repeat|repeat rewind|daylist|time capsule|mix/i;
    function recPlaylists(g, e) {
      function srch(q) { return call('GET', '/search?type=playlist&limit=10&q=' + encodeURIComponent(q)).then(function (j) { return (j && j.playlists && j.playlists.items || []).filter(Boolean); }, function () { return []; }); }
      var jobs = g === 'foryou'
        ? [call('GET', '/me/playlists?limit=50').then(function (j) { return (j && j.items || []).filter(Boolean); }, function () { return []; }), srch('Discover Weekly'), srch('Release Radar'), srch('Daily Mix')]
        : [srch(vlabel(g)), srch(vlabel(g) + ' ' + (e === 'new' ? 'new' : e === 'any' ? 'mix' : era(e)[1])), srch(vlabel(g) + ' mix')];
      return Promise.all(jobs).then(function (ls) {
        var ids = {}, out = [];
        [].concat.apply([], ls).forEach(function (p) {
          if (!p || !p.id || ids[p.id]) return;
          if (g === 'foryou' && !(p.owner && p.owner.id === 'spotify' && MFY.test(p.name || ''))) return;   // made for you: Spotify's own
          ids[p.id] = 1; out.push(p);
        });
        if (g === 'foryou' && !out.length) return taste().catch(function () { return { genres: [] }; }).then(function (t) {   // none visible: playlists for your playlists' top genre
          var gs = t.genres;
          return gs.length ? srch(gs[0] + ' mix').then(function (r) { return { list: r.slice(0, 8), mfyHidden: true }; }) : { list: [], mfyHidden: true };
        });
        return { list: out.slice(0, 10) };
      });
    }

    function cap(g) { return String(g).replace(/(^|[\s-])\S/g, function (c) { return c.toUpperCase(); }); }
    function vlabel(g) { return GENRES.some(function (r) { return r[0] === g; }) ? gName(g) : cap(g); }
    // the genre dropdown: from your playlists (worked out), the genres your playlists lean to, then every genre; a typed one is added
    function genreSelect(sel, cur, onPick) {
      function build(tg) {
        sel.textContent = ''; var seen = {};
        function opt(parent, v, t) { if (seen[v]) return; seen[v] = 1; var o = el('option', null, t); o.value = v; parent.appendChild(o); }
        opt(sel, 'foryou', 'From my playlists (auto)');
        if (tg.length) { var g1 = el('optgroup'); g1.label = 'Your playlists lean'; tg.slice(0, 8).forEach(function (g) { opt(g1, g, cap(g)); }); sel.appendChild(g1); }
        var g2 = el('optgroup'); g2.label = 'Genres'; GENRES.slice(1).forEach(function (r) { opt(g2, r[0], r[1]); }); sel.appendChild(g2);
        if (!seen[cur]) { var g3 = el('optgroup'); g3.label = 'Typed'; opt(g3, cur, cap(cur)); sel.appendChild(g3); }
        sel.value = cur;
      }
      build([]); taste().then(function (t) { build(t.genres); }, function () { });
      sel.onchange = function () { onPick(sel.value); };
    }
    function eraSelect(sel, cur, onPick) {
      sel.textContent = ''; ERAS.forEach(function (r) { var o = el('option', null, r[1]); o.value = r[0]; sel.appendChild(o); });
      sel.value = cur; sel.onchange = function () { onPick(sel.value); };
    }

    /* ---------- adding to a playlist: a sheet of your own playlists, or a new one named for you ---------- */
    var pk = el('div', 'np-pick'); pk.setAttribute('role', 'dialog'); pk.setAttribute('aria-modal', 'true'); pk.setAttribute('aria-label', 'Add to a playlist');
    pk.innerHTML = '<div class="pk"><div class="pk-h"><b></b><button type="button" class="pk-x" aria-label="Close">' + ICON.x + '</button></div><ul></ul></div>';
    document.body.appendChild(pk);
    function pkClose() { pk.classList.remove('on'); }
    pk.querySelector('.pk-x').addEventListener('click', pkClose);
    pk.addEventListener('click', function (e) { if (e.target === pk) pkClose(); });
    function addTo(id, uris) {   // newer apps use /items; older ones /tracks
      return call('POST', '/playlists/' + id + '/items', { uris: uris }).catch(function (e) {
        if (e.status === 401 || e.status === 429 || /scope/i.test(e.message)) throw e;
        return call('POST', '/playlists/' + id + '/tracks', { uris: uris }).catch(function () { throw e; });
      });
    }
    function newList(name) {
      var body = { name: name, description: 'New songs found by the Worlds DJ.', public: false };
      return call('POST', '/me/playlists', body).catch(function (e) {
        if (e.status === 401 || e.status === 429 || /scope/i.test(e.message)) throw e;
        return me().then(function (m) { return call('POST', '/users/' + encodeURIComponent(m.id) + '/playlists', body); });
      });
    }
    function pickList(uris, label, vibe, onAdded) {
      var ul = pk.querySelector('ul'); pk.querySelector('b').textContent = 'Add ' + label + ' to…';
      ul.textContent = ''; ul.appendChild(el('li', 'pk-e', 'Loading your playlists…')); pk.classList.add('on');
      var MON = new Date().toLocaleString('en', { month: 'short' }) + ' ' + Y, name = 'Worlds DJ · ' + (vibe || (dj.g === 'foryou' ? 'My playlists' : vlabel(dj.g))) + ' · ' + MON;
      function row(img, t, s2, go) {
        var li = el('li'), b = el('button'); b.type = 'button';
        if (img) { var im = el('img'); im.alt = ''; im.src = img; b.appendChild(im); } else b.appendChild(el('i', null, '+'));
        var sp = el('span'); sp.appendChild(el('b', null, t)); sp.appendChild(el('small', null, s2)); b.appendChild(sp);
        b.addEventListener('click', go); li.appendChild(b); ul.appendChild(li);
      }
      function done(p) { return function () { pkClose(); flash('Added to ' + p, true); djToast('Added to ' + p, true); if (onAdded) onAdded(p); }; }
      function fail(e) { pkClose(); flash(e.status === 401 || /scope/i.test(e.message) ? 'Sign in again on the Spotify page to allow changing playlists' : 'Spotify would not add it: ' + e.message); }
      Promise.all([me(), call('GET', '/me/playlists?limit=50')]).then(function (r) {
        var mine = (r[1] && r[1].items || []).filter(function (p) { return p && (p.collaborative || (p.owner && r[0] && p.owner.id === r[0].id)); });
        ul.textContent = '';
        row('', 'New playlist', name, function () { newList(name).then(function (p) { return addTo(p.id, uris).then(done(p.name)); }).catch(fail); });
        mine.forEach(function (p) { var n = (p.items || p.tracks || {}).total; row(pic(p.images), p.name, n != null ? n + ' songs' : 'Playlist', function () { addTo(p.id, uris).then(done(p.name), fail); }); });
      }, fail);
    }

    /* ---------- DJ mode: covers the page, the wallpaper showing through; it keeps adding new songs so the music carries on ---------- */
    var djEl = el('div', 'np-dj'); djEl.setAttribute('role', 'region'); djEl.setAttribute('aria-label', 'DJ mode'); djEl.setAttribute('aria-hidden', 'true');
    djEl.innerHTML = '<img class="dj-glow" alt="">' +
      '<div class="dj-top"><span class="dj-tag"><i></i><em>Worlds DJ</em></span><span class="dj-vibe"></span><button type="button" class="dj-go" title="DJ mode: new songs in a vibe you pick">' + ICON.dj + 'DJ</button><button type="button" class="dj-share" hidden title="Share this song to Discord">' + ICON.share + '</button><button type="button" class="dj-pip" aria-label="Small window" title="Small window: a little player that stays on top">' + ICON.pip + '</button><button type="button" class="dj-x" aria-label="Leave DJ mode" title="Leave DJ mode">' + ICON.x + '</button></div>' +
      '<div class="dj-mid"><div class="dj-card" title="Play / pause"><img class="dj-cover" alt=""><span class="dj-glare" aria-hidden="true"></span></div><div class="dj-meta"><span class="dj-line"></span><b class="dj-t"></b><span class="dj-a"></span>' +
      '<div class="dj-prog"><span class="dj-cur">0:00</span><span class="dj-bar"><i></i></span><span class="dj-dur">0:00</span></div>' +
      '<div class="dj-ctl"><button type="button" class="dj-like" aria-label="Save to your library" aria-pressed="false">' + ICON.heart + '</button><button type="button" class="dj-prev" aria-label="Previous">' + ICON.prev + '</button>' +
      '<button type="button" class="dj-play" aria-label="Play">' + ICON.play + '</button><button type="button" class="dj-next" aria-label="Next">' + ICON.next + '</button>' +
      '<button type="button" class="dj-save" aria-label="Add to a playlist" title="Add to a playlist">' + ICON.save + '</button></div><p class="dj-toast" aria-live="polite"></p></div></div>' +
      '<div class="dj-bot"><div class="dj-vibe2"><select class="np-sel dj-g" aria-label="Genre"></select><select class="np-sel dj-e" aria-label="Era"></select>' +
      '<form class="np-gform dj-f"><input type="search" class="np-q" placeholder="Type a genre…" aria-label="Type a genre for the DJ" autocomplete="off" spellcheck="false"><button type="submit">Play</button></form></div><div class="dj-upnext"><span>Up next</span><ul></ul></div></div>' +
      (opts.app ? '<div class="dj-yt-grab" title="Drag up to return to the tablet" aria-hidden="true"></div>' : '');
    document.body.appendChild(djEl);
    function djQ(c) { return djEl.querySelector(c); }
    var djOpen = false, djArt = '', djFetching = false, djStartPending = false, djRefillAt = 0, djLastId = null, toastT = 0, view = null, nowFrom = '', nextFor = null;
    function djToast(msg, ok) { if (!djOpen) return; var t = djQ('.dj-toast'); clearTimeout(toastT); t.textContent = msg; t.classList.toggle('bad', !ok); toastT = setTimeout(function () { t.textContent = ''; }, 4500); }
    function vibeText() { return (dj.g === 'foryou' ? 'From your playlists' : vlabel(dj.g)) + ' · ' + era(dj.e)[1]; }
    function djChips() {
      genreSelect(djQ('.dj-g'), dj.g, function (g) { dj.g = g; djStart(); });
      eraSelect(djQ('.dj-e'), dj.e, function (e) { dj.e = e; djStart(); });
      djQ('.dj-vibe').textContent = vibeText();
    }
    djQ('.dj-f').addEventListener('submit', function (e) { e.preventDefault(); var inp = this.querySelector('input'), v = inp.value.trim().toLowerCase(); if (v.length < 2) return; inp.value = ''; inp.blur(); dj.g = v; djStart(); });
    // a line from the DJ for each song, about why it is here
    function djLine(it, mine) {
      if (view === 'now') return nowFrom ? 'From ' + nowFrom : S && S.context && S.context.type ? 'Playing from your ' + S.context.type : 'Playing now';
      if (!mine) return 'Playing now';
      var yr = it.album && it.album.release_date ? String(it.album.release_date).slice(0, 4) : '', g = dj.g === 'foryou' ? '' : vlabel(dj.g);
      var lines = [g ? 'Fresh ' + g.toLowerCase() + (yr ? ' from ' + yr : '') : 'New to you' + (mine.r ? ', ' + mine.r : ''),
        'New to you: ' + names(it.artists).split(',')[0], (g || 'From your playlists') + ' · ' + era(dj.e)[1] + (yr ? ' · ' + yr : '')];
      return lines[(it.id || '').length % lines.length];
    }
    function djIndex() { if (!S || !S.item) return -1; for (var i = dj.list.length - 1; i >= 0; i--) if (dj.list[i].u === S.item.uri) return i; return -1; }
    function djPaint() {
      if (!djOpen) return;
      if (view === 'yt') return ytPaint();
      var ul = djQ('.dj-upnext ul'), idx = djIndex(), startSet = view === 'dj' && idx < 0;
      var playing = !startSet && !!(S && S.is_playing);
      djEl.classList.toggle('playing', playing);
      var p = djQ('.dj-play'); p.innerHTML = playing ? ICON.pause : ICON.play; p.setAttribute('aria-label', startSet ? 'Start DJ set' : playing ? 'Pause' : 'Play');
      if (!S || !S.item) {
        djQ('.dj-t').textContent = 'Ready when you are'; djQ('.dj-a').textContent = view === 'dj' ? 'Press play: the DJ picks new songs for ' + vibeText() : 'Play something to see it here';
        djQ('.dj-line').textContent = 'Worlds DJ'; djQ('.dj-cover').removeAttribute('src'); djQ('.dj-glow').removeAttribute('src'); djArt = '';
        djQ('.dj-cur').textContent = djQ('.dj-dur').textContent = '0:00'; djQ('.dj-bar i').style.width = '0';
        ul.textContent = ''; djQ('.dj-upnext').hidden = true; return;
      }
      var it = S.item, img = it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : (it.images && it.images[0] ? it.images[0].url : '');
      if (img !== djArt) { djArt = img; djQ('.dj-cover').src = img; djQ('.dj-glow').src = img; }
      var acc = box.style.getPropertyValue('--np-acc'); if (acc) djEl.style.setProperty('--np-acc', acc);
      djQ('.dj-t').textContent = it.name; djQ('.dj-a').textContent = (it.artists || it.show && [it.show] || []).map(function (a) { return a.name; }).join(', ');
      if (it.id !== djLastId) { djLastId = it.id; djQ('.dj-line').textContent = djLine(it, idx >= 0 ? dj.list[idx] : null); }
      djQ('.dj-dur').textContent = fmt(it.duration_ms);
      var lk = djQ('.dj-like'); lk.innerHTML = liked ? ICON.heartOn : ICON.heart; lk.classList.toggle('on', !!liked); lk.setAttribute('aria-pressed', String(!!liked));
      ul.textContent = '';
      var ahead = view === 'dj' ? (idx >= 0 ? dj.list.slice(idx + 1, idx + 4) : []) : (nextFor && nextFor.id === it.id ? nextFor.list : []);
      ahead.forEach(function (x) { var li = el('li'), im = el('img'); im.alt = ''; if (x.i) im.src = x.i; li.appendChild(im); li.appendChild(el('span', null, x.t + ' · ' + x.a)); ul.appendChild(li); });
      djQ('.dj-upnext').hidden = !ul.firstChild;
      if (view === 'now' && (!nextFor || nextFor.id !== it.id)) {   // now playing: what Spotify plays next
        nextFor = { id: it.id, list: [] };
        call('GET', '/me/player/queue').then(function (j) { if (!nextFor || nextFor.id !== it.id) return; nextFor.list = (j && j.queue || []).slice(0, 3).filter(Boolean).map(djEntry); djPaint(); }, function () { });
      }
    }
    // YouTube in the full view: its video sits where the cover goes (YouTube asks that its player stays visible)
    function ytPaint() {
      var d = yt.info();
      if (opts.app) {
        box.classList.toggle('yt-frame', !d.error && !!yt.vidEl.querySelector('iframe'));
        djQ('.dj-vibe').textContent = d.title;
      }
      djEl.classList.toggle('playing', d.playing);
      var p = djQ('.dj-play'); p.innerHTML = d.playing ? ICON.pause : ICON.play; p.setAttribute('aria-label', d.playing ? 'Pause' : 'Play');
      djQ('.dj-t').textContent = d.title || 'YouTube'; djQ('.dj-a').textContent = d.error || d.author || 'Pick a video, mix or playlist';
      djQ('.dj-line').textContent = 'YouTube';
      var g = d.vid && !opts.app ? 'https://i.ytimg.com/vi/' + encodeURIComponent(d.vid) + '/hqdefault.jpg' : '';
      if (g !== djArt) { djArt = g; if (g) djQ('.dj-glow').src = g; else djQ('.dj-glow').removeAttribute('src'); }
      djQ('.dj-upnext').hidden = true; placeVid();
    }
    function placeVid() {
      if (opts.app) return;
      var v = yt && yt.vidEl; if (!v) return;
      if (view !== 'yt') { v.style.left = v.style.top = v.style.width = v.style.height = ''; return; }
      var r = djQ('.dj-cover').getBoundingClientRect(); v.style.left = r.left + 'px'; v.style.top = r.top + 'px'; v.style.width = r.width + 'px'; v.style.height = r.height + 'px';
    }
    window.addEventListener('resize', function () { if (view === 'yt') placeVid(); });
    setInterval(function () { if (view !== 'yt' || !yt) return; var d = yt.info(); djQ('.dj-bar i').style.width = d.dur ? Math.min(100, d.cur / d.dur * 100).toFixed(2) + '%' : '0'; djQ('.dj-cur').textContent = fmt(d.cur * 1000); djQ('.dj-dur').textContent = fmt(d.dur * 1000); }, 500);
    function djEntry(t) { return { u: t.uri, t: t.name, a: names(t.artists), i: pic(t.album && t.album.images), r: reason }; }
    // only one page tops the queue up at a time (the rotation briefly has two wallpapers open while it crossfades)
    var me2 = rand(8);
    function djLock() {
      var l = null; try { l = JSON.parse(localStorage.getItem('np-dj-lock') || 'null'); } catch (e) { }
      if (l && l.who !== me2 && Date.now() - l.t < 20000) return false;
      try { localStorage.setItem('np-dj-lock', JSON.stringify({ who: me2, t: Date.now() })); } catch (e) { } return true;
    }
    // a new vibe (or a fresh start): a batch of new songs, playing now
    function djStart() {
      dj.on = true; djChips(); djSave();
      if (djFetching) { djStartPending = true; return; }
      djFetching = true;
      var label = vibeText();
      djToast('Finding tracks for ' + label + '…', true);
      newSongs(dj.g, dj.e, 10).then(function (ts) {
        if (!dj.on || djStartPending) return;
        if (!ts.length) { var rest = searchResting(); djToast(rest ? retryMessage(rest, true, searchLimit) : 'No playable tracks found for ' + label + '. Try another genre.'); return; }
        var entries = ts.map(djEntry), fallback = reason.indexOf('while') >= 0;
        return play({ uris: ts.map(function (t) { return t.uri; }) }, fallback ? 'tracks from your library' : label).then(function (ok) {
          if (!ok) return;
          dj.list = entries; djRefillAt = 0; djSave(); seenAdd(ts.map(function (t) { return t.id; }));
        });
      }).catch(function (e) { djToast(why(e)); }).finally(finishDjWork);
    }
    function finishDjWork() {
      djFetching = false;
      if (!djStartPending) return;
      djStartPending = false;
      if (dj.on) djStart();
    }
    // and then it carries on: with three of its songs left, it queues more
    function djKeepGoing() {
      if (!dj.on || djFetching || busy || !S || !S.is_playing || !S.item || Date.now() < djRefillAt) return;
      dj = Object.assign(djLoad(), { on: dj.on });   // another wallpaper may have added songs
      var idx = djIndex(); if (idx < 0 || dj.list.length - 1 - idx > 3 || !djLock()) return;
      djFetching = true;
      var device = S.device && S.device.id, query = device ? '&device_id=' + encodeURIComponent(device) : '';
      newSongs(dj.g, dj.e, 6).then(function (ts) {
        if (!ts.length) djRefillAt = Math.max(searchResting(), Date.now() + 30000);
        return ts.reduce(function (p, t) { return p.then(function () {
          if (!dj.on || djStartPending || busy || !S || !S.is_playing || (S.device && S.device.id) !== device) return;
          return call('POST', '/me/player/queue?uri=' + encodeURIComponent(t.uri) + query).then(function () { dj.list.push(djEntry(t)); seenAdd([t.id]); });
        }); }, Promise.resolve());
      }).catch(function (e) { djRefillAt = Math.max(e.retryAt || 0, Date.now() + 30000); djToast(why(e)); }).finally(function () { djSave(); djPaint(); finishDjWork(); });
    }
    // the full view: 'dj' (the DJ's songs, and its vibe), 'now' (whatever plays, with its own list), 'yt' (YouTube), or null
    function setView(v, returnExpanded) {
      view = v; djOpen = !!v; djEl.classList.toggle('on', !!v); djEl.setAttribute('aria-hidden', String(!v));
      ['dj', 'now', 'yt'].forEach(function (m) { djEl.classList.toggle('m-' + m, v === m); });
      djEl.setAttribute('aria-label', v === 'dj' ? 'DJ mode' : v === 'yt' ? 'YouTube' : 'Now playing');
      djQ('.dj-tag em').textContent = v === 'dj' ? 'Worlds DJ' : v === 'yt' ? 'YouTube' : 'Now playing';
      var close = djQ('.dj-x'), minimize = opts.app && v === 'yt';
      close.innerHTML = minimize ? ICON.narrow + '<span>Back to tablet</span>' : ICON.x;
      close.title = minimize ? 'Back to tablet' : v === 'dj' ? 'Exit DJ mode' : 'Exit full screen';
      close.setAttribute('aria-label', close.title);
      var hideCard = v === 'dj' || v === 'now';
      box.classList.toggle('dj-hide', hideCard); tab.classList.toggle('dj-hide', !!v);
      box.classList.toggle('yt-full', v === 'yt');
      window.dispatchEvent(new CustomEvent('np:view', { detail: { view: v, returnExpanded: returnExpanded } }));
      if (v) { setBig(false); djLastId = null; djArt = ''; nextFor = null; if (v === 'dj') djChips(); else djQ('.dj-vibe').textContent = v === 'now' && nowFrom ? nowFrom : ''; if (v !== 'yt') checkLiked(); djPaint(); wake(); }
      requestAnimationFrame(placeVid);
    }
    function setDj(open) { setView(open ? 'dj' : null); }
    function openNow(label) { nowFrom = label || ''; setView('now'); }
    function djEnter(fresh2) {
      dj.on = true; djSave(); setDj(true);
      if (fresh2 === true || !S || !S.item || djIndex() < 0) djStart();   // something else playing, or nothing: the DJ starts its own set
    }
    function djLeave() { if (view === 'dj') { dj.on = false; djSave(); } setView(null); }
    $('.np-djbtn').addEventListener('click', function () { djEnter(); });
    djQ('.dj-go').addEventListener('click', function () { djEnter(true); });
    $('.np-art').addEventListener('click', function () { if (S && S.item && !idleMode) openNow(); });   // the cover opens the full view
    djQ('.dj-x').addEventListener('click', djLeave);
    if (opts.app) {
      var ytGrab = djQ('.dj-yt-grab'), grabY = null;
      ytGrab.addEventListener('pointerdown', function (e) {
        if (view !== 'yt' || e.button !== 0) return;
        grabY = e.clientY; ytGrab.setPointerCapture(e.pointerId);
      });
      ytGrab.addEventListener('pointermove', function (e) { if (grabY != null && grabY - e.clientY >= 28) { grabY = null; djLeave(); } });
      ytGrab.addEventListener('lostpointercapture', function () { grabY = null; });
    }
    (function () {   // the card follows the mouse
      var card = djQ('.dj-card'), still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.addEventListener('pointermove', function (e) {
        if (still || view === 'yt') return;
        var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        card.classList.add('live');
        card.style.setProperty('--ry', (x * 18).toFixed(2) + 'deg'); card.style.setProperty('--rx', (-y * 18).toFixed(2) + 'deg');
        card.style.setProperty('--gx', ((x + .5) * 100).toFixed(1) + '%'); card.style.setProperty('--gy', ((y + .5) * 100).toFixed(1) + '%');
        card.style.setProperty('--sx', (x * 40).toFixed(1)); card.style.setProperty('--sy', (y * 40).toFixed(1));
      });
      card.addEventListener('pointerleave', function () { card.classList.remove('live'); ['--rx', '--ry', '--gx', '--gy', '--sx', '--sy'].forEach(function (k) { card.style.removeProperty(k); }); });
      card.addEventListener('click', function () {
        if (view === 'yt') return;
        card.classList.remove('tap'); void card.offsetWidth; card.classList.add('tap');
        djQ('.dj-play').click();
      });
    })();
    djQ('.dj-play').addEventListener('click', function () { if (view === 'yt') { yt.toggle(); return; } if (view === 'dj' && djIndex() < 0) { if (!djFetching) djStart(); return; } if (S && S.item) { $('.np-play').click(); setTimeout(djPaint, 50); } });
    djQ('.dj-next').addEventListener('click', function () { if (view === 'yt') yt.next(); else $('.np-next').click(); });
    djQ('.dj-prev').addEventListener('click', function () { if (view === 'yt') yt.prev(); else $('.np-prev').click(); });
    djQ('.dj-like').addEventListener('click', function () { $('.np-like').click(); djPaint(); });
    djQ('.dj-save').addEventListener('click', function () { if (S && S.item && S.item.uri && S.item.type === 'track') { var u = S.item.uri, b = djQ('.dj-save'); pickList([u], S.item.name, null, function (pl) { addedPl[u] = pl; markAdded(b, 'Added to ' + pl); setTimeout(function () { b.innerHTML = ICON.save; b.classList.remove('done'); b.title = 'Add to a playlist'; }, 3000); }); } });
    // quiet when the mouse rests: the buttons fade, the cover and the song stay
    var calmT = 0;
    function wake() { djEl.classList.remove('calm'); clearTimeout(calmT); calmT = setTimeout(function () { if (!pk.classList.contains('on') && !djEl.contains(document.activeElement && document.activeElement.matches('input,select') ? document.activeElement : null)) djEl.classList.add('calm'); }, 5000); }
    ['pointermove', 'pointerdown', 'keydown'].forEach(function (ev) { djEl.addEventListener(ev, wake); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (pk.classList.contains('on')) pkClose(); else if (djOpen) djLeave(); } });

    /* ---------- a small window: the browser's own picture-in-picture window, which stays on top of everything (Chrome, Edge) ---------- */
    var pipWin = null, CAN_PIP = !!PIPW && !opts.app;   // wherever the browser can (also on ?wallpaper pages opened in a browser)
    window.addEventListener('pagehide', function () { if (pipWin) try { pipWin.close(); } catch (e) { } });   // the rotation moved on: its small window goes with it
    var CAN_MINI = !CAN_PIP && !opts.mini && !opts.app;   // Firefox, Safari: a small popup window instead (Spotify only)
    if (CAN_PIP) { box.classList.add('can-pip'); djEl.classList.add('can-pip'); }
    else if (CAN_MINI) { box.classList.add('can-mini'); djEl.classList.add('can-mini'); }
    var PIPCSS = 'html,body{margin:0;height:100%;background:#07070d;color:#f5f3ff;font:500 13px/1.35 "Chakra Petch","Trebuchet MS",system-ui,sans-serif;overflow:hidden}' +
      '.pp{position:relative;height:100%;display:grid;grid-template-rows:minmax(0,1fr) auto auto auto;gap:10px;padding:14px;box-sizing:border-box;--acc:#1ed760}' +
      '.bg{position:absolute;inset:-20%;width:140%;height:140%;object-fit:cover;filter:blur(40px) saturate(1.4);opacity:.5;pointer-events:none}.bg:not([src]){display:none}' +
      '.pp>*:not(.bg){position:relative}' +
      '.cv{width:100%;height:100%;min-height:0;object-fit:contain;border-radius:14px;filter:drop-shadow(0 12px 28px rgba(0,0,0,.5))}.cv:not([src]){visibility:hidden}' +
      '.tx{display:grid;min-width:0;text-align:center}.tx b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tx span{color:rgba(245,243,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bar{height:3px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden}.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,transparent,var(--acc));box-shadow:0 0 8px var(--acc)}' +
      '.ct{display:flex;justify-content:center;align-items:center;gap:6px}' +
      'button{font:inherit;color:inherit;background:none;border:0;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer}button:hover{background:rgba(255,255,255,.14)}button:focus-visible{outline:2px solid var(--acc)}' +
      'button svg{width:19px;height:19px;fill:currentColor}.play{width:48px;height:48px;background:#f5f3ff;color:#111}.play:hover{background:#fff}.like.on{color:var(--acc)}' +
      '@media (max-height:190px){.cv{display:none}.pp{grid-template-rows:1fr auto auto auto}}';
    function pipPaint() {
      if (!pipWin) return; var d = pipWin.document, it = S && S.item;
      var img = it ? (it.album && it.album.images && it.album.images[0] ? it.album.images[0].url : (it.images && it.images[0] ? it.images[0].url : '')) : '';
      ['.cv', '.bg'].forEach(function (c) { var im = d.querySelector(c); if (img) { if (im.getAttribute('src') !== img) im.src = img; } else im.removeAttribute('src'); });
      d.querySelector('.tx b').textContent = it ? it.name : 'Nothing playing';
      d.querySelector('.tx span').textContent = it ? (it.artists || it.show && [it.show] || []).map(function (a) { return a.name; }).join(', ') : 'Play something on Spotify';
      var p = d.querySelector('.play'); p.innerHTML = S && S.is_playing ? ICON.pause : ICON.play; p.setAttribute('aria-label', S && S.is_playing ? 'Pause' : 'Play');
      var lk = d.querySelector('.like'); lk.innerHTML = liked ? ICON.heartOn : ICON.heart; lk.classList.toggle('on', !!liked);
      var acc = box.style.getPropertyValue('--np-acc'); if (acc) d.querySelector('.pp').style.setProperty('--acc', acc);
      d.title = it ? it.name + ' · Worlds' : 'Worlds player';
    }
    function openPip() {
      if (!CAN_PIP) {
        if (CAN_MINI) window.open(new URL('mini.html', HERE).href, 'worlds-mini', 'popup=yes,width=360,height=480');
        return;
      }
      if (pipWin) { pipWin.close(); return; }
      PIPW.documentPictureInPicture.requestWindow({ width: 320, height: 400 }).then(function (w) {
        pipWin = w; var d = w.document;
        Array.prototype.forEach.call(document.querySelectorAll('link[rel=stylesheet][href*="fonts.googleapis"]'), function (l) { d.head.appendChild(l.cloneNode()); });
        var st2 = d.createElement('style'); st2.textContent = PIPCSS; d.head.appendChild(st2);
        d.body.innerHTML = '<div class="pp"><img class="bg" alt=""><img class="cv" alt=""><div class="tx"><b></b><span></span></div><div class="bar"><i></i></div>' +
          '<div class="ct"><button type="button" class="like" aria-label="Save to your library">' + ICON.heart + '</button><button type="button" class="prev" aria-label="Previous">' + ICON.prev + '</button>' +
          '<button type="button" class="play" aria-label="Play">' + ICON.play + '</button><button type="button" class="next" aria-label="Next">' + ICON.next + '</button>' +
          '<button type="button" class="back" aria-label="Back to the page" title="Back to the page">' + ICON.pip + '</button></div></div>';
        d.querySelector('.play').addEventListener('click', function () { if (S && S.item) $('.np-play').click(); else if (dj.on) djStart(); setTimeout(pipPaint, 30); });
        d.querySelector('.next').addEventListener('click', function () { $('.np-next').click(); });
        d.querySelector('.prev').addEventListener('click', function () { $('.np-prev').click(); });
        d.querySelector('.like').addEventListener('click', function () { $('.np-like').click(); setTimeout(pipPaint, 30); });
        d.querySelector('.back').addEventListener('click', function () { w.close(); });
        w.addEventListener('pagehide', function () { pipWin = null; });
        pipPaint();
      }, function (e) { flash('The small window could not open: ' + e.message); });
    }
    $('.np-pip').addEventListener('click', openPip);
    djQ('.dj-pip').addEventListener('click', function () { if (view === 'yt') yt.pip(); else openPip(); });
    if (dj.on && enabled && !opts.app) setDj(true);   // keep the desktop pill compact when reopening the app

    // Library: playlists, recently played, top songs and top artists (4 weeks, 6 months, all time)
    var lib = 'pl', range = 'short_term';
    function chips(sel, attr, val) { $$(sel + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val)); }); }
    $$('.np-lsub button').forEach(function (b) { b.addEventListener('click', function () { lib = b.getAttribute('data-l'); fillLib(); }); });
    $$('.np-lrange button').forEach(function (b) { b.addEventListener('click', function () { range = b.getAttribute('data-r'); fillLib(); }); });
    // Liked Songs: Spotify keeps it out of your playlists, so it gets a row of its own, and a list (the newest 50)
    function playLiked() { me().then(function (m) { play({ context_uri: 'spotify:user:' + m.id + ':collection' }, 'Liked Songs'); }, function (e) { flash(why(e)); }); }
    function likedRow() {
      if (lib === 'liked') return { t: 'Liked Songs', s: 'Play your saved songs', icon: ICON.heart, go: playLiked };
      return { t: 'Liked Songs', s: 'Browse your saved songs', icon: ICON.heart, verb: 'Open', go: function () { lib = 'liked'; fillLib(); } };
    }
    function fillLiked(ok, ul) {
      function songs(j) { return (j && j.items || []).map(function (x) { return x && (x.track || x.item); }).filter(function (t) { return t && t.uri && t.type !== 'episode'; }); }
      var OLD = function () { return call('GET', '/me/tracks?limit=50'); }, NEW = function () { return call('GET', '/me/library?limit=50'); };
      libTry(OLD, NEW).then(function (j) {   // an empty answer from one address: ask the other too
        var ts = songs(j); return ts.length ? ts : (libNew ? OLD : NEW)().then(songs, function () { return ts; });
      }).then(function (ts) {
        if (!ok()) return;
        var rows = [likedRow()];
        if (ts.length) rows.push({ t: 'Shuffle these ' + ts.length, s: 'Your newest liked songs, shuffled', icon: ICON.shuffle, go: function () { play({ uris: shuffle(ts.map(function (t) { return t.uri; })) }, 'your liked songs, shuffled'); } }, { head: 'Newest liked' });
        list(ul, rows.concat(ts.length ? ts.map(asTrack) : [{ empty: 'No liked songs yet: press the heart on a song to save it.' }]));
      }, function (e) { if (ok()) failed(ul, e); });
    }
    function libPath() { return lib === 'pl' ? '/me/playlists?limit=30' : lib === 'recent' ? '/me/player/recently-played?limit=30' : '/me/top/' + (lib === 'tt' ? 'tracks' : 'artists') + '?limit=20&time_range=' + range; }
    function fillLib() {
      chips('.np-lsub', 'data-l', lib); chips('.np-lrange', 'data-r', range); $('.np-lrange').hidden = lib !== 'tt' && lib !== 'ta';
      var ok = fresh('lib'), ul = $('.np-ll');
      if (!recent[libPath()]) list(ul, [{ empty: 'Loading…' }]);
      if (lib === 'liked') return fillLiked(ok, ul);
      function draw(j) {
        if (!ok()) return; var items = (j && j.items || []).filter(Boolean), rows;
        if (lib === 'pl') rows = [likedRow()].concat(items.map(asList));
        else if (lib === 'ta') rows = items.map(asArtist);
        else if (lib === 'recent') { var seen = {}; rows = items.map(function (x) { return x.track; }).filter(function (t) { if (!t || seen[t.id]) return false; seen[t.id] = 1; return true; }).map(asTrack); }
        else rows = items.map(asTrack);
        list(ul, rows.length ? rows : [{ empty: lib === 'pl' ? 'No playlists yet.' : 'Nothing here yet: Spotify needs a little listening first.' }]);
      }
      quick(libPath(), draw).then(function (j) { if (!ul.querySelector('.np-bar')) draw(j); }, function (e) { if (ok() && !recent[libPath()]) failed(ul, e); });
    }

    // Devices: everything on your account that can play; press one to move the music there
    var DEVNAME = 'Worlds wallpaper';
    function fillDev() {
      var ok = fresh('dev'), ul = $('.np-dl');
      if (!ul.firstChild) list(ul, [{ empty: 'Looking for devices…' }]);
      call('GET', '/me/player/devices').then(function (j) {
        if (!ok()) return; var ds = j && j.devices || [];
        list(ul, ds.length ? ds.map(function (d) {
          var mine = d.id && d.id === hereId, available = d.id && !d.is_restricted;
          var selected = selectedDevice && d.id === selectedDevice.id;
          var state = d.is_active ? 'Active' : selected ? 'Selected for the next track' : available ? 'Play here' : 'Spotify controls unavailable';
          return { t: d.name + (mine ? ' (this one)' : ''), s: [d.type, state, d.volume_percent != null ? 'vol ' + d.volume_percent + '%' : ''].filter(Boolean).join(' · '),
            icon: DEV[d.type] || DEV.Speaker, on: d.is_active || selected, verb: 'Play on', go: d.is_active || !available ? null : function () { transfer(d); } };
        }) : [{ empty: 'No Spotify devices available. Open Spotify on the device you want to use, then refresh.' }]);
      }, function (e) { if (ok()) failed(ul, e); });
    }
    function transfer(d) {
      if (busy) return;
      busy = true; lastAction = Date.now(); hold = lastAction + 2000;
      call('PUT', '/me/player', { device_ids: [d.id], play: true }).then(function () {
        selectedDevice = d; deviceSettlesAt = Date.now() + 5000; flash('Selected ' + d.name, true);
        setTimeout(function () { hold = 0; poll(); if (pane === 'dev') fillDev(); }, 900);
      }, function (e) {
        hold = 0;
        if (e.status === 404 && (!S || !S.item)) { selectedDevice = d; deviceSettlesAt = 0; flash('Selected ' + d.name + '. Pick a track to start playback.', true); if (pane === 'dev') fillDev(); }
        else flash(why(e));
      }).finally(function () { busy = false; });
    }

    // the wallpaper as a speaker: Spotify's own in-browser player makes this page a device (Premium; the browser must allow protected audio)
    var here = null, hereId = null, sdk = null, hk = 'np-here-' + (opts.id || 'page'), hereOn = false;
    function hereNote(t) { $('.np-herenote').textContent = t; }
    function loadSdk() {
      if (sdk) return sdk;
      sdk = new Promise(function (res, rej) {
        if (window.Spotify && window.Spotify.Player) { res(); return; }
        var prev = window.onSpotifyWebPlaybackSDKReady;
        window.onSpotifyWebPlaybackSDKReady = function () { if (prev) try { prev(); } catch (e) { } res(); };
        var s = document.createElement('script'); s.src = 'https://sdk.scdn.co/spotify-player.js'; s.async = true;
        s.onerror = function () { sdk = null; rej(new Error('Could not reach Spotify\'s player')); };
        document.head.appendChild(s);
      });
      return sdk;
    }
    function setHere(on, keep) {
      hereOn = on; $('.np-herecb').checked = on;
      if (keep) try { localStorage.setItem(hk, on ? '1' : '0'); } catch (e) { }
      if (!on) { if (here) try { here.disconnect(); } catch (e) { } here = null; hereId = null; hereNote(''); if (pane === 'dev') fillDev(); return; }
      if (here) return;
      hereNote('Switching on…');
      loadSdk().then(function () {
        if (!hereOn || here) return;
        here = new window.Spotify.Player({ name: DEVNAME, volume: 0.7, getOAuthToken: function (cb) { access().then(cb, function () { cb(''); }); } });
        here.addListener('ready', function (d) { hereId = d.device_id; hereNote(keepHere ? 'Ready: the music comes here.' : 'Ready: pick “' + DEVNAME + '” in Spotify, or press it above.'); if (pane === 'dev') fillDev(); setTimeout(grabCheck, 800); });
        here.addListener('not_ready', function () { hereId = null; hereNote('Lost the connection: trying again…'); });
        function stop(msg) { return function () { hereNote(msg); hereId = null; if (here) try { here.disconnect(); } catch (e) { } here = null; }; }
        here.addListener('initialization_error', stop('This browser cannot play Spotify here (Lively\'s browser may not allow it).'));
        here.addListener('authentication_error', stop('Sign in again on the Spotify page to allow this.'));
        here.addListener('account_error', stop('Playing here needs Spotify Premium.'));
        here.addListener('playback_error', function () { hereNote('Spotify could not play that here.'); });
        here.addListener('player_state_changed', function (ps) {   // the speaker's own news: no request needed
          if (!ps) { setTimeout(poll, 500); return; }   // the music moved to another device
          var ct = ps.track_window && ps.track_window.current_track; if (!ct || Date.now() < hold) return;
          S = Object.assign({}, S || {}, { item: { id: ct.id, uri: ct.uri, name: ct.name, type: ct.type || 'track', duration_ms: ps.duration, artists: ct.artists || [], album: ct.album || {}, external_urls: { spotify: 'https://open.spotify.com/track/' + ct.id } },
            is_playing: !ps.paused, progress_ms: ps.position, shuffle_state: ps.shuffle, repeat_state: ['off', 'context', 'track'][ps.repeat_mode] || 'off', device: Object.assign({}, S && S.device, { id: hereId, name: DEVNAME }) });
          at = Date.now(); if (!ps.paused) lastPlay = at; setIdle(null); paint(); show(); djPaint();
        });
        here.connect();
      }, function (e) { hereNote(e.message); });
    }
    $('.np-herecb').addEventListener('change', function () { setHere(this.checked, true); });
    try { if (localStorage.getItem(hk) === '1' && enabled) setHere(true); } catch (e) { }
    // keep the music here: every 5 seconds, if another device has it, the wallpaper takes it back (play or pause kept as it was).
    // Only one page at a time does this (the rotation briefly has two wallpapers open while it crossfades).
    var keepHere = false, lastGrab = 0, keepWho = rand(8);
    try { keepHere = localStorage.getItem('np-keep-here') === '1'; } catch (e) { }
    $('.np-keepcb').checked = keepHere;
    $('.np-keepcb').addEventListener('change', function () {
      keepHere = this.checked; try { localStorage.setItem('np-keep-here', keepHere ? '1' : '0'); } catch (e) { }
      if (keepHere && !hereOn) setHere(true, true);
      lastGrab = 0; grabCheck();
    });
    if (keepHere && enabled && !hereOn) setHere(true);
    function keepLock() {
      var l = null; try { l = JSON.parse(localStorage.getItem('np-keep-lock') || 'null'); } catch (e) { }
      if (l && l.who !== keepWho && Date.now() - l.t < 12000) return false;
      try { localStorage.setItem('np-keep-lock', JSON.stringify({ who: keepWho, t: Date.now() })); } catch (e) { } return true;
    }
    var grabMiss = 0;
    function grabCheck() {
      if (!keepHere || !hereId || !enabled || document.hidden || !keepLock()) return;
      if (S && S.device && S.device.id === hereId) { grabMiss = 0; return; }   // already here
      var wait = Math.min(60000, 5000 * Math.pow(2, grabMiss));   // 5 s, then 10, 20, 40, 60 while a move keeps not sticking
      if (Date.now() - lastGrab < wait - 500) return;
      if (lastGrab && Date.now() - lastGrab < 90000) grabMiss++; else grabMiss = 0;
      lastGrab = Date.now(); lastAction = Date.now();
      var playing = !!(S && S.is_playing);
      call('PUT', '/me/player', { device_ids: [hereId], play: playing }).then(function () {
        hereNote('Took the music back to this wallpaper.'); setTimeout(poll, 600);
      }, function (e) { hereNote(why(e)); });
    }

    if (opts.app) { opts.mini = true; box.classList.add('in-app'); }
    if (window.desktop && window.desktop.discord) {   // the app: share the song to a Discord channel
      box.querySelector('.np-shares').hidden = false; djQ('.dj-share').hidden = false;
      var share = function () {
        var t = view === 'yt' && yt ? yt.track() : currentTrack(); if (!t || !t.title) { flash('Nothing playing to share'); return; }
        window.desktop.discord.share(t).then(function (r) { var m = r && r.ok ? 'Shared to Discord: ' + t.title : 'Discord: ' + (r && r.error || 'could not share'); flash(m, r && r.ok); djToast(m, r && r.ok); });
      };
      $('.np-share').addEventListener('click', share); djQ('.dj-share').addEventListener('click', share);
    }
    if (opts.mini) { box.classList.add('mini-page'); tab.classList.add('mini-page'); setTuck(false); setTimeout(function () { setBig(true); }, 0); }
    if (opts.interactive === false) box.classList.add('ro');
    if (opts.skin) box.classList.add('sk-' + opts.skin);
    window.addEventListener('resize', function () { $('.np-t').classList.remove('mq'); fitTitle(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { $('.np-t').classList.remove('mq'); fitTitle(); });

    ready.then(function () { setStatus(tok ? 'idle' : 'off'); poll(); });
    var volT = 0;
    return {
      enabled: function () { return enabled; },
      setEnabled: function (on) { enabled = on; try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { } if (!on) { hide(); setHere(false); } poll(); },
      onStatus: function (fn) { statusFns.push(fn); fn(status, note); },
      // for the island: which source, open or closed, the full view, the buttons, what plays
      setSource: function (s2) { if (s2 === 'sp' || (s2 === 'yt' && yt)) setSrc(s2, true); },
      setPanelActive: function (active) {
        if (active === panelActive) return;
        panelActive = active;
        if (active) poll();
        else if (!polling) { clearTimeout(timer); timer = setTimeout(poll, gap()); }
      },
      source: function () { return src; },
      setBig: function (b) { setBig(!!b); }, isBig: function () { return box.classList.contains('big'); },
      openDevices: function () { setPane('dev', true); },
      openView: function (v) { if (v === 'dj') djEnter(); else if (v === 'yt') setView('yt'); else openNow(); },
      closeView: function () { if (view) djLeave(); },
      view: function () { return view; },
      control: function (s2, what) {
        if (s2 === 'yt') { if (yt) yt[what === 'play' ? 'toggle' : what](); return; }
        var b = $('.np-' + (what === 'play' ? 'play' : what)); if (b) b.click();
      },
      like: function () { $('.np-like').click(); }, liked: function () { return !!liked; },
      /* the island's type bar and tiles */
      // songs for some words (one search; while Spotify's search rests it says so)
      find: function (q) {
        q = String(q || '').trim(); if (q.length < 2) return Promise.resolve([]);
        var rest = searchResting(); if (rest) return Promise.reject(new Error(retryMessage(rest, true, searchLimit)));
        return call('GET', '/search?type=track&limit=5&q=' + encodeURIComponent(q)).then(function (j) {
          return (j && j.tracks && j.tracks.items || []).filter(Boolean).map(function (t) {
            var im = t.album && t.album.images || [];
            return { uri: t.uri, title: t.name, artist: (t.artists || []).map(function (a) { return a.name; }).join(', '), art: (im[im.length - 1] || im[0] || {}).url || '' };
          });
        }, function (e) { throw new Error(why(e)); });
      },
      playTrack: function (uri, label) { return /^spotify:track:[A-Za-z0-9]+$/.test(uri || '') ? play({ uris: [uri] }, label || 'your pick') : Promise.resolve(false); },
      djPlay: function (q) { q = String(q || '').trim().toLowerCase(); if (q.length < 2) return; setSrc('sp', true); dj.g = q; djEnter(true); },
      ytSearch: function (q) { if (yt && yt.search) { setSrc('yt', true); yt.search(q); } },
      volume: function (s2, v) {
        if (s2 === 'yt') return yt && yt.volume ? yt.volume(v) : null;
        if (v == null) return S && S.device && S.device.volume_percent != null ? S.device.volume_percent : null;
        v = Math.max(0, Math.min(100, Math.round(+v)));
        if (S && S.device) S.device.volume_percent = v;
        var r = $('.np-volr'); if (r) r.value = v;
        clearTimeout(volT); volT = setTimeout(function () { ctl('PUT', '/me/player/volume?volume_percent=' + v, function () { }); }, 250);
        return v;
      },
      device: function () { return S && S.device ? S.device.name : ''; },
      signedIn: function () { return !!(load() && load().refresh); },
      spotifyTrack: function () { return currentTrack(); },
      ytTrack: function () { return yt ? yt.track() : null; },
      _state: function (s) { S = s; at = Date.now(); if (s && s.item) { lastPlay = Date.now(); paint(); show(); } else hide(); }   // for testing
    };
  }

  /* attach(id, row, on, skin): the settings row (on: switched on by default; skin: a look of its own, e.g. 'normandy') on a wallpaper: a switch, and a link to sign in when not signed in yet */
  function attach(id, row, on, skin) {
    var p = init({ id: id, on: on, skin: skin });
    var cb = row.querySelector('input[type=checkbox]'), link = row.querySelector('a');
    cb.checked = p.enabled();
    cb.addEventListener('change', function () { p.setEnabled(cb.checked); });
    function upd() { if (link) { var again = needsNewSignIn(); link.hidden = signedIn() && !again; link.textContent = again ? 'Sign in again ↗' : 'Sign in ↗'; link.href = SETUP + '?back=' + encodeURIComponent(location.href); } }
    p.onStatus(upd);
    return p;
  }
  return { init: init, attach: attach, check: check, connect: connect, disconnect: disconnect, signedIn: signedIn, needsNewSignIn: needsNewSignIn, handleCallback: handleCallback, livelyLink: livelyLink, setup: SETUP,
    clientId: cid, setClientId: function (v) { try { localStorage.setItem('np-client', v); } catch (e) { } },
    corner: corner, setCorner: function (v) { try { localStorage.setItem('np-corner', v); } catch (e) { } } };
})();
