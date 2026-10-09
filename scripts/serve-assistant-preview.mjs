import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = new Map([
  ['/', [resolve('dist/assistant-preview/index.html'), 'text/html; charset=utf-8']],
  ['/commercial-assistant-preview.html', [resolve('dist/assistant-preview/index.html'), 'text/html; charset=utf-8']],
  ['/app.js', [resolve('dist/assistant-preview/app.js'), 'text/javascript; charset=utf-8']],
  ['/app.css', [resolve('dist/assistant-preview/app.css'), 'text/css; charset=utf-8']],
]);

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  const entry = files.get(path);
  if (!entry) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  try {
    const body = await readFile(entry[0]);
    response.writeHead(200, {
      'Content-Type': entry[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-src http://127.0.0.1:3001; object-src 'none'; base-uri 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Prévia ainda não compilada');
  }
}).listen(5173, '127.0.0.1', () => {
  console.log('Prévia local disponível em http://127.0.0.1:5173/commercial-assistant-preview.html');
});
