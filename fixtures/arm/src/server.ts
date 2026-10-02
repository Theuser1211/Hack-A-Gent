import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFile } from 'node:fs';
import * as path from 'node:path';
import { detectHardware, describeHardware, type HardwareInfo } from './core/hardware.js';
import { allKernels, type KernelPair } from './core/kernels.js';
import { benchKernel, measurePair, type MeasuredRun } from './core/bench.js';
import { quantizeSection, type QuantSection } from './core/quantize.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

interface BenchRequest {
  kernels: string[];
  matrixSize?: number;
  windowMs?: number;
}

export function startServer(publicDir: string): void {
  const HOST = process.env.HOST ?? '127.0.0.1';
  const PORT = Number(process.env.PORT ?? 0) || 8801;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);
    const pathname = url.pathname;

    void (async () => {
      try {
        // API endpoints
        if (pathname === '/api/hardware') {
          const hw = detectHardware();
          return json(res, 200, hw);
        }

        if (pathname === '/api/kernels') {
          const matrixSize = 256;
          const kernels = allKernels(matrixSize);
          const list = kernels.map(k => ({
            id: k.name,
            baselineLabel: k.baselineLabel,
            optimizedLabel: k.optimizedLabel,
            description: k.describe(),
          }));
          return json(res, 200, list);
        }

        if (pathname === '/api/benchmark' && req.method === 'POST') {
          const raw = await readBody(req);
          const body: BenchRequest = {
            kernels: Array.isArray(raw.kernels) ? raw.kernels.map(String) : [],
            matrixSize: Number(raw.matrixSize),
            windowMs: Number(raw.windowMs),
          };
          const kernelIds = Array.isArray(body.kernels) ? body.kernels : [];
          const matrixSize = Math.max(32, Math.min(1024, Number(body.matrixSize) || 256));
          const windowMs = Math.max(100, Math.min(2000, Number(body.windowMs) || 400));

          if (kernelIds.length === 0) {
            return json(res, 400, { error: 'No kernels selected' });
          }

          const allKernelPairs = allKernels(matrixSize);
          const selectedPairs = allKernelPairs.filter(k => kernelIds.includes(k.name));

          if (selectedPairs.length === 0) {
            return json(res, 400, { error: 'No valid kernels selected' });
          }

          const hw = detectHardware();
          const runs: MeasuredRun[] = [];

          for (const pair of selectedPairs) {
            const verified = pair.verify();
            const run = measurePair(
              pair.name,
              pair.baselineLabel,
              pair.optimizedLabel,
              pair.baseline,
              pair.optimized,
              verified,
              windowMs,
            );
            runs.push(run);
          }

          const quant = quantizeSection();

          return json(res, 200, {
            hardware: hw,
            runs,
            matrixSize,
            windowMs,
            quant,
          });
        }

        // Static files
        const safeName = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const filePath = path.normalize(path.join(publicDir, safeName));
        if (!filePath.startsWith(publicDir)) return json(res, 403, { error: 'forbidden' });
        if (!existsSync(filePath)) return json(res, 404, { error: 'not found' });

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'content-type': MIME[ext] ?? 'application/octet-stream',
          'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
        });
        readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('server error');
            return;
          }
          res.end(data);
        });
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
      }
    })();
  });

  server.listen(PORT, HOST, () => {
    console.log(`  Arm Neural Bench dashboard at http://${HOST}:${PORT}`);
  });
}