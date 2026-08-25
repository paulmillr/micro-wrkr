import { bn254 } from '@noble/curves/bn254.js';
import { pippenger } from '@noble/curves/abstract/curve.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { wrkr } from 'micro-wrkr';

const handlers = {
  double: (i) => i.map((j) => j * 2),
  sum: (i) => i.reduce((acc, j) => acc + j, 0),
  text: (i) => i.map((j) => j + '_tmp'),
  zero: () => 0,
  no: () => false,
  empty: () => '',
  nothing: () => undefined,
  throwUndefined: () => {
    throw undefined;
  },
  throwError: () => {
    throw new Error('boom');
  },
  hash: (i) => i.map((j) => sha256(j)),
  bn254_msmG1: (lst) => {
    if (!lst.length) return bn254.G1.Point.ZERO;
    const points = lst.map((i) => new bn254.G1.Point(i.point.X, i.point.Y, i.point.Z));
    const scalars = lst.map((i) => i.scalar);
    return pippenger(bn254.G1.Point, points, scalars);
  },
};

wrkr.initWorker(handlers);
