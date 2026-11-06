'use strict';
/* The Mac menu bar icon: Astrum's four-pointed star as a template image (black shape, see-through elsewhere), which
   macOS draws white on a dark menu bar and black on a light one, like its own icons. Drawn here, 18 pt at 2x, so there
   is no image file to ship. */
const STAR = [[12, 3.2], [13.9, 10.1], [20.8, 12], [13.9, 13.9], [12, 20.8], [10.1, 13.9], [3.2, 12], [10.1, 10.1]];   // on a 24 grid

function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// a BGRA bitmap, size x size, the star scaled to fit, each pixel's cover sampled 4x4 for smooth edges
function starBitmap(size) {
  const buf = Buffer.alloc(size * size * 4), k = size / 24, S = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) if (inside((x + (sx + 0.5) / S) / k, (y + (sy + 0.5) / S) / k, STAR)) n++;
    buf[(y * size + x) * 4 + 3] = Math.round((255 * n) / (S * S));   // black, with this much cover
  }
  return buf;
}
function menuBarIcon(nativeImage) {
  const img = nativeImage.createFromBitmap(starBitmap(36), { width: 36, height: 36, scaleFactor: 2 });
  img.setTemplateImage(true);
  return img;
}
module.exports = { menuBarIcon, starBitmap };
