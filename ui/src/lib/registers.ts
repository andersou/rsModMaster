// Regras da tabela de registradores, sem UI: funções Modbus, formatos (Bin/Dec/Hex/Float),
// pares float de 32 bits nas 4 ordens de byte, a grade de 10 colunas e a leitura do que o usuário
// digitou para escrever. Porte do registers.py do fModMaster.

export type Base = 'bin' | 'dec' | 'hex' | 'float';
/** Ordem dos bytes do float, como no libmodbus: 0 ABCD, 1 DCBA, 2 BADC, 3 CDAB. */
export type Endian = 0 | 1 | 2 | 3;

export const ENDIAN_LABELS = ['ABCD (BE_BE)', 'DCBA (LE_LE)', 'BADC (BE_LE)', 'CDAB (LE_BE)'] as const;
export const BASE_LABELS: Record<Base, string> = { bin: 'Bin', dec: 'Dec', hex: 'Hex', float: 'Float' };

// No INI há duas codificações: `[Session] Base` usa o índice do qModMaster; `[RegisterFormats]`
// usa o valor do enum do fModMaster (a base numérica, 3 = float).
const SESSION_BASES: Record<number, Base> = { 0: 'hex', 1: 'dec', 2: 'bin', 3: 'float', 10: 'dec', 16: 'hex' };
export const baseFromSession = (n: number): Base => SESSION_BASES[n] ?? 'dec';
export const baseToSession = (b: Base): number => ({ hex: 0, dec: 1, bin: 2, float: 3 })[b];
const FORMAT_BASES: Record<number, Base> = { 2: 'bin', 10: 'dec', 16: 'hex', 3: 'float' };
export const baseFromFormat = (n: number): Base | undefined => FORMAT_BASES[n];
export const baseToFormat = (b: Base): number => ({ bin: 2, dec: 10, hex: 16, float: 3 })[b];
export const toEndian = (n: number | undefined): Endian => (n === 1 || n === 2 || n === 3 ? n : 0);

export interface FunctionSpec {
  code: number;
  name: string;
  /** bobinas/entradas discretas: valores 0/1, sem formato */
  bits: boolean;
  min: number;
  max: number;
  quantityLabel: string;
  write: boolean;
}

const fn = (code: number, name: string, bits: boolean, min: number, max: number, write = false): FunctionSpec => ({
  code,
  name,
  bits,
  min,
  max,
  quantityLabel: bits ? 'Number of Coils' : 'Number of Registers',
  write,
});

/** Na ordem do qModMaster: `[Session] FunctionCode` guarda o índice nesta lista. */
export const FUNCTIONS: readonly FunctionSpec[] = [
  fn(0x01, 'Read Coils', true, 1, 2000),
  fn(0x02, 'Read Discrete Inputs', true, 1, 2000),
  fn(0x03, 'Read Holding Registers', false, 1, 125),
  fn(0x04, 'Read Input Registers', false, 1, 125),
  fn(0x05, 'Write Single Coil', true, 1, 1, true),
  fn(0x06, 'Write Single Register', false, 1, 1, true),
  fn(0x0f, 'Write Multiple Coils', true, 2, 1968, true),
  fn(0x10, 'Write Multiple Registers', false, 2, 123, true),
];

export const functionSpec = (code: number) => FUNCTIONS.find((f) => f.code === code) ?? FUNCTIONS[0];
/** Índice salvo no INI; 15 e 16 também são aceitos como o próprio código. */
export const functionFromSetting = (raw: number) => (raw === 0x0f || raw === 0x10 ? functionSpec(raw) : (FUNCTIONS[raw] ?? FUNCTIONS[0]));
export const functionIndex = (code: number) => Math.max(0, FUNCTIONS.findIndex((f) => f.code === code));
export const clampQuantity = (qty: number, spec: FunctionSpec) => Math.min(Math.max(Number.isFinite(qty) ? qty : spec.min, spec.min), spec.max);

// ---- float de 32 bits em dois registradores ----

/** Bytes A B C D (big-endian) do float, na ordem em que vão para os dois registradores. */
const ORDER: Record<Endian, readonly number[]> = { 0: [0, 1, 2, 3], 1: [3, 2, 1, 0], 2: [1, 0, 3, 2], 3: [2, 3, 0, 1] };

export function floatFromRegs(reg0: number, reg1: number, endian: Endian): number {
  const wire = [reg0 >> 8, reg0 & 0xff, reg1 >> 8, reg1 & 0xff];
  const view = new DataView(new ArrayBuffer(4));
  ORDER[endian].forEach((abcd, i) => view.setUint8(abcd, wire[i]));
  return view.getFloat32(0);
}

export function floatToRegs(value: number, endian: Endian): [number, number] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  const wire = ORDER[endian].map((abcd) => view.getUint8(abcd));
  return [(wire[0] << 8) | wire[1], (wire[2] << 8) | wire[3]];
}

/** `%.6g` do Python: 6 dígitos significativos, sem zeros à direita. */
export function formatFloat(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  const [mantissa, exp] = value.toExponential(5).split('e');
  const e = Number(exp);
  const trim = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  if (e < -4 || e >= 6) return `${trim(mantissa)}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
  return trim(value.toFixed(5 - e));
}

// ---- valores de 16 bits ----

export function formatValue(value: number, base: Base, bits: boolean, signed: boolean): string {
  const u = value & 0xffff;
  if (bits) return String(value ? 1 : 0);
  switch (base) {
    case 'bin':
      return u.toString(2).padStart(16, '0');
    case 'hex':
      return u.toString(16).padStart(4, '0');
    default: // dec, e o float sem par (último registrador de uma quantidade ímpar)
      return String(signed && base === 'dec' && u >= 0x8000 ? u - 0x10000 : u);
  }
}

/** Valor digitado para escrever, já como u16; `null` se inválido. */
export function parseValue(raw: string, base: Base, bits: boolean, signed: boolean): number | null {
  const text = raw.trim();
  if (bits) return text === '0' || text === '1' ? Number(text) : null;
  if (base === 'bin') return /^[01]{1,16}$/.test(text) ? parseInt(text, 2) : null;
  if (base === 'hex') return /^[0-9a-f]{1,4}$/i.test(text) ? parseInt(text, 16) : null;
  if (!/^-?\d{1,6}$/.test(text)) return null;
  const n = Number(text);
  const [lo, hi] = signed && base === 'dec' ? [-32768, 32767] : [0, 65535];
  return n >= lo && n <= hi ? n & 0xffff : null;
}

/** Float digitado: número decimal finito dentro do float32 (sem `inf`, `nan` ou hexadecimal). */
export function parseFloat32(raw: string): number | null {
  const text = raw.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && Math.abs(n) <= 3.4e38 ? n : null;
}

export const maxLength = (base: Base, bits: boolean, signed: boolean) =>
  bits ? 1 : base === 'float' ? 20 : base === 'bin' ? 16 : base === 'hex' ? 4 : signed ? 6 : 5;

// ---- grade ----

export const GRID_WIDTH = 10;

export interface Grid {
  start: number;
  count: number;
  bits: boolean;
  write: boolean;
  signed: boolean;
  defaultBase: Base;
  defaultEndian: Endian;
  /** formato por endereço, quando difere do padrão */
  formats: Record<number, Base>;
  endians: Record<number, Endian>;
  values: readonly number[];
  /** `false` depois de um erro: as células mostram "-/-" */
  valid: boolean;
}

export interface Cell {
  address: number;
  kind: 'unused' | 'value' | 'continuation';
  text: string;
  /** formato usado para mostrar e para ler o que for digitado */
  base: Base;
  endian: Endian;
  editable: boolean;
  /** valor real lido (para o campo de escrita começar vazio quando não há) */
  hasValue: boolean;
  /** formato próprio, diferente do padrão (borda na tela) */
  overridden: boolean;
  tooltip: string;
}

export interface Row {
  address: number;
  cells: Cell[];
}

/** Os 2 registradores de um float: o primeiro mostra o valor, o segundo vira "—". */
export function buildRows(grid: Grid): Row[] {
  const { start, count, formats } = grid;
  const formatAt = (a: number): Base => (grid.bits ? 'dec' : (formats[a] ?? grid.defaultBase));
  const endianAt = (a: number) => grid.endians[a] ?? grid.defaultEndian;
  const used = new Map<number, Cell>();
  for (let i = 0; i < count; i++) {
    const address = start + i;
    const value = grid.values[i];
    const base = formatAt(address);
    const tooltip = `Address : ${address}`;
    // continuação de um float que começa antes do intervalo lido
    if (i === 0 && !grid.bits && formats[address - 1] === 'float') {
      used.set(address, continuation(address, base, endianAt(address), tooltip, value !== undefined));
      continue;
    }
    const paired = base === 'float' && i < count - 1;
    const missing = value === undefined || (paired && grid.values[i + 1] === undefined);
    let text: string;
    if (!grid.valid) text = '-/-';
    else if (missing) text = '-';
    else if (paired) text = formatFloat(floatFromRegs(value, grid.values[i + 1], endianAt(address)));
    else text = formatValue(value, base === 'float' ? 'dec' : base, grid.bits, grid.signed);
    used.set(address, {
      address,
      kind: 'value',
      text,
      base: paired ? 'float' : base === 'float' ? 'dec' : base,
      endian: endianAt(address),
      editable: grid.write,
      hasValue: grid.valid && !missing,
      overridden: formats[address] !== undefined && formats[address] !== grid.defaultBase,
      tooltip: paired ? `${tooltip} → ${address + 1}` : tooltip,
    });
    if (paired) {
      const next = address + 1;
      const cell = continuation(next, 'float', endianAt(address), `Address : ${next}`, grid.values[i + 1] !== undefined);
      cell.overridden = formats[address] !== undefined;
      used.set(next, cell);
      i++;
    }
  }
  const rows: Row[] = [];
  if (count === 1) return [{ address: start, cells: [used.get(start)!] }];
  const first = start - (start % GRID_WIDTH);
  for (let row = first; row < start + count; row += GRID_WIDTH) {
    const cells = Array.from({ length: GRID_WIDTH }, (_, col) => used.get(row + col) ?? unused(row + col));
    rows.push({ address: row, cells });
  }
  return rows;
}

const continuation = (address: number, base: Base, endian: Endian, tooltip: string, hasValue: boolean): Cell => ({
  address,
  kind: 'continuation',
  text: '—',
  base,
  endian,
  editable: false,
  hasValue,
  overridden: false,
  tooltip,
});

const unused = (address: number): Cell => ({
  address,
  kind: 'unused',
  text: 'x',
  base: 'dec',
  endian: 0,
  editable: false,
  hasValue: false,
  overridden: false,
  tooltip: '',
});

/** A primeira célula é a 2ª metade de um float que começa antes do intervalo: escrever a partir
 *  dela deslocaria todos os valores. */
export const startsInsideFloat = (rows: Row[]) => rows.flatMap((r) => r.cells).find((c) => c.kind !== 'unused')?.kind === 'continuation';

/** Algum registrador seria escrito como float (o Write Single Register não consegue). */
export const hasFloat = (rows: Row[]) => rows.some((r) => r.cells.some((c) => c.kind === 'value' && c.base === 'float'));

/** Texto inicial do campo de escrita: vazio quando não há valor lido. */
export const editText = (cell: Cell) => (cell.hasValue ? cell.text : '');

/** Lê os campos de escrita na ordem dos registradores. Inválido: o endereço do primeiro campo ruim. */
export function collectWrite(
  rows: Row[],
  text: (cell: Cell) => string,
  bits: boolean,
  signed: boolean,
): { values: number[] } | { invalid: number } {
  const values: number[] = [];
  for (const cell of rows.flatMap((r) => r.cells)) {
    if (cell.kind !== 'value') continue;
    if (cell.base === 'float') {
      const parsed = parseFloat32(text(cell));
      if (parsed === null) return { invalid: cell.address };
      values.push(...floatToRegs(parsed, cell.endian));
    } else {
      const parsed = parseValue(text(cell), cell.base, bits, signed);
      if (parsed === null) return { invalid: cell.address };
      values.push(parsed);
    }
  }
  return { values };
}

/** Campo em branco não é erro (ainda não foi preenchido); só o que foi digitado e não vale. */
export function inputValid(cell: Cell, raw: string, bits: boolean, signed: boolean): boolean {
  if (!raw.trim()) return true;
  return cell.base === 'float' ? parseFloat32(raw) !== null : parseValue(raw, cell.base, bits, signed) !== null;
}

/** Mensagem se não der para usar `base` em `address` (o registrador já é a 2ª metade de um float,
 *  ou o float passaria por cima de um formato escolhido no seguinte). */
export function validateFormat(address: number, base: Base, formats: Record<number, Base>): string | null {
  if (formats[address - 1] === 'float') return `Register ${address} is consumed by float at address ${address - 1}`;
  const next = formats[address + 1];
  if (base === 'float' && next !== undefined && next !== 'float') {
    return `Register ${address + 1} already has an explicit format; cannot extend float at address ${address}`;
  }
  return null;
}

/** Cabeçalho da linha / endereço, em decimal (2 dígitos no mínimo) ou hexadecimal. */
export const formatAddress = (address: number, hex: boolean) => (hex ? address.toString(16).toUpperCase() : String(address).padStart(2, '0'));
