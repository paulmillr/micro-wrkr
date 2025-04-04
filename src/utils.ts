export type Result<T> = { res: T } | { err: string };

/** Returns up to `numChunks`, but not higher. */
export function splitChunks<T>(list: T[], numChunks: number): T[][] {
  if (numChunks <= 0) throw new Error('numChunks must be > 0');
  const chunkSize = Math.ceil(list.length / numChunks);
  const res: T[][] = [];
  for (let i = 0; i < list.length; i += chunkSize) res.push(list.slice(i, i + chunkSize));
  return res;
}

export const stringifyError = (e: Error | unknown): string =>
  '' + (e instanceof Error ? e.message : e);

export type Message = { id: number; fn: string; payload: any };
export type WorkerHandlers = Record<string, (...args: any) => any>;
export type Reducers<H extends WorkerHandlers> = {
  [K in keyof H]: ((results: Awaited<ReturnType<H[K]>[]>) => Awaited<ReturnType<H[K]>>) | undefined;
};
export type Methods<H extends WorkerHandlers> = {
  [K in keyof H]: (
    input: Parameters<H[K]>[0],
    threads?: number
  ) => Promise<Awaited<ReturnType<H[K]>>>;
};

export type GetWorker = () => Worker;
export type OnMessage = (msg: Message) => void;
export type OnError = (err: string) => void;
export type WorkerHandle = {
  send: (msg: Message) => void;
  terminate: () => void;
};

// Generic API for both web/nodejs so we can type-check that it works
export type WorkerPlatform = {
  cpus: () => number | undefined;
  initWorker: (handlers: WorkerHandlers) => void;
  createWorker: (getWorker: GetWorker, onMessage: OnMessage, onError: OnError) => WorkerHandle;
};

export type BatchFn = <H extends WorkerHandlers>(
  getWorker: GetWorker,
  reducers: Reducers<H>,
  threads?: number
) => {
  methods: Methods<H>;
  terminate: () => void;
};
/**
 * initBatch type:
 * This works as method list + we can reduce result
 * threads: optional threads amount.
 */
export type WrkrAPI = {
  getConcurrency: () => number;
  initWorker: (handlers: WorkerHandlers) => void;
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

export function initWrkr(platform: WorkerPlatform): WrkrAPI {
  return {
    getConcurrency: () => getConcurrencyFromPlatform(platform),
    initWorker: platform.initWorker,
    initBatch: (getWorker, reducers, threads) =>
      initBatchGen(platform, getWorker, reducers, threads),
  };
}
