import { describe, should, it } from 'micro-should';
import { TESTS } from './test-shared.js';

TESTS(describe, it);

should.runWhen(import.meta.url);
