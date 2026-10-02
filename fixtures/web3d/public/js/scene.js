// Builds the deterministic scene from the shared seed (matches src/scene-spec.ts).

import { fibonacciSphere, ringPoints, starShell, edgeMesh } from './engine.js';

const SEED = 202608;

export function buildScene() {
  const points = fibonacciSphere(380, 1.55, SEED);
  const edges = edgeMesh(points, 2, 0.95);
  const rings = [
    { points: ringPoints(2.35, 18, -24, 160, SEED + 1, 0.04), color: 'rgba(92, 242, 255, 0.75)' },
    { points: ringPoints(2.85, -30, 40, 180, SEED + 2, 0.06), color: 'rgba(143, 123, 255, 0.7)' },
  ];
  const stars = starShell(420, 20, SEED + 3);
  return { points, edges, rings, stars };
}
