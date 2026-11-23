import { describe, expect, it } from 'vitest';
import {
  baseFromSession,
  baseToSession,
  buildRows,
  collectWrite,
  editText,
  type Endian,
  floatFromRegs,
  floatToRegs,
  formatFloat,
  formatValue,
  functionFromSetting,
  type Grid,
  hasFloat,
  inputValid,
  parseFloat32,
  parseValue,
  validateFormat,
} from './registers';

const grid = (over: Partial<Grid>): Grid => ({
  start: 0,
  count: 1,
  bits: false,
  write: false,
  signed: false,
  defaultBase: 'dec',
  defaultEndian: 0,
  formats: {},
  endians: {},
  values: [],
  valid: true,
  ...over,
});
const texts = (g: Grid) => buildRows(g).flatMap((r) => r.cells.map((c) => c.text));

describe('formatos de 16 bits', () => {
  it('mostra hex, dec com e sem sinal e bin como o fModMaster', () => {
    expect(formatValue(255, 'hex', false, false)).toBe('00ff');
    expect(formatValue(-1, 'dec', false, true)).toBe('-1');
    expect(formatValue(-1, 'dec', false, false)).toBe('65535');
    expect(formatValue(5, 'bin', false, false)).toBe('0000000000000101');
    expect(formatValue(1, 'bin', true, false)).toBe('1');
  });

  it('lê o digitado dentro da faixa de cada formato', () => {
    expect(parseValue('ffff', 'hex', false, false)).toBe(0xffff);
    expect(parseValue('10000', 'hex', false, false)).toBeNull();
    expect(parseValue('-1', 'dec', false, true)).toBe(0xffff); // vai ao escravo como u16
    expect(parseValue('-1', 'dec', false, false)).toBeNull();
    expect(parseValue('65536', 'dec', false, false)).toBeNull();
    expect(parseValue('101', 'bin', false, false)).toBe(5);
    expect(parseValue('2', 'bin', false, false)).toBeNull();
    expect(parseValue('1', 'dec', true, false)).toBe(1);
    expect(parseValue('2', 'dec', true, false)).toBeNull();
    expect(parseValue('', 'dec', false, false)).toBeNull();
  });
});

describe('float de 32 bits', () => {
  it('lê 1.0 nas 4 ordens de byte (libmodbus)', () => {
    expect(floatFromRegs(0x3f80, 0x0000, 0)).toBe(1);
    expect(floatFromRegs(0x0000, 0x803f, 1)).toBe(1);
    expect(floatFromRegs(0x803f, 0x0000, 2)).toBe(1);
    expect(floatFromRegs(0x0000, 0x3f80, 3)).toBe(1);
    expect(floatFromRegs(0xc148, 0x0000, 0)).toBe(-12.5);
  });

  it('ida e volta em todas as ordens', () => {
    for (const endian of [0, 1, 2, 3] as Endian[]) {
      const [r0, r1] = floatToRegs(-273.15, endian);
      expect(floatFromRegs(r0, r1, endian)).toBeCloseTo(-273.15, 4);
    }
    expect(floatToRegs(1, 0)).toEqual([0x3f80, 0]);
    expect(floatToRegs(1, 1)).toEqual([0, 0x803f]);
  });

  it('formata como o %.6g do Python', () => {
    expect(formatFloat(1)).toBe('1');
    expect(formatFloat(-273.149994)).toBe('-273.15');
    expect(formatFloat(1234567)).toBe('1.23457e+06');
    expect(formatFloat(0.0001)).toBe('0.0001');
    expect(formatFloat(0.00001234)).toBe('1.234e-05');
    expect(formatFloat(NaN)).toBe('nan');
    expect(formatFloat(-Infinity)).toBe('-inf');
  });

  it('aceita só float32 decimal finito', () => {
    expect(parseFloat32(' 1.5e3 ')).toBe(1500);
    expect(parseFloat32('.5')).toBe(0.5);
    for (const bad of ['', 'inf', 'nan', '0x10', '1e39', '1,5']) expect(parseFloat32(bad)).toBeNull();
  });
});

describe('grade', () => {
  it('10 colunas alinhadas ao endereço, com x fora do intervalo', () => {
    const rows = buildRows(grid({ start: 12, count: 5 }));
    expect(rows.map((r) => r.address)).toEqual([10]);
    expect(texts(grid({ start: 12, count: 5 }))).toEqual(['x', 'x', '-', '-', '-', '-', '-', 'x', 'x', 'x']);
    expect(buildRows(grid({ start: 8, count: 4 })).map((r) => r.address)).toEqual([0, 10]);
  });

  it('um registrador só: uma célula, sem grade', () => {
    const rows = buildRows(grid({ start: 15, count: 1, values: [255], defaultBase: 'hex' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.map((c) => c.text)).toEqual(['00ff']);
  });

  it('erro mostra -/-; tabela limpa mostra -', () => {
    expect(texts(grid({ count: 1, values: [], valid: false }))).toEqual(['-/-']);
    expect(texts(grid({ count: 1, values: [] }))).toEqual(['-']);
  });

  it('float em toda a grade: pares, com o último ímpar como inteiro', () => {
    const g = grid({ count: 3, defaultBase: 'float', values: [0x3f80, 0, 42] });
    expect(texts(g).slice(0, 3)).toEqual(['1', '—', '42']);
    const first = buildRows(g)[0].cells[0];
    expect(first.tooltip).toBe('Address : 0 → 1');
  });

  it('float por endereço com a própria ordem de bytes', () => {
    const g = grid({ start: 58, count: 4, formats: { 59: 'float' }, endians: { 59: 3 }, values: [7, 0, 0x3f80, 9] });
    expect(texts(g).slice(8, 10)).toEqual(['7', '1']);
    expect(buildRows(g)[1].cells.slice(0, 2).map((c) => c.text)).toEqual(['—', '9']);
    const owner = buildRows(g)[0].cells[9];
    expect([owner.base, owner.endian, owner.overridden]).toEqual(['float', 3, true]);
  });

  it('intervalo que começa na 2ª metade de um float', () => {
    const cells = buildRows(grid({ start: 59, count: 2, formats: { 58: 'float' }, values: [1, 2] }))[0].cells;
    expect(cells.slice(9).map((c) => [c.kind, c.text])).toEqual([['continuation', '—']]);
  });

  it('bobinas ignoram formato e float', () => {
    expect(texts(grid({ count: 2, bits: true, defaultBase: 'float', values: [1, 0] })).slice(0, 2)).toEqual(['1', '0']);
  });
});

describe('escrita', () => {
  it('lê os campos em ordem, float vira dois registradores', () => {
    const g = grid({ count: 3, write: true, formats: { 1: 'float' }, values: [5, 0x3f80, 0] });
    const rows = buildRows(g);
    expect(hasFloat(rows)).toBe(true);
    const typed: Record<number, string> = { 0: '7', 1: '-12.5' };
    expect(collectWrite(rows, (c) => typed[c.address] ?? editText(c), false, false)).toEqual({ values: [7, 0xc148, 0] });
  });

  it('o primeiro campo inválido é apontado', () => {
    const rows = buildRows(grid({ count: 2, write: true, defaultBase: 'hex', values: [1, 2] }));
    expect(collectWrite(rows, (c) => (c.address === 1 ? 'zz' : editText(c)), false, false)).toEqual({ invalid: 1 });
  });

  it('sem valor lido o campo começa vazio e não fica vermelho', () => {
    const [cell] = buildRows(grid({ count: 1, write: true, valid: false }))[0].cells;
    expect(editText(cell)).toBe('');
    expect(inputValid(cell, '', false, false)).toBe(true);
    expect(inputValid(cell, 'x', false, false)).toBe(false);
  });

  it('formato por endereço não pode cobrir metade de float', () => {
    expect(validateFormat(11, 'hex', { 10: 'float' })).toBe('Register 11 is consumed by float at address 10');
    expect(validateFormat(10, 'float', { 11: 'bin' })).toMatch(/Register 11 already has an explicit format/);
    expect(validateFormat(10, 'float', {})).toBeNull();
  });
});

describe('INI', () => {
  it('Base da sessão no índice do qModMaster (Hex = 0 volta como Hex)', () => {
    for (const b of ['bin', 'dec', 'hex', 'float'] as const) expect(baseFromSession(baseToSession(b))).toBe(b);
    expect(baseFromSession(16)).toBe('hex');
  });

  it('FunctionCode é o índice na lista; 15 e 16 valem como código', () => {
    expect(functionFromSetting(2).code).toBe(3);
    expect(functionFromSetting(15).code).toBe(0x0f);
    expect(functionFromSetting(99).code).toBe(1);
  });
});
