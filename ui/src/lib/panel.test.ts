import { describe, expect, it } from 'vitest';
import { clampHeight } from './panel';

describe('panel height', () => {
  it('stays between the minimum and almost the whole window', () => {
    expect(clampHeight(300, 900)).toBe(300);
    expect(clampHeight(50, 900)).toBe(120);
    expect(clampHeight(2000, 900)).toBe(900 - 88); // barra de título e de status continuam visíveis
  });
});
