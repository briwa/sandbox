import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const here = import.meta.dirname;
const src = (p) => resolve(here, p);

const publicEntries = [
  ['@briwa.dev/sandbox/client', 'src/client/index.js'],
  ['@briwa.dev/sandbox/remark', 'src/remark/index.js'],
  ['@briwa.dev/sandbox/markdown', 'src/markdown/index.js'],
  ['@briwa.dev/sandbox/astro', 'src/astro/index.js'],
  ['@briwa.dev/sandbox/styles', 'styles/all.css'],
  ['@briwa.dev/sandbox', 'src/core/index.js'],
];

export default defineConfig({
  base: './',
  resolve: {
    alias: publicEntries.map(([find, to]) => ({ find, replacement: src(to) })),
  },
  build: {
    outDir: 'demo-dist',
  },
});
