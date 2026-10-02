# EchoIntel — Conversation Intelligence for Voice Interactions

**EchoIntel** is a conversation intelligence studio built for the **Call-E**
challenge. It turns a raw voice call into a structured, analyzable artifact: an
animated waveform, a live streaming transcript with speaker attribution, and a
local analysis pipeline that extracts sentiment, topics, talk-time metrics and
action items.

It is not a generic AI chat page. It is a real voice-product workbench with a
clearly marked **Call-E integration boundary**: everything in this build runs on
prepared local dialogue through a deterministic engine, and one typed provider
interface (`CalleyApiProvider`) is where the real Call-E speech/communication
API connects for live calls.

## What the product demonstrates

1. **A live call experience** — pick a sample call, press *Start call*, and watch
   a waveform render from a deterministic audio envelope while the transcript
   streams in word-by-word with per-speaker styling and a live turn indicator.
2. **A real analysis pipeline** — after the call, the local engine computes
   sentiment (lexicon-based with confidence), topic weights, action items, and
   conversation metrics (talk-time split, interjections, response delays). All
   of it is real code running on the machine — no numbers are fabricated.
3. **A communication-intelligence story** — the product surfaces exactly what a
   voice-API product needs: who talked, when, about what, and what was agreed.
4. **Offline-first** — microphone permissions or API credentials are not
   required. The complete experience works from prepared sample audio/transcript
   data, so the demo never depends on a network call.

## Run

```sh
npm install
npm run build
npm start        # CLI: analyze the prepared calls in the terminal
npm start -- --serve   # web studio at http://127.0.0.1:8803
```

Options:

| Flag | Effect |
| --- | --- |
| `--serve` | start the web studio dashboard |
| `--port <n>` | override the web port (default 8803) |

## Call-E integration boundary

The pipeline is intentionally structured around a single seam:

```
Audio → Waveform → Transcript → Analysis
                ↓
     CalleyApiProvider  (the boundary)
```

- `src/pipeline/` holds the deterministic local engine (dialogue, waveform,
  analysis) with zero runtime dependencies.
- `CalleyApiProvider` is the typed interface where the real Call-E endpoint
  would be implemented — live audio in, structured transcript + analysis out —
  without changing the UI or the analysis consumers.

## Architecture

```
src/
  pipeline/
    types.ts     shared types (turns, waveform, analysis)
    random.ts    seeded PRNG + hashing for deterministic output
    dialogue.ts  prepared sample calls (turns, words, timing)
    waveform.ts  deterministic audio-level envelope generator
    analysis.ts  sentiment / topics / action items / metrics
  cli.ts         terminal analysis report
  server.ts      static + JSON API (/api/calls, /api/call/:id, /api/analyze)
  index.ts       entry — CLI by default, --serve for the studio
public/
  index.html     studio shell
  styles.css     dark voice-product theme
  js/app.js      call selection, live playback, tabs
  js/waveform.js canvas waveform renderer
  js/api.js      fetch helper
```

## Design decisions

- **Zero runtime dependencies** — only `typescript` and `@types/node` as dev
  dependencies. Everything (server, waveform, analysis) is hand-rolled.
- **Deterministic** — the same call always produces the same waveform and
  timing, which makes the demo reproducible run after run.
- **Honest by default** — the UI labels the offline pipeline ("Local pipeline ·
  offline") and the API boundary explicitly; it never claims a live external API
  was called.
- **Speed controls** — the demo runs at 4× by default so a full call plays out in
  seconds; switch to 1× for a realistic pace.
