import { describe, expect, it } from 'vitest';
import { emptyChart, fillSample, freeSlot, laneValue, lastValue, MAX_ROWS, pushSample, resetColumn } from './chart';
import { buildRows, type Grid, parseNumber } from './registers';

describe('histórico do gráfico', () => {
  it('grava amostras e começa série nova com lacunas no passado', () => {
    const data = emptyChart();
    pushSample(data, 1000, new Map([[10, 1]]), [10]);
    pushSample(data, 2000, new Map([[10, 2], [11, 5]]), [10, 11]);
    expect(data.t).toEqual([1000, 2000]);
    expect(data.cols.get(10)).toEqual([1, 2]);
    expect(data.cols.get(11)).toEqual([null, 5]);
  });

  it('instante repetido ou para trás vira +1 (X crescente)', () => {
    const data = emptyChart();
    expect(pushSample(data, 1000, new Map(), [1])).toBe(1000);
    expect(pushSample(data, 1000, new Map(), [1])).toBe(1001);
    expect(pushSample(data, 900, new Map(), [1])).toBe(1002);
  });

  it('preenche depois o valor do converter na linha certa, mesmo fora de ordem', () => {
    const data = emptyChart();
    const a = pushSample(data, 1000, new Map([[5, null]]), [5]);
    const b = pushSample(data, 1050, new Map([[5, null]]), [5]);
    expect(fillSample(data, b, 5, 20)).toBe(true);
    expect(fillSample(data, a, 5, 10)).toBe(true);
    expect(data.cols.get(5)).toEqual([10, 20]);
    expect(fillSample(data, 999, 5, 1)).toBe(false);
    expect(fillSample(data, a, 6, 1)).toBe(false);
  });

  it('corta o histórico no limite', () => {
    const data = emptyChart();
    for (let i = 0; i < MAX_ROWS * 1.05 + 1; i++) pushSample(data, i, new Map([[1, i]]), [1]);
    expect(data.t.length).toBe(MAX_ROWS);
    expect(data.cols.get(1)![0]).toBe(data.t[0]);
  });

  it('formato trocado zera a série; cores livres; último valor; faixas de bobina', () => {
    const data = emptyChart();
    pushSample(data, 1, new Map([[1, 3]]), [1]);
    resetColumn(data, 1);
    expect(data.cols.get(1)).toEqual([null]);
    expect(freeSlot([0, 1, 3])).toBe(2);
    expect(freeSlot([0, 1, 2, 3, 4, 5, 6, 7])).toBeNull();
    expect(lastValue([1, 2, null])).toBe(2);
    expect(lastValue([null])).toBeNull();
    expect([laneValue(2, 1), laneValue(2, 0), laneValue(0, null)]).toEqual([2.8, 2, null]);
  });
});

describe('valor numérico das células', () => {
  const grid = (over: Partial<Grid>): Grid => ({
    start: 0, count: 3, bits: false, write: false, signed: false, defaultBase: 'dec', defaultEndian: 0,
    formats: {}, endians: {}, values: [], valid: true, ...over,
  });
  const nums = (g: Grid) => buildRows(g)[0].cells.slice(0, g.count).map((c) => c.num);

  it('é o mesmo número em Dec, Hex e Bin; com sinal quando a tabela mostra com sinal', () => {
    expect(nums(grid({ values: [0xffff, 10, 255], formats: { 1: 'hex', 2: 'bin' } }))).toEqual([65535, 10, 255]);
    expect(nums(grid({ values: [0xffff, 10, 255], signed: true }))).toEqual([-1, 10, 255]);
  });

  it('float usa os dois registradores; continuação e erro não têm número', () => {
    expect(nums(grid({ values: [0x3f80, 0, 7], formats: { 0: 'float' } }))).toEqual([1, undefined, 7]);
    expect(nums(grid({ values: [], valid: false }))).toEqual([undefined, undefined, undefined]);
  });

  it('converter: só texto numérico vira número', () => {
    const conv = (value: string) => nums(grid({ count: 1, values: [1], converters: { 0: 'c' }, sizes: { c: 1 }, converted: { 0: { value } } }))[0];
    expect(conv('21.5')).toBe(21.5);
    expect(conv('RUN|ALARM')).toBeUndefined();
    expect(conv('')).toBeUndefined();
    expect(parseNumber('1e+20')).toBe(1e20);
    expect(parseNumber('inf')).toBeNull();
  });

  it('bobinas: 0 ou 1', () => {
    expect(nums(grid({ bits: true, values: [1, 0, 1] }))).toEqual([1, 0, 1]);
  });
});
