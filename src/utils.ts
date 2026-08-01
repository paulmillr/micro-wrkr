/** Worker call result envelope. */
export type Result<T> = { res: T } | { err: string };

const checkChunks = (numChunks: number, name = 'numChunks'): number => {
  if (typeof numChunks !== 'number')
    throw new TypeError(`expected ${name} number, got ${typeof numChunks}`);
  if (!Number.isSafeInteger(numChunks) || numChunks <= 0)
    throw new RangeError(`${name} must be > 0`);
  return numChunks;
};

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
  if (!Array.isArray(list)) throw new TypeError(`expected list array, got ${typeof list}`);
  numChunks = checkChunks(numChunks);
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
/** Hook listing Transferable objects inside a payload, enabling zero-copy postMessage. */
export type TransferFn = (data: any) => Transferable[];
/** Per-method transfer hooks applied to results posted back from a worker. */
export type WorkerTransfer = Record<string, TransferFn>;
/** Optional reducers used to merge per-worker results. */
export type Reducers<H extends WorkerHandlers> = {
  [K in keyof H]: ((results: Awaited<ReturnType<H[K]>>[]) => Awaited<ReturnType<H[K]>>) | undefined;
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
   * @param transfer - Optional Transferables inside `msg` to move instead of clone.
   */
  send: (msg: Message, transfer?: Transferable[]) => void;
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
   * @param transfer - Optional per-method hooks listing Transferables inside results.
   */
  initWorker: (handlers: WorkerHandlers, transfer?: WorkerTransfer) => void;
  /**
   * Creates one worker handle wired to the runtime callbacks.
   * @param getWorker - Factory that returns the raw worker instance.
   * @param onMessage - Callback for worker messages.
   * @param onError - Callback for worker runtime errors.
   * @returns Wrapper handle used by the batching logic.
   */
  createWorker: (getWorker: GetWorker, onMessage: OnMessage, onError: OnError) => WorkerHandle;
};

/** Options accepted by `initBatch`. */
export type BatchOptions<H extends WorkerHandlers> = {
  /** Worker pool size. Defaults to the platform concurrency. */
  threads?: number;
  /**
   * How many chunks to create per worker used by a call. Values above 1 let fast workers
   * pull extra chunks instead of idling while the slowest chunk finishes.
   * Set to 1 to send exactly one chunk per worker. Default: 4.
   */
  chunksPerWorker?: number;
  /**
   * Per-method hooks listing Transferables inside an input chunk, enabling zero-copy
   * transfer to workers. Transferred buffers are detached and unusable in the caller.
   */
  transfer?: Partial<{ [K in keyof H]: (chunk: Parameters<H[K]>[0]) => Transferable[] }>;
};
/** Factory that creates batch-processing methods for a worker set. */
export type BatchFn = <H extends WorkerHandlers>(
  getWorker: GetWorker,
  reducers: Reducers<H>,
  options?: number | BatchOptions<H>
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
   * @param transfer - Optional per-method hooks listing Transferables inside results.
   */
  initWorker: (handlers: WorkerHandlers, transfer?: WorkerTransfer) => void;
  /**
   * Creates a batched worker pool wrapper around one worker factory.
   * @param getWorker - Factory that returns the raw worker instance.
   * @param reducers - Optional reducers used to merge per-worker results.
   * @param options - Worker count, or options: `threads`, `chunksPerWorker`, `transfer`.
   * @returns Batch methods plus a pool terminator.
   */
  initBatch: BatchFn;
};

const getConcurrencyFromPlatform = (platform: WorkerPlatform): number => {
  const cpus = platform.cpus();
  // Custom platforms must return a positive worker count here.
  // Only `undefined` opts into the 1-worker fallback.
  return cpus === undefined ? 1 : cpus;
};

const DEFAULT_CHUNKS_PER_WORKER = 4;

function initBatchGen<H extends WorkerHandlers>(
  platform: WorkerPlatform,
  getWorker: GetWorker,
  reducers: Reducers<H>,
  options?: number | BatchOptions<H>
): {
  methods: Methods<H>;
  terminate: () => void;
} {
  const opts: BatchOptions<H> =
    options == null
      ? {}
      : typeof options === 'object'
        ? options
        : { threads: checkChunks(options, 'threads') };
  let threads = opts.threads;
  if (threads == null) threads = getConcurrencyFromPlatform(platform);
  else checkChunks(threads, 'threads');
  const chunksPerWorker =
    opts.chunksPerWorker == null
      ? DEFAULT_CHUNKS_PER_WORKER
      : checkChunks(opts.chunksPerWorker, 'chunksPerWorker');
  let id = 0;
  let terminated = false;
  // Slots are filled lazily: a worker spawns the first time a chunk is dispatched to it.
  const workers: (WorkerHandle | undefined)[] = new Array(threads);
  const pending: number[] = new Array(threads).fill(0);
  const WAIT: Record<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void; worker: number }
  > = {};

  const toError = (err: unknown): Error => (err instanceof Error ? err : new Error('' + err));
  // Rejects in-flight calls: all of them, or only those pinned to one failed worker.
  const rejectCalls = (err: unknown, workerIdx?: number) => {
    const e = toError(err);
    for (const i in WAIT) {
      if (workerIdx !== undefined && WAIT[i].worker !== workerIdx) continue;
      const handler = WAIT[i];
      delete WAIT[i];
      handler.reject(e);
    }
  };
  const msgHandler = (msg: any) => {
    const { id, res, err } = msg;
    const handler = WAIT[id];
    // Late replies (after a worker error or terminate) have no slot left; drop them
    // instead of throwing inside the platform message listener, where nothing can catch.
    if (!handler) return;
    delete WAIT[id];
    if (err !== undefined) handler.reject(new Error(err));
    else handler.resolve(res);
  };
  const ensureWorker = (i: number): WorkerHandle => {
    let w = workers[i];
    if (w === undefined) {
      w = platform.createWorker(getWorker, msgHandler, (err) => rejectCalls(err, i));
      workers[i] = w;
    }
    return w;
  };
  // Least-busy pool slots first, so concurrent calls spread across the pool.
  // On equal load, prefer already-spawned workers to avoid startup cost.
  const pickWorkers = (count: number): number[] => {
    const idx = Array.from({ length: workers.length }, (_, i) => i);
    idx.sort(
      (a, b) =>
        pending[a] - pending[b] ||
        (workers[a] === undefined ? 1 : 0) - (workers[b] === undefined ? 1 : 0) ||
        a - b
    );
    return idx.slice(0, count);
  };
  const callWorker = (workerIdx: number, fn: string, payload: any, transfer?: TransferFn) => {
    const currId = id++;
    if (WAIT[currId] !== undefined) return Promise.reject(new Error('worker: id re-use'));
    pending[workerIdx]++;
    const p = new Promise((resolve, reject) => {
      WAIT[currId] = { resolve, reject, worker: workerIdx };
    }).finally(() => pending[workerIdx]--);
    try {
      ensureWorker(workerIdx).send(
        { id: currId, fn, payload },
        transfer !== undefined ? transfer(payload) : undefined
      );
    } catch (e) {
      // postMessage can throw synchronously (uncloneable payload, bad transfer list).
      // Settle through WAIT so the slot is cleaned up instead of leaking.
      const handler = WAIT[currId] as (typeof WAIT)[number] | undefined;
      delete WAIT[currId];
      handler?.reject(toError(e));
    }
    return p;
  };

  const methods = {} as any;
  for (const fn in reducers) {
    const transfer = opts.transfer?.[fn] as TransferFn | undefined;
    methods[fn] = async (input: any[], _threads?: number) => {
      if (terminated) throw new Error('worker: terminated');
      const requested = checkChunks(_threads !== undefined ? _threads : threads, 'threads');
      // Callers can cap a call below the pool size.
      // Larger hints are limited to the pool size.
      const count = requested > workers.length ? workers.length : requested;
      // Over-decompose so one slow chunk doesn't leave finished workers idle:
      // each worker pulls the next unprocessed chunk as soon as its previous one completes.
      const chunks = splitChunks(input, count * chunksPerWorker);
      const results: any[] = new Array(chunks.length);
      let next = 0;
      const drain = async (workerIdx: number) => {
        while (next < chunks.length) {
          const chunkIdx = next++;
          results[chunkIdx] = await callWorker(workerIdx, fn, chunks[chunkIdx], transfer);
        }
      };
      await Promise.all(pickWorkers(count).map(drain));
      const reducer = reducers[fn];
      return reducer ? reducer(results as any) : results.flat(1);
    };
  }
  const terminate = () => {
    if (terminated) return;
    terminated = true;
    // Reject before stopping the pool.
    // Pending callers cannot receive replies from stopped workers.
    rejectCalls(new Error('worker stopped'));
    for (const w of workers) w?.terminate();
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
    // WorkerPlatform hooks are receiver-free function properties.
    // Custom platforms should close over state instead of using `this`.
    initWorker: platform.initWorker,
    initBatch: (getWorker, reducers, options) =>
      initBatchGen(platform, getWorker, reducers, options),
  };
}
