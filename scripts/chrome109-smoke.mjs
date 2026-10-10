import { chromium } from '@playwright/test';

const APP_URL = process.env.CHROME109_SMOKE_APP_URL || 'http://127.0.0.1:4174';
const API_URL = process.env.CHROME109_SMOKE_API_URL || 'http://127.0.0.1:3030';
const executablePath = process.env.CHROME109_SMOKE_CHROMIUM_PATH;
const conversationName = 'Contato Sintético';

function positiveNumber(name, fallback, { allowZero = false } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${name} must be a ${allowZero ? 'non-negative' : 'positive'} number.`);
  }
  return value;
}

function throughput(name) {
  const value = Number(process.env[name] ?? -1);
  if (!Number.isFinite(value) || (value !== -1 && value <= 0)) {
    throw new Error(`${name} must be positive bytes per second, or -1 for unlimited.`);
  }
  return value;
}

function getLoopbackOrigin(value, name) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(`${name} must use an HTTP loopback origin; refusing remote traffic.`);
  }
  return url.origin;
}

const appOrigin = getLoopbackOrigin(APP_URL, 'CHROME109_SMOKE_APP_URL');
const apiOrigin = getLoopbackOrigin(API_URL, 'CHROME109_SMOKE_API_URL');
const allowedOrigins = new Set([appOrigin, apiOrigin]);
const runs = positiveNumber('CHROME109_SMOKE_RUNS', 1);
const viewportWidth = positiveNumber('CHROME109_SMOKE_WIDTH', 1365);
const viewportHeight = positiveNumber('CHROME109_SMOKE_HEIGHT', 768);
if (!Number.isInteger(runs) || runs > 10) {
  throw new Error('CHROME109_SMOKE_RUNS must be a whole number from 1 to 10.');
}
if (!Number.isInteger(viewportWidth) || !Number.isInteger(viewportHeight)) {
  throw new Error('CHROME109_SMOKE_WIDTH and CHROME109_SMOKE_HEIGHT must be whole numbers.');
}

const cpuRate = positiveNumber('CHROME109_SMOKE_CPU_RATE', 1);
const latencyMs = positiveNumber('CHROME109_SMOKE_LATENCY_MS', 0, { allowZero: true });
const downloadBps = throughput('CHROME109_SMOKE_DOWNLOAD_BPS');
const uploadBps = throughput('CHROME109_SMOKE_UPLOAD_BPS');
const emulateNetwork = latencyMs > 0 || downloadBps >= 0 || uploadBps >= 0;

const requestedOrigins = new Set();
const blockedOrigins = new Set();
const allPageErrors = [];
const allConsoleErrors = [];
const runResults = [];

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox'],
});

try {
  for (let run = 1; run <= runs; run += 1) {
    const resetResponse = await fetch(`${apiOrigin}/__mock__/reset`, { method: 'POST' });
    if (!resetResponse.ok) throw new Error('Local API fixture could not reset synthetic state.');
    const initialStatsResponse = await fetch(`${apiOrigin}/__mock__/stats`);
    if (!initialStatsResponse.ok) throw new Error('Local API fixture is not available.');
    const initialStats = await initialStatsResponse.json();
    const context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
    });

    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      requestedOrigins.add(url.origin);

      if (!allowedOrigins.has(url.origin)) {
        blockedOrigins.add(url.origin);
        return route.abort();
      }

      // Exercise the profile's protection against Clarity IDs supplied by an API.
      if (url.origin === apiOrigin && url.pathname.endsWith('/global_config')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clarityProjectId: 'synthetic-disabled-clarity' }),
        });
      }

      return route.continue();
    });

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    if (cpuRate !== 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    }
    if (emulateNetwork) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: latencyMs,
        downloadThroughput: downloadBps,
        uploadThroughput: uploadBps,
      });
    }

    const pageErrors = [];
    const consoleErrors = [];
    let sendRequestTiming = null;
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', entry => {
      if (entry.type() === 'error') consoleErrors.push(entry.text());
    });
    page.on('request', request => {
      const requestUrl = new URL(request.url());
      if (request.method() === 'POST' && requestUrl.pathname.endsWith('/messages')) {
        sendRequestTiming = { startedAt: Date.now(), status: null, responseMs: null };
      }
    });
    page.on('response', response => {
      const responseUrl = new URL(response.url());
      if (response.request().method() === 'POST' && responseUrl.pathname.endsWith('/messages')) {
        const receivedAt = Date.now();
        sendRequestTiming = {
          startedAt: sendRequestTiming?.startedAt ?? receivedAt,
          status: response.status(),
          responseMs: receivedAt - (sendRequestTiming?.startedAt ?? receivedAt),
        };
      }
    });

    const startedAt = Date.now();
    await page.goto(`${appOrigin}/login`, { waitUntil: 'domcontentloaded' });
    const email = page.locator('#login-email');
    await email.fill('agent@example.test');
    await page.locator('#login-password').fill('synthetic-password');
    const loginStartedAt = Date.now();
    // Exercise the login form without relying on mouse input or translations.
    await email.focus();
    await page.keyboard.press('Tab');
    const passwordFocused = await page.evaluate(() => document.activeElement?.id === 'login-password');
    await page.keyboard.press('Tab');
    const loginFocus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const style = getComputedStyle(active);
      return {
        isSubmit: active.matches('form button[type="submit"]'),
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });
    const loginFocusVisible = Boolean(loginFocus && (
      (loginFocus.outlineStyle !== 'none' && loginFocus.outlineColor !== 'rgba(0, 0, 0, 0)') ||
      loginFocus.boxShadow !== 'none'
    ));
    await page.keyboard.press('Enter');
    await page.getByText(conversationName, { exact: true }).first().waitFor({ timeout: 30000 });
    const loginToListMs = Date.now() - loginStartedAt;

    const openConversationStartedAt = Date.now();
    await page.getByText(conversationName, { exact: true }).first().click();
    const composer = page.locator('textarea[aria-label]');
    await composer.waitFor({ timeout: 30000 });
    const conversationOpenMs = Date.now() - openConversationStartedAt;

    const message = `Smoke Chrome 109 run ${run} ${new Date().toISOString()}`;
    await composer.fill(message);
    const sendStartedAt = Date.now();
    await composer.press('Enter');
    await page.locator('.rich-content').filter({ hasText: message }).waitFor({ timeout: 15000 });
    const sendVisibleMs = Date.now() - sendStartedAt;

    const themeButton = page.locator('header button').first();
    await themeButton.click();
    const darkTheme = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        stored: localStorage.getItem('theme.chrome109'),
        active: document.documentElement.classList.contains('dark'),
        background: root.getPropertyValue('--background').trim(),
        foreground: root.getPropertyValue('--foreground').trim(),
        mutedForeground: root.getPropertyValue('--muted-foreground').trim(),
        primary: root.getPropertyValue('--primary').trim(),
      };
    });
    await themeButton.click();
    const lightTheme = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        stored: localStorage.getItem('theme.chrome109'),
        active: document.documentElement.classList.contains('dark'),
        background: root.getPropertyValue('--background').trim(),
        foreground: root.getPropertyValue('--foreground').trim(),
        mutedForeground: root.getPropertyValue('--muted-foreground').trim(),
        primary: root.getPropertyValue('--primary').trim(),
      };
    });

    const pageMetrics = await page.evaluate(() => ({
      path: location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
      documentScrollWidth: document.documentElement.scrollWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      supportsOklch: CSS.supports('color', 'oklch(0 0 0)'),
      supportsColorMix: CSS.supports('color', 'color-mix(in oklab, red, blue)'),
      resourceCount: performance.getEntriesByType('resource').length,
      transferBytes: performance.getEntriesByType('resource')
        .reduce((total, entry) => total + (entry.transferSize || 0), 0),
    }));
    const fixtureResponse = await fetch(`${apiOrigin}/__mock__/stats`);
    if (!fixtureResponse.ok) throw new Error('Could not read local fixture statistics.');
    const { events } = await fixtureResponse.json();
    const runEvents = events.slice(initialStats.events.length);
    const listRead = runEvents.some(event => event.outcome === 'synthetic_list_read');
    const messagesRead = runEvents.some(event => event.outcome === 'synthetic_messages_read');
    const conversationMarkedRead = runEvents.some(event => event.outcome === 'synthetic_mark_read');
    const sentMessage = runEvents.find(event =>
      event.outcome === 'synthetic_text_send' &&
      event.content_length === message.length &&
      event.message_type === 'outgoing' &&
      event.private === false,
    );

    const result = {
      run,
      keyboard: { passwordFocused, loginSubmitFocused: Boolean(loginFocus?.isSubmit), loginFocusVisible },
      timingsMs: {
        loginToList: loginToListMs,
        conversationOpen: conversationOpenMs,
        sendVisible: sendVisibleMs,
        sendRequest: sendRequestTiming
          ? { status: sendRequestTiming.status, responseMs: sendRequestTiming.responseMs }
          : null,
        fullFlow: Date.now() - startedAt,
      },
      conversationRead: { listRead, messagesRead, conversationMarkedRead },
      pageMetrics,
      darkTheme,
      lightTheme,
      syntheticMessageSent: Boolean(sentMessage),
      pageErrors,
      consoleErrors,
    };
    runResults.push(result);
    allPageErrors.push(...pageErrors.map(error => `run ${run}: ${error}`));
    allConsoleErrors.push(...consoleErrors.map(error => `run ${run}: ${error}`));
    await context.close();

    if (
      pageErrors.length > 0 ||
      !passwordFocused ||
      !loginFocus?.isSubmit ||
      !loginFocusVisible ||
      !listRead ||
      !messagesRead ||
      !conversationMarkedRead ||
      !sentMessage ||
      sendRequestTiming?.status !== 200 ||
      pageMetrics.documentScrollWidth > pageMetrics.viewport.width ||
      pageMetrics.documentScrollHeight > pageMetrics.viewport.height ||
      darkTheme.stored !== 'dark' ||
      !darkTheme.active ||
      darkTheme.background !== '#0b0f19' ||
      darkTheme.foreground !== '#f8fafc' ||
      lightTheme.stored !== 'light' ||
      lightTheme.active ||
      !['#ffffff', '#fff'].includes(lightTheme.background) ||
      lightTheme.foreground !== '#171717'
    ) {
      process.exitCode = 1;
    }
  }

  const mean = field => Math.round(
    runResults.reduce((total, result) => total + result.timingsMs[field], 0) / runResults.length,
  );
  const output = {
    browserVersion: browser.version(),
    profile: {
      runs,
      viewport: { width: viewportWidth, height: viewportHeight },
      cpuThrottleRate: cpuRate,
      network: emulateNetwork
        ? { latencyMs, downloadBps, uploadBps }
        : 'not emulated',
    },
    meanTimingsMs: {
      loginToList: mean('loginToList'),
      conversationOpen: mean('conversationOpen'),
      sendVisible: mean('sendVisible'),
      fullFlow: mean('fullFlow'),
    },
    results: runResults,
    requestedOrigins: [...requestedOrigins],
    blockedOrigins: [...blockedOrigins],
    pageErrors: allPageErrors,
    consoleErrors: allConsoleErrors,
  };
  console.log(JSON.stringify(output, null, 2));

  if (blockedOrigins.size > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
