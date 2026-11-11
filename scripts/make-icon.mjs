import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const side = 128;
const scale = 4;
const width = side * scale;
const pixels = new Uint8Array(width * width * 4);

function roundedRect(x, y, w, h, radius, color) {
  for (let py = Math.floor(y * scale); py < Math.ceil((y + h) * scale); py += 1) {
    for (let px = Math.floor(x * scale); px < Math.ceil((x + w) * scale); px += 1) {
      const cx = (px + 0.5) / scale;
      const cy = (py + 0.5) / scale;
      const nearestX = Math.max(x + radius, Math.min(cx, x + w - radius));
      const nearestY = Math.max(y + radius, Math.min(cy, y + h - radius));
      if ((cx - nearestX) ** 2 + (cy - nearestY) ** 2 > radius ** 2) continue;
      const at = (py * width + px) * 4;
      pixels.set([...color, 255], at);
    }
  }
}

roundedRect(4, 4, 120, 120, 28, [20, 99, 171]);
roundedRect(30, 35, 75, 24, 7, [122, 190, 236]);
roundedRect(23, 52, 82, 27, 7, [199, 227, 247]);
roundedRect(18, 69, 87, 29, 8, [255, 255, 255]);
roundedRect(29, 79, 13, 9, 4.5, [255, 176, 69]);
roundedRect(48, 81, 43, 5, 2.5, [20, 99, 171]);

const scanlines = Buffer.alloc(side * (1 + side * 4));
for (let y = 0; y < side; y += 1) {
  for (let x = 0; x < side; x += 1) {
    const totals = [0, 0, 0, 0];
    for (let sy = 0; sy < scale; sy += 1) {
      for (let sx = 0; sx < scale; sx += 1) {
        const at = ((y * scale + sy) * width + x * scale + sx) * 4;
        for (let c = 0; c < 4; c += 1) totals[c] += pixels[at + c];
      }
    }
    const out = y * (side * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 4; c += 1) scanlines[out + c] = Math.round(totals[c] / (scale * scale));
  }
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let n = 0; n < 8; n += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(side, 0);
ihdr.writeUInt32BE(side, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(scanlines)),
  chunk('IEND', Buffer.alloc(0)),
]);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'assets', 'icon-128.png');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, png);
console.log(output);
