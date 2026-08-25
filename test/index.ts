import { wrkr } from '../src/nodewt.js';
import type { Methods } from '../src/utils.js';
import type { Handlers } from './worker.js';

const batch = wrkr.initBatch<Handlers>(
  () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
  { double: undefined, sum: (parts) => parts.reduce((total, part) => total + part, 0) },
  2
);
const methods: Methods<Handlers> = batch.methods;

try {
  const doubled = await methods.double([1, 2, 3, 4]);
  if (doubled.join(',') !== '2,4,6,8') throw new Error(`unexpected result: ${doubled}`);

  const summed = await methods.sum([1, 2, 3, 4]);
  if (summed !== 10) throw new Error(`unexpected sum: ${summed}`);
} finally {
  batch.terminate();
}
