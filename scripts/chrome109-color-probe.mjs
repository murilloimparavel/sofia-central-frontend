import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const executablePath = process.env.CHROME109_SMOKE_CHROMIUM_PATH;
const screenshotPath = resolve(
  process.env.CHROME109_COLOR_PROBE_SCREENSHOT || join(tmpdir(), 'chrome109-color-probe.png'),
);

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({ viewport: { width: 720, height: 280 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <style>
      body { margin: 0; padding: 16px; color: #111; background: #fff; font: 16px sans-serif; }
      .row { display: flex; gap: 16px; }
      .swatch { box-sizing: border-box; width: 210px; height: 120px; padding: 8px; border: 1px solid #444; }
      .srgb { color: #000; background-color: #d95835; }
      .oklch { color: #000; background-color: #d95835; background-color: oklch(0.62 0.16 35); }
      .mix { color: #111; background-color: rgba(37, 99, 235, 0.15); background-color: color-mix(in oklab, #2563eb 15%, white); }
      .query { color: #fff; background-color: #17803d; }
      @supports not (color: oklch(0 0 0)) { .query { background-color: #be123c; } }
    </style>
    <h2>OKLCH / color-mix paint probe</h2>
    <div class="row">
      <div class="swatch srgb">sRGB reference</div>
      <div class="swatch oklch">OKLCH with sRGB fallback</div>
      <div class="swatch mix">color-mix with rgba fallback</div>
    </div>
    <p class="swatch query">@supports not query: red means fallback active; green means query accepted</p>
  `);

  const result = await page.evaluate(() => {
    const color = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      supportsOklch: CSS.supports('color', 'oklch(0.62 0.16 35)'),
      supportsColorMix: CSS.supports('color', 'color-mix(in oklab, #2563eb 15%, white)'),
      computedBackgrounds: {
        srgb: color('.srgb'),
        oklch: color('.oklch'),
        colorMix: color('.mix'),
        negativeSupportsBranch: color('.query'),
      },
    };
  });
  await page.screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ browserVersion: browser.version(), ...result, screenshotPath }, null, 2));
} finally {
  await browser.close();
}
