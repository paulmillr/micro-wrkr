import workerPlugin from '@chialab/esbuild-plugin-worker';
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['./test.js'],
  bundle: true,
  format: 'esm',
  outdir: 'build/esbuild/',
  splitting: true,
  plugins: [workerPlugin()],
});
