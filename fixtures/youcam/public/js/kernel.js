// Client-side mirror of the shared processing kernel (src/core/kernel.ts).
// Pure functions over RGBA buffers, used to render the preview instantly while
// the inspector captures the same parameters for the API boundary.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a, b, t) => a + (b - a) * t;

export const EFFECTS = [
  { id: 'grayscale', name: 'Grayscale', category: 'Color', defaultIntensity: 1, minIntensity: 0, maxIntensity: 1, step: 0.05 },
  { id: 'sepia', name: 'Sepia', category: 'Color', defaultIntensity: 0.8, minIntensity: 0, maxIntensity: 1, step: 0.05 },
  { id: 'saturate', name: 'Saturation', category: 'Color', defaultIntensity: 1.4, minIntensity: 0, maxIntensity: 2.5, step: 0.1 },
  { id: 'contrast', name: 'Contrast', category: 'Adjust', defaultIntensity: 1.2, minIntensity: 0.5, maxIntensity: 2, step: 0.05 },
  { id: 'brightness', name: 'Brightness', category: 'Adjust', defaultIntensity: 0.1, minIntensity: -0.5, maxIntensity: 0.5, step: 0.05 },
  { id: 'vignette', name: 'Vignette', category: 'Style', defaultIntensity: 0.45, minIntensity: 0, maxIntensity: 1, step: 0.05 },
  { id: 'blur', name: 'Blur', category: 'Retouch', defaultIntensity: 1, minIntensity: 0, maxIntensity: 6, step: 1 },
  { id: 'pixelate', name: 'Pixelate', category: 'Retouch', defaultIntensity: 6, minIntensity: 2, maxIntensity: 24, step: 2 },
];

export function getEffect(id) {
  return EFFECTS.find((e) => e.id === id);
}

export function applyEffect(src, effectId, intensity) {
  const def = getEffect(effectId);
  if (!def) throw new Error(`unknown effect: ${effectId}`);
  const t = clamp(intensity, def.minIntensity, def.maxIntensity);
  const { width, height } = src;
  const out = new Uint8ClampedArray(src.data);

  switch (effectId) {
    case 'grayscale':
      for (let i = 0; i < out.length; i += 4) {
        const lum = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
        out[i] = mix(out[i], lum, t);
        out[i + 1] = mix(out[i + 1], lum, t);
        out[i + 2] = mix(out[i + 2], lum, t);
      }
      break;
    case 'sepia':
      for (let i = 0; i < out.length; i += 4) {
        const r = out[i]; const g = out[i + 1]; const b = out[i + 2];
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        out[i] = mix(r, sr, t); out[i + 1] = mix(g, sg, t); out[i + 2] = mix(b, sb, t);
      }
      break;
    case 'saturate':
      for (let i = 0; i < out.length; i += 4) {
        const r = out[i]; const g = out[i + 1]; const b = out[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        out[i] = mix(lum, r, t); out[i + 1] = mix(lum, g, t); out[i + 2] = mix(lum, b, t);
      }
      break;
    case 'contrast':
      for (let i = 0; i < out.length; i += 4) {
        out[i] = clamp((out[i] - 128) * t + 128, 0, 255);
        out[i + 1] = clamp((out[i + 1] - 128) * t + 128, 0, 255);
        out[i + 2] = clamp((out[i + 2] - 128) * t + 128, 0, 255);
      }
      break;
    case 'brightness': {
      const d = t * 255;
      for (let i = 0; i < out.length; i += 4) {
        out[i] = clamp(out[i] + d, 0, 255);
        out[i + 1] = clamp(out[i + 1] + d, 0, 255);
        out[i + 2] = clamp(out[i + 2] + d, 0, 255);
      }
      break;
    }
    case 'vignette': {
      const cx = width / 2; const cy = height / 2; const maxD = Math.hypot(cx, cy);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const d = Math.hypot(x - cx, y - cy) / maxD;
          const dim = clamp(1 - t * Math.pow(d, 2.2), 0.45, 1);
          const i = (y * width + x) * 4;
          out[i] = out[i] * dim; out[i + 1] = out[i + 1] * dim; out[i + 2] = out[i + 2] * dim;
        }
      }
      break;
    }
    case 'blur': {
      const radius = Math.max(1, Math.round(t));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let r = 0, g = 0, b = 0, n = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const px = clamp(x + dx, 0, width - 1);
              const py = clamp(y + dy, 0, height - 1);
              const i = (py * width + px) * 4;
              r += out[i]; g += out[i + 1]; b += out[i + 2]; n++;
            }
          }
          const o = (y * width + x) * 4;
          out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
        }
      }
      break;
    }
    case 'pixelate': {
      const block = Math.max(1, Math.round(t));
      for (let y = 0; y < height; y += block) {
        for (let x = 0; x < width; x += block) {
          let r = 0, g = 0, b = 0, n = 0;
          const xEnd = Math.min(x + block, width);
          const yEnd = Math.min(y + block, height);
          for (let py = y; py < yEnd; py++) {
            for (let px = x; px < xEnd; px++) {
              const i = (py * width + px) * 4;
              r += out[i]; g += out[i + 1]; b += out[i + 2]; n++;
            }
          }
          const avgR = r / n, avgG = g / n, avgB = b / n;
          for (let py = y; py < yEnd; py++) {
            for (let px = x; px < xEnd; px++) {
              const i = (py * width + px) * 4;
              out[i] = avgR; out[i + 1] = avgG; out[i + 2] = avgB;
            }
          }
        }
      }
      break;
    }
  }
  return { data: out, width, height };
}
