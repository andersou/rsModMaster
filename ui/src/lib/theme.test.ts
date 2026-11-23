import { describe, expect, it } from 'vitest';
import { parseThemePref, resolveTheme } from './theme';

describe('tema', () => {
  it('System segue o sistema; Light e Dark fixam', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('preferência gravada inválida volta a System', () => {
    expect(parseThemePref('dark')).toBe('dark');
    expect(parseThemePref(null)).toBe('system');
    expect(parseThemePref('blue')).toBe('system');
  });
});
