import workerPlugin from '@chialab/esbuild-plugin-worker';
import metaUrlPlugin from '@chialab/esbuild-plugin-meta-url';
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['./test.js'],
  bundle: true,
  format: 'iife',
  outdir: 'build/esbuild/',
  plugins: [workerPlugin(), metaUrlPlugin()],
});
