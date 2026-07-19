# Developer Guide

## Add a CLI command

1. Create `cli/commands/<name>.ts` exporting `<name>Command(ctx, args): Promise<CLIResult>`.
2. Register `<name>` in `VALID_COMMANDS` (cli/index.ts) and the `CommandName` union (cli/types.ts).
3. Add a `case` to the `main()` switch, or register it as a feature command under `features/commands/`.

## Add a feature command (zero-risk to the production CLI)

Place `features/commands/<name>.ts` exporting `<name>Command(ctx, args)`.
Map it in the dynamic feature loader inside `cli/index.ts` (the `default` switch case).
This keeps new capabilities out of the refactored `cli/` files.

## Add a benchmark category

1. Add a `CategorySpec` to `features/benchmarks/category-suite.ts`.
2. Declare `acceptance` patterns and per-dimension `weights`.
3. Evaluate with `hag categories run <id> --generate` and compare runs.

## Improve a prompt

Edit or add a template in `kernel/prompts/templates.ts`, then reference it from
`getTemplate(id)` / `PromptEngine.registerTemplate(...)`. Templates are
provider-agnostic and deterministically rendered.

## Tests

`npm test` (vitest). New modules under `features/` should ship a `tests/features/*.test.ts`.
