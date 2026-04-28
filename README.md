# micro-wrkr

Wrappers for built-in Web Workers enabling easy parallel data processing.

- 🔒 CSP-friendly: no evals, static file name
- 🔍 Tested in browsers, node, deno, bun
- 📦 Can be bundled using esbuild, rollup, webpack, parcel
- 🏭 High-level type-safe helpers for batch processing
- ⛓ Sync: much simpler than async, no queues / locks

Used in [micro-zk-proofs](https://github.com/paulmillr/micro-zk-proofs).

## Why

Browser Web Workers work fine, but have terrible APIs (just like most "web APIs").
Node.js doesn't have workers, while polyfilling them using node APIs breaks bundlers.

How could one pass a code to a worker?

- eval: stringify function, then `eval`. Would break CSP and imports
- wasm: much easier, just send binary blob of code. Would not work in envs without wasm
- re-run module with if-workercode-else-maincode: fragile, need to track everything done before workers are initialized (IO such as HTTP, DOM)
- build static file before publishing: works if wrkr is directly used, but not inside of other library

Check out [webpack docs on webworkers](https://webpack.js.org/guides/web-workers/).

The library could also be used in single-threaded manner: provide `threads` option to `initBatch`.
Then slow functions can be ran outside of main thread, with async API.

## Usage

> `npm install micro-wrkr`

> `deno add jsr:@paulmillr/micro-wrkr`

### Main file `main.js`

```ts
import { bn254 } from '@noble/curves/bn254.js';
import type {
  WeierstrassPointCons, WeierstrassPoint,
} from '@noble/curves/abstract/weierstrass.js';
import { wrkr } from 'micro-wrkr';
import type { Methods } from 'micro-wrkr/utils.js';
import type { Handlers } from './msm-worker.js';

function reducePoint<T>(p: WeierstrassPointCons<T>) {
  return (lst: WeierstrassPoint<T>[]): WeierstrassPoint<T> =>
    lst.map((i) => new p(i.X, i.Y, i.Z)).reduce((acc, i) => acc.add(i), p.ZERO);
}

export function initMSM(): { methods: Methods<Handlers>; terminate: () => void } {
  // Type-safe
  // worker should be in same directory as main thread code
  const { methods, terminate } = wrkr.initBatch<Handlers>(
    () => new Worker(new URL('./msm-worker.js', import.meta.url), { type: 'module' }),
    {
      // optional reducers
      bn254_msmG1: reducePoint(bn254.G1.Point),
      bn254_msmG2: reducePoint(bn254.G2.Point),
    }
  );
  // Use `terminate` to stop workers when app is paused or exported from library.
  // Otherwise, it won't terminate.
  return { methods, terminate };
}
```

### Worker file `msm-worker.js`

```ts
import { bn254 } from '@noble/curves/bn254.js';
import { pippenger } from '@noble/curves/abstract/curve.js';
import { wrkr } from 'micro-wrkr';
import type { Fp2 } from '@noble/curves/abstract/tower.js';
import type {
  WeierstrassPointCons,
  WeierstrassPoint,
} from '@noble/curves/abstract/weierstrass.js';

type MSMInput<T> = { point: WeierstrassPoint<T>; scalar: bigint };
export type Handlers = {
  bn254_msmG1: (lst: MSMInput<bigint>[]) => WeierstrassPoint<bigint>;
  bn254_msmG2: (lst: MSMInput<Fp2>[]) => WeierstrassPoint<Fp2>;
};

function buildMSM<T>(point: WeierstrassPointCons<T>) {
  return (lst: MSMInput<T>[]): WeierstrassPoint<T> => {
    if (!lst.length) return point.ZERO;
    const points = lst.map((i) => new point(i.point.X, i.point.Y, i.point.Z));
    const scalars = lst.map((i) => i.scalar);
    return pippenger(point, points, scalars);
  };
}

const handlers: Handlers = {
  bn254_msmG1: buildMSM(bn254.G1.Point),
  bn254_msmG2: buildMSM(bn254.G2.Point),
};
wrkr.initWorker(handlers);
```

## Testing

- Browserify isn't supported
- Webpack sometimes breaks CSP by encoding workers as data:url
    - Example: `new Worker(new URL(e.p+e.u(44),e.b),{type:void 0})`


```sh
# when no google chrome, thorium can also be used
export CHROME_BIN='/Applications/Thorium.app/Contents/MacOS/Thorium'
npm run build && npm run test:full
```

## License

MIT (c) Paul Miller [(https://paulmillr.com)](https://paulmillr.com), see LICENSE file.
