#!/usr/bin/env node
// gen-ios-icon.mjs — renders the app icon (1024x1024 PNG) for the iOS asset
// catalog without any image tooling: hand-rolled PNG encoder (zlib deflate +
// CRC32, same technique as the zip writer in pack-android.mjs) plus a tiny
// scanline polygon rasterizer. Output:
//   ios/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png + Contents.json
//   ios/App/Assets.xcassets/Contents.json

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'ios', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

// ------------------------------------------------------------------ PNG out

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length, 0); // length is big-endian — fix below
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgb, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  // 10..12: compression/filter/interlace = 0
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- rasterizer

const S = 1024;
const px = Buffer.alloc(S * S * 3);

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function fillAll(h) {
  const [r, g, b] = hex(h);
  for (let i = 0; i < S * S; i++) {
    px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b;
  }
}

/** Scanline fill of a polygon (array of [x,y] in 0..S space). */
function fillPoly(points, h) {
  const [r, g, b] = hex(h);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(S - 1, Math.ceil(maxY)); y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k]));
      const to = Math.min(S - 1, Math.round(xs[k + 1]));
      for (let x = from; x <= to; x++) {
        const i = (y * S + x) * 3;
        px[i] = r; px[i + 1] = g; px[i + 2] = b;
      }
    }
  }
}

function fillRect(x0, y0, x1, y1, h) {
  const [r, g, b] = hex(h);
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const i = (y * S + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
}

// Android adaptive icon geometry (108 viewport) scaled to 1024 — shield + gate.
const K = S / 108;
const shield = [
  [54, 24], [76, 32], [76, 56], [73, 68], [65, 78], [54, 85],
  [43, 78], [35, 68], [32, 56], [32, 32],
];

fillAll('#0E1A1E');
fillPoly(shield.map(([x, y]) => [x * K, y * K]), '#35D0BA');
// gate door + battlements (dark cut-outs)
fillRect(50 * K, 50 * K, 58 * K, 72 * K, '#0E1A1E');
fillRect(46 * K, 42 * K, 50 * K, 48 * K, '#0E1A1E');
fillRect(58 * K, 42 * K, 62 * K, 48 * K, '#0E1A1E');

// ------------------------------------------------------------------ emit

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon-1024.png'), encodePNG(px, S, S));
writeFileSync(join(OUT, 'Contents.json'), JSON.stringify({
  images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 },
}, null, 2));
const assetsRoot = join(OUT, '..');
writeFileSync(join(assetsRoot, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2));
console.log('[ios-icon] icon-1024.png written');
