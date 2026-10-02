// The scene is deterministic: the same seed produces the same world every run.
// The browser renders the world from the same seed constant (public/js/scene.js)
// so the server and the client always agree.

export function sceneSpec(): {
  seed: number;
  description: string;
  sphere: { points: number; radius: number };
  rings: number;
  stars: number;
  edges: number;
} {
  return {
    seed: 202608,
    description: 'Seeded particle sphere with orbital rings and a parallax star shell — rendered locally, no runtime libraries.',
    sphere: { points: 380, radius: 1.55 },
    rings: 2,
    stars: 420,
    edges: 380,
  };
}
