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

### Options

Third argument of `initBatch` accepts a thread count or an options object:

```ts
const { methods, terminate } = wrkr.initBatch(getWorker, reducers, {
  // Worker pool size. Default: hardwareConcurrency / cpu count.
  // Workers spawn lazily, on first use.
  threads: 4,
  // Chunks created per worker used by a call. Values above 1 let fast workers
  // pull extra chunks instead of idling while the slowest chunk finishes.
  // Set to 1 to send exactly one chunk per worker. Default: 4.
  chunksPerWorker: 4,
  // Zero-copy: per-method hooks listing Transferables inside an input chunk.
  // Transferred buffers are detached and unusable in the caller!
  transfer: { hash: (chunk) => chunk.map((u8) => u8.buffer) },
});
```

Inside the worker file, second argument of `initWorker` transfers result buffers back:

```ts
wrkr.initWorker(handlers, { hash: (res) => res.map((u8) => u8.buffer) });
```

#### Why transfer is opt-in

Transferables are supported by every runtime the library runs on, but they are not a
transparent optimization: transferring a buffer *detaches* it on the sending side.
The library cannot turn them on by default, because only the caller knows whether that is safe:

- Callers often keep their input. `await methods.hash(data); await methods.hash(data)` —
  auto-transfer would make the second call silently operate on zero-length buffers.
- Aliasing breaks even single calls. Several `Uint8Array`s may share one `ArrayBuffer`
  (e.g. subarrays of a big allocation) and land in different chunks: transferring chunk 1's
  buffer detaches chunk 2's data before it is sent.
- Auto-discovery is not free: it would require deep-walking every payload in JS, paid even
  by callers that gain nothing from it.

The `transfer` hook is the caller's explicit assertion: "I'm done with these buffers".
For zero-copy *without* giving up ownership, use `SharedArrayBuffer` payloads instead —
they are cloned as references — but browsers require COOP/COEP headers to enable them.

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
