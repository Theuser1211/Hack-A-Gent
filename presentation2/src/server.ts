import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFile } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sceneSpec } from './scene-spec.js';

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
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function startServer(port = 8806): void {
  const HOST = process.env.HOST ?? '127.0.0.1';
  const PORT = Number(process.env.PORT ?? 0) || port;
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);
    const pathname = url.pathname;

    void (async () => {
      try {
        if (pathname === '/api/scene') {
          return json(res, 200, sceneSpec());
        }

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
    console.log(`  Orbital — 3D web experience at http://${HOST}:${PORT}`);
  });
}
