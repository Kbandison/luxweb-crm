import { describe, expect, it } from 'vitest';
import { flattenJoin } from './array-join';

describe('flattenJoin', () => {
  it('returns object when input is a single object', () => {
    const o = { id: 'a' };
    expect(flattenJoin(o)).toBe(o);
  });

  it('returns first element when input is an array', () => {
    const o1 = { id: 'a' };
    const o2 = { id: 'b' };
    expect(flattenJoin([o1, o2])).toBe(o1);
  });

  it('returns undefined for empty array', () => {
    expect(flattenJoin<unknown>([])).toBe(undefined);
  });

  it('handles primitives too', () => {
    expect(flattenJoin('hello')).toBe('hello');
    expect(flattenJoin([1, 2, 3])).toBe(1);
  });
});
