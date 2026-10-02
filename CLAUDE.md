# HAG NORTH STAR

Hack-A-Gent is an autonomous engineering workflow that transforms raw ideas into production-ready software through:

1. **Validated Generation**: Every line of code written to disk passes through a syntax gate (TypeScript parser validation) ensuring invalid TS/TSX/JS/JSX never reaches disk.
2. **Contract Integrity**: Fallback templates and generated files strictly adhere to shared type contracts (db, auth, WorkItem, Context) with zero mismatches.
3. **Atomic Mutations**: All write, patch, and append operations are validated as complete units before mutation.
4. **Independent Verification**: Generated projects must pass `npm install`, `npm run typecheck`, `npm run build`, and runtime smoke checks without manual intervention.
5. **Transparent Orchestration**: The system logs every autonomous decision, repair attempt, and validation gate outcome for auditability.
6. **Failure-Bounded**: NVIDIA model fallbacks are bounded and logged; production fallback is coherent and verified.
7. **No Hidden Overwrites**: Later operations cannot silently corrupt previously validated files; all paths respect the syntax gate.
8. **Real-World Success**: The CLI exits with code 0 only after generating a project that independently verifies end-to-end.

This document is the single source of truth for production-grade operation.