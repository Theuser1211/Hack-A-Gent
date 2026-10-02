import { allKernels } from './core/kernels.js';
import { measurePair } from './core/bench.js';
import { detectHardware } from './core/hardware.js';
import { quantizeSection } from './core/quantize.js';
import { printReport, toJson, type ReportInput } from './core/report.js';
import { startServer } from './server.js';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

interface CliArgs {
  matrixSize: number;
  windowMs: number;
  json: boolean;
  quantize: boolean;
  serve: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { matrixSize: 256, windowMs: 400, json: false, quantize: true, serve: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--no-quant') args.quantize = false;
    else if (a === '--quick') args.windowMs = 200;
    else if (a === '--serve') args.serve = true;
    else if (a === '--size') args.matrixSize = Math.max(32, Math.min(1024, Number(argv[++i]) || 256));
  }
  return args;
}

function runCli(args: CliArgs): void {
  const hw = detectHardware();
  const kernels = allKernels(args.matrixSize);

  const runs = kernels.map((k) =>
    measurePair(k.name, k.baselineLabel, k.optimizedLabel, k.baseline, k.optimized, k.verify(), args.windowMs),
  );

  const report: ReportInput = {
    hw,
    runs,
    matrixSize: args.matrixSize,
    quant: args.quantize ? quantizeSection() : null,
    windowMs: args.windowMs,
  };

  if (args.json) {
    console.log(toJson(report));
  } else {
    printReport(report);
  }
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.serve) {
    const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
    startServer(publicDir);
  } else {
    runCli(args);
  }
}

run();