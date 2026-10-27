import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => ({
  base: '/archive/',
  plugins: [{
    name: 'archive-static-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (!context.server) return html;
        return html.replace('<link rel="stylesheet" href="./assets/archive.css"/>', '')
          .replace('<script defer src="./assets/archive.js"></script>', '<script type="module" src="/src/main.tsx"></script>');
      },
    },
  }],
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  build: {
    outDir: 'dist',
    lib: {
      entry: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
      name: 'ArchiveApp',
      formats: ['iife'],
      fileName: () => 'assets/archive.js',
      cssFileName: 'assets/archive',
    },
  },
}));
