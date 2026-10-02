import type { RGBA } from './kernel.js';
import { mulberry32 } from './random.js';

/**
 * Build a deterministic 96×96 sample image: a warm gradient backdrop with a
 * couple of colored shapes and a diagonal stripe. Used by the CLI and the API
 * endpoint so the inspector always has something real to report on.
 */
export function generateSampleImage(width = 96, height = 96, seed = 42): RGBA {
  const data = new Uint8ClampedArray(width * height * 4);
  const rnd = mulberry32(seed);

  const c1 = { r: 52 + Math.round(rnd() * 40), g: 96 + Math.round(rnd() * 40), b: 180 + Math.round(rnd() * 40) };
  const c2 = { r: 220 + Math.round(rnd() * 35), g: 130 + Math.round(rnd() * 40), b: 60 + Math.round(rnd() * 40) };

  const cx = width * (0.35 + rnd() * 0.3);
  const cy = height * (0.35 + rnd() * 0.3);
  const radius = width * 0.22;
  const cx2 = width * (0.65 + rnd() * 0.15);
  const cy2 = height * (0.6 + rnd() * 0.2);
  const radius2 = width * 0.14;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = x / width;
      let r = c1.r + (c2.r - c1.r) * t;
      let g = c1.g + (c2.g - c1.g) * t;
      let b = c1.b + (c2.b - c1.b) * t;

      const d1 = Math.hypot(x - cx, y - cy);
      const d2 = Math.hypot(x - cx2, y - cy2);
      const d3 = Math.abs(x - y) % (width * 0.3);

      if (d1 < radius) {
        const k = 0.6 + 0.4 * Math.cos((d1 / radius) * Math.PI * 2);
        r = 255 * k;
        g = 150 * k;
        b = 90 * k;
      } else if (d2 < radius2) {
        r = 120;
        g = 200;
        b = 255;
      } else if (d3 < 3) {
        r = mix(r, 255, 0.75);
        g = mix(g, 255, 0.75);
        b = mix(b, 200, 0.75);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
