import { bn254 } from '@noble/curves/bn254.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { main } from './main.js';
import { splitChunks } from '../utils.js';
import { deepStrictEqual, throws } from './assert.js';

export const TESTS = (describe, it) => {
  // These cases create their own worker pools, so test-runner parallelism only adds contention.
  const test = it.serial || it;
  describe('workers', () => {
    test('splitChunks validators', async () => {
      await throws(
        () => splitChunks([1, 2], '2'),
        TypeError,
        'expected numChunks number, got string'
      );
      await throws(() => splitChunks([1, 2], 0), RangeError, 'numChunks must be > 0');
      await throws(() => splitChunks([1, 2], 1.5), RangeError, 'numChunks must be > 0');
    });
    test(`basic`, async () => {
      const { methods, terminate } = await main(3);

      try {
        deepStrictEqual(await methods.text(['a', 'b', 'c']), ['a_tmp', 'b_tmp', 'c_tmp']);
        deepStrictEqual(await methods.double([1, 2, 3, 4, 5]), [2, 4, 6, 8, 10]);
        // Reducer test
        deepStrictEqual(await methods.sum([1, 2, 3, 4, 5]), 15);
        deepStrictEqual(
          await methods.hash([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]),
          [sha256(new Uint8Array([1, 2, 3])), sha256(new Uint8Array([4, 5, 6]))]
        );
        // Reducer test
        const msm = await methods.bn254_msmG1([
          { scalar: 3n, point: bn254.G1.Point.BASE },
          { scalar: 2n, point: bn254.G1.Point.BASE },
          { scalar: 4n, point: bn254.G1.Point.BASE },
        ]);
        deepStrictEqual(msm.equals(bn254.G1.Point.BASE.multiply(9n)), true);
      } finally {
        terminate();
      }
    });
    test('falsy values', async () => {
      const { methods, terminate } = await main(1);

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
    test('thread override', async () => {
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
    test('empty and overlapping batches', async () => {
      const { methods, terminate } = await main(2);

      try {
        deepStrictEqual(await methods.double([]), []);
        deepStrictEqual(await methods.sum([]), 0);
        const [first, second] = await Promise.all([
          methods.double([1, 2, 3, 4]),
          methods.double([5, 6, 7, 8]),
        ]);
        deepStrictEqual(first, [2, 4, 6, 8]);
        deepStrictEqual(second, [10, 12, 14, 16]);
      } finally {
        terminate();
      }
    });
    test('error propagation', async () => {
      const { methods, terminate } = await main(1);

      try {
        await throws(() => methods.throwError([1]), Error, 'boom');
      } finally {
        terminate();
      }
    });
  });
};
