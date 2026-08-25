import { wrkr } from '../src/nodewt.js';

export type Handlers = {
  double: (input: number[]) => number[];
  sum: (input: number[]) => number;
};

wrkr.initWorker({
  double: (input) => input.map((value) => value * 2),
  sum: (input) => input.reduce((total, value) => total + value, 0),
} satisfies Handlers);
