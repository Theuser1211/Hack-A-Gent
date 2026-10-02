# Orbital — A 3D Web Experience Built Without a 3D Library

**Orbital** is an immersive, interactive 3D website built for the **3D Websites
Hackathon**. The hero is a live, dependency-free **canvas 3D engine** — a
rotating particle sphere with a geodesic edge mesh, two tilted orbital rings, a
parallax starfield and a glowing core — rendered every frame by hand-written
math. No WebGL, no Three.js, no runtime libraries.

## What the product demonstrates

1. **A real 3D engine** — seeded scene generation (fibonacci sphere, rings,
   star shell), an orbiting camera with easing and inertia, perspective
   projection, and depth-aware shading. Every pixel is computed by the code in
   `public/js/engine.js`.
2. **Interaction that feels like a product** — drag to orbit with inertia, scroll
   to zoom, touch support, and an idle auto-orbit that resumes after you stop.
3. **A credible landing experience** — modern editorial typography over the 3D
   world, scroll-reveal sections, and tilt-on-hover showcase cards, all
   responsive down to mobile.
4. **Determinism** — the whole world is built from one seed (`202608`), so the
   exact same scene renders on every visit. The server exposes it via
   `/api/scene`; the browser builds the same world from the same constant.

## Run

```sh
npm install
npm run build
npm start        # serves the 3D experience at http://127.0.0.1:8806
```

Open the printed URL. Drag to orbit the sphere, scroll to zoom, then scroll the
page to reveal the feature sections.

## How the engine works

```
public/js/
  engine.js   seeded generators (sphere/rings/stars), camera, projection,
              renderer (vignette → stars → back rings → core → mesh → particles → front rings)
  scene.js    builds the deterministic scene from the shared seed
  app.js      interaction (drag/zoom/touch), scroll reveals, tilt cards, RAF loop
```

The render order is a hand-rolled painter's algorithm:

1. Radial vignette over the canvas.
2. Star shell with per-star twinkle and camera parallax.
3. Orbital-ring segments are split into *back* and *front* halves (in camera
   space) so the sphere correctly occludes the far side of the rings.
4. The glowing core, then the geodesic edge mesh (front hemisphere only), then
   the particles — shaded cyan→violet by depth with size falloff.
5. The front half of the rings draws last.

## Technical decisions

- **Zero runtime dependencies** — `typescript` and `@types/node` only; the HTTP
  server and the renderer are both hand-rolled.
- **Canvas 2D, not WebGL** — the projection math is straightforward and runs at
  a smooth frame rate on any laptop, which is exactly what a judging demo needs.
- **Deterministic scene** — a fixed seed means no layout jumps between runs and
  every frame is reproducible.
- **Server-backed scene spec** — `GET /api/scene` documents the world (seed,
  counts, radius) so the scene is inspectable as data, not just pixels.
