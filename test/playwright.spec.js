import { expect, test } from '@playwright/test';

const BUNDLERS = ['parcel', 'webpack', 'rollup', 'esbuild'];
const REQUIRED_CSP = ["default-src 'none'", "script-src 'self'", "worker-src 'self'"];
const TEST_NAMES = [
  'workers / splitChunks validators',
  'workers / basic',
  'workers / falsy values',
  'workers / thread override',
  'workers / empty and overlapping batches',
  'workers / error propagation',
];

for (const bundler of BUNDLERS) {
  test(`${bundler} bundle`, async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));

    const response = await page.goto(`/bundles/${bundler}`);
    expect(response?.ok()).toBe(true);
    const csp = response.headers()['content-security-policy'];
    for (const directive of REQUIRED_CSP) expect(csp).toContain(directive);
    expect(csp).not.toContain('unsafe-');
    await page.waitForFunction(() => typeof globalThis.__microWrkrRunTests === 'function');
    const results = await page.evaluate(() => globalThis.__microWrkrRunTests());

    expect(results.map(({ name }) => name)).toEqual(TEST_NAMES);
    for (const result of results) {
      await test.step(result.name, async () => {
        expect.soft(result.error, result.error?.stack || result.error?.message).toBeUndefined();
      });
    }
    expect(pageErrors, pageErrors.join('\n\n')).toEqual([]);
  });
}
