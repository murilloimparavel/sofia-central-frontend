import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const outputDir = resolve('dist/assistant-preview');
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: ['src/commercialAssistantPreview.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'automatic',
  outfile: resolve(outputDir, 'app.js'),
  define: {
    'import.meta.env.VITE_COMMERCIAL_ASSISTANT_URL': JSON.stringify(
      process.env.VITE_COMMERCIAL_ASSISTANT_URL || 'http://127.0.0.1:3001',
    ),
  },
});

await writeFile(
  resolve(outputDir, 'index.html'),
  await readFile('commercial-assistant-preview.html', 'utf8'),
);
console.log(`Assistant preview built in ${outputDir}`);
