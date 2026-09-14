import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: { build: { outDir: 'dist-electron', rollupOptions: { external: ['better-sqlite3'] } } },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) { args.reload(); },
        vite: { build: { outDir: 'dist-electron' } },
      },
      {
        entry: 'electron/print-preview-preload.ts',
        onstart(args) { args.reload(); },
        vite: { build: { outDir: 'dist-electron' } },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@retail-sarathi/gst-engine': path.resolve(__dirname, '../../packages/gst-engine/src/index.ts'),
      '@retail-sarathi/ui': path.resolve(__dirname, '../../packages/ui/src/index.tsx'),
      '@retail-sarathi/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages/] },
  },
  server: { port: 5173 },
});
