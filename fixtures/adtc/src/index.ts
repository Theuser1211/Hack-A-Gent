import { runCli } from './cli.js';
import { loadDataset } from './data.js';
import { IntentEngine } from './engine.js';
import { startServer } from './server.js';

function run(): void {
  const argv = process.argv.slice(2);

  // Default (no command) → launch the local web dashboard.
  if (argv.length === 0 || argv[0] === '--serve') {
    const portIdx = argv[0] === '--serve' ? 1 : 0;
    const port = argv[portIdx] ? Number(argv[portIdx]) : 8800;
    const dataset = loadDataset();
    const engine = new IntentEngine(dataset);
    startServer(engine, port);
    return;
  }

  runCli(argv);
}

run();