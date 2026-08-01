import { initWrkr, stringifyError, type WorkerTransfer, type WrkrAPI } from './utils.js';

/** Default worker runtime wired to browser workers or the Node worker-thread adapter. */
export const wrkr: WrkrAPI = Object.freeze(
  initWrkr({
    cpus: (): number | undefined => {
      if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency)
        return navigator.hardwareConcurrency;
      return undefined;
    },
    initWorker(handlers: Record<string, Function>, transfer?: WorkerTransfer): void {
      // Worker-scope postMessage; lib.dom types only expose the window signature.
      const post = globalThis.postMessage as (msg: unknown, transfer?: Transferable[]) => void;
      globalThis.addEventListener('message', (msg) => {
        const { id, fn, payload } = msg.data;
        try {
          // Own-property check: inherited names like 'toString' are not methods.
          if (!Object.hasOwn(handlers, fn) || typeof handlers[fn] !== 'function')
            throw new Error('unknown method: ' + fn);
          // Browser handlers must return cloneable values synchronously.
          // The wrapper posts the result immediately.
          const res = handlers[fn](payload);
          const t = transfer && Object.hasOwn(transfer, fn) ? transfer[fn](res) : undefined;
          post({ id, res }, t);
        } catch (e) {
          post({ id, err: stringifyError(e) });
        }
      });
    },
    createWorker(getWorker, onMessage, onError) {
      const worker: Worker = getWorker();
      worker.addEventListener('message', (msg) => onMessage(msg.data));
      worker.addEventListener('error', (err) => onError(err.message));
      return {
        send: (msg, transfer) =>
          transfer !== undefined ? worker.postMessage(msg, transfer) : worker.postMessage(msg),
        terminate: () => worker.terminate(),
      };
    },
  })
);
