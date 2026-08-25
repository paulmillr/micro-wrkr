import { wrkr } from 'micro-wrkr';
import type { Methods, Reducers } from 'micro-wrkr/utils.js';

type Handlers = {
  double: (input: number[]) => number[];
  sum: (input: number[]) => number;
};

const worker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const reducers: Reducers<Handlers> = {
  double: undefined,
  sum: (parts) => parts.reduce((total, part) => total + part, 0),
};
const batch = wrkr.initBatch<Handlers>(worker, reducers, 2);
const methods: Methods<Handlers> = batch.methods;
const doubled: Promise<number[]> = methods.double([1, 2, 3]);
const summed: Promise<number> = methods.sum([1, 2, 3]);

// @ts-expect-error handler inputs remain type-safe
methods.double(['1']);
// @ts-expect-error reducers must return the handler's result type
const invalidReducers: Reducers<Handlers> = { double: (parts) => parts.length, sum: undefined };

void doubled;
void summed;
void invalidReducers;
batch.terminate();
