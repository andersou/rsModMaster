import { describe, expect, it } from 'vitest';
import { isNewer, parseVersion } from './update';

describe('update check', () => {
  it('parses release tags', () => {
    expect(parseVersion('v0.5.1')).toEqual([0, 5, 1]);
    expect(parseVersion('1.10.0')).toEqual([1, 10, 0]);
    expect(parseVersion('v1.0.0-beta.1')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
  });

  it('compares numerically, not as text', () => {
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v1.0.0', '0.99.0')).toBe(true);
    expect(isNewer('v0.5.1', '0.5.1')).toBe(false);
    expect(isNewer('v0.5.0', '0.5.1')).toBe(false);
    expect(isNewer('garbage', '0.5.1')).toBe(false);
  });
});
