// @ts-ignore
import * as threads from 'node:worker_threads';
// @ts-ignore
import { cpus } from 'node:os';
import { initWrkr, stringifyError, type WrkrAPI } from './utils.js';

// IMPORTANT
// `export` fields order in package.json matters for bun.
// If 'node' happens before 'bun' it will fail.
// TODO: fix monkey patching in `createWorker`

export const wrkr: WrkrAPI = Object.freeze(
  initWrkr({
    cpus: () => cpus().length,
    initWorker(handlers: Record<string, Function>): void {
      threads.parentPort?.on('message', (msg: any) => {
        const { id, fn, payload } = msg;
        const pp = threads.parentPort;
        // The listener only exists inside a worker.
        // TS does not carry that narrowing into the callback.
        if (!pp) throw new Error('expected parentPort in worker');
        try {
          // Success is control-flow based because handlers may return falsy values.
          const res = handlers[fn](payload);
          pp.postMessage({ id, res });
        } catch (e) {
          pp.postMessage({ id, err: stringifyError(e) });
        }
      });
    },
    createWorker(getWorker, onMessage, onError) {
      if (typeof Worker !== 'undefined') throw new Error('Worker defined on node');
      // getWorker calls new Worker(...) inside, but we cannot define it as isomorphic thing, because
      // then bundlers may catch it and break.
      // Instead, we temporary set global Worker object, run function and then remove it.
      let worker: threads.Worker = undefined as any;
      globalThis.Worker = class {
        constructor(fileUrl: string | URL) {
          worker = new threads.Worker(fileUrl);
        }
      } as unknown as typeof Worker;
      try {
        getWorker() as unknown as threads.Worker;
      } finally {
        delete (globalThis as any).Worker;
      }
      worker.on('message', onMessage);
      worker.on('error', (err: Error) => onError(err.message));
      return {
        send: (msg: any) => worker.postMessage(msg),
        terminate: () => worker.terminate(),
      };
    },
  })
);
