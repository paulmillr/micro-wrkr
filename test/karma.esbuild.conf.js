import { karmaDefaults } from './build/karma-csp.js';

export default function (config) {
  config.set({
    files: ['./build/esbuild/*.js'],
    ...karmaDefaults(config, true),
  });
}
