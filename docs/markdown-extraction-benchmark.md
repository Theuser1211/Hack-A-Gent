---
noteId: "c0b159908f2b11f1ad605d4fba815a33"
tags: []

---

# Markdown Extraction Strategy — Benchmark Report

**Date:** 2026-08-03
**Command:** `npm run hackagent benchmark extraction` (seed 42)
**Status:** Experimental — not the production default

## Objective

The universal parser (`features/universal-parser/`) extracts structured fields (sponsors, judging criteria, prizes, deadlines, themes) from hackathon pages by scanning HTML for section headings. `stripHtml` discards `<img>` tags, so sponsor names that only appear in logo images are lost.

This session built an alternative pipeline — **HTML → Clean Markdown → structured extraction** — behind a pluggable extractor registry and benchmarked it against the existing DOM strategy to decide whether it should replace the default.

## Architecture

```
features/extraction/
  types.ts              ExtractStrategy, ExtractionResult, BenchmarkResult, BenchmarkFixture
  metadata.ts           OpenGraph / Twitter / JSON-LD metadata capture
  html-cleaner.ts       boilerplate removal (nav/footer/scripts/...; iterative stable loop)
  html-to-markdown.ts   GFM table + img-alt + link conversion
  sections.ts           sectionsFromMarkdown() — structured metadata + intro content composition
  dom-extractor.ts      existing heading-scan path (unchanged behavior)
  markdown-extractor.ts clean-markdown strategy
  jsonld-extractor.ts   JSON-LD strategy
  registry.ts           runExtractor() — 'dom' is the fallback (production path unchanged)
  benchmark-fixtures.ts 4 fixtures with hand-verified ground truth
  benchmark.ts          scoring + verdict
```

Parser wiring (`features/universal-parser/`): `runExtractor()` replaces the direct `extractUniversalSections` call; `ParserContext` gained `aiInput`; the AI normalizer accepts an optional `sectionsTextOverride`. With no `extractor` option set, behavior is byte-identical to before.

## Methodology

- **Fixtures (4):** `global-hack-week`, `climate-ai-challenge`, `fintech-buildathon`, `luma-ai-hackathon` — each with hand-verified ground truth and internally consistent content.
- **Metrics:** completeness, sponsorRecall, judgingRecall, timelineRecall, prizeRecall, themesRecall, titleHit, organizerHit, hallucinationRate, noiseRatio, aiInputBytes, runtimeMs.
- **Seed:** 42 (deterministic).

## Results (seed 42)

| metric            | dom    | markdown | delta | winner    |
|-------------------|--------|----------|-------|-----------|
| completeness      | 0.821  | 1.000    | 0.179 | markdown  |
| sponsorRecall     | 0      | 1        | 1     | markdown  |
| judgingRecall     | 0.75   | 1        | 0.25  | markdown  |
| timelineRecall    | 1      | 1        | 0     | tie       |
| prizeRecall       | 1      | 1        | 0     | tie       |
| themesRecall      | 1      | 1        | 0     | tie       |
| titleHit          | 1      | 1        | 0     | tie       |
| organizerHit      | 1      | 1        | 0     | tie       |
| hallucinationRate | 0      | 0        | 0     | tie       |
| noiseRatio        | 0      | 0        | 0     | tie       |
| aiInputBytes      | 805    | 1046     | 241   | dom       |
| runtimeMs         | 1.8    | 2.0      | 0.2   | dom       |

**Overall quality: dom=0.821, markdown=1.000 → VERDICT: markdown_wins**

### Per-fixture completeness

| fixture            | dom    | markdown |
|--------------------|--------|----------|
| global-hack-week   | 0.857  | 1.000    |
| climate-ai-challenge | 0.857 | 1.000    |
| fintech-buildathon | 0.714  | 1.000    |
| luma-ai-hackathon  | 0.857  | 1.000    |

## Root Cause

`stripHtml` drops `<img>` tags entirely. Sponsor sections that render sponsors as logo images (the common case on Devpost-style pages) contribute zero text to the DOM strategy. The markdown strategy preserves image alt text (entity-decoded: `Weights &amp; Biases` → `Weights & Biases`), recovering every logo sponsor. Tables (judging criteria breakdowns) also survive the conversion as GFM tables, lifting judgingRecall from 0.75 → 1.

## Pros / Cons

**markdown wins on:** all recall/completeness metrics, zero hallucination, zero noise.
**dom only wins on:** aiInputBytes (805 vs 1046, i.e. ~30% smaller LLM input) and runtime (1.8 vs 2.0 ms). Both negligible for production use.

**markdown risks:** conversion could introduce artifacts on unusual HTML (mitigated by tests + iterative cleaner); slightly larger AI input; new code path adds maintenance surface. The `'dom'` fallback in the registry keeps the original path intact if markdown ever regresses.

## Recommendation

Adopt markdown extraction as the default extractor. It is strictly better on parse quality (completeness 0.821 → 1.000) and closes a real gap (sponsors from logo images) that the DOM path cannot fix without an `<img>` handling change. Keep `'dom'` registered as a fallback and gate the switch behind the `extractor` option so rollback is a one-line config change. Recommended follow-ups:

1. Flip the parser default to `'markdown'` behind a config flag, run the full 111-file suite + live-URL regression.
2. Improve DOM `stripHtml` to retain `img[alt]` text (closes the same gap for the DOM path).
3. Add 1–2 live-URL fixtures to the benchmark for real-world confidence.
4. Consider running the AI leg (`--ai`) once an API key is configured — currently skipped (no NVIDIA NIM key).

## Checks Performed

- `npx vitest run --testTimeout=45000` — 111 files / 1677 tests pass (includes 21 new extraction tests).
- `npx eslint tests/features/extraction-strategies.test.ts cli/commands/benchmark.ts` — 0 errors.
- `npx tsc -p tsconfig.json` — 133 error lines; HEAD baseline via `git stash` = 134. **Zero new type errors** (remaining errors are pre-existing debt in `tests/`, `intelligence-analyzer.ts`, `section-extractor.ts`, and a `router` type mismatch).
