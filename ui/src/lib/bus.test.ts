import { describe, expect, it } from 'vitest';
import { type FrameFormat, frameRegisters, frameValues, functionText, valuesText } from './bus';

const format: FrameFormat = {
  bits: false,
  write: false,
  signed: false,
  defaultBase: 'dec',
  defaultEndian: 0,
  formats: { 11: 'float', 13: 'hex' },
  endians: {},
};
const fc03 = (bytes: number): [string, string][] => [['function', '0x03'], ['byteCount', String(bytes)], ['values', '1']];

describe('bus monitor', () => {
  it('names the function, and the requested one in an exception', () => {
    expect(functionText('0x03')).toBe('0x03 Read Holding Registers');
    expect(functionText('0x0F')).toBe('0x0F Write Multiple Coils');
    expect(functionText('0x83')).toBe('0x83 Read Holding Registers · exception');
    expect(functionText('0x2B')).toBe('0x2B');
  });

  it('only register frames with a known address get the table formats', () => {
    expect(frameRegisters(fc03(4), 10, format)).toEqual({ start: 10, format });
    expect(frameRegisters(fc03(4), undefined, format)).toBeNull();
    expect(frameRegisters(fc03(3), 10, format)).toBeNull(); // bytes, não registradores
    expect(frameRegisters([['function', '0x01']], 10, format)).toBeNull();
    expect(frameRegisters([['function', '0x83']], 10, format)).toBeNull();
  });

  it('shows the values in dec, hex or as the table did when the frame arrived', () => {
    // 10 = 7, 11..12 = float 1.5 (0x3FC0 0x0000), 13 = 255 em hex
    const values = frameValues('7, 16320, 0, 255');
    const regs = frameRegisters(fc03(8), 10, format);
    expect(valuesText(values, 'dec', regs)).toBe('7, 16320, 0, 255');
    expect(valuesText(values, 'hex', regs)).toBe('0x0007, 0x3FC0, 0x0000, 0x00FF');
    expect(valuesText(values, 'custom', regs)).toBe('10: 7, 11: 1.5, 13: 00ff'); // como a célula da tabela
    // sem registradores (bobinas, endereço desconhecido), Custom cai em decimal
    expect(valuesText(values, 'custom', null)).toBe('7, 16320, 0, 255');
    expect(valuesText([1, 255], 'hex', null)).toBe('0x01, 0xFF');
  });
});
