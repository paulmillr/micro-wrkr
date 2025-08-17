import { bn254 } from '@noble/curves/bn254';
import { wrkr } from 'micro-wrkr';

export const main = () =>
  wrkr.initBatch(() => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), {
    double: undefined,
    sum: (x) => x.reduce((acc, i) => acc + i, 0),
    text: undefined,
    hash: undefined,
    bn254_msmG1: (x) =>
      x
        .map((i) => new bn254.G1.ProjectivePoint(i.px, i.py, i.pz))
        .reduce((acc, i) => acc.add(i), bn254.G1.ProjectivePoint.ZERO),
  });
