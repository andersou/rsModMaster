// Bus monitor: nome da função e os valores do quadro em Dec, Hex ou no formato da tabela (Custom).
import { t, tk } from '../i18n';
import { buildRows, type Converted, type Grid } from './registers';

export type ValueMode = 'dec' | 'hex' | 'custom';

/** Formatos da tabela quando o quadro chegou (sem valores nem intervalo). Cada quadro guarda o seu:
 *  mudar formato, endereço ou quantidade depois não reescreve o histórico. */
export type FrameFormat = Omit<Grid, 'values' | 'valid' | 'converted' | 'start' | 'count'>;

/** Registradores que os `values` do quadro trazem: endereço (da tabela) do primeiro e formatos. */
export interface FrameRegisters {
  start: number;
  format: FrameFormat;
}

/** Funções cujos `values` são registradores de 16 bits (as de bobina trazem bytes de bits). */
const REGISTER_FUNCTIONS = new Set([0x03, 0x04, 0x06, 0x10]);

export const field = (fields: readonly [string, string][], key: string) => fields.find(([k]) => k === key)?.[1];

/** `0x03` -> `0x03 Read Holding Registers`; numa exceção (`0x83`), o nome da função pedida. */
export function functionText(code: string): string {
  const fc = parseInt(code, 16);
  const name = Number.isNaN(fc) ? undefined : tk(`functions.f${(fc & 0x7f).toString(16).padStart(2, '0')}`);
  if (!name) return code;
  return fc & 0x80 ? `${code} ${name} · ${t('bus.exception')}` : `${code} ${name}`;
}

/** Os registradores do quadro, se os `values` forem registradores; `null` nos outros casos (bobinas,
 *  exceção, quantidade ímpar de bytes, endereço desconhecido). */
export function frameRegisters(fields: readonly [string, string][], start: number | undefined, format: FrameFormat): FrameRegisters | null {
  const fc = parseInt(field(fields, 'function') ?? '', 16);
  const bytes = field(fields, 'byteCount');
  if (start === undefined || !REGISTER_FUNCTIONS.has(fc) || (bytes !== undefined && Number(bytes) % 2)) return null;
  return { start, format };
}

/** Valores do quadro como o core os lê (registradores, ou bytes se a contagem for ímpar). */
export const frameValues = (text: string): number[] => text.split(',').map((v) => Number(v.trim()));

/** Custom: as células da tabela (`endereço: texto`), com os formatos guardados no quadro. */
export function customRows(values: readonly number[], regs: FrameRegisters, converted: Record<number, Converted> = {}) {
  const grid: Grid = { ...regs.format, bits: false, write: false, start: regs.start, count: values.length, values, valid: true, converted };
  return buildRows(grid)
    .flatMap((r) => r.cells)
    .filter((c) => c.kind === 'value');
}

export function valuesText(values: readonly number[], mode: ValueMode, regs: FrameRegisters | null, converted?: Record<number, Converted>): string {
  if (mode === 'custom' && regs) return customRows(values, regs, converted).map((c) => `${c.address}: ${c.text}`).join(', ');
  if (mode === 'hex') {
    const digits = regs || values.some((v) => v > 0xff) ? 4 : 2;
    return values.map((v) => `0x${v.toString(16).toUpperCase().padStart(digits, '0')}`).join(', ');
  }
  return values.join(', ');
}
