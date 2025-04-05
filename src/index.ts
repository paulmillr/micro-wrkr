import { initWrkr, stringifyError, type WrkrAPI } from './utils.js';

export const wrkr: WrkrAPI = initWrkr({
  cpus: (): number | undefined => {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency)
      return navigator.hardwareConcurrency;
    return undefined;
  },
  initWorker(handlers: Record<string, Function>): void {
    globalThis.addEventListener('message', (msg) => {
      const { id, fn, payload } = msg.data;
      try {
        const res = handlers[fn](payload);
        globalThis.postMessage({ id, res });
      } catch (e) {
        globalThis.postMessage({ id, err: stringifyError(e) });
      }
    });
  },
  createWorker(getWorker, onMessage, onError) {
    const worker: Worker = getWorker();
    worker.addEventListener('message', (msg) => onMessage(msg.data));
    worker.addEventListener('error', (err) => onError(err.message));
    return {
      send: (msg) => worker.postMessage(msg),
      terminate: () => worker.terminate(),
    };
  },
});
