// Generates PWA icons and screenshots as minimal PNGs (no dependencies)
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePNG(w, h, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  const stride = 1 + w * 3;
  const raw = Buffer.allocUnsafe(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelFn(x, y, w, h);
      const o = y * stride + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const idat = pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 }));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, pngChunk('IHDR', ihdrData), idat, iend]);
}

// Colors
const BLUE   = [25, 118, 210];  // --primary #1976d2
const BLUE_D = [18,  86, 163];  // darker blue
const WHITE  = [255, 255, 255];
const LGRAY  = [220, 235, 250];  // light blue-gray for lines

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function lerpColor(c1, c2, t) { return [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t)]; }

// Icon pixel function — blue bg, white document with 3 scan lines
function iconPixel(x, y, w, h) {
  const pad = w * 0.25;
  const docX1 = Math.round(pad);
  const docX2 = Math.round(w - pad);
  const docY1 = Math.round(pad * 0.85);
  const docY2 = Math.round(h - pad * 0.85);
  const docW = docX2 - docX1;
  const docH = docY2 - docY1;
  const foldSize = Math.round(docW * 0.25);
  const r = Math.round(w * 0.04); // corner radius for document

  // Check if inside document (with fold cutout)
  const inDoc = (px, py) => {
    if (px < docX1 || px > docX2 || py < docY1 || py > docY2) return false;
    // Top-right fold
    if (px > docX2 - foldSize && py < docY1 + foldSize) {
      if ((docX2 - px) + (py - docY1) < foldSize) return false;
    }
    return true;
  };

  // Fold triangle fill (slightly darker white)
  const inFold = (px, py) => {
    if (px < docX2 - foldSize || px > docX2) return false;
    if (py < docY1 || py > docY1 + foldSize) return false;
    return (docX2 - px) + (py - docY1) < foldSize + 1;
  };

  // Scan lines inside document
  const lineXs = docX1 + Math.round(docW * 0.15);
  const lineXe = docX2 - Math.round(docW * 0.3);
  const line1Y = Math.round(docY1 + docH * 0.38);
  const line2Y = Math.round(docY1 + docH * 0.55);
  const line3Y = Math.round(docY1 + docH * 0.72);
  const lineH = Math.max(2, Math.round(h * 0.025));

  const inLine = (px, py) =>
    px >= lineXs && px <= lineXe &&
    (
      (py >= line1Y && py < line1Y + lineH) ||
      (py >= line2Y && py < line2Y + lineH) ||
      (py >= line3Y && py < line3Y + lineH)
    );

  if (inLine(x, y) && inDoc(x, y)) return lerpColor(WHITE, BLUE, 0.55); // gray-blue lines

  if (inFold(x, y)) return lerpColor(WHITE, BLUE, 0.12); // slightly shaded fold
  if (inDoc(x, y)) return WHITE;

  // Gradient background
  const t = y / h;
  return lerpColor(BLUE, BLUE_D, t);
}

// Screenshot pixel — header bar + card mockup
function screenshotPixel(x, y, w, h) {
  const headerH = Math.round(h * 0.075);
  // Header
  if (y < headerH) {
    return lerpColor(BLUE, BLUE_D, x / w);
  }
  // White body
  if (y < h * 0.92) {
    // Card mockup
    const cardX1 = Math.round(w * 0.05);
    const cardX2 = Math.round(w * 0.95);
    const cardY1 = Math.round(headerH + h * 0.04);
    const cardY2 = Math.round(cardY1 + h * 0.18);
    if (x >= cardX1 && x <= cardX2 && y >= cardY1 && y <= cardY2) {
      // Card shadow border
      if (x === cardX1 || x === cardX2 || y === cardY1 || y === cardY2)
        return [210, 220, 230];
      return [248, 250, 252];
    }
    // Card 2
    const c2Y1 = Math.round(cardY2 + h * 0.04);
    const c2Y2 = Math.round(c2Y1 + h * 0.12);
    if (x >= cardX1 && x <= cardX2 && y >= c2Y1 && y <= c2Y2) {
      if (x === cardX1 || x === cardX2 || y === c2Y1 || y === c2Y2)
        return [210, 220, 230];
      return [248, 250, 252];
    }
    return [245, 245, 245]; // bg
  }
  // Bottom FAB bar area
  return [255, 255, 255];
}

const outDir = path.join(__dirname, '..', 'src', 'client', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const screenshotDir = path.join(__dirname, '..', 'src', 'client', 'public', 'screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });

console.log('Generating icon-192.png...');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makePNG(192, 192, iconPixel));

console.log('Generating icon-512.png...');
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makePNG(512, 512, iconPixel));

console.log('Generating screenshot-mobile.png (390x844)...');
fs.writeFileSync(path.join(screenshotDir, 'screenshot-mobile.png'), makePNG(390, 844, screenshotPixel));

console.log('Generating screenshot-wide.png (1280x800)...');
fs.writeFileSync(path.join(screenshotDir, 'screenshot-wide.png'), makePNG(1280, 800, screenshotPixel));

console.log('Done.');
