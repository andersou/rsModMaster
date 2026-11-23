// Estado da tela em sinais e stores, e as ações que chamam o core. Porte do MainViewController do
// fModMaster: os mesmos estados (desconectado, conectado, em scan) e as mesmas regras.

import { createMemo, createSignal } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import { api } from './api';
import {
  type Base,
  baseFromFormat,
  baseFromSession,
  baseToFormat,
  baseToSession,
  buildRows,
  type Cell,
  clampQuantity,
  collectWrite,
  type Endian,
  editText,
  functionFromSetting,
  functionIndex,
  functionSpec,
  type Grid,
  hasFloat,
  startsInsideFloat,
  toEndian,
  validateFormat,
} from './lib/registers';
import { convertAddress, type FormErrors, parseAddress, validateForm } from './lib/form';
import type { CoreEvent, Outcome, Request, Settings } from './lib/types';
import { toast } from './toasts';

export type Mode = 'RTU' | 'TCP';
export type DialogName = 'settings' | 'bus' | 'tools' | 'about';

export interface RawLine {
  type: 'Tx' | 'Rx';
  at: number;
  mode: string;
  hex: string;
  detail: string;
}

const FLOAT_NEEDS_FC10 = 'Float requires Write Multiple Registers (FC 10): the register is a 32-bit float.';

const int = (raw: string | number, fallback: number) => {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
};

// ---- estado ----

const [settings, setSettings] = createStore<Settings>({} as Settings);
const [loaded, setLoaded] = createSignal(false);

/** Campos da tela como o usuário digitou (validados ao usar). */
const [form, setForm] = createStore({
  mode: 'RTU' as Mode,
  slave: '1',
  scanRate: '1000',
  fn: 0x01,
  start: '0',
  addrHex: false,
  qty: '1',
  format: 'dec' as Base,
  signed: false,
});

const [connected, setConnected] = createSignal<Mode | null>(null);
const [scanning, setScanning] = createSignal(false);
const [busy, setBusy] = createSignal(false);
const [counters, setCounters] = createSignal({ packets: 0, errors: 0 });
/** valores da última transação; `valid: false` depois de um erro */
const [table, setTable] = createSignal<{ values: number[]; valid: boolean }>({ values: [], valid: true });
const [edits, setEdits] = createStore<Record<number, string>>({});
const [invalidCell, setInvalidCell] = createSignal<number | null>(null);
const [raw, setRaw] = createSignal<RawLine[]>([]);
const [dialog, setDialog] = createSignal<DialogName | null>(null);
let lastScanError: string | null = null;

/** Escolhas de cada função, guardadas ao trocar (quantidade, endereço, formatos), como o fModMaster. */
interface Checkpoint {
  qty: string;
  start: string;
  format: Base;
  formats: Record<string, number>;
  endians: Record<string, number>;
}
const checkpoints = new Map<number, Checkpoint>();

// ---- derivados ----

const spec = createMemo(() => functionSpec(form.fn));
const startAddress = createMemo(() => Math.min(parseAddress(form.start, form.addrHex) ?? 0, 65535));
const quantity = createMemo(() => clampQuantity(int(form.qty, spec().min), spec()));
const singleRegisterWrite = createMemo(() => form.fn === 0x06);
const errors = createMemo<FormErrors>(() => validateForm({ ...form, baseAddr: settings.baseAddr ?? '0', spec: spec() }));
/** Primeiro campo inválido, avisado ao tentar ler, escrever ou escanear. */
function blockedByForm() {
  const first = Object.values(errors())[0];
  if (first) toast(first, 'warning');
  return Boolean(first);
}
const formats = createMemo(() => {
  const out: Record<number, Base> = {};
  for (const [addr, value] of Object.entries(settings.registerFormats ?? {})) {
    const base = baseFromFormat(value);
    if (base) out[Number(addr)] = base;
  }
  return out;
});
const endians = createMemo(() => {
  const out: Record<number, Endian> = {};
  for (const [addr, value] of Object.entries(settings.registerFloatEndians ?? {})) out[Number(addr)] = toEndian(value);
  return out;
});
const grid = createMemo<Grid>(() => ({
  start: startAddress(),
  count: quantity(),
  bits: spec().bits,
  write: spec().write,
  signed: form.signed && form.format === 'dec',
  defaultBase: form.format,
  defaultEndian: toEndian(settings.floatEndian),
  formats: formats(),
  endians: endians(),
  values: table().values,
  valid: table().valid,
}));
const rows = createMemo(() => buildRows(grid()));
const cellText = (cell: Cell) => edits[cell.address] ?? editText(cell);
const maxLines = () => {
  const n = int(settings.maxNoOfLines, 60);
  return n > 0 ? n : 60;
};

// ---- INI <-> tela ----

function loadForm() {
  const fn = functionFromSetting(settings.functionCode);
  setForm({
    mode: settings.modbusMode === 1 ? 'TCP' : 'RTU',
    slave: String(settings.slaveId),
    scanRate: String(settings.scanRate),
    fn: fn.code,
    start: String(settings.startAddr),
    addrHex: false,
    qty: String(clampQuantity(Math.max(settings.noOfRegs, 1), fn)),
    format: baseFromSession(settings.defaultBase),
  });
}

function syncSettings() {
  setSettings({
    modbusMode: form.mode === 'TCP' ? 1 : 0,
    slaveId: int(form.slave, settings.slaveId),
    scanRate: int(form.scanRate, settings.scanRate),
    functionCode: functionIndex(form.fn),
    startAddr: startAddress(),
    noOfRegs: int(form.qty, settings.noOfRegs),
    defaultBase: baseToSession(form.format),
  });
}

/** Grava o INI com o que está na tela (ao conectar, a cada leitura/escrita e nas configurações). */
async function persist() {
  syncSettings();
  try {
    await api.saveSettings(structuredClone(unwrap(settings)));
  } catch (err) {
    toast(String(err), 'danger');
  }
}

const sessionDefaults = {
  modbusMode: 0,
  slaveId: 1,
  scanRate: 1000,
  functionCode: 0,
  startAddr: 0,
  noOfRegs: 0,
  defaultBase: 1,
  floatEndian: 0,
};

function clearTable() {
  setTable({ values: [], valid: true });
  setEdits(reconcile({}));
  setInvalidCell(null);
}

// ---- transações ----

/** A requisição com o que está na tela; o Base Addr é descontado do endereço inicial. */
function request(values?: number[]): Request {
  return {
    slave: int(form.slave, 1),
    function: form.fn,
    start: Math.max(0, startAddress() - int(settings.baseAddr, 0)),
    count: quantity(),
    values,
  };
}

/** Valores a escrever, lidos da tabela; `undefined` numa leitura, `null` se algo não vale. */
function writeValues(): number[] | undefined | null {
  if (!spec().write) return undefined;
  if (startsInsideFloat(rows())) {
    const start = startAddress();
    toast(`Register ${start} is the second half of the float at ${start - 1}: start at ${start - 1} or reset its format.`, 'warning');
    return null;
  }
  if (singleRegisterWrite() && hasFloat(rows())) {
    toast(FLOAT_NEEDS_FC10, 'warning');
    return null;
  }
  const result = collectWrite(rows(), cellText, spec().bits, grid().signed);
  if ('invalid' in result) {
    setInvalidCell(result.invalid);
    toast('Invalid write value in table.', 'danger');
    return null;
  }
  setInvalidCell(null);
  return result.values;
}

function apply(outcome: Outcome, fromScan = false) {
  setCounters({ packets: outcome.packets, errors: outcome.errors });
  setTable({ values: outcome.values, valid: outcome.error === null });
  // escrita que falhou: o que foi digitado fica para tentar de novo
  if (outcome.error === null) setEdits(reconcile({}));
  // no scan, o mesmo erro a cada volta vira um aviso só
  if (outcome.error && (!fromScan || outcome.error !== lastScanError)) toast(outcome.error, 'danger');
  if (fromScan) lastScanError = outcome.error;
}

function onCoreEvents(events: CoreEvent[]) {
  const lines: RawLine[] = [];
  for (const event of events) {
    if (event.kind === 'raw') lines.push({ type: event.tx ? 'Tx' : 'Rx', at: event.at, mode: event.mode, hex: event.hex, detail: event.detail });
    else if (scanning()) apply(event, true);
  }
  if (lines.length) setRaw((list) => [...list, ...lines].slice(-maxLines()));
}

async function guarded(action: () => Promise<void>) {
  if (busy()) return;
  setBusy(true);
  try {
    await action();
  } catch (err) {
    toast(String(err), 'danger');
  } finally {
    setBusy(false);
  }
}

// ---- ações ----

export const app = {
  settings,
  setSettings,
  loaded,
  form,
  setForm,
  connected,
  scanning,
  busy,
  counters,
  rows,
  grid,
  spec,
  quantity,
  errors,
  /** Dec/Hex do endereço inicial: converte o texto, o endereço continua o mesmo. */
  setAddrHex(hex: boolean) {
    if (hex === form.addrHex) return;
    setForm({ start: convertAddress(form.start, form.addrHex), addrHex: hex });
  },
  singleRegisterWrite,
  cellText,
  invalidCell,
  setEdit: (address: number, text: string) => setEdits(address, text),
  raw,
  clearRaw: () => setRaw([]),
  dialog,
  setDialog,
  dialogOpen: () => dialog() !== null,
  onCoreEvents,

  async init() {
    setSettings(reconcile(await api.loadSettings()));
    loadForm();
    setLoaded(true);
  },

  connect: () =>
    guarded(async () => {
      if (connected()) {
        await api.disconnect();
        setScanning(false);
        setConnected(null);
        return;
      }
      const timeoutMs = settings.timeOut;
      if (form.mode === 'TCP') {
        await api.connectTcp({ ip: settings.slaveIp, port: settings.tcpPort, timeoutMs });
        toast(`Connected to ${settings.slaveIp}:${settings.tcpPort}`);
      } else {
        await api.connectRtu({
          port: settings.serialPortName,
          baud: int(settings.baud, 9600),
          parity: settings.parity,
          dataBits: int(settings.dataBits, 8),
          stopBits: int(settings.stopBits, 1),
          rts: settings.rts,
          timeoutMs,
        });
        toast(`Connected on ${settings.serialPortName} @ ${settings.baud} baud`);
      }
      setConnected(form.mode);
      await persist();
    }),

  readWrite: () =>
    guarded(async () => {
      if (!connected() || scanning() || blockedByForm()) return;
      const values = writeValues();
      if (values === null) return;
      const outcome = await api.transaction(request(values));
      apply(outcome);
      if (values && outcome.error === null) {
        toast(`Wrote ${values.length} ${spec().bits ? 'coil' : 'register'}${values.length > 1 ? 's' : ''} at ${startAddress()}`);
      }
      await persist();
    }),

  toggleScan: () =>
    guarded(async () => {
      if (scanning()) {
        await api.stopScan();
        setScanning(false);
        return;
      }
      if (!connected() || blockedByForm()) return;
      const values = writeValues();
      if (values === null) return;
      lastScanError = null;
      await api.startScan(request(values), int(form.scanRate, 1000));
      setScanning(true);
    }),

  clearTable,

  async resetCounters() {
    await api.resetCounters();
    setCounters({ packets: 0, errors: 0 });
  },

  /** Troca de função: guarda as escolhas da anterior e recupera as da nova (ou ajusta a quantidade). */
  setFunction(code: number) {
    const previous = form.fn;
    checkpoints.set(previous, {
      qty: form.qty,
      start: form.start,
      format: form.format,
      formats: { ...settings.registerFormats },
      endians: { ...settings.registerFloatEndians },
    });
    const next = functionSpec(code);
    const saved = checkpoints.get(code);
    if (saved) {
      setForm({ fn: code, qty: saved.qty, start: saved.start, format: saved.format });
      setSettings('registerFormats', reconcile(saved.formats));
      setSettings('registerFloatEndians', reconcile(saved.endians));
    } else {
      setForm({ fn: code, qty: String(clampQuantity(int(form.qty, next.min), next)) });
    }
    if (code === 0x06 && form.format === 'float') setForm('format', 'dec');
    if (code === 0x05) toast('Write Single Coil writes one coil at a time.', 'warning');
    else if (code === 0x06 && hasFloat(rows())) toast(FLOAT_NEEDS_FC10, 'warning');
  },

  setFormat(address: number, base: Base, endian?: Endian) {
    if (base === 'float' && singleRegisterWrite()) return toast(FLOAT_NEEDS_FC10, 'warning');
    const message = validateFormat(address, base, formats());
    if (message) return toast(message, 'warning');
    setSettings('registerFormats', String(address), baseToFormat(base));
    if (base === 'float') setSettings('registerFloatEndians', String(address), endian ?? toEndian(settings.floatEndian));
    else setSettings('registerFloatEndians', String(address), undefined!);
  },

  resetFormat(address: number) {
    setSettings('registerFormats', String(address), undefined!);
    setSettings('registerFloatEndians', String(address), undefined!);
  },

  async saveSettings(changes: Partial<Settings>) {
    setSettings(changes);
    await persist();
  },

  newSession() {
    setSettings(sessionDefaults);
    setSettings('registerFormats', reconcile({}));
    setSettings('registerFloatEndians', reconcile({}));
    checkpoints.clear();
    loadForm();
    clearTable();
  },

  async loadSession() {
    try {
      const loadedSettings = await api.loadSession();
      if (!loadedSettings) return;
      setSettings(reconcile(loadedSettings));
      checkpoints.clear();
      loadForm();
      clearTable();
      toast('Session loaded');
    } catch (err) {
      toast(String(err), 'danger');
    }
  },

  async saveSession() {
    syncSettings();
    try {
      const path = await api.saveSession(structuredClone(unwrap(settings)));
      if (path) toast(`Session saved to ${path}`);
    } catch (err) {
      toast(String(err), 'danger');
    }
  },
};
