import { karmaDefaults } from './build/karma-csp.js';

export default function (config) {
  config.set({
    files: [
      'build/delay-broken-karma.js',
      'build/rollup/index.js', // this bootstraps Mocha after the bundle is ready
      { pattern: 'build/rollup/*.js', included: false }, // don't preload — we'll load manually
    ],
    ...karmaDefaults(config),
  });
}
