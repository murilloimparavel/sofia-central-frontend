const { chromium } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const worker = fs.readFileSync(path.join(__dirname, '../public/push-worker.js'));
const server = http.createServer((req, res) => {
  if (req.url === '/push-worker.js') { res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' }); res.end(worker); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Local push check</title>');
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const options = { headless: true };
    if (process.env.CHROMIUM_EXECUTABLE_PATH) options.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    browser = await chromium.launch(options);
    const context = await browser.newContext();
    await context.grantPermissions(['notifications'], { origin });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    let registrationId;
    cdp.on('ServiceWorker.workerRegistrationUpdated', event => {
      for (const item of event.registrations) if (item.scopeURL === `${origin}/`) registrationId = item.registrationId;
    });
    await cdp.send('ServiceWorker.enable');
    await page.goto(origin);
    if (await page.evaluate(() => Notification.permission) !== 'granted') throw new Error('Browser notification permission not granted');
    await page.evaluate(async () => { await navigator.serviceWorker.register('/push-worker.js'); await navigator.serviceWorker.ready; });
    for (let i = 0; i < 50 && !registrationId; i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!registrationId) throw new Error('Service worker registration was not observed');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify({ title: 'Ana', body: 'Olá', tag: 'test', url: `${origin}/conversations/123` }) });
    let notification;
    for (let i = 0; i < 100 && !notification; i++) {
      notification = await page.evaluate(async () => { const [n] = await (await navigator.serviceWorker.ready).getNotifications(); return n ? { title: n.title, body: n.body, target: n.data.target } : null; });
      if (!notification) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!notification) throw new Error('Notification not observed after simulated push');
    if (notification.title !== 'Ana' || notification.body !== 'Olá' || notification.target !== '/conversations/123') throw new Error('Unexpected notification payload');
    console.log(JSON.stringify({ ok: true, notification }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
