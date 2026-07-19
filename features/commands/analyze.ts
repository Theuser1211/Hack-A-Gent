/**
 * Feature command wrapper: `hag analyze` / `hag inspect`.
 * Thin re-export — all logic lives in features/analyze/command.ts
 * so it stays out of the refactored cli/ files.
 *
 * Both `analyze` and `inspect` resolve to the same command
 * (the loader maps the `inspect` command name to this module and
 * invokes `analyzeCommand`, which treats them identically).
 */
export { analyzeCommand } from '../analyze/command.js';
