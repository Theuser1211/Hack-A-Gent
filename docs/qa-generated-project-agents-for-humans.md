# QA Adversarial Report — HAG-Generated Project `agents-for-humans-hackathon`

**Date:** 2026-09-26
**Artifact:** Output of the real `hag run https://agentsforhumans.devpost.com/` (not a fixture/simulator).
**QA hygiene:** All modifications were temporary diagnostic patches, restored byte-identical afterwards (md5-verified: `Stepper.tsx` = `27165a2f3c88a4fde4c565c891c80c6d`, `error.tsx` = `31d8a6629c8b19f8bc395546947f5836`, `tsconfig.json` restored from git index). Port 3000 freed; QA logs removed. No permanent fixes applied.

## Verdict

| Phase | Result |
|---|---|
| INSTALL | PASS (2 vulnerabilities: 1 critical, 1 high) |
| TYPECHECK | FAIL — 1 syntax error as shipped; 37 type errors behind it |
| BUILD | FAIL — `next build` exits 1 in both states |
| STARTUP | FAIL — `next start` exits immediately: no production build |
| RUNTIME (dev, unmodified) | FAIL — `GET /` → HTTP 500 |
| RUNTIME (dev, +2-line diagnostic patch) | PARTIAL — pages render; 3 API routes 500; auth broken; Tailwind dead |
| BROWSER SMOKE | PARTIAL — React renders; UI completely unstyled; dead controls |

**FINAL STATUS: GENERATED_PROJECT_NOT_VERIFIED**

## Gating defects (shipped tree)

1. `src/components/Stepper.tsx(62,7): error TS1005: '}' expected.` — the `steps.map(...)` JSX expression closes with `))` but never closes its `{`. Imported by the main page → compile kills the app.
2. `src/app/error.tsx` — missing `"use client"`; Next.js requires `error.tsx` to be a Client Component. Also calls `ErrorDisplay` with `retryLabel`, which the component does not accept.
3. With only those two patched: **37 type errors across 13 files** (see Inventory).

## Runtime findings (with minimal diagnostic patch)

- `GET /` 200, Quarry workflow renders; error boundary not triggered; no client crash; 404 page OK; static chunks OK.
- **Tailwind produces zero utilities**: `tailwind.config.*`/`postcss.config.*` absent though Tailwind is a devDependency; compiled CSS is 5 KB and still contains raw `@tailwind` directives → the whole UI renders unstyled.
- Stray generator residue in `page.tsx`: a "Hack-A-Gent Demo" hero + `#features` anchor + `.cta-btn` class with no CSS definition, above the actual Quarry UI.
- `/dashboard` renders but is orphaned (not linked from navbar).
- `/api/db`, `/api/setup-db`, `/api/init-db` → 500 (`db.prepare is not a function`; imports of non-existent `resetDatabase`/`aiContexts`/`workItems`/`userPrefs` exports).
- `/api/feedback` → 500 even with a fully valid payload: route calls `getWorkItem()` **without importing it** (ReferenceError).
- `/api/ai/run` → 400 for the exact `{ memory }` payload its own generated client `lib/api.ts` sends; real contract is `{ userId, inputs: { description, ... } }`. The other generated client (`lib/utils.ts`) never calls HTTP at all — it returns hardcoded Rick Astley/Queen mocks.
- **Auth is non-functional end-to-end**: `POST /api/auth/register` returns 201 but **echoes the plaintext password**; the freshly registered account cannot log in (401) because `findUserByEmail` in `lib/db.ts` is a broken stub, and login then checks 3 hardcoded "seeded" emails (`alice/bob/carol@example.com`) that exist in no store — `alice@example.com` with any password also 401s. `GET /api/auth/me` with the register-issued token → 401.
- `POST /api/analyze` returns feedback-triage domain data ("Bug/Feature/Performance/Ux", "Route to the appropriate team…") — a different application's endpoint, not Quarry's.
- `src/config.ts` (feature flags, `NEXT_PUBLIC_*`) is dead code; `.env.example` is a `[TEMPLATE]` placeholder.
- README names the app "Siftline" in "Why This Wins" while everything else says "Quarry"; Tech Stack claims SQLite (better-sqlite3) and Vitest, neither of which is installed.

## Root-cause trace to HAG

**Smoking gun (git forensics):** HAG's own git **index** contains a *syntactically correct* `Stepper.tsx` (closing `})}`) and a *different* `error.tsx` (`GlobalError` matching `ErrorDisplay`'s real contract). The shipped **worktree** contains the broken `Stepper.tsx` and the rewritten `error.tsx`. A later generation/repair pass **overwrote previously-good files with broken ones, and no final gate re-ran afterwards**.

1. **Gate ordering bug** — the syntax gate validated an earlier snapshot; final writes happened after validation. Responsible: syntax-gate/challenge-validation ordering vs. the code-gen/repair write path. *Fix:* run `tsc --noEmit` + `next build` on the final tree inside `hag run`; abort submission on non-zero exit. Regression test: full pipeline on a fixture must produce a project where both commands exit 0 and `next build` emits a fresh `BUILD_ID`.
2. **No whole-tree re-validation after per-file writes** — *Fix:* after any repair/improvement write, re-run the gate on the whole `src` tree. Regression test: inject a late write that breaks an unrelated file; pipeline must fail.
3. **Cross-pass contract incoherence** — 37 type errors showing files generated against different contract versions (`ApiResponse{status}` vs `{data,error}`, `Button.loading` vs `isLoading`, `User.password`, SQLite `db.prepare`, duplicate `WorkItem` in `types.ts` vs `utils.ts`). Responsible: code-gen stages not pinned to one shared schema; integration/contract stage never reconciled. *Fix:* generate `types.ts` first and require all files import from it (tsc then enforces coherence — but only if the gate runs last).
4. **Integration liveness never verified** — 17 API routes exist; the UI calls none of them; the one generated HTTP client sends payloads its routes reject. *Fix:* pipeline step: for every generated `fetch('/api/…')`, assert a matching route exists and the route accepts the client's exact payload (zod round-trip test per route).
5. **No build/start verification** — `.next` shipped stale with **no `BUILD_ID`**; `next start` cannot run. *Fix:* build + `next start` + `GET /` expecting 200 and expected copy; add `.next` to the project `.gitignore` template.
6. **Template bleed-through** — "Hack-A-Gent Demo" hero, wrong-domain `/api/analyze`, "Siftline" naming, `[TEMPLATE]` env file. *Fix:* post-generation lint asserting no generator-identity strings, domain match per route against the project spec, and defined class names present in compiled CSS when Tailwind is a dependency.
7. **Security gate missing** — plaintext password echoed in a 201 response. *Fix:* lint rule / test asserting no password field appears in any response body.

## Exact reproduction

```bash
cd agents-for-humans-hackathon
npm install                 # PASS, 2 vulns (1 critical)
npm run typecheck           # exit 2 — Stepper.tsx(62,7): TS1005
npm run build               # exit 1 — Stepper syntax + error.tsx not client
npm run start               # exit 1 — "Could not find a production build … no BUILD_ID"
npm run dev & curl -i localhost:3000/          # HTTP 500 (unmodified)
# after ONLY the 2-line syntax/"use client" patch:
curl -s -X POST localhost:3000/api/feedback -H 'Content-Type: application/json' \
  -d '{"workItemId":"1","adjustment":{"description":"more 80s songs"}}'   # 500
curl -s -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"QA","email":"qa@test.dev","password":"Passw0rd!"}'         # 201, echoes password
```
