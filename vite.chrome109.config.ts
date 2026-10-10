import { mergeConfig } from 'vite';
import path from 'node:path';
import baseConfig from './vite.config';

/**
 * Experimental compatibility build for the basic operator workflow on Chrome
 * 109. Keep this separate from the default modern-browser build until the
 * Windows 7 device checks pass.
 */
export default mergeConfig(baseConfig, {
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: { chrome: 109 << 16 },
    },
  },
  plugins: [
    {
      name: 'chrome109-profile-aliases',
      enforce: 'pre',
      resolveId(source: string, importer?: string) {
        if (
          source === './EmojiPicker' &&
          importer?.endsWith('/src/components/chat/message-input/MessageInput.tsx')
        ) {
          return path.resolve(__dirname, 'src/components/chat/message-input/EmojiPickerChrome109.tsx');
        }
        if (
          source === '../message-input' &&
          importer?.endsWith('/src/components/chat/chat-area/ChatArea.tsx')
        ) {
          return path.resolve(__dirname, 'src/components/chat/message-input/MessageInputChrome109.tsx');
        }
        return null;
      },
      transform(code: string, id: string) {
        let transformed = code.replace(
          /from\s+(['"])@\/components\/AppLogo\1/g,
          'from "@/components/AppLogoChrome109"',
        );
        if (id.endsWith('/src/pages/Customer/Chat/Chat.tsx')) {
          transformed = transformed.replace(
            /import\s+\{\s*ChatTour\s*\}\s+from\s+['"]@\/tours\/ChatTour['"];?/,
            'const ChatTour = () => null;',
          );
        }
        return transformed === code ? null : { code: transformed, map: null };
      },
    },
    {
      name: 'chrome109-entry-html',
      transformIndexHtml: {
        order: 'pre',
        handler(html: string) {
          return html
            .replace("localStorage.getItem('theme')", "localStorage.getItem('theme.chrome109')")
            .replace(
              /<link rel="icon"[^>]*>\s*<link rel="alternate icon"[^>]*>/,
              '<link rel="icon" type="image/png" href="/favicon-32.png" />',
            )
            .replace('<html lang="en">', '<html lang="pt-BR">')
            .replace('<title>SOFIA Central</title>', '<title>SOFIA Central — Atendimento</title>')
            .replace('/src/main.tsx', '/src/main.chrome109.tsx');
        },
      },
    },
  ],
  build: {
    target: 'chrome109',
    outDir: 'dist-chrome109',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  // VITE_COMPAT_ALLOWED_API_HOSTS is a comma-separated, explicit allowlist
  // supplied only for a disposable isolated test environment.
  define: {
    'import.meta.env.VITE_COMPAT_ALLOWED_API_HOSTS': JSON.stringify(
      process.env.VITE_COMPAT_ALLOWED_API_HOSTS || '',
    ),
  },
});
