import { bn254 } from '@noble/curves/bn254';
import { sha256 } from '@noble/hashes/sha2';
import { wrkr } from 'micro-wrkr';

const handlers = {
  double: (i) => i.map((j) => j * 2),
  sum: (i) => i.reduce((acc, j) => acc + j, 0),
  text: (i) => i.map((j) => j + '_tmp'),
  hash: (i) => i.map((j) => sha256(j)),
  bn254_msmG1: (lst) => {
    if (!lst.length) return bn254.G1.ProjectivePoint.ZERO;
    const points = lst.map((i) => new bn254.G1.ProjectivePoint(i.point.px, i.point.py, i.point.pz));
    const scalars = lst.map((i) => i.scalar);
    return bn254.G1.ProjectivePoint.msm(points, scalars);
  },
};

wrkr.initWorker(handlers);
