import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import OMT from '@surma/rollup-plugin-off-main-thread';

export default [
  {
    input: './test.js',
    output: {
      dir: `./build/rollup/`,
      format: 'amd',
      name: 'tests',
      sourcemap: true,
      exports: 'named',
      entryFileNames: 'index.js',
    },
    plugins: [
      commonjs(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      OMT(),
    ],
  },
];
