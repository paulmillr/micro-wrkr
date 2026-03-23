/** Worker call result envelope. */
export type Result<T> = { res: T } | { err: string };

/**
 * Split a list into at most `numChunks` contiguous chunks.
 * @param list - Items to divide into worker batches.
 * @param numChunks - Maximum number of chunks to create.
 * @returns List of contiguous chunks, omitting empty trailing chunks.
 * @throws On wrong `numChunks` argument types. {@link TypeError}
 * @throws On non-positive or non-integer `numChunks` values. {@link RangeError}
 * @example
 * Split 4 items into 2 worker batches.
 * ```ts
 * splitChunks([1, 2, 3, 4], 2); // => [[1, 2], [3, 4]]
 * ```
 */
export function splitChunks<T>(list: T[], numChunks: number): T[][] {
  if (typeof numChunks !== 'number')
    throw new TypeError(`splitChunks: expected numChunks number, got ${typeof numChunks}`);
  if (!Number.isSafeInteger(numChunks) || numChunks <= 0)
    throw new RangeError('numChunks must be > 0');
  const chunkSize = Math.ceil(list.length / numChunks);
  const res: T[][] = [];
  for (let i = 0; i < list.length; i += chunkSize) res.push(list.slice(i, i + chunkSize));
  return res;
}

/**
 * Convert an unknown thrown value into a printable string.
 * @param e - Error-like value received from worker code.
 * @returns Message string derived from the input value.
 * @example
 * Convert a worker failure into the string sent back to the caller.
 * ```ts
 * stringifyError(new Error('boom')); // => 'boom'
 * ```
 */
export const stringifyError = (e: Error | unknown): string =>
  '' + (e instanceof Error ? e.message : e);

/** Message envelope exchanged with worker instances. */
export type Message = {
  /** Monotonic request id used to match responses back to callers. */
  id: number;
  /** Worker method name to invoke. */
  fn: string;
  /** Serialized payload passed to the worker method. */
  payload: any;
};
/** Map of worker method names to callable handlers. */
export type WorkerHandlers = Record<string, (...args: any) => any>;
/** Optional reducers used to merge per-worker results. */
export type Reducers<H extends WorkerHandlers> = {
  [K in keyof H]: ((results: Awaited<ReturnType<H[K]>[]>) => Awaited<ReturnType<H[K]>>) | undefined;
};
/** Public batch methods generated from worker handlers. */
export type Methods<H extends WorkerHandlers> = {
  [K in keyof H]: (
    input: Parameters<H[K]>[0],
    threads?: number
  ) => Promise<Awaited<ReturnType<H[K]>>>;
};

/** Factory that creates a new worker instance. */
export type GetWorker = () => Worker;
/** Callback invoked for each worker message. */
export type OnMessage = (msg: Message) => void;
/** Callback invoked for worker runtime errors. */
export type OnError = (err: string) => void;
/** Running worker instance with send/terminate controls. */
export type WorkerHandle = {
  /**
   * Sends one message to the underlying worker.
   * @param msg - Serialized worker message to post.
   */
  send: (msg: Message) => void;
  /**
   * Stops the underlying worker instance.
   * @returns Cleanup completion signal from the runtime.
   */
  terminate: () => void;
};

// Generic API for both web/nodejs so we can type-check that it works
/** Platform hooks needed to bind the batching API to a worker runtime. */
export type WorkerPlatform = {
  /**
   * Returns the runtime worker concurrency hint.
   * @returns Preferred number of worker instances, or `undefined` to fall back to `1`.
   */
  cpus: () => number | undefined;
  /**
   * Initializes a worker context with the provided handlers.
   * @param handlers - Method map that the worker should expose.
   */
  initWorker: (handlers: WorkerHandlers) => void;
  /**
   * Creates one worker handle wired to the runtime callbacks.
   * @param getWorker - Factory that returns the raw worker instance.
   * @param onMessage - Callback for worker messages.
   * @param onError - Callback for worker runtime errors.
   * @returns Wrapper handle used by the batching logic.
   */
  createWorker: (getWorker: GetWorker, onMessage: OnMessage, onError: OnError) => WorkerHandle;
};

/** Factory that creates batch-processing methods for a worker set. */
export type BatchFn = <H extends WorkerHandlers>(
  getWorker: GetWorker,
  reducers: Reducers<H>,
  threads?: number
) => {
  methods: Methods<H>;
  terminate: () => void;
};
/** Public API returned by `initWrkr`. */
export type WrkrAPI = {
  /**
   * Returns the concurrency level that will be used by default.
   * @returns Worker count selected from the platform hooks.
   */
  getConcurrency: () => number;
  /**
   * Installs a handler map inside a worker context.
   * @param handlers - Method map that the worker should expose.
   */
  initWorker: (handlers: WorkerHandlers) => void;
  /**
   * Creates a batched worker pool wrapper around one worker factory.
   * @param getWorker - Factory that returns the raw worker instance.
   * @param reducers - Optional reducers used to merge per-worker results.
   * @param threads - Optional worker count override for this batch wrapper.
   * @returns Batch methods plus a pool terminator.
   */
  initBatch: BatchFn;
};

const getConcurrencyFromPlatform = (platform: WorkerPlatform): number => {
  const cpus = platform.cpus();
  return cpus === undefined ? 1 : cpus;
};

function initBatchGen<H extends WorkerHandlers>(
  platform: WorkerPlatform,
  getWorker: GetWorker,
  reducers: Reducers<H>,
  threads?: number
): {
  methods: Methods<H>;
  terminate: () => void;
} {
  if (threads == null) threads = getConcurrencyFromPlatform(platform);
  let id = 0;
  const workers: WorkerHandle[] = [];
  const WAIT: Record<number, { resolve: (v: any) => void; reject: (e: any) => void }> = {};

  const errHandler = (err: any) => {
    for (const i in WAIT) WAIT[i].reject(err);
  };
  const msgHandler = (msg: any) => {
    const { id, res, err } = msg;
    const handler = WAIT[id];
    delete WAIT[id];
    if (!handler) throw new Error('unknown id');
    if (err !== undefined) handler.reject(new Error(err));
    else handler.resolve(res);
  };
  // Start workers
  for (let i = 0; i < threads; i++) {
    workers.push(platform.createWorker(getWorker, msgHandler, errHandler));
  }

  const methods = {} as any;
  for (const fn in reducers) {
    methods[fn] = async (input: any[], _threads?: number) => {
      const chunks = splitChunks(input, _threads !== undefined ? _threads : threads);
      const promises = chunks.map((chunk, i) => {
        const currId = id++;
        const thread = workers[i];
        const p = new Promise((resolve, reject) => {
          if (WAIT[currId] !== undefined) reject(new Error('worker: id re-use'));
          WAIT[currId] = { resolve, reject };
        });
        thread.send({ id: currId, fn, payload: chunk });
        return p;
      });
      const results = await Promise.all(promises);
      const reducer = reducers[fn];
      return reducer ? reducer(results as any) : results.flat(1);
    };
  }
  const terminate = () => {
    errHandler(new Error('worker stopped'));
    for (const w of workers) w.terminate();
  };
  return { methods, terminate };
}

/**
 * Bind the generic worker batching helpers to a concrete runtime platform.
 * @param platform - Platform hooks for concurrency, worker startup, and worker creation.
 * @returns Worker API bound to the provided platform.
 * @example
 * Bind custom runtime hooks once, then reuse the returned API to create worker pools.
 * ```ts
 * import { initWrkr } from 'micro-wrkr/utils.js';
 * const api = initWrkr({
 *   cpus: () => 2,
 *   initWorker: () => {},
 *   createWorker: () => ({ send: () => {}, terminate: () => {} }),
 * });
 * api.getConcurrency(); // => 2
 * ```
 */
export function initWrkr(platform: WorkerPlatform): WrkrAPI {
  return {
    getConcurrency: () => getConcurrencyFromPlatform(platform),
    initWorker: platform.initWorker,
    initBatch: (getWorker, reducers, threads) =>
      initBatchGen(platform, getWorker, reducers, threads),
  };
}
