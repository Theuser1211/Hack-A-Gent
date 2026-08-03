// Backward-compatible entry point: the single-idea API now runs the full
// startup-quality brainstorm (20 ideas → self-rank → top 5 → winner) and
// returns the winner's one-liner. The canonical implementation lives in
// cli/ideation/idea-engine.ts.
export { generateProjectIdea } from '../ideation/idea-engine.js';
