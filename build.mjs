import { build, context } from 'esbuild';

const entryPoints = [
  'src/core/index.js',
  'src/client/index.js',
  'src/remark/index.js',
  'src/codemirror/index.js',
  'src/editor/index.js',
  'src/react/index.js',
  'src/astro/index.js',
];

const options = {
  entryPoints,
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  jsx: 'automatic',

  packages: 'external',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(options);
}
