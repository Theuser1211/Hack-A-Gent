import { runCli } from './cli.js';
import { startServer } from './server.js';

function run(): void {
  const argv = process.argv.slice(2);
  const serve = argv.includes('--serve');
  const portIdx = argv.indexOf('--port');
  const port = portIdx >= 0 ? Number(argv[portIdx + 1]) || 8805 : 8805;

  if (serve) {
    startServer(port);
    return;
  }
  runCli();
}

run();
