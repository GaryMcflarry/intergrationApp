'use strict';
/* Where the island sits (pure: main.js gives it the screens). The anchor is the closed pill's centre on one screen, kept as
   a share of that screen's work area. Opening grows away from the nearer edge: downwards in the top half of a screen,
   upwards in the bottom half, and near a side towards the middle, so the island is always whole on its screen. */
const PILL = 36, TOP = 6, BOTTOM = 24;   // the pill's height; the island's inset from its window's top / bottom (room for its shadow)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const inside = (p, wa) => p.x >= wa.x && p.x < wa.x + wa.width && p.y >= wa.y && p.y < wa.y + wa.height;
function nearest(displays, p) {
  return displays.find((d) => inside(p, d.workArea)) || displays.slice().sort((a, b) => dist(a.workArea, p) - dist(b.workArea, p))[0];
}
function dist(wa, p) { const dx = Math.max(wa.x - p.x, 0, p.x - (wa.x + wa.width)), dy = Math.max(wa.y - p.y, 0, p.y - (wa.y + wa.height)); return dx * dx + dy * dy; }

// the screen the island belongs to (its own while it exists, else the main one)
function anchorDisplay(displays, primary, anchor) { return (anchor && displays.find((d) => d.id === anchor.display)) || primary; }
function anchorPoint(displays, primary, anchor) {
  const d = anchorDisplay(displays, primary, anchor), wa = d.workArea;
  if (!anchor) return { d, x: wa.x + wa.width / 2, y: wa.y + TOP + PILL / 2 };   // the first time: the top middle of the main screen
  return { d, x: wa.x + anchor.fx * wa.width, y: wa.y + anchor.fy * wa.height };
}
// the window's bounds for an island of this size, and which way it grows
function islandBounds(displays, primary, anchor, size) {
  const p = anchorPoint(displays, primary, anchor), wa = p.d.workArea, up = p.y > wa.y + wa.height / 2;
  const width = Math.min(wa.width, size.width), height = Math.min(wa.height, size.height);
  const x = clamp(Math.round(p.x - width / 2), wa.x, wa.x + wa.width - width);
  const y = clamp(Math.round(up ? p.y + PILL / 2 + BOTTOM - height : p.y - PILL / 2 - TOP), wa.y, wa.y + wa.height - height);
  return { x, y, width, height, up };
}
// a drop: where the window was let go becomes the new anchor (snapping to the top or bottom edge, or the middle, when close).
// placement 'screen' puts it at the top middle of the screen it was dropped on.
function anchorFromWindow(displays, bounds, up, placement) {
  const cx = bounds.x + bounds.width / 2, cy = up ? bounds.y + bounds.height - BOTTOM - PILL / 2 : bounds.y + TOP + PILL / 2;
  const d = nearest(displays, { x: cx, y: cy }), wa = d.workArea;
  let x = clamp(cx, wa.x + 60, wa.x + wa.width - 60), y = clamp(cy, wa.y + TOP + PILL / 2, wa.y + wa.height - BOTTOM - PILL / 2);
  if (placement === 'screen') { x = wa.x + wa.width / 2; y = wa.y + TOP + PILL / 2; }
  if (Math.abs(x - (wa.x + wa.width / 2)) < 48) x = wa.x + wa.width / 2;         // the middle
  if (y - wa.y < 70) y = wa.y + TOP + PILL / 2;                                     // the top edge (the classic island)
  else if (wa.y + wa.height - y < 70) y = wa.y + wa.height - BOTTOM - PILL / 2;     // the bottom edge
  return { display: d.id, fx: (x - wa.x) / wa.width, fy: (y - wa.y) / wa.height };
}
// Follow the mouse: the same spot, on the screen the mouse is on
function followTo(display, anchor) { return { display: display.id, fx: anchor ? anchor.fx : 0.5, fy: anchor ? anchor.fy : (TOP + PILL / 2) / display.workArea.height }; }
// This screen: its top middle
function topMiddle(display) { return { display: display.id, fx: 0.5, fy: (TOP + PILL / 2) / display.workArea.height }; }

module.exports = { PILL, TOP, BOTTOM, islandBounds, anchorFromWindow, anchorDisplay, followTo, topMiddle, nearest };
