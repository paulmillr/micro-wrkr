import { bn254 } from '@noble/curves/bn254';
import { sha256 } from '@noble/hashes/sha256';
import { main } from './main.js';

// Minimal assert version to avoid dependecies on node internals
// Allows to verify that none of brwoserify version of node internals is included in resulting build
function deepStrictEqual(actual, expected, message) {
  const [actualType, expectedType] = [typeof actual, typeof expected];
  const err = new Error(
    `Non-equal values: actual=${actual} (type=${actualType}) expected=${expected} (type=${expectedType})${
      message ? `. Message: ${message}` : ''
    }`
  );
  if (actualType !== expectedType) {
    throw err;
  }
  // Primitive types
  if (['string', 'number', 'bigint', 'undefined', 'boolean'].includes(actualType)) {
    if (actual !== expected) {
      throw err;
    }
    return;
  }
  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (actual.length !== expected.length) {
      throw err;
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        throw err;
      }
    }
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      throw err;
    }
    for (let i = 0; i < actual.length; i++) {
      deepStrictEqual(actual[i], expected[i], message);
    }
    return;
  }
  if (actual === null && expected === null) {
    return;
  }
  if (actualType === 'object') {
    const [actualKeys, expectedKeys] = [Object.keys(actual), Object.keys(expected)];
    deepStrictEqual(actualKeys, expectedKeys, message);
    for (const key of actualKeys) {
      deepStrictEqual(actual[key], expected[key], message);
    }
    return;
  }
  throw err;
}

export const TESTS = (describe, it) => {
  describe('workers', () => {
    it(`basic`, async () => {
      const { methods, terminate } = await main();

      deepStrictEqual(await methods.text(['a', 'b', 'c']), ['a_tmp', 'b_tmp', 'c_tmp']);
      deepStrictEqual(await methods.double([1, 2, 3, 4, 5]), [2, 4, 6, 8, 10]);
      // Reducer test
      deepStrictEqual(await methods.sum([1, 2, 3, 4, 5]), 15);
      deepStrictEqual(await methods.hash([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]), [
        sha256(new Uint8Array([1, 2, 3])),
        sha256(new Uint8Array([4, 5, 6])),
      ]);
      // Reducer test
      const msm = await methods.bn254_msmG1([
        { scalar: 3n, point: bn254.G1.ProjectivePoint.BASE },
        { scalar: 2n, point: bn254.G1.ProjectivePoint.BASE },
        { scalar: 4n, point: bn254.G1.ProjectivePoint.BASE },
      ]);
      deepStrictEqual(msm.equals(bn254.G1.ProjectivePoint.BASE.multiply(9n)), true);

      terminate();
    });
    it('throw', async () => {
      // console.log('123');
      // //     EvalError: Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: "script-src 'self'".
      // //const t = new Function('a', '');
      // const b = await main();
      // console.log('456', b);
      // const res = await b.batch('text', ['a', 'b', 'c']);
      // console.log('789', res);
      // b.terminate();
      // //throw new Error('err ' + JSON.stringify(res));
    });
  });
};
