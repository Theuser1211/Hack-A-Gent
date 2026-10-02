/**
 * Entry point for `npm run gen-docs`.
 * Regenerates the documentation set into generated-docs/ (or the
 * --out target). Deterministic and offline.
 */
import { generateDocs } from '../features/docs/generator.js';

const outArg = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : undefined;

const { outDir, files } = generateDocs({ outDir: outArg });
// eslint-disable-next-line no-console
console.log(`Generated ${files.length} documentation file(s) into ${outDir}`);
for (const f of files) {
  // eslint-disable-next-line no-console
  console.log(`  • ${f}`);
}
