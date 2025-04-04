// @ts-ignore
import * as threads from 'node:worker_threads';
// @ts-ignore
import { cpus } from 'node:os';
import { initWrkr, stringifyError, type WrkrAPI } from './utils.js';

// IMPORTANT
// `export` fields order in package.json matters for bun.
// If 'node' happens before 'bun' it will fail.
// TODO: fix monkey patching in `createWorker`

export const wrkr: WrkrAPI = initWrkr({
  cpus: () => cpus().length,
  initWorker(handlers: Record<string, Function>): void {
    threads.parentPort?.on('message', (msg: any) => {
      const { id, fn, payload } = msg;
      let res, err;
      try {
        res = handlers[fn](payload);
      } catch (e) {
        err = e;
      }

      const pp = threads.parentPort;
      if (res) {
        pp.postMessage({ id, res });
      } else {
        pp.postMessage({ id, err: stringifyError(err) });
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
});

export default wrkr;
