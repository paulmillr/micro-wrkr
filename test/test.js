import { TESTS } from './test-shared.js';

const registeredTests = [];
const suites = [];

const describe = (name, register) => {
  suites.push(name);
  try {
    register();
  } finally {
    suites.pop();
  }
};

const it = (name, run) => registeredTests.push({ name: [...suites, name].join(' / '), run });
it.serial = it;

TESTS(describe, it);

const serializeError = (error) => ({
  name: error instanceof Error ? error.name : typeof error,
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
});

let run;
globalThis.__microWrkrRunTests = () =>
  (run ??= (async () => {
    const results = [];
    for (const test of registeredTests) {
      const started = performance.now();
      try {
        await test.run();
        results.push({ name: test.name, duration: performance.now() - started });
      } catch (error) {
        results.push({
          name: test.name,
          duration: performance.now() - started,
          error: serializeError(error),
        });
      }
    }
    return results;
  })());
