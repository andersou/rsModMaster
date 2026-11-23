// Regras dos campos da tela principal, sem UI: o que não vale fica marcado e bloqueia
// Read/Write/Scan, em vez de ser ajustado em silêncio (endereço errado num equipamento real).

import type { FunctionSpec } from './registers';

export const MIN_SCAN_MS = 50;

export interface FormInput {
  mode: 'RTU' | 'TCP';
  slave: string;
  scanRate: string;
  start: string;
  addrHex: boolean;
  qty: string;
  baseAddr: string;
  spec: FunctionSpec;
}

export type FormErrors = Partial<Record<'slave' | 'scanRate' | 'start' | 'qty', string>>;

const digits = (text: string) => /^\d+$/.test(text.trim());

/** Endereço digitado em decimal ou hexadecimal; `null` se não for um número inteiro nessa base. */
export function parseAddress(text: string, hex: boolean): number | null {
  const t = text.trim();
  if (!(hex ? /^[0-9a-f]+$/i : /^\d+$/).test(t)) return null;
  return parseInt(t, hex ? 16 : 10);
}

/** Texto do endereço na outra base, ao alternar Dec/Hex (o valor continua o mesmo). */
export function convertAddress(text: string, fromHex: boolean): string {
  const n = parseAddress(text, fromHex);
  return n === null ? text : fromHex ? String(n) : n.toString(16).toUpperCase();
}

export function validateForm(f: FormInput): FormErrors {
  const errors: FormErrors = {};
  const maxSlave = f.mode === 'TCP' ? 255 : 247;
  if (!digits(f.slave) || Number(f.slave) > maxSlave) errors.slave = `${f.mode === 'TCP' ? 'Unit ID' : 'Slave address'} must be 0–${maxSlave}`;
  if (!digits(f.scanRate) || Number(f.scanRate) < MIN_SCAN_MS) errors.scanRate = `Scan rate must be at least ${MIN_SCAN_MS} ms`;
  const qtyOk = digits(f.qty) && Number(f.qty) >= f.spec.min && Number(f.qty) <= f.spec.max;
  if (!qtyOk) errors.qty = `${f.spec.quantityLabel} must be ${f.spec.min}–${f.spec.max}`;
  const start = parseAddress(f.start, f.addrHex);
  const base = digits(f.baseAddr) ? Number(f.baseAddr) : 0;
  if (start === null) errors.start = `Start address must be a ${f.addrHex ? 'hexadecimal' : 'decimal'} number`;
  else if (start < base) errors.start = `Start address is below Base Addr (${base})`;
  else if (start - base + (qtyOk ? Number(f.qty) : 1) - 1 > 65535) errors.start = 'The range goes past address 65535';
  return errors;
}
