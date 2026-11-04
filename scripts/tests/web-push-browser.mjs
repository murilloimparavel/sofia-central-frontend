// Local browser smoke: public PWA assets only; never contacts production.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root = new URL('../../public/', import.meta.url);
const server = createServer(async (req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<link rel="manifest" href="/manifest.webmanifest"><title>Local push smoke</title>');
  }
  const assets = { '/push-sw.js': 'application/javascript', '/manifest.webmanifest': 'application/manifest+json', '/favicon-192.png': 'image/png', '/favicon-512.png': 'image/png' };
  if (!assets[req.url]) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', assets[req.url]);
  res.end(await readFile(new URL(req.url.slice(1), root)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ permissions: ['notifications'] });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => console.log('Page error:', error.message));
  page.setDefaultNavigationTimeout(20000);
  await page.goto(origin);
  console.log('Local browser loaded; checking worker.');
  const result = await page.evaluate(async () => {
    const deadline = new Promise((_, reject) => setTimeout(() => reject(new Error('PWA smoke timed out')), 20000));
    return Promise.race([deadline, (async () => {
    await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
    const reg = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    const ack = new Promise(resolve => { channel.port1.onmessage = resolve; });
    reg.active.postMessage({ type: 'PUSH_USER', userId: 'synthetic-user' }, [channel.port2]);
    await ack;
    const cache = await caches.open('sofia-push-state-v1');
    const user = await (await cache.match('/__push_user__')).json();
    const manifest = await (await fetch('/manifest.webmanifest')).json();
    const icons = await Promise.all(manifest.icons.map(async icon => {
      const image = new Image(); image.src = icon.src; await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }));
    return { scope: reg.scope, user, manifest, icons };
    })()]);
  });
  assert.equal(result.scope, `${origin}/`);
  assert.equal(result.user.userId, 'synthetic-user');
  assert.equal(result.manifest.display, 'standalone');
  assert.deepEqual(result.icons, [{ width: 192, height: 192 }, { width: 512, height: 512 }]);
  console.log('PASS Chromium: service-worker activation, persistent user state, PWA manifest and 192/512px icons.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
