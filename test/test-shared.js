import { bn254 } from '@noble/curves/bn254';
import { sha256 } from '@noble/hashes/sha256';
import { main } from './main.js';
import { splitChunks } from '../utils.js';

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

async function throws(fn, type, message) {
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  deepStrictEqual(!!err, true);
  deepStrictEqual(err instanceof type, true);
  if (message !== undefined) deepStrictEqual(err.message, message);
}

export const TESTS = (describe, it) => {
  describe('workers', () => {
    it('splitChunks validators', async () => {
      await throws(
        () => splitChunks([1, 2], '2'),
        TypeError,
        'expected numChunks number, got string'
      );
      await throws(() => splitChunks([1, 2], 0), RangeError, 'numChunks must be > 0');
      await throws(() => splitChunks([1, 2], 1.5), RangeError, 'numChunks must be > 0');
    });
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
    it('falsy values', async () => {
      const { methods, terminate } = await main();

      try {
        deepStrictEqual(await methods.zero([1]), [0]);
        deepStrictEqual(await methods.no([1]), [false]);
        deepStrictEqual(await methods.empty([1]), ['']);
        deepStrictEqual(await methods.nothing([1]), [undefined]);
        await throws(() => methods.throwUndefined([1]), Error, 'undefined');
      } finally {
        terminate();
      }
    });
    it('input must be array', async () => {
      const { methods, terminate } = await main();
      try {
        await throws(() => methods.double(5), TypeError, 'expected list array, got number');
      } finally {
        terminate();
      }
    });
    it('threads validated at init', async () => {
      await throws(() => main(0), RangeError, 'threads must be > 0');
      await throws(() => main(1.5), RangeError, 'threads must be > 0');
      await throws(() => main('2'), TypeError, 'expected threads number, got string');
      await throws(() => main({ threads: 0 }), RangeError, 'threads must be > 0');
      await throws(() => main({ chunksPerWorker: 0 }), RangeError, 'chunksPerWorker must be > 0');
    });
    it('chunksPerWorker option', async () => {
      const { methods, terminate } = await main({ threads: 2, chunksPerWorker: 1 });
      try {
        deepStrictEqual(await methods.double([1, 2, 3, 4, 5, 6]), [2, 4, 6, 8, 10, 12]);
        deepStrictEqual(await methods.sum([1, 2, 3, 4, 5]), 15);
      } finally {
        terminate();
      }
    });
    it('transferables', async () => {
      const { methods, terminate } = await main({
        threads: 2,
        transfer: { hash: (chunk) => chunk.map((u8) => u8.buffer) },
      });
      try {
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([4, 5, 6]);
        deepStrictEqual(await methods.hash([a, b]), [
          sha256(new Uint8Array([1, 2, 3])),
          sha256(new Uint8Array([4, 5, 6])),
        ]);
        // Input buffers were moved to workers, not cloned: detached in the caller.
        deepStrictEqual(a.byteLength, 0);
        deepStrictEqual(b.byteLength, 0);
      } finally {
        terminate();
      }
    });
    it('calls after terminate reject', async () => {
      const { methods, terminate } = await main();
      deepStrictEqual(await methods.double([1, 2]), [2, 4]);
      terminate();
      terminate(); // idempotent
      await throws(() => methods.double([3, 4]), Error, 'worker: terminated');
    });
    it('thread override', async () => {
      const { methods, terminate } = await main(2);

      try {
        deepStrictEqual(await methods.double([1, 2, 3, 4, 5, 6]), [2, 4, 6, 8, 10, 12]);
        deepStrictEqual(await methods.double([1, 2, 3, 4, 5, 6], 1), [2, 4, 6, 8, 10, 12]);
        deepStrictEqual(await methods.double([1, 2, 3, 4, 5, 6], 2), [2, 4, 6, 8, 10, 12]);
        deepStrictEqual(await methods.double([1, 2, 3, 4, 5, 6], 4), [2, 4, 6, 8, 10, 12]);
        await throws(
          () => methods.double([1, 2], '2'),
          TypeError,
          'expected threads number, got string'
        );
        await throws(() => methods.double([1, 2], 0), RangeError, 'threads must be > 0');
      } finally {
        terminate();
      }
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
