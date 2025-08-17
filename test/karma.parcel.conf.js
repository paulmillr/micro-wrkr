import { karmaDefaults } from './build/karma-csp.js';

export default function (config) {
  config.set({
    files: ['./build/parcel/test.js', './build/parcel/*.js'],
    ...karmaDefaults(config, true),
  });
}
