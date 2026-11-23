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
  startsInsideFloat,
  validateConverter,
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

  it('escrita que começa na 2ª metade de um float é reconhecida (não pode deslocar os valores)', () => {
    const rows = buildRows(grid({ start: 10, count: 2, write: true, formats: { 9: 'float' }, values: [1, 2] }));
    expect(startsInsideFloat(rows)).toBe(true);
    // sem o bloqueio, sairia um valor a menos do que a quantidade pedida
    expect(collectWrite(rows, editText, false, false)).toEqual({ values: [2] });
    expect(startsInsideFloat(buildRows(grid({ start: 9, count: 2, write: true, formats: { 9: 'float' } })))).toBe(false);
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

describe('session', () => {
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

describe('custom converters', () => {
  const sizes = { u32: 2, st: 1 };
  const conv = (over: Partial<Grid>) => grid({ count: 4, converters: { 1: 'u32' }, sizes, values: [9, 1, 2, 7], ...over });

  it('a célula inicial mostra o decode e as seguintes viram continuação', () => {
    const cells = buildRows(conv({ converted: { 1: { value: '65538' } } }))[0].cells;
    expect(cells.slice(0, 4).map((c) => [c.kind, c.text])).toEqual([
      ['value', '9'],
      ['value', '65538'],
      ['continuation', '—'],
      ['value', '7'],
    ]);
    expect(cells[1].tooltip).toBe('Address : 1 → 2 · u32');
  });

  it('erro do script vira ERR com a mensagem; pendente mostra -; erro de leitura mostra -/-', () => {
    const err = buildRows(conv({ converted: { 1: { error: 'u32.lua:3: boom' } } }))[0].cells[1];
    expect([err.text, err.error]).toEqual(['ERR', 'u32.lua:3: boom']);
    expect(buildRows(conv({}))[0].cells[1].text).toBe('-');
    expect(buildRows(conv({ valid: false, values: [] }))[0].cells[1].text).toBe('-/-');
    const missing = buildRows(conv({ converters: { 1: 'gone' } }))[0].cells[1];
    expect([missing.text, missing.error]).toEqual(['ERR', "Converter 'gone' not found"]);
  });

  it('cortado no fim do intervalo volta ao formato padrão; começo no meio vira continuação', () => {
    expect(buildRows(conv({ count: 2, values: [9, 1] }))[0].cells.slice(0, 2).map((c) => c.text)).toEqual(['9', '1']);
    const inside = buildRows(conv({ start: 2, count: 2, values: [2, 7] }))[0].cells;
    expect(inside.slice(2, 4).map((c) => c.kind)).toEqual(['continuation', 'value']);
    expect(startsInsideFloat(buildRows(conv({ start: 2, count: 2, values: [2, 7] })))).toBe(true);
  });

  it('bobinas ignoram converter', () => {
    expect(buildRows(conv({ bits: true, values: [1, 0, 1, 0] }))[0].cells[1].text).toBe('0');
  });

  it('escrita usa o que o encode devolveu; sem encode o campo é inválido', () => {
    const rows = buildRows(conv({ write: true, converted: { 1: { value: '65538' } } }));
    expect(collectWrite(rows, editText, false, false, { 1: [1, 2] })).toEqual({ values: [9, 1, 2, 7] });
    expect(collectWrite(rows, editText, false, false, {})).toEqual({ invalid: 1 });
  });

  it('não sobrepõe floats, formatos nem outros converters', () => {
    expect(validateConverter(5, 2, {}, {}, sizes)).toBeNull();
    expect(validateConverter(5, 2, { 4: 'float' }, {}, sizes)).toMatch(/consumed by float/);
    expect(validateConverter(5, 2, { 6: 'hex' }, {}, sizes)).toMatch(/Register 6 already/);
    expect(validateConverter(5, 2, {}, { 4: 'u32' }, sizes)).toMatch(/inside the converter at 4/);
    expect(validateConverter(4, 1, {}, { 4: 'u32' }, sizes)).toBeNull(); // troca o converter do próprio endereço
    expect(validateFormat(5, 'hex', {}, { 4: 'u32' }, sizes)).toMatch(/inside the converter/);
    expect(validateFormat(3, 'float', {}, { 4: 'st' }, sizes)).toMatch(/has a converter/);
  });
});

describe('converter como formato padrão', () => {
  const sizes = { u32: 2 };
  it('cobre em blocos os registradores sem formato próprio; o resto do fim volta ao padrão', () => {
    const g = grid({ count: 5, values: [0, 1, 2, 3, 4], defaultConverter: 'u32', sizes, formats: { 2: 'hex' }, converted: { 0: { value: '1' }, 3: { value: '12' } } });
    const cells = buildRows(g)[0].cells.slice(0, 5);
    expect(cells.map((c) => [c.kind, c.text])).toEqual([
      ['value', '1'],
      ['continuation', '—'],
      ['value', '0002'],
      ['value', '12'],
      ['continuation', '—'],
    ]);
    expect(cells[0].converter).toBe('u32');
    expect(cells[0].overridden).toBe(false); // padrão não leva *
    expect(cells[2].overridden).toBe(true);
  });

  it('o bloco não engole registrador com formato próprio: sem caber, fica o valor cru', () => {
    const g = grid({ count: 4, values: [0, 0x3f80, 0, 7], defaultConverter: 'u32', sizes, formats: { 1: 'float' } });
    const cells = buildRows(g)[0].cells.slice(0, 4);
    expect(cells.map((c) => [c.kind, c.text])).toEqual([
      ['value', '0'],
      ['value', '1'],
      ['continuation', '—'],
      ['value', '7'], // último do intervalo: o bloco de 2 não cabe
    ]);
    expect(cells[0].converter).toBeUndefined();
  });

  it('converter próprio vence o padrão; bobinas ignoram', () => {
    const g = grid({ count: 2, values: [1, 2], defaultConverter: 'u32', sizes: { u32: 2, one: 1 }, converters: { 0: 'one' } });
    expect(buildRows(g)[0].cells.slice(0, 2).map((c) => c.converter)).toEqual(['one', undefined]);
    expect(buildRows(grid({ count: 2, bits: true, values: [1, 0], defaultConverter: 'u32', sizes }))[0].cells[0].converter).toBeUndefined();
  });
});
