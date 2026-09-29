#!/usr/bin/env node
/**
 * Gera os ícones do Zittodb sem dependências externas.
 * Desenho: fundo grafite arredondado + "Z" em verde Zitto com barra de cursor
 * (homenagem ao prompt ">_" do terminal — o Zittodb é a GUI do ADB).
 *
 * Uso: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src-tauri', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------- minimal PNG encoder (RGBA, 8-bit) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
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
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- drawing ----------
const BG = [16, 21, 28, 255]; // #10151c
const FG = [61, 220, 132, 255]; // #3ddc84 (android green)

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function inRoundedSquare(x, y, size, corner) {
  const dx = Math.min(x, size - 1 - x);
  const dy = Math.min(y, size - 1 - y);
  if (dx >= corner || dy >= corner) return true;
  // inside the corner quadrant: compare with the corner arc
  const cx = x < size / 2 ? corner : size - 1 - corner;
  const cy = y < size / 2 ? corner : size - 1 - corner;
  return Math.hypot(x - cx, y - cy) <= corner;
}

function draw(size) {
  const s = size / 512;
  const buf = Buffer.alloc(size * size * 4);
  const corner = 100 * s;

  // "Z" + cursor, designed on a 512 grid.
  // The "Z" is the brand ("Zittodb"); the cursor bar below is the nod to the
  // terminal prompt (ADB is a command-line tool — the app is its GUI).
  const Z = [
    [136, 150], // top-left
    [376, 150], // top-right
    [136, 362], // bottom-left
    [376, 362], // bottom-right
  ];
  const halfStroke = 34 * s;
  // cursor bar (the "_" of the classic ">_" prompt)
  const U = { x0: 136 * s, x1: 376 * s, y0: 424 * s, y1: 466 * s };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = [0, 0, 0, 0];
      if (inRoundedSquare(x, y, size, corner)) px = BG;

      if (px[3] === 255) {
        const cxp = x + 0.5;
        const cyp = y + 0.5;
        const d = Math.min(
          distToSegment(cxp, cyp, Z[0][0] * s, Z[0][1] * s, Z[1][0] * s, Z[1][1] * s), // top bar
          distToSegment(cxp, cyp, Z[1][0] * s, Z[1][1] * s, Z[2][0] * s, Z[2][1] * s), // diagonal
          distToSegment(cxp, cyp, Z[2][0] * s, Z[2][1] * s, Z[3][0] * s, Z[3][1] * s), // bottom bar
        );
        if (d <= halfStroke) px = FG;

        if (x >= U.x0 && x < U.x1 && y >= U.y0 && y < U.y1) px = FG;
      }

      const o = (y * size + x) * 4;
      buf[o] = px[0];
      buf[o + 1] = px[1];
      buf[o + 2] = px[2];
      buf[o + 3] = px[3];
    }
  }
  return buf;
}

const targets = [
  ['icon.png', 512],
  ['128x128.png', 128],
  ['32x32.png', 32],
  ['icon@2x.png', 256],
];

for (const [name, size] of targets) {
  const file = join(outDir, name);
  writeFileSync(file, encodePng(size, draw(size)));
  console.log(`generated ${file} (${size}x${size})`);
}
