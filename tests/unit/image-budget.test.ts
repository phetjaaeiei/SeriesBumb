import { describe, expect, it } from 'vitest';
import { assertImageBudget } from '../../src/lib/services/images';

describe('image storage budget', () => {
  it('accepts the 50 MB ceiling and rejects the first byte over it', () => {
    expect(() => assertImageBudget(47_000_000, 3_000_000)).not.toThrow();
    expect(() => assertImageBudget(47_000_001, 3_000_000)).toThrow('50 MB');
  });
});
