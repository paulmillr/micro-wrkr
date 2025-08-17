import { TESTS } from './test-shared.js';

console.log('init tests');
TESTS(describe, it);

if (typeof window !== 'undefined' && window.__karma__.loadedDelay) window.__karma__.loadedDelay();
