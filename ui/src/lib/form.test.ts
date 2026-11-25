import { describe, expect, it } from 'vitest';
import { convertAddress, parseAddress, validateForm } from './form';
import { functionSpec } from './registers';

const base = { mode: 'RTU' as const, slave: '1', scanRate: '1000', start: '0', addrHex: false, qty: '10', baseAddr: '0', spec: functionSpec(3) };

describe('campos da tela', () => {
  it('formulário válido não tem erros', () => {
    expect(validateForm(base)).toEqual({});
  });

  it('marca lixo em vez de ajustar em silêncio', () => {
    expect(Object.keys(validateForm({ ...base, slave: '300' }))).toEqual(['slave']);
    expect(validateForm({ ...base, slave: '255', mode: 'TCP' })).toEqual({});
    expect(Object.keys(validateForm({ ...base, slave: 'abc', scanRate: '10', qty: '200', start: '1A' }))).toEqual(['slave', 'scanRate', 'qty', 'start']);
  });

  it('endereço abaixo do Base Addr ou passando de 65535', () => {
    expect(validateForm({ ...base, start: '5', baseAddr: '10' }).start).toMatch(/below Base Addr/);
    expect(validateForm({ ...base, start: '65530', qty: '10' }).start).toMatch(/65535/);
    expect(validateForm({ ...base, start: '1A', addrHex: true })).toEqual({});
  });

  it('alternar Dec/Hex converte o texto, não reinterpreta', () => {
    expect(parseAddress('500', false)).toBe(500);
    expect(parseAddress('0x1F4', true)).toBe(500);
    expect(parseAddress('0x', true)).toBeNull();
    expect(convertAddress('500', false)).toBe('1F4');
    expect(convertAddress('1F4', true)).toBe('500');
    expect(convertAddress('zz', false)).toBe('zz');
  });
});
