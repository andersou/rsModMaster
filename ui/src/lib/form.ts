// Regras dos campos da tela principal, sem UI: o que não vale fica marcado e bloqueia
// Read/Write/Scan, em vez de ser ajustado em silêncio (endereço errado num equipamento real).

import { t } from '../i18n';
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
  // em Hex, o `0x` já aparece ao lado do campo; colado junto também vale
  const t = hex ? text.trim().replace(/^0x/i, '') : text.trim();
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
  if (!digits(f.slave) || Number(f.slave) > maxSlave) errors.slave = t('validation.slaveRange', { label: f.mode === 'TCP' ? t('comm.unitId') : t('validation.slaveAddress'), max: maxSlave });
  if (!digits(f.scanRate) || Number(f.scanRate) < MIN_SCAN_MS) errors.scanRate = t('validation.scanRate', { min: MIN_SCAN_MS });
  const qtyOk = digits(f.qty) && Number(f.qty) >= f.spec.min && Number(f.qty) <= f.spec.max;
  if (!qtyOk) errors.qty = t('validation.quantity', { label: f.spec.quantityLabel, min: f.spec.min, max: f.spec.max });
  const start = parseAddress(f.start, f.addrHex);
  const base = digits(f.baseAddr) ? Number(f.baseAddr) : 0;
  if (start === null) errors.start = t(f.addrHex ? 'validation.startHex' : 'validation.startDec');
  else if (start < base) errors.start = t('validation.startBelowBase', { base });
  else if (start - base + (qtyOk ? Number(f.qty) : 1) - 1 > 65535) errors.start = t('validation.rangePastEnd');
  return errors;
}
