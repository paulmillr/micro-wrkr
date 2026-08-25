// Minimal assertions avoid pulling Node compatibility shims into browser bundles.
export function deepStrictEqual(actual, expected, message) {
  const [actualType, expectedType] = [typeof actual, typeof expected];
  const err = new Error(
    `Non-equal values: actual=${actual} (type=${actualType}) expected=${expected} (type=${expectedType})${
      message ? `. Message: ${message}` : ''
    }`
  );
  if (actualType !== expectedType) throw err;
  if (['string', 'number', 'bigint', 'undefined', 'boolean'].includes(actualType)) {
    if (actual !== expected) throw err;
    return;
  }
  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (actual.length !== expected.length) throw err;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) throw err;
    }
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) throw err;
    for (let i = 0; i < actual.length; i++) deepStrictEqual(actual[i], expected[i], message);
    return;
  }
  if (actual === null && expected === null) return;
  if (actualType === 'object') {
    const [actualKeys, expectedKeys] = [Object.keys(actual), Object.keys(expected)];
    deepStrictEqual(actualKeys, expectedKeys, message);
    for (const key of actualKeys) deepStrictEqual(actual[key], expected[key], message);
    return;
  }
  throw err;
}

export async function throws(fn, type, message) {
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  deepStrictEqual(!!err, true);
  deepStrictEqual(err instanceof type, true);
  if (message !== undefined) deepStrictEqual(err.message, message);
}
