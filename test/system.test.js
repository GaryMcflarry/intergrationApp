'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create, parse } = require('../lib/system');

// a fake computer: answers by command, and remembers what was run
function fake(answers, existing = []) {
  const ran = [];
  const run = async (cmd, args) => {
    ran.push([cmd, ...args].join(' '));
    for (const [re, out] of answers) if (re.test([cmd, ...args].join(' '))) { if (out instanceof Error) throw out; return out; }
    throw new Error('not found: ' + cmd);
  };
  return { ran, run, exists: (p) => existing.includes(p), opened: [] };
}

test('parsers read each tool\'s answer', () => {
  assert.deepEqual(parse.macVolume('output volume:44, input volume:50, alert volume:100, output muted:false'), { volume: 44, muted: false });
  assert.equal(parse.macWifiDevice('Hardware Port: Ethernet\nDevice: en1\n\nHardware Port: Wi-Fi\nDevice: en0\nEthernet Address: x'), 'en0');
  assert.equal(parse.macWifiPower('Wi-Fi Power (en0): On'), true);
  assert.equal(parse.macWifiName('Current Wi-Fi Network: Labmin'), 'Labmin');
  assert.equal(parse.macBrightness('display 0: main, active, awake, online, built-in, ID 0x1\ndisplay 0: brightness 0.734'), 73);
  assert.deepEqual(parse.winWifi('    Name                   : Wi-Fi\n    State                  : connected\n    SSID                   : Labmin\n    BSSID   : aa'), { wifi: true, wifiName: 'Labmin' });
  assert.deepEqual(parse.winWifi('    State                  : disconnected'), { wifi: false, wifiName: '' });
  assert.equal(parse.winDark('    AppsUseLightTheme    REG_DWORD    0x0'), true);
  assert.equal(parse.winDark('    AppsUseLightTheme    REG_DWORD    0x1'), false);
  assert.equal(parse.pactlVolume('Volume: front-left: 42598 /  65% / -11.23 dB,   front-right: 42598 /  65%'), 65);
  assert.equal(parse.pactlMute('Mute: no'), false);
  assert.equal(parse.brightnessctl('intel_backlight,backlight,400,40%,1000'), 40);
  assert.equal(parse.gnomeDark("'prefer-dark'"), true);
  assert.equal(parse.nmcliName('no:Other\nyes:Labmin'), 'Labmin');
  assert.equal(parse.bluetoothctl('Controller x\n\tPowered: yes'), true);
});

test('macOS: reads the sound, dark mode and Wi-Fi; brightness only with the brightness tool', async () => {
  const f = fake([
    [/get volume settings/, 'output volume:30, input volume:50, alert volume:100, output muted:false'],
    [/get dark mode/, 'true'],
    [/-listallhardwareports/, 'Hardware Port: Wi-Fi\nDevice: en0\n'],
    [/-getairportpower en0/, 'Wi-Fi Power (en0): On'],
    [/-getairportnetwork en0/, 'Current Wi-Fi Network: Labmin']
  ]);
  const s = await create({ platform: 'darwin', run: f.run, exists: f.exists }).get();
  assert.deepEqual(s, { volume: 30, muted: false, brightness: null, dark: true, wifi: true, wifiName: 'Labmin', bluetooth: null });
  const g = fake([[/brightness -l/, 'display 0: brightness 0.5'], [/.*/, '']], ['/opt/homebrew/bin/brightness']);
  assert.equal((await create({ platform: 'darwin', run: g.run, exists: g.exists }).get()).brightness, 50);
});

test('macOS: sets with fixed commands; unknown controls and bad values are refused', async () => {
  const f = fake([[/.*/, '']]);
  const sys = create({ platform: 'darwin', run: f.run, exists: f.exists });
  assert.deepEqual(await sys.set('volume', 55), { ok: true });
  assert.ok(f.ran.includes('osascript -e set volume output volume 55 -e set volume without output muted'));
  await sys.set('volume', 400); assert.ok(f.ran.some((r) => r.includes('output volume 100')));   // clamped
  await sys.set('dark', false); assert.ok(f.ran.some((r) => r.endsWith('set dark mode to false')));
  assert.equal((await sys.set('volume', '1; do shell script "x"')).ok, false);   // not a number
  assert.equal((await sys.set('dark', 'yes')).ok, false);
  assert.equal((await sys.set('shell', 'x')).ok, false);
  assert.equal((await sys.act('rm -rf')).ok, false);
  assert.deepEqual(await sys.act('lock'), { ok: true }); assert.ok(f.ran.includes('pmset displaysleepnow'));
});

test('Windows: the volume through Core Audio, dark mode in the registry, Wi-Fi from netsh', async () => {
  const f = fake([
    [/^powershell\.exe .*-EncodedCommand/, '40,False'],
    [/^reg query/, '    AppsUseLightTheme    REG_DWORD    0x0'],
    [/^netsh/, '    State                  : connected\n    SSID                   : Labmin']
  ]);
  const s = await create({ platform: 'win32', run: f.run, exists: f.exists, dataDir: 'C:\\Temp' }).get();
  assert.equal(s.volume, 40); assert.equal(s.muted, false); assert.equal(s.dark, true); assert.equal(s.wifi, true); assert.equal(s.wifiName, 'Labmin');
  const g = fake([[/.*/, '']]); const opened = [];
  const sys = create({ platform: 'win32', run: g.run, exists: g.exists, open: async (u) => { opened.push(u); } });
  await sys.set('dark', true);
  assert.ok(g.ran.some((r) => r.includes('AppsUseLightTheme /t REG_DWORD /d 0 /f')) && g.ran.some((r) => r.includes('SystemUsesLightTheme /t REG_DWORD /d 0 /f')));
  await sys.set('volume', 25);
  const cmd = g.ran.find((r) => r.startsWith('powershell.exe')).split(' ').pop();
  assert.match(Buffer.from(cmd, 'base64').toString('utf16le'), /\[AstrumAudio\]::Volume = 0\.25/);
  await sys.set('wifi', false); await sys.act('screenshot');
  assert.deepEqual(opened, ['ms-settings:network-wifi', 'ms-screenclip:']);
});

test('Linux: pactl, brightnessctl, gsettings, nmcli; a missing tool is simply unavailable', async () => {
  const f = fake([
    [/get-sink-volume/, 'Volume: front-left: 42598 /  65% / -11.23 dB'], [/get-sink-mute/, 'Mute: yes'],
    [/gsettings get/, "'prefer-dark'"], [/nmcli radio wifi$/, 'enabled'], [/nmcli -t/, 'yes:Home']
  ]);
  const s = await create({ platform: 'linux', run: f.run, exists: f.exists }).get();
  assert.deepEqual(s, { volume: 65, muted: true, brightness: null, dark: true, wifi: true, wifiName: 'Home', bluetooth: null });
});
