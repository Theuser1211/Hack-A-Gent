import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFile } from 'node:fs';
import * as path from 'node:path';
import { computeMetrics } from './app/metrics.js';
import type { FocusSession } from './app/data.js';
import type { SubscriptionService } from './subscription/index.js';

const FREE_DAILY_SESSION_CAP = 3;

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

export interface ServerDeps {
  service: SubscriptionService;
  publicDir: string;
  account: Record<string, unknown>;
  sessions: FocusSession[];
  onReset?: () => void;
}

export function startServer(deps: ServerDeps): void {
  const { service, publicDir, account, sessions } = deps;
  const HOST = process.env.HOST ?? '127.0.0.1';
  const PORT = Number(process.env.PORT ?? 0) || 8800;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);
    const pathname = url.pathname;

    void (async () => {
      try {
        if (pathname === '/api/bootstrap') {
          return json(res, 200, {
            catalog: service.getCatalog(),
            view: service.getState(),
            metrics: computeMetrics(sessions),
            sessions: [...sessions].slice(-20).reverse(),
            account,
            meta: { serverTime: new Date().toISOString(), freeDailyCap: FREE_DAILY_SESSION_CAP },
          });
        }

        if (pathname === '/api/purchase') {
          const body = await readBody(req);
          const packageId = String(body.packageId ?? '');
          if (!packageId) return json(res, 400, { error: 'missing packageId' });
          const outcome = await service.purchase(packageId);
          if (!outcome.ok) return json(res, 402, { error: outcome.error ?? 'purchase failed' });
          return json(res, 200, outcome);
        }

        if (pathname === '/api/restore') {
          const outcome = await service.restore();
          return json(res, 200, outcome);
        }

        if (pathname === '/api/cancel') {
          return json(res, 200, { view: service.cancelSubscriptions() });
        }

        if (pathname === '/api/reset') {
          deps.onReset?.();
          return json(res, 200, {
            view: service.reset(),
            catalog: service.getCatalog(),
            account,
            metrics: computeMetrics(sessions),
            meta: { serverTime: new Date().toISOString(), freeDailyCap: FREE_DAILY_SESSION_CAP },
          });
        }

        if (pathname === '/api/sessions' && req.method === 'POST') {
          const body = await readBody(req);
          const durationSec = Math.max(1, Math.min(4 * 3600, Number(body.durationSec ?? 0)));
          const tag = typeof body.tag === 'string' && body.tag.trim() ? body.tag.trim() : 'Focus';
          const hasUnlimited = Boolean(service.getState().grants['focus.unlimited']);
          if (!hasUnlimited) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const usedToday = sessions.filter((s) => Date.parse(s.startedAt) >= todayStart.getTime()).length;
            if (usedToday >= FREE_DAILY_SESSION_CAP) {
              return json(res, 403, {
                error: `You've used your ${FREE_DAILY_SESSION_CAP} free sessions today. Upgrade to Pro for unlimited focus.`,
                view: service.getState(),
              });
            }
          }
          const record: FocusSession = {
            id: `sess_${Date.now()}`,
            startedAt: new Date().toISOString(),
            durationSec,
            tag,
          };
          sessions.push(record);
          return json(res, 201, { session: record, metrics: computeMetrics(sessions), view: service.getState() });
        }

        if (pathname === '/api/insights') {
          const hasInsights = Boolean(service.getState().grants['stats.insights']);
          if (!hasInsights) {
            return json(res, 403, {
              error: 'Focus insights are a Pro feature.',
              view: service.getState(),
            });
          }
          return json(res, 200, { metrics: computeMetrics(sessions), view: service.getState() });
        }

        if (pathname === '/api/fail-next' && req.method === 'POST') {
          const body = await readBody(req);
          service.failNext(Boolean(body.on));
          return json(res, 200, { ok: true });
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
    console.log(`  Lumen is running at http://${HOST}:${PORT}`);
  });
}
