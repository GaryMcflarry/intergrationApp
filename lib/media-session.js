'use strict';
/* YouTube without the extension: the computer's own media controls. What a browser (or the YouTube desktop app) tells
   the system it plays, and play / pause / next / previous for it; no queue and no suggestions (the system does not
   know them). Used only while no browser is connected through Astrum's extension (lib/yt-bridge.js).
   Like lib/system.js, each platform uses its own tools, with fixed arguments (never a shell, never text from a page):
     Windows  PowerShell, the system's media sessions (Windows.Media.Control)
     Linux    playerctl (MPRIS); only players whose address is on youtube.com
     macOS    Apple allows no app to read "Now Playing" since macOS 15.4; mediaremote-adapter reads it through the
              system's own /usr/bin/perl. It is used only when its files are in native/mediaremote-adapter. */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const INTERVAL = 5000;
const NAMES = new Set(['play', 'pause', 'toggle', 'next', 'prev']);

function defaultRun(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeout || 8000, windowsHide: true, encoding: 'utf8', maxBuffer: 1 << 20 }, (err, out) => (err ? reject(err) : resolve(String(out || '').trim())));
  });
}
function text(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function num(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }

/* ---------- Windows: the media sessions, through PowerShell (the async WinRT calls awaited as tasks) ---------- */
const WIN_HEAD = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$m = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
`;
const WIN_GET = WIN_HEAD + `$out = @(foreach ($s in $m.GetSessions()) {
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $tl = $s.GetTimelineProperties()
  [pscustomobject]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; status = $s.GetPlaybackInfo().PlaybackStatus.ToString(); position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds }
})
ConvertTo-Json -Compress -InputObject $out`;
const WIN_SEND = { play: 'TryPlayAsync', pause: 'TryPauseAsync', toggle: 'TryTogglePlayPauseAsync', next: 'TrySkipNextAsync', prev: 'TrySkipPreviousAsync' };
// the browsers, and the YouTube app (an installed web app reports its own id, with youtube in it)
const WIN_APPS = /chrome|msedge|brave|firefox|opera|vivaldi|youtube/i;

/* ---------- Linux: playerctl ---------- */
const LINUX_FORMAT = '{{playerName}}\t{{status}}\t{{xesam:url}}\t{{xesam:title}}\t{{xesam:artist}}\t{{position}}\t{{mpris:length}}';
const LINUX_SEND = { play: 'play', pause: 'pause', toggle: 'play-pause', next: 'next', prev: 'previous' };

/* ---------- macOS: mediaremote-adapter (MRMediaRemoteCommand: 0 play, 1 pause, 2 toggle, 4 next, 5 previous) ---------- */
const MAC_SEND = { play: '0', pause: '1', toggle: '2', next: '4', prev: '5' };

const parse = {
  // Windows: the sessions as JSON (one object, or a list); the browser or YouTube app that is playing wins
  win(out) {
    let list; try { list = JSON.parse(out || '[]'); } catch { return null; }
    if (!Array.isArray(list)) list = list ? [list] : [];
    const ok = list.filter((s) => s && WIN_APPS.test(String(s.app || '')) && text(s.title, 200));
    const s = ok.find((x) => x.status === 'Playing') || ok[0];
    if (!s) return null;
    return { title: text(s.title, 200), channel: text(s.artist, 100), playing: s.status === 'Playing', position: num(s.position), duration: num(s.duration), app: text(String(s.app), 80) };
  },
  // Linux: one line per player; only those on youtube.com
  linux(out) {
    const rows = String(out || '').split('\n').map((l) => l.split('\t')).filter((r) => r.length >= 5 && /^https:\/\/(www\.|music\.)?youtube\.com\//.test(r[2]));
    const r = rows.find((x) => x[1] === 'Playing') || rows[0];
    if (!r) return null;
    const v = (() => { try { return new URL(r[2]).searchParams.get('v') || ''; } catch { return ''; } })();
    return { title: text(r[3], 200), channel: text(r[4], 100), playing: r[1] === 'Playing', position: num(r[5]) / 1e6, duration: num(r[6]) / 1e6, player: text(r[0], 60), video: /^[\w-]{11}$/.test(v) ? v : '' };
  },
  // macOS: the adapter's JSON; only a browser or the YouTube app, as on Windows
  mac(out) {
    let j; try { j = JSON.parse(out || 'null'); } catch { return null; }
    if (!j || typeof j !== 'object' || !text(j.title, 200)) return null;
    const app = String(j.bundleIdentifier || j.parentApplicationBundleIdentifier || '');
    if (!/chrome|edge|brave|firefox|opera|vivaldi|safari|youtube/i.test(app)) return null;
    return { title: text(j.title, 200), channel: text(j.artist, 100), playing: j.playing === true, position: num(j.elapsedTime), duration: num(j.duration), app: text(app, 80) };
  }
};

function createMediaSession(o = {}) {
  const platform = o.platform || process.platform;
  const run = o.run || defaultRun;
  const exists = o.exists || ((p) => { try { return fs.existsSync(p); } catch { return false; } });
  const onState = o.onState || (() => {});
  const adapter = o.adapterDir || path.join(__dirname, '..', 'native', 'mediaremote-adapter');
  const macScript = path.join(adapter, 'mediaremote-adapter.pl'), macFramework = path.join(adapter, 'MediaRemoteAdapter.framework');
  const ps = (cmd) => run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(cmd, 'utf16le').toString('base64')], { timeout: 10000 });

  let last = null, lastKey = 'null', timer = null, busy = false, linuxPlayer = '';
  function available() {
    if (platform === 'darwin') return exists(macScript) && exists(macFramework);
    return platform === 'win32' || platform === 'linux';
  }
  async function read() {
    if (platform === 'win32') return parse.win(await ps(WIN_GET));
    if (platform === 'linux') { const s = parse.linux(await run('playerctl', ['-a', 'metadata', '--format', LINUX_FORMAT])); linuxPlayer = s ? s.player : ''; return s; }
    // --no-artwork: the cover comes as base64 otherwise, hundreds of KB a time (and not shown: the island has no use for it)
    if (platform === 'darwin') return parse.mac(await run('/usr/bin/perl', [macScript, macFramework, 'get', '--no-artwork']));
    return null;
  }
  async function poll() {
    if (busy || !available()) return;
    busy = true;
    try { last = await read(); } catch { last = null; }   // the tool is missing or nothing plays: the same to the island
    finally { busy = false; }
    const key = JSON.stringify(last);
    if (key !== lastKey) { lastKey = key; onState(state()); }
  }
  // the bridge's shape, so the island draws both the same way; `via` says it came from the system
  function state() {
    if (!last) return { connected: false, via: 'system' };
    return { connected: true, via: 'system', video: last.video || '', title: last.title, channel: last.channel, playing: last.playing,
      position: last.position, duration: last.duration, volume: null, list: '', index: -1, queue: [], upNext: [] };
  }
  async function send(name) {
    if (!NAMES.has(name) || !last || !available()) return false;
    try {
      if (platform === 'win32') {
        // the session that was read, by its app id: Windows' own value, used only when it has the usual characters
        if (!/^[\w.!+-]{1,80}$/.test(last.app)) return false;
        await ps(WIN_HEAD + `$s = @($m.GetSessions() | Where-Object { $_.SourceAppUserModelId -eq '${last.app}' })[0]
if ($s) { $null = Await ($s.${WIN_SEND[name]}()) ([bool]) }`);
      } else if (platform === 'linux') {
        await run('playerctl', ['-p', linuxPlayer || last.player, LINUX_SEND[name]]);
      } else if (platform === 'darwin') {
        await run('/usr/bin/perl', [macScript, macFramework, 'send', MAC_SEND[name]]);
      } else return false;
      setTimeout(poll, 400);
      return true;
    } catch { return false; }
  }

  return {
    available, state, send, poll,
    // polled only while no browser is connected through the extension (main.js starts and stops it)
    start() { if (!timer && available()) { poll(); timer = setInterval(poll, o.interval || INTERVAL); if (timer.unref) timer.unref(); } },
    stop() { clearInterval(timer); timer = null; if (last) { last = null; lastKey = 'null'; onState(state()); } }
  };
}

module.exports = { createMediaSession, parse };
