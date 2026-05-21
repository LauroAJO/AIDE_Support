// Generates valid placeholder PNG icons: solid #6366f1 square with a simple
// white "A" glyph rendered from a small bitmap font. No external deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const ACCENT = [0x63, 0x66, 0xf1, 0xff]; // #6366f1
const WHITE = [0xff, 0xff, 0xff, 0xff];

// 5x7 bitmap for the letter "A".
const GLYPH = [
  '01110',
  '10001',
  '10001',
  '11111',
  '10001',
  '10001',
  '10001',
];

function makeIcon(size) {
  const px = (x, y) => {
    // Map pixel to glyph cell. Glyph occupies the centered ~60% box.
    const boxW = size * 0.5;
    const boxH = size * 0.7;
    const ox = (size - boxW) / 2;
    const oy = (size - boxH) / 2;
    if (x < ox || x >= ox + boxW || y < oy || y >= oy + boxH) return ACCENT;
    const gx = Math.floor(((x - ox) / boxW) * 5);
    const gy = Math.floor(((y - oy) / boxH) * 7);
    return GLYPH[gy][gx] === '1' ? WHITE : ACCENT;
  };

  // Raw image data: each scanline prefixed with filter byte 0.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = px(x, y);
      raw[p++] = c[0];
      raw[p++] = c[1];
      raw[p++] = c[2];
      raw[p++] = c[3];
    }
  }

  return buildPNG(size, size, deflateSync(raw));
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function buildPNG(w, h, idatData) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', makeIcon(192));
writeFileSync('public/icon-512.png', makeIcon(512));
console.log('Wrote public/icon-192.png and public/icon-512.png');
