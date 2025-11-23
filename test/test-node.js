import { describe, it, should } from '@paulmillr/jsbt/test.js';
import { TESTS } from './test-shared.js';

TESTS(describe, it);

should.runWhen(import.meta.url);
