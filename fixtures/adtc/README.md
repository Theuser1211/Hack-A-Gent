# Kilima — an on-device intent classifier

For a smart assistant to be useful, it has to work where connectivity is
unreliable. **Kilima** is an intent classifier that runs **entirely on-device**:
training, evaluation, quantization and inference all happen on the local machine
with zero network access. It is built for the deep-tech reality of building
something useful for people whose phones spend much of the day offline.

The intent model is tiny, deterministic and retrainable in under a second — a
concrete stance on the challenge: *useful AI must not assume a signal.*

## The problem / solution

- **Problem** — many assistants are thin clients for a remote model. In
  low-connectivity areas that fails exactly when the assistant would be most
  useful.
- **Solution** — a compact classifier that can be trained, quantized and served
  from a modest CPU, plus a clean CLI and a web chat that talk to the same
  on-device engine.

The bundled intent set is deliberately practical: **reminder, weather, timer,
alarm, message, emergency** — with African English phrasing in the sample data.

## What's implemented

| Capability | How it runs |
| --- | --- |
| Train | real SGD on the bundled labels, deterministic seed, ~90 epochs |
| Predict | CPU-only forward pass with measured latency and per-class probabilities |
| Evaluate | accuracy + a matrix over the bundled sample set (measured, local) |
| Quantize | FP32 → INT8 simulation: byte savings, MSE, max error, top-1 match |
| Serve | a polished offline web chat that talks to the same engine |

## Run

```sh
npm install
npm run build
npm start -- help
```

### CLI

```sh
npm start -- inspect "will it rain in Nakuru this weekend"
npm start -- eval
npm start -- train 120
npm start -- quantize
npm start -- serve 8800        # opens the web chat at http://localhost:8800
```

Append `--json` to any command for a machine-readable report.

## Honesty rules

- **Trained on the bundled sample set.** Reported accuracy is over that set
  only — it is a demonstration of the pipeline, not a claim about real-world
  data.
- **Measured where it says measured.** Latency is measured live on your machine;
  quantization bytes/error/metrics are computed from the trained weights.
- **On-device.** No cloud, no keys, no network calls at inference time.

## Architecture

```
src/
  tokenizer.ts   character vocabulary + normalized bag-of-characters features
  model.ts        tiny MLP (forward + SGD training with gradient clipping)
  data.ts         dataset loader
  engine.ts       IntentEngine: vocab → features → model → predict/eval/quantize
  cli.ts          subcommand dispatch + terminal output
  server.ts       HTTP server for the web chat
  index.ts        entry point
data/intents.json seeded labeled examples (synthetic, for demonstration)
public/          web demo (index.html, styles.css, app.js)
```

## Technical notes

- **Gradient clipping + weight decay** keep the tiny network stable even when
  over-trained on a small set — a real, reviewable detail, not a magic number.
- **Deterministic.** Seeding the RNG makes every run reproducible.
- **No runtime dependencies.** Only `typescript` and `@types/node`.

## Opinionated stance

This project is not a "bigger model". The point is the boundary: everything a
voice assistant needs to *understand* an utterance can run on a modest device,
which is precisely the deep-tech constraint that matters in low-connectivity
regions. Swap in a real ASR front-end and a small on-device NLU — the training
and quantization harness here is what you'd keep.