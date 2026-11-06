'use strict';
/* The computer's own controls for Settings › Controls: sound, display brightness, dark mode, Wi-Fi, Bluetooth, and a few
   actions (lock, screenshot, Focus). Each platform uses only its own built-in tools, run with fixed arguments (never a
   shell, never text from the page); what a computer cannot do comes back as null, and its tile is shown as unavailable
   or opens the system's own settings page instead.
     macOS    osascript, networksetup, pmset (brightness and Bluetooth when the free `brightness` / `blueutil` tools exist)
     Windows  PowerShell (Core Audio for the volume, WMI for a laptop's brightness), reg, netsh
     Linux    pactl, brightnessctl, gsettings, nmcli, bluetoothctl, loginctl */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v))));
const num = (v) => Number.isFinite(Number(v)) && v !== '' && v !== null && typeof v !== 'boolean';

function defaultRun(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeout || 6000, windowsHide: true, encoding: 'utf8' }, (err, out) => (err ? reject(err) : resolve(String(out || '').trim())));
  });
}

/* Windows: the default speaker's volume through Core Audio (compiled once into a small library, then loaded each time) */
const WIN_AUDIO = `using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext); int j();
  int GetMasterVolumeLevelScalar(out float pfLevel); int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext); int GetMute(out bool pbMute); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class AstrumAudio {
  static IAudioEndpointVolume Vol() { var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice d = null;
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out d)); IAudioEndpointVolume v = null; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(d.Activate(ref id, 23, 0, out v)); return v; }
  public static float Volume { get { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, Guid.Empty)); } }
  public static bool Mute { get { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, Guid.Empty)); } }
}`;
const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';

// parsers (pure, tested)
const parse = {
  macVolume(s) {   // "output volume:44, input volume:50, alert volume:100, output muted:false"
    const v = /output volume:(\d+)/.exec(s), m = /output muted:(true|false)/.exec(s);
    return { volume: v ? clamp(v[1]) : null, muted: m ? m[1] === 'true' : null };
  },
  macWifiDevice(s) {   // networksetup -listallhardwareports
    const m = /Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\S+)/.exec(s); return m ? m[1] : null;
  },
  macWifiPower(s) { const m = /:\s*(On|Off)\s*$/i.exec(s); return m ? m[1].toLowerCase() === 'on' : null; },
  macWifiName(s) { const m = /Current Wi-Fi Network:\s*(.+)$/m.exec(s); return m ? m[1].trim() : ''; },
  macBrightness(s) { const m = /brightness\s+([\d.]+)/.exec(s); return m ? clamp(parseFloat(m[1]) * 100) : null; },
  winWifi(s) {   // netsh wlan show interfaces
    const st = /^\s*State\s*:\s*(.+)$/mi.exec(s), id = /^\s*SSID\s*:\s*(.+)$/mi.exec(s);
    if (!st) return { wifi: null, wifiName: '' };
    return { wifi: /connected/i.test(st[1]) && !/disconnected/i.test(st[1]), wifiName: id ? id[1].trim() : '' };
  },
  winDark(s) { const m = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(s); return m ? parseInt(m[1], 16) === 0 : null; },
  pactlVolume(s) { const m = /(\d+)%/.exec(s); return m ? clamp(m[1]) : null; },
  pactlMute(s) { const m = /Mute:\s*(yes|no)/i.exec(s); return m ? m[1].toLowerCase() === 'yes' : null; },
  brightnessctl(s) { const p = s.split(','); const v = p[3] && /(\d+)%/.exec(p[3]); return v ? clamp(v[1]) : null; },
  gnomeDark(s) { return /prefer-dark/.test(s) ? true : /default|prefer-light/.test(s) ? false : null; },
  nmcliRadio(s) { return /^enabled/m.test(s) ? true : /^disabled/m.test(s) ? false : null; },
  nmcliName(s) { const l = s.split('\n').find((x) => x.startsWith('yes:')); return l ? l.slice(4) : ''; },
  bluetoothctl(s) { const m = /Powered:\s*(yes|no)/i.exec(s); return m ? m[1].toLowerCase() === 'yes' : null; }
};

function create(o = {}) {
  const platform = o.platform || process.platform;
  const run = o.run || defaultRun;
  const open = o.open || (() => Promise.resolve());   // shell.openExternal, for settings pages
  const exists = o.exists || ((p) => { try { fs.accessSync(p); return true; } catch { return false; } });
  const dataDir = o.dataDir || require('os').tmpdir();
  const ok = (p) => p.then((v) => v, () => null);
  const first = (list) => list.find((p) => exists(p)) || null;

  /* ---------------- macOS ---------------- */
  const osa = (script) => run('osascript', ['-e', script]);
  let wifiDev;
  const macWifiDev = async () => (wifiDev !== undefined ? wifiDev : (wifiDev = await ok(run('networksetup', ['-listallhardwareports']).then(parse.macWifiDevice))));
  const brightnessBin = () => first(['/opt/homebrew/bin/brightness', '/usr/local/bin/brightness']);
  const blueutilBin = () => first(['/opt/homebrew/bin/blueutil', '/usr/local/bin/blueutil']);
  const mac = {
    async get() {
      const s = { volume: null, muted: null, brightness: null, dark: null, wifi: null, wifiName: '', bluetooth: null };
      const [vol, dark, dev] = await Promise.all([ok(osa('get volume settings')), ok(osa('tell application "System Events" to tell appearance preferences to get dark mode')), macWifiDev()]);
      if (vol) Object.assign(s, parse.macVolume(vol));
      if (dark) s.dark = /true/.test(dark);
      if (dev) {
        s.wifi = await ok(run('networksetup', ['-getairportpower', dev]).then(parse.macWifiPower));
        if (s.wifi) s.wifiName = (await ok(run('networksetup', ['-getairportnetwork', dev]).then(parse.macWifiName))) || '';
      }
      const bb = brightnessBin(); if (bb) s.brightness = await ok(run(bb, ['-l']).then(parse.macBrightness));
      const bu = blueutilBin(); if (bu) s.bluetooth = await ok(run(bu, ['-p']).then((x) => x.trim() === '1'));
      return s;
    },
    async set(k, v) {
      if (k === 'volume') return run('osascript', ['-e', 'set volume output volume ' + clamp(v)].concat(clamp(v) > 0 ? ['-e', 'set volume without output muted'] : []));
      if (k === 'muted') return osa('set volume output muted ' + (v ? 'true' : 'false'));
      if (k === 'dark') return osa('tell application "System Events" to tell appearance preferences to set dark mode to ' + (v ? 'true' : 'false'));
      if (k === 'wifi') { const dev = await macWifiDev(); if (!dev) throw new Error('no Wi-Fi here'); return run('networksetup', ['-setairportpower', dev, v ? 'on' : 'off']); }
      if (k === 'brightness') { const bb = brightnessBin(); if (!bb) throw new Error('needs brightness'); return run(bb, [(clamp(v) / 100).toFixed(2)]); }
      if (k === 'bluetooth') { const bu = blueutilBin(); if (!bu) return open('x-apple.systempreferences:com.apple.preferences.Bluetooth'); return run(bu, ['-p', v ? '1' : '0']); }
      throw new Error('not here');
    },
    act(a) {
      if (a === 'lock') return run('pmset', ['displaysleepnow']);
      if (a === 'screenshot') return run('open', ['-a', 'Screenshot']);
      if (a === 'focus') return open('x-apple.systempreferences:com.apple.Focus-Settings.extension');
      if (a === 'bluetooth-settings') return open('x-apple.systempreferences:com.apple.preferences.Bluetooth');
      if (a === 'wifi-settings') return open('x-apple.systempreferences:com.apple.preference.network');
      if (a === 'sound-settings') return open('x-apple.systempreferences:com.apple.preference.sound');
      if (a === 'display-settings') return open('x-apple.systempreferences:com.apple.preference.displays');
      throw new Error('not here');
    }
  };

  /* ---------------- Windows ---------------- */
  const ps = (cmd) => run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(cmd, 'utf16le').toString('base64')], { timeout: 10000 });
  const dll = path.join(dataDir, 'astrum-audio-1.dll');
  const audio = (body) => {
    const lit = (p) => "'" + p.replace(/'/g, "''") + "'";
    const load = exists(dll) ? 'Add-Type -Path ' + lit(dll) + ';'
      : 'Add-Type -TypeDefinition @\'\n' + WIN_AUDIO + '\n\'@ -OutputAssembly ' + lit(dll) + '; Add-Type -Path ' + lit(dll) + ';';
    return ps(load + body);
  };
  const win = {
    async get() {
      const s = { volume: null, muted: null, brightness: null, dark: null, wifi: null, wifiName: '', bluetooth: null };
      const [a, br, dark, wifi] = await Promise.all([
        ok(audio('[Console]::Out.Write([string][math]::Round([AstrumAudio]::Volume*100) + "," + [AstrumAudio]::Mute)')),
        ok(ps('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness')),
        ok(run('reg', ['query', PERSONALIZE, '/v', 'AppsUseLightTheme'])),
        ok(run('netsh', ['wlan', 'show', 'interfaces']))
      ]);
      if (a && /^\d+,(True|False)$/i.test(a.trim())) { const [v, m] = a.trim().split(','); s.volume = clamp(v); s.muted = /true/i.test(m); }
      if (br && /^\d+$/.test(br.trim())) s.brightness = clamp(br);
      if (dark) s.dark = parse.winDark(dark);
      if (wifi) Object.assign(s, parse.winWifi(wifi));
      return s;
    },
    set(k, v) {
      if (k === 'volume') return audio('[AstrumAudio]::Volume = ' + (clamp(v) / 100).toFixed(2) + (clamp(v) > 0 ? '; [AstrumAudio]::Mute = $false' : ''));
      if (k === 'muted') return audio('[AstrumAudio]::Mute = $' + (v ? 'true' : 'false'));
      if (k === 'brightness') return ps('Invoke-CimMethod -InputObject (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1) -MethodName WmiSetBrightness -Arguments @{Timeout=1;Brightness=' + clamp(v) + '} | Out-Null');
      if (k === 'dark') {
        const d = v ? '0' : '1';
        return run('reg', ['add', PERSONALIZE, '/v', 'AppsUseLightTheme', '/t', 'REG_DWORD', '/d', d, '/f'])
          .then(() => run('reg', ['add', PERSONALIZE, '/v', 'SystemUsesLightTheme', '/t', 'REG_DWORD', '/d', d, '/f']));
      }
      if (k === 'wifi') return open('ms-settings:network-wifi');        // turning Wi-Fi off needs an administrator: its settings page
      if (k === 'bluetooth') return open('ms-settings:bluetooth');
      throw new Error('not here');
    },
    act(a) {
      if (a === 'lock') return run('rundll32.exe', ['user32.dll,LockWorkStation']);
      if (a === 'screenshot') return open('ms-screenclip:');
      if (a === 'focus') return open('ms-settings:quiethours');
      if (a === 'bluetooth-settings') return open('ms-settings:bluetooth');
      if (a === 'wifi-settings') return open('ms-settings:network-wifi');
      if (a === 'sound-settings') return open('ms-settings:sound');
      if (a === 'display-settings') return open('ms-settings:display');
      throw new Error('not here');
    }
  };

  /* ---------------- Linux ---------------- */
  const linux = {
    async get() {
      const s = { volume: null, muted: null, brightness: null, dark: null, wifi: null, wifiName: '', bluetooth: null };
      const [v, m, b, d, w, n, bt] = await Promise.all([
        ok(run('pactl', ['get-sink-volume', '@DEFAULT_SINK@'])), ok(run('pactl', ['get-sink-mute', '@DEFAULT_SINK@'])),
        ok(run('brightnessctl', ['-m'])), ok(run('gsettings', ['get', 'org.gnome.desktop.interface', 'color-scheme'])),
        ok(run('nmcli', ['radio', 'wifi'])), ok(run('nmcli', ['-t', '-f', 'active,ssid', 'dev', 'wifi'])), ok(run('bluetoothctl', ['show']))
      ]);
      if (v) s.volume = parse.pactlVolume(v);
      if (m) s.muted = parse.pactlMute(m);
      if (b) s.brightness = parse.brightnessctl(b);
      if (d) s.dark = parse.gnomeDark(d);
      if (w) s.wifi = parse.nmcliRadio(w);
      if (n && s.wifi) s.wifiName = parse.nmcliName(n);
      if (bt) s.bluetooth = parse.bluetoothctl(bt);
      return s;
    },
    set(k, v) {
      if (k === 'volume') return run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', clamp(v) + '%']);
      if (k === 'muted') return run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', v ? '1' : '0']);
      if (k === 'brightness') return run('brightnessctl', ['set', Math.max(1, clamp(v)) + '%']);
      if (k === 'dark') return run('gsettings', ['set', 'org.gnome.desktop.interface', 'color-scheme', v ? 'prefer-dark' : 'default']);
      if (k === 'wifi') return run('nmcli', ['radio', 'wifi', v ? 'on' : 'off']);
      if (k === 'bluetooth') return run('bluetoothctl', ['power', v ? 'on' : 'off']);
      throw new Error('not here');
    },
    act(a) {
      if (a === 'lock') return run('loginctl', ['lock-session']);
      if (a === 'screenshot') return run('gnome-screenshot', ['-i']);
      throw new Error('not here');
    }
  };

  const impl = platform === 'darwin' ? mac : platform === 'win32' ? win : linux;
  const KEYS = { volume: 'num', brightness: 'num', muted: 'bool', dark: 'bool', wifi: 'bool', bluetooth: 'bool' };
  const ACTS = ['lock', 'screenshot', 'focus', 'bluetooth-settings', 'wifi-settings', 'sound-settings', 'display-settings'];
  return {
    platform,
    get: () => impl.get().catch(() => ({})),
    // only the known controls, with a number (0-100) or a yes/no; anything else is refused
    async set(k, v) {
      const kind = KEYS[k];
      if (!kind || (kind === 'num' && !num(v)) || (kind === 'bool' && typeof v !== 'boolean')) return { ok: false, error: 'not a control' };
      try { await impl.set(k, kind === 'num' ? clamp(v) : v); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
    },
    async act(a) {
      if (!ACTS.includes(a)) return { ok: false, error: 'not an action' };
      try { await impl.act(a); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
    }
  };
}

module.exports = { create, parse };
