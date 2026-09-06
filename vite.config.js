import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = import.meta.dirname;
const src = (p) => resolve(here, p);

const publicEntries = [
  ['@briwa.dev/sandbox/codemirror', 'src/codemirror/index.js'],
  ['@briwa.dev/sandbox/client', 'src/client/index.js'],
  ['@briwa.dev/sandbox/remark', 'src/remark/index.js'],
  ['@briwa.dev/sandbox/editor', 'src/editor/index.js'],
  ['@briwa.dev/sandbox/react', 'src/react/index.js'],
  ['@briwa.dev/sandbox/astro', 'src/astro/index.js'],
  ['@briwa.dev/sandbox/styles', 'styles/all.css'],
  ['@briwa.dev/sandbox', 'src/core/index.js'],
];

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: publicEntries.map(([find, to]) => ({ find, replacement: src(to) })),
  },
  build: {
    outDir: 'demo-dist',
    rollupOptions: {
      input: {
        index: src('index.html'),
        figures: src('demo/figures.html'),
        playground: src('demo/playground.html'),
        editor: src('demo/editor.html'),
      },
    },
  },
});
