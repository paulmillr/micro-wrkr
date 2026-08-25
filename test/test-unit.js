import { describe, it, should } from '@paulmillr/jsbt/test.js';
import { initWrkr, splitChunks, stringifyError } from '../utils.js';
import { deepStrictEqual, throws } from './assert.js';

function fakePlatform(cpus) {
  if (arguments.length === 0) cpus = 2;
  const state = {
    created: 0,
    pending: [],
    sent: [],
    terminated: [],
  };
  const platform = {
    cpus: () => cpus,
    initWorker: () => {},
    createWorker(_getWorker, onMessage, onError) {
      const worker = state.created++;
      return {
        send(message) {
          state.sent.push({ worker, message });
          state.pending.push({
            worker,
            message,
            resolve: (res) => onMessage({ id: message.id, res }),
            reject: (err) => onMessage({ id: message.id, err }),
            fail: onError,
          });
        },
        terminate() {
          state.terminated.push(worker);
        },
      };
    },
  };
  return { platform, state };
}

describe('scheduler unit tests', () => {
  it.serial('splits exact, uneven, oversized, and empty batches', () => {
    deepStrictEqual(splitChunks([1, 2, 3, 4], 2), [
      [1, 2],
      [3, 4],
    ]);
    deepStrictEqual(splitChunks([1, 2, 3, 4, 5], 2), [
      [1, 2, 3],
      [4, 5],
    ]);
    deepStrictEqual(splitChunks([1, 2], 10), [[1], [2]]);
    deepStrictEqual(splitChunks([], 3), []);
  });

  it.serial('rejects every invalid chunk count', async () => {
    await throws(() => splitChunks([1], '2'), TypeError, 'expected numChunks number, got string');
    for (const value of [0, -1, 1.5, NaN, Infinity]) {
      await throws(() => splitChunks([1], value), RangeError, 'numChunks must be > 0');
    }
  });

  it.serial('uses platform concurrency and the one-worker fallback', () => {
    const two = initWrkr(fakePlatform(2).platform);
    const fallback = initWrkr(fakePlatform(undefined).platform);
    deepStrictEqual(two.getConcurrency(), 2);
    deepStrictEqual(fallback.getConcurrency(), 1);
  });

  it.serial('chunks work and preserves input order across out-of-order replies', async () => {
    const { platform, state } = fakePlatform(3);
    const { methods, terminate } = initWrkr(platform).initBatch(
      () => ({}),
      { double: undefined },
      3
    );
    const result = methods.double([1, 2, 3, 4, 5]);

    deepStrictEqual(
      state.sent.map(({ worker, message }) => ({ worker, payload: message.payload })),
      [
        { worker: 0, payload: [1, 2] },
        { worker: 1, payload: [3, 4] },
        { worker: 2, payload: [5] },
      ]
    );
    state.pending[2].resolve([10]);
    state.pending[0].resolve([2, 4]);
    state.pending[1].resolve([6, 8]);
    deepStrictEqual(await result, [2, 4, 6, 8, 10]);

    terminate();
    deepStrictEqual(state.terminated, [0, 1, 2]);
  });

  it.serial('reduces partial results in chunk order', async () => {
    const { platform, state } = fakePlatform(2);
    const { methods, terminate } = initWrkr(platform).initBatch(
      () => ({}),
      { sum: (parts) => parts.reduce((total, part) => total + part, 0) },
      2
    );
    const result = methods.sum([1, 2, 3, 4]);
    state.pending[1].resolve(7);
    state.pending[0].resolve(3);
    deepStrictEqual(await result, 10);
    terminate();
  });

  it.serial('keeps overlapping calls isolated by request id', async () => {
    const { platform, state } = fakePlatform(2);
    const { methods, terminate } = initWrkr(platform).initBatch(() => ({}), { copy: undefined }, 2);
    const first = methods.copy([1, 2]);
    const second = methods.copy([3, 4]);

    deepStrictEqual(
      state.sent.map(({ message }) => message.id),
      [0, 1, 2, 3]
    );
    state.pending[3].resolve([4]);
    state.pending[1].resolve([2]);
    state.pending[2].resolve([3]);
    state.pending[0].resolve([1]);
    deepStrictEqual(await first, [1, 2]);
    deepStrictEqual(await second, [3, 4]);
    terminate();
  });

  it.serial('propagates handler errors and rejects work interrupted by termination', async () => {
    const handler = fakePlatform(1);
    const handlerBatch = initWrkr(handler.platform).initBatch(() => ({}), { run: undefined }, 1);
    const failed = handlerBatch.methods.run([1]);
    const failedAssertion = throws(() => failed, Error, 'boom');
    handler.state.pending[0].reject('boom');
    await failedAssertion;
    handlerBatch.terminate();

    const stopped = fakePlatform(2);
    const stoppedBatch = initWrkr(stopped.platform).initBatch(() => ({}), { run: undefined }, 2);
    const interrupted = stoppedBatch.methods.run([1, 2]);
    const interruptedAssertion = throws(() => interrupted, Error, 'worker stopped');
    stoppedBatch.terminate();
    await interruptedAssertion;
    deepStrictEqual(stopped.state.terminated, [0, 1]);
  });

  it.serial('rejects all in-flight calls after a worker-level failure', async () => {
    const { platform, state } = fakePlatform(2);
    const { methods, terminate } = initWrkr(platform).initBatch(() => ({}), { run: undefined }, 2);
    const first = methods.run([1, 2]);
    const second = methods.run([3, 4]);
    const resultsPromise = Promise.allSettled([first, second]);
    state.pending[0].fail('worker crashed');
    const results = await resultsPromise;
    deepStrictEqual(results, [
      { status: 'rejected', reason: 'worker crashed' },
      { status: 'rejected', reason: 'worker crashed' },
    ]);
    terminate();
  });

  it.serial('serializes errors without losing falsy thrown values', () => {
    deepStrictEqual(stringifyError(new Error('boom')), 'boom');
    deepStrictEqual(stringifyError(undefined), 'undefined');
    deepStrictEqual(stringifyError(0), '0');
  });
});

should.runWhen(import.meta.url);
