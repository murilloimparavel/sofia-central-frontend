import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDirectory = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(stylesDirectory, 'chrome109.css'), 'utf8');
const modernEntry = readFileSync(resolve(stylesDirectory, '../main.tsx'), 'utf8');
const compatibilityEntry = readFileSync(resolve(stylesDirectory, '../main.chrome109.tsx'), 'utf8');
const chatHeader = readFileSync(resolve(stylesDirectory, '../components/chat/chat-header/ChatHeader.tsx'), 'utf8');

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((channel) =>
    parseInt(channel, 16) / 255,
  );
  if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function fallbackBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing ${selector} fallback block`);
  return css.slice(start, css.indexOf('}', start));
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing fallback token --${name}`);
  return match[1];
}

describe('Chrome 109 chat sRGB palette contrast', () => {
  const light = fallbackBlock(':root');
  const dark = fallbackBlock(':root.dark');

  it.each([
    ['light', light, '#171717', '#ffffff'],
    ['dark', dark, '#f8fafc', '#0b0f19'],
  ])('%s body text meets WCAG AA', (_mode, block, expectedForeground, expectedBackground) => {
    const foreground = token(block, 'foreground');
    const background = token(block, 'background');
    expect(foreground).toBe(expectedForeground);
    expect(background).toBe(expectedBackground);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light', light, '#52525b', '#ffffff'],
    ['dark', dark, '#9ca3af', '#0b0f19'],
  ])('%s muted text meets WCAG AA', (_mode, block, expectedForeground, expectedBackground) => {
    const foreground = token(block, 'muted-foreground');
    const background = token(block, 'background');
    expect(foreground).toBe(expectedForeground);
    expect(background).toBe(expectedBackground);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light', light, '#2563eb', '#ffffff'],
    ['dark', dark, '#2563eb', '#0b0f19'],
  ])('%s primary text meets WCAG AA', (_mode, block, expectedForeground, expectedBackground) => {
    const background = token(block, 'background');
    expect(background).toBe(expectedBackground);
    const foreground = _mode === 'dark'
      ? css.match(/:root\.dark \.text-primary[\s\S]*?\{([^}]+)\}/)?.[1]?.match(/color:\s*(#[0-9a-f]{6})/i)?.[1]
      : token(block, 'primary');
    expect(foreground).toBe(_mode === 'dark' ? '#60a5fa' : expectedForeground);
    expect(contrastRatio(foreground!, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light', light, '#ffffff', '#2563eb'],
    ['dark', dark, '#ffffff', '#2563eb'],
  ])('%s primary button text meets WCAG AA', (_mode, block, expectedForeground, expectedBackground) => {
    const foreground = token(block, 'primary-foreground');
    const background = token(block, 'primary');
    expect(foreground).toBe(expectedForeground);
    expect(background).toBe(expectedBackground);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps common chat color-mix opacity utilities translucent in the compatibility profile', () => {
    const requiredFallbacks = [
      '[class~="bg-primary/5"] { background-color: rgba(37, 99, 235, 0.05); }',
      '[class~="bg-primary/10"] { background-color: rgba(37, 99, 235, 0.10); }',
      '[class~="bg-primary/20"] { background-color: rgba(37, 99, 235, 0.20); }',
      '[class~="bg-muted/50"] { background-color: rgba(244, 244, 245, 0.50); }',
      '[class~="from-primary/20"] { --tw-gradient-from: rgba(37, 99, 235, 0.20); }',
      '[class~="via-background/95"] { --tw-gradient-via: rgba(255, 255, 255, 0.95); }',
      '[class~="dark:bg-primary/20"] { background-color: rgba(96, 165, 250, 0.20); }',
      '[class~="dark:bg-muted/50"] { background-color: rgba(31, 41, 55, 0.50); }',
      ':root.dark [class~="from-primary/20"] { --tw-gradient-from: rgba(96, 165, 250, 0.20); }',
      ':root.dark [class~="via-background/95"] { --tw-gradient-via: rgba(11, 15, 25, 0.95); }',
    ];

    for (const fallback of requiredFallbacks) {
      expect(css).toContain(fallback);
    }
    expect(css).not.toContain('@supports not (color: oklch(0 0 0))');
  });

  it('loads legacy CSS only in the isolated compatibility entry', () => {
    expect(compatibilityEntry).toContain("import './styles/chrome109.css'");
    expect(modernEntry).not.toContain('chrome109.css');
  });

  it('reflows the conversation header only in the legacy desktop viewport range', () => {
    expect(compatibilityEntry).toContain("classList.add('chrome109-profile')");
    expect(modernEntry).not.toContain('chrome109-profile');
    expect(css).toContain('@media (min-width: 768px) and (max-width: 900px)');
    expect(css).toContain('html.chrome109-profile [data-compat-chat-header-layout]');
    expect(css).toContain('html.chrome109-profile [data-compat-chat-header-status]');
    expect(chatHeader).toContain('data-compat-chat-header-contact');
    expect(chatHeader).toContain('data-compat-chat-header-actions');
  });
});
