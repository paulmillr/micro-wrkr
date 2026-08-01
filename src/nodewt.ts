// @ts-ignore
import * as threads from 'node:worker_threads';
// @ts-ignore
import { cpus } from 'node:os';
import { initWrkr, stringifyError, type WorkerTransfer, type WrkrAPI } from './utils.js';

// IMPORTANT
// `export` fields order in package.json matters for bun.
// If 'node' happens before 'bun' it will fail.
// TODO: fix monkey patching in `createWorker`

export const wrkr: WrkrAPI = Object.freeze(
  initWrkr({
    cpus: () => cpus().length,
    initWorker(handlers: Record<string, Function>, transfer?: WorkerTransfer): void {
      threads.parentPort?.on('message', (msg: any) => {
        const { id, fn, payload } = msg;
        const pp = threads.parentPort;
        // The listener only exists inside a worker.
        // TS does not carry that narrowing into the callback.
        if (!pp) throw new Error('expected parentPort in worker');
        try {
          // Own-property check: inherited names like 'toString' are not methods.
          if (!Object.hasOwn(handlers, fn) || typeof handlers[fn] !== 'function')
            throw new Error('unknown method: ' + fn);
          // Success is control-flow based because handlers may return falsy values.
          const res = handlers[fn](payload);
          const t = transfer && Object.hasOwn(transfer, fn) ? transfer[fn](res) : undefined;
          pp.postMessage({ id, res }, t as any);
        } catch (e) {
          pp.postMessage({ id, err: stringifyError(e) });
        }
      });
    },
    createWorker(getWorker, onMessage, onError) {
      // getWorker calls new Worker(...) inside, but we cannot define it as isomorphic thing, because
      // then bundlers may catch it and break.
      // Instead, we temporarily set global Worker object, run function and then restore it.
      let worker: threads.Worker | undefined;
      const prevWorker = (globalThis as any).Worker;
      globalThis.Worker = class {
        constructor(fileUrl: string | URL, _opts?: unknown) {
          // Web Worker options ({ type: 'module' }) don't map to node:worker_threads options.
          worker = new threads.Worker(fileUrl);
        }
      } as unknown as typeof Worker;
      try {
        getWorker() as unknown as threads.Worker;
      } finally {
        if (prevWorker === undefined) delete (globalThis as any).Worker;
        else (globalThis as any).Worker = prevWorker;
      }
      if (!worker) throw new Error('getWorker must construct a worker via new Worker(...)');
      const w = worker;
      w.on('message', onMessage);
      w.on('error', (err: Error) => onError(stringifyError(err)));
      // Without this, a worker that dies (e.g. process.exit) leaves callers hanging forever.
      // After a normal terminate() no calls are pending, so the rejection is a no-op.
      w.on('exit', (code: number) => onError('worker exited with code ' + code));
      return {
        send: (msg: any, transfer?: Transferable[]) => w.postMessage(msg, transfer as any),
        terminate: () => w.terminate(),
      };
    },
  })
);
