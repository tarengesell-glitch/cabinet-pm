import { describe, expect, it } from 'vitest';
import * as core from '../index';

// Trivial test so the runner is proven to work. Replaced by real tests in step 1b.
describe('core scaffold', () => {
  it('loads the core entry point', () => {
    expect(core).toBeTypeOf('object');
  });
});
