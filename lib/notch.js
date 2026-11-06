'use strict';
/* macOS: the real notch of each screen, so the island leaves just its width free (and no gap at all on a screen without
   one). macOS 12+ tells it through NSScreen: safeAreaInsets.top is the notch's height (0: no notch), and the areas left
   and right of it (auxiliaryTopLeftArea / auxiliaryTopRightArea) leave the notch's width between them. Asked once
   through JavaScript for Automation (osascript, built in), and again when screens change. */
const { execFile } = require('child_process');

const SCRIPT = `ObjC.import('AppKit');
var out = [], ss = $.NSScreen.screens;
for (var i = 0; i < ss.count; i++) {
  var s = ss.objectAtIndex(i), f = s.frame, top = 0, lw = 0, rw = 0;
  try { top = s.safeAreaInsets.top; } catch (e) {}
  try { lw = s.auxiliaryTopLeftArea.size.width; rw = s.auxiliaryTopRightArea.size.width; } catch (e) {}
  out.push({ x: f.origin.x, w: f.size.width, h: f.size.height, top: top, lw: lw, rw: rw });
}
JSON.stringify(out);`;

// the screens' answer -> { displayId: notch width in px (0: none) }, matched to Electron's displays by position and size
function match(list, displays) {
  const out = {};
  for (const d of displays) {
    const s = list.find((x) => Math.round(x.x) === Math.round(d.bounds.x) && Math.round(x.w) === Math.round(d.bounds.width) && Math.round(x.h) === Math.round(d.bounds.height));
    if (!s) continue;
    const w = s.top > 0 && s.lw > 0 && s.rw > 0 ? s.w - s.lw - s.rw : 0;
    out[d.id] = w > 40 && w < s.w / 2 ? Math.round(w) : 0;
  }
  return out;
}

function measure(displays, run = (cb) => execFile('osascript', ['-l', 'JavaScript', '-e', SCRIPT], { timeout: 5000 }, cb)) {
  return new Promise((resolve) => {
    run((err, stdout) => {
      if (err) return resolve({});
      try { resolve(match(JSON.parse(String(stdout).trim()), displays)); } catch { resolve({}); }
    });
  });
}

module.exports = { measure, match, SCRIPT };
