import { bn254 } from '@noble/curves/bn254.js';
import { wrkr } from 'micro-wrkr';

export const main = (threads) =>
  wrkr.initBatch(
    () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
    {
      double: undefined,
      sum: (x) => x.reduce((acc, i) => acc + i, 0),
      text: undefined,
      zero: undefined,
      no: undefined,
      empty: undefined,
      nothing: undefined,
      throwUndefined: undefined,
      throwError: undefined,
      hash: undefined,
      bn254_msmG1: (x) =>
        x
          .map((i) => new bn254.G1.Point(i.X, i.Y, i.Z))
          .reduce((acc, i) => acc.add(i), bn254.G1.Point.ZERO),
    },
    threads
  );
