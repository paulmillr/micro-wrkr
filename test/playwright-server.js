import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 9876;
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');
const BUNDLES = {
  parcel: { src: '/build/parcel/test.js' },
  webpack: { src: '/build/webpack/index.js' },
  rollup: { src: '/build/rollup/index.js' },
  esbuild: { src: '/build/esbuild/test.js', module: true },
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function headers(contentType) {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': CSP,
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  };
}

function bundlePage(bundle) {
  const type = bundle.module ? ' type="module"' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>micro-wrkr tests</title></head><body><script${type} src="${bundle.src}"></script></body></html>`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/health') {
    response.writeHead(200, headers('text/plain; charset=utf-8'));
    response.end('ok');
    return;
  }

  const bundle = BUNDLES[url.pathname.replace('/bundles/', '')];
  if (bundle) {
    response.writeHead(200, headers(TYPES['.html']));
    response.end(bundlePage(bundle));
    return;
  }

  if (!url.pathname.startsWith('/build/')) {
    response.writeHead(404, headers('text/plain; charset=utf-8'));
    response.end('not found');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname).slice(1);
  } catch {
    response.writeHead(400, headers('text/plain; charset=utf-8'));
    response.end('bad request');
    return;
  }
  const filename = resolve(ROOT, pathname);
  if (!filename.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    response.writeHead(403, headers('text/plain; charset=utf-8'));
    response.end('forbidden');
    return;
  }

  try {
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, {
      ...headers(TYPES[extname(filename)] || 'application/octet-stream'),
      'Content-Length': info.size,
    });
    createReadStream(filename).pipe(response);
  } catch {
    response.writeHead(404, headers('text/plain; charset=utf-8'));
    response.end('not found');
  }
});

server.listen(PORT, HOST);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
