import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RGBA } from './kernel.js';

/**
 * Minimal top-down 24-bit BMP writer (zero dependencies). Produces a real image
 * file that any OS image viewer can open, so the CLI's output is inspectable.
 */
export function writeBmp(filePath: string, img: RGBA): void {
  const { width, height, data } = img;
  const rowBytes = width * 3;
  const paddedRow = Math.ceil(rowBytes / 4) * 4;
  const pixelArraySize = paddedRow * height;
  const fileSize = 14 + 40 + pixelArraySize;

  const buf = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6); // reserved
  buf.writeUInt32LE(54, 10); // pixel array offset

  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // negative height → top-down rows
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bpp
  buf.writeUInt32LE(0, 30); // no compression
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38); // X pixels per meter (72dpi)
  buf.writeInt32LE(2835, 42); // Y pixels per meter
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Pixel array — BGR, top-down, padded rows
  for (let y = 0; y < height; y++) {
    const rowStart = 54 + y * paddedRow;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = rowStart + x * 3;
      buf[o] = data[i + 2]!; // B
      buf[o + 1] = data[i + 1]!; // G
      buf[o + 2] = data[i]!; // R
    }
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buf);
}
