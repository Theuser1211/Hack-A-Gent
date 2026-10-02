# FrameForge — Image Studio with a YouCam API Boundary

**FrameForge** is an image-processing studio built for the **YouCam API**
challenge. Upload or drop an image, apply a chain of effects, compare before and
after, and inspect every API request and response in a live inspector panel.

It is not a CRUD page. The product is built around a **single typed boundary**
(`YouCamApiProvider`): one interface that captures exactly what a real YouCam
API call would look like. In this build the boundary is backed by a
deterministic local image kernel so the entire demo runs offline — swapping in
the real endpoint is a one-file change.

## What the product demonstrates

1. **A real editing workflow** — drag-and-drop upload (or a bundled sample
   image), instant canvas preview, per-effect intensity control, and a
   before/after split comparison.
2. **A real image kernel** — eight effects (grayscale, sepia, saturation,
   contrast, brightness, vignette, blur, pixelate) implemented as pure
   transforms over raw RGBA pixels. The exact same kernel powers the CLI, the
   web preview, and the mock API, so the inspector never disagrees with what you
   see.
3. **An API inspector** — every "Apply & inspect" action captures the request
   payload and the response (job id, status, pixels processed, measured mean-RGB
   shift) and renders them in a request/response/pipeline inspector.
4. **Honest, computed numbers** — the statistics in the inspector (mean RGB,
   luminance spread, delta) are measured from real processing of a real image on
   this machine. Nothing is fabricated or scaled.

## Run

```sh
npm install
npm run build
npm start        # CLI: process the sample image, write before/after bitmaps
npm start -- --serve   # web studio at http://127.0.0.1:8804
```

The CLI writes real `output/*.bmp` files (a generated sample image processed by
each effect) that any image viewer can open.

## YouCam API boundary

```
Upload → Preview → [ YouCamApiProvider ] → Inspector
                        ↑
        local deterministic kernel (default)
        real YouCam endpoint (swap in one file)
```

- `src/core/kernel.ts` — pure RGBA transforms (shared with the web client).
- `src/core/pipeline.ts` — the processing job: validates params, runs the
  kernel, computes before/after statistics, builds the response. This is the
  seam where the real YouCam API would be called.
- `public/js/kernel.js` — the same kernel compiled for the browser, so the
  preview is instant and offline.

## Architecture

```
src/
  core/
    kernel.ts        pure effect transforms + statistics
    sample-image.ts  deterministic generated sample image
    pipeline.ts      processing job (the API boundary)
    bmp.ts           minimal 24-bit BMP writer for CLI output
  cli.ts             process sample → write bitmaps → print inspector preview
  server.ts          static + JSON API (/api/effects, /api/process)
  index.ts           entry — CLI by default, --serve for the studio
public/
  index.html         studio shell
  styles.css         media-product dark theme
  js/app.js          upload/drop, effect chips, slider, inspector tabs
  js/kernel.js       browser copy of the kernel
  js/api.js          fetch helper
```

## Design decisions

- **Zero runtime dependencies** — the image kernel, BMP writer and HTTP server
  are all hand-rolled; only `typescript` and `@types/node` are installed.
- **Deterministic** — the sample image and every transform are seeded, so the
  demo is identical on every run.
- **Shared kernel** — one implementation across CLI, web and API means the
  "mock API" response is always consistent with the visible preview.
- **Honest by default** — the UI labels the pipeline "Local kernel · offline"
  and the boundary note explains that this build processes locally.
