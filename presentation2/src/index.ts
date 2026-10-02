import { startServer } from './server.js';

function run(): void {
  const argv = process.argv.slice(2);
  const portIdx = argv.indexOf('--port');
  const port = portIdx >= 0 ? Number(argv[portIdx + 1]) || 8806 : 8806;
  startServer(port);
}

run();
