const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

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
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paint(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy) / (size / 2);
  if (dist > 0.98) return [0, 0, 0, 0];
  const bg = 10 + Math.floor((1 - dist) * 18);
  let r = bg, g = bg, b = bg + 2, a = 255;
  const ring = Math.abs(dist - 0.72);
  if (ring < 0.06) {
    r = 232; g = 163; b = 23;
  }
  const ring2 = Math.abs(dist - 0.58);
  if (ring2 < 0.03) {
    r = 166; g = 124; b = 26;
  }
  const barW = size * 0.06;
  const barH = size * 0.34;
  if (Math.abs(dx) < barW && Math.abs(dy) < barH) {
    r = 232; g = 163; b = 23;
  }
  const bar2W = size * 0.22;
  const bar2H = size * 0.06;
  if (Math.abs(dx) < bar2W && dy > size * 0.08 && dy < size * 0.08 + bar2H) {
    r = 232; g = 163; b = 23;
  }
  return [r, g, b, a];
}

const out = path.join(__dirname, "..", "public");
fs.writeFileSync(path.join(out, "icon-192.png"), png(192, paint));
fs.writeFileSync(path.join(out, "icon-512.png"), png(512, paint));
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), png(180, paint));
console.log("icons written");
