# micro-wrkr

Reasonable micro API for built-in Web Workers.

- Tested in browsers, node, deno, bun
- Can be bundled using esbuild, rollup, webpack, parcel
- CSP-friendly: no evals, static file name
- High-level type-safe helpers: supports batch processing by default
- Sync: much simpler than async, no queues / locks

## Usage

> `npm install micro-wrkr`

> `deno add jsr:@paulmillr/micro-wrkr`

> `deno doc jsr:@paulmillr/micro-wrkr` # command-line documentation

### Main file `main.js`

```ts
import { bn254 } from '@noble/curves/bn254';
import { type ProjConstructor, type ProjPointType } from '@noble/curves/abstract/weierstrass';
import wrkr from 'micro-wrkr';
import { type Handlers } from './msm-worker.js';

function reducePoint<T>(p: ProjConstructor<T>) {
  return (lst: ProjPointType<T>[]) =>
    lst.map((i) => new p(i.px, i.py, i.pz)).reduce((acc, i) => acc.add(i), p.ZERO);
}

export function initMSM() {
  // Type-safe
  // worker should be in same directory as main thread code
  const { methods, terminate } = wrkr.initBatch<Handlers>(
    () => new Worker(new URL('./msm-worker.js', import.meta.url), { type: 'module' }),
    {
      // optional reducers
      bn254_msmG1: reducePoint(bn254.G1.ProjectivePoint),
      bn254_msmG2: reducePoint(bn254.G2.ProjectivePoint),
    }
  );
  // Use `terminate` to stop workers when app is paused or exported from library.
  // Otherwise, it won't terminate.
  return { methods, terminate };
}
```

### Worker file `msm-worker.js`

```ts
import { bn254 } from '@noble/curves/bn254';
import wrkr from 'micro-wrkr';
import { type ProjConstructor, type ProjPointType } from '@noble/curves/abstract/weierstrass';

type MSMInput<T> = { point: ProjPointType<T>; scalar: T };

function buildMSM<T>(point: ProjConstructor<T>) {
  return (lst: MSMInput<T>[]): ProjPointType<T> => {
    if (!lst.length) return point.ZERO;
    const points = lst.map((i: any) => new point(i.point.px, i.point.py, i.point.pz));
    const scalars = lst.map((i: any) => i.scalar);
    return point.msm(points, scalars);
  };
}

const handlers = {
  bn254_msmG1: buildMSM(bn254.G1.ProjectivePoint),
  bn254_msmG2: buildMSM(bn254.G2.ProjectivePoint),
};
// Export Handlers type for type-safety
export type Handlers = typeof handlers;
wrkr.initWorker(handlers);
```

## Why and how

Browser Web Workers work fine, but have terrible APIs (just like most "web APIs").
Node.js has different interface, and polyfilling workers using node APIs breaks bundlers

How could one pass a code to a worker?

- eval: stringify function, then `eval`. Would break CSP and imports
- wasm: much easier, just send binary blob of code. Would not work in envs without wasm
- re-run module with if-workercode-else-maincode: fragile, need to track everything done before workers are initialized (IO such as HTTP, DOM)
- build static file before publishing: works if wrkr is directly used, but not inside of other library

Check out [webpack docs on webworkers](https://webpack.js.org/guides/web-workers/).

The library could also be used in single-threaded manner: provide `threads` option to `initBatch`.
Then slow functions can be ran outside of main thread, with async API.

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
