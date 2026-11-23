// Estado da tela em sinais e stores, e as ações que chamam o core. Porte do MainViewController do
// fModMaster: os mesmos estados (desconectado, conectado, em scan) e as mesmas regras.

import { createEffect, createMemo, createSignal, on, untrack } from 'solid-js';
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
  type Converted,
  type Endian,
  editText,
  functionFromSetting,
  functionIndex,
  functionSpec,
  type Grid,
  type Row,
  hasFloat,
  startsInsideFloat,
  toEndian,
  parseNumber,
  validateConverter,
  validateFormat,
} from './lib/registers';
import { type ChartData, dropColumn, emptyChart, fillSample, freeSlot, pushSample, resetColumn, type WindowKey, WINDOWS } from './lib/chart';
import { convertAddress, type FormErrors, parseAddress, validateForm } from './lib/form';
import type { Catalog, CoreEvent, Outcome, Request, Settings } from './lib/types';
import { errorText, t } from './i18n';
import { toast } from './toasts';

export type Mode = 'RTU' | 'TCP';
export type DialogName = 'settings' | 'tools' | 'about' | 'converters';

export interface RawLine {
  type: 'Tx' | 'Rx';
  at: number;
  mode: string;
  hex: string;
  /** campos decodificados pelo core: chave (rótulo em `bus.fields`) e valor */
  fields: [string, string][];
}

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
  /** converter usado como formato padrão ('' = o `format` acima) */
  converter: '',
  signed: false,
});

const [connected, setConnected] = createSignal<Mode | null>(null);
const [scanning, setScanning] = createSignal(false);
const [busy, setBusy] = createSignal(false);
const [counters, setCounters] = createSignal({ packets: 0, errors: 0 });
/** valores da última transação; `valid: false` depois de um erro */
/** valores da última transação; `at` = instante gravado no gráfico (0 = sem amostra) */
const [table, setTable] = createSignal<{ values: number[]; valid: boolean; at: number }>({ values: [], valid: true, at: 0 });

// ---- gráfico ----
const chart: ChartData = emptyChart();
/** muda a cada amostra: a visão Chart redesenha (no máximo uma vez por quadro) */
const [chartVersion, setChartVersion] = createSignal(0);
const bumpChart = () => setChartVersion((v) => v + 1);
const [view, setView] = createSignal<'table' | 'chart'>('table');
const WINDOW_KEY = 'rsmodmaster.chartWindow';
const storedWindow = localStorage.getItem(WINDOW_KEY);
const [chartWindow, setChartWindowSignal] = createSignal<WindowKey>(
  WINDOWS.some((w) => w.value === storedWindow) ? (storedWindow as WindowKey) : '2m',
);
function clearChart() {
  chart.t.length = 0;
  chart.cols.clear();
  bumpChart();
}
const [edits, setEdits] = createStore<Record<number, string>>({});
const [invalidCell, setInvalidCell] = createSignal<number | null>(null);
const [raw, setRaw] = createSignal<RawLine[]>([]);
const [dialog, setDialog] = createSignal<DialogName | null>(null);
const [catalog, setCatalog] = createSignal<Catalog>({ dir: '', converters: [], errors: [], template: '' });
/** decode de cada converter do intervalo, por endereço inicial */
const [converted, setConverted] = createSignal<Record<number, Converted>>({});
let lastScanError: string | null = null;

/** Escolhas de cada função, guardadas ao trocar (quantidade, endereço, formatos), como o fModMaster. */
interface Checkpoint {
  qty: string;
  start: string;
  format: Base;
  formats: Record<string, number>;
  endians: Record<string, number>;
  converters: Record<string, string>;
  labels: Record<string, string>;
  charts: Record<string, number>;
}
const checkpoints = new Map<number, Checkpoint>();

// ---- derivados ----

const spec = createMemo(() => functionSpec(form.fn));
const startAddress = createMemo(() => Math.min(parseAddress(form.start, form.addrHex) ?? 0, 65535));
const quantity = createMemo(() => clampQuantity(int(form.qty, spec().min), spec()));
const singleRegisterWrite = createMemo(() => form.fn === 0x06);
/** O gráfico é das leituras: numa função de escrita a tabela volta. */
const showingChart = createMemo(() => view() === 'chart' && !spec().write);
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
/** registradores no gráfico: endereço -> cor (0..7), na ordem dos endereços */
const charted = createMemo(() => {
  const out = new Map<number, number>();
  const entries = Object.entries(settings.registerCharts ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [addr, slot] of entries) out.set(Number(addr), slot);
  return out;
});
const labels = createMemo(() => {
  const out: Record<number, string> = {};
  for (const [addr, text] of Object.entries(settings.registerLabels ?? {})) out[Number(addr)] = text;
  return out;
});
const assigned = createMemo(() => {
  const out: Record<number, string> = {};
  for (const [addr, id] of Object.entries(settings.registerConverters ?? {})) out[Number(addr)] = id;
  return out;
});
const sizes = createMemo(() => Object.fromEntries(catalog().converters.map((c) => [c.id, c.registers])) as Record<string, number>);
const grid = createMemo<Grid>(() => ({
  start: startAddress(),
  count: quantity(),
  bits: spec().bits,
  write: spec().write,
  signed: form.signed && form.format === 'dec' && !form.converter,
  defaultBase: form.format,
  defaultConverter: form.converter,
  defaultEndian: toEndian(settings.floatEndian),
  formats: formats(),
  endians: endians(),
  values: table().values,
  valid: table().valid,
  converters: assigned(),
  sizes: sizes(),
  converted: converted(),
}));

// Decode dos converters sempre que chegam valores ou muda a atribuição/o catálogo. O Lua roda no
// core; uma resposta atrasada (scan rápido) é descartada pela sequência.
let decodeSeq = 0;
let lastConverterError: string | undefined;
createEffect(
  on([() => table(), assigned, sizes, startAddress, quantity, () => spec().bits, () => form.converter, showingChart], async () => {
    const seq = ++decodeSeq;
    const { values, valid, at } = table();
    const start = startAddress();
    const items: { address: number; id: string; regs: number[] }[] = [];
    if (valid && !spec().bits) {
      // células de converter (próprio ou o padrão) que a grade monta, sem depender do resultado
      const layout = untrack(() => buildRows({ ...grid(), converted: {} }));
      for (const cell of layout.flatMap((r) => r.cells)) {
        const size = cell.converter === undefined ? undefined : sizes()[cell.converter];
        const offset = cell.address - start;
        if (cell.kind !== 'value' || size === undefined || offset + size > values.length) continue;
        // no gráfico só interessam as séries; a tabela inteira é decodificada ao voltar para ela
        if (showingChart() && !charted().has(cell.address)) continue;
        items.push({ address: cell.address, id: cell.converter!, regs: values.slice(offset, offset + size) });
      }
    }
    if (!items.length) return setConverted({});
    try {
      const results = await api.convertDecode(items.map(({ id, regs }) => ({ id, regs })));
      // o gráfico recebe o valor na linha da sua leitura, mesmo que a tabela já tenha andado
      if (at) {
        let filled = false;
        for (const [i, item] of items.entries()) {
          if (!charted().has(item.address)) continue;
          const value = results[i].value;
          filled = fillSample(chart, at, item.address, value === undefined ? null : parseNumber(value)) || filled;
        }
        if (filled) bumpChart();
      }
      if (seq !== decodeSeq) return;
      setConverted(Object.fromEntries(items.map((item, i) => [item.address, results[i]])));
      // como no scan: a mesma mensagem de script uma vez só
      for (const r of results) {
        const text = r.error && errorText(r.error);
        if (text && text !== lastConverterError) toast((lastConverterError = text), 'danger');
      }
    } catch (err) {
      if (seq === decodeSeq) toast(errorText(err), 'danger');
    }
  }),
);
// a grade só é montada com a tabela na tela: no gráfico o memo fica parado (sem custo por volta do
// scan) e volta a calcular ao trocar de visão
const rows = createMemo<Row[]>((previous) => (showingChart() ? previous : buildRows(grid())), []);
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
    converter: settings.defaultConverter ?? '',
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
    defaultConverter: form.converter,
  });
}

/** Grava o INI com o que está na tela (ao conectar, a cada leitura/escrita e nas configurações). */
async function persist() {
  syncSettings();
  try {
    await api.saveSettings(structuredClone(unwrap(settings)));
  } catch (err) {
    toast(errorText(err), 'danger');
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
  setTable({ values: [], valid: true, at: 0 });
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

/** Valores a escrever, lidos da tabela (os converters passam pelo `encode` no core); `undefined`
 *  numa leitura, `null` se algo não vale. */
async function writeValues(): Promise<number[] | undefined | null> {
  if (!spec().write) return undefined;
  if (startsInsideFloat(rows())) {
    const start = startAddress();
    toast(t('store.middle', { start }), 'warning');
    return null;
  }
  const convCells = rows()
    .flatMap((r) => r.cells)
    .filter((c) => c.kind === 'value' && c.converter !== undefined);
  if (singleRegisterWrite() && convCells.some((c) => (sizes()[c.converter!] ?? 1) > 1)) {
    toast(t('store.converterNeedsFc10'), 'warning');
    return null;
  }
  const encoded: Record<number, number[]> = {};
  if (convCells.length) {
    const results = await api.convertEncode(convCells.map((c) => ({ id: c.converter!, text: cellText(c) })));
    for (const [i, cell] of convCells.entries()) {
      const r = results[i];
      if (r.error !== undefined || !r.value) {
        setInvalidCell(cell.address);
        toast(t('store.convertFailed', { address: cell.address, error: r.error ? errorText(r.error) : t('store.noValue') }), 'danger');
        return null;
      }
      encoded[cell.address] = r.value;
    }
  }
  if (singleRegisterWrite() && hasFloat(rows())) {
    toast(t('store.floatNeedsFc10'), 'warning');
    return null;
  }
  const result = collectWrite(rows(), cellText, spec().bits, grid().signed, encoded);
  if ('invalid' in result) {
    setInvalidCell(result.invalid);
    toast(t('store.invalidWrite'), 'danger');
    return null;
  }
  setInvalidCell(null);
  return result.values;
}

/** Amostra do gráfico com o que a tabela vai mostrar desta leitura; os converters entram como
 *  lacuna e são preenchidos quando o decode responde. Erro de comunicação = lacuna em tudo. */
function sample(outcome: Outcome): number {
  if (!charted().size || spec().write) return 0;
  const nums = new Map<number, number | null>();
  if (outcome.error === null) {
    const next = buildRows({ ...grid(), values: outcome.values, valid: true, converted: {} });
    for (const cell of next.flatMap((r) => r.cells)) {
      if (cell.kind === 'value' && cell.converter === undefined && charted().has(cell.address)) nums.set(cell.address, cell.num ?? null);
    }
  }
  const time = pushSample(chart, outcome.at, nums, [...charted().keys()]);
  bumpChart();
  return time;
}

function apply(outcome: Outcome, fromScan = false) {
  setCounters({ packets: outcome.packets, errors: outcome.errors });
  const at = sample(outcome);
  setTable({ values: outcome.values, valid: outcome.error === null, at });
  // escrita que falhou: o que foi digitado fica para tentar de novo
  if (outcome.error === null) setEdits(reconcile({}));
  // no scan, o mesmo erro a cada volta vira um aviso só
  const error = outcome.error && errorText(outcome.error);
  if (error && (!fromScan || error !== lastScanError)) toast(error, 'danger');
  if (fromScan) lastScanError = error;
}

function onCoreEvents(events: CoreEvent[]) {
  const lines: RawLine[] = [];
  for (const event of events) {
    if (event.kind === 'raw') lines.push({ type: event.tx ? 'Tx' : 'Rx', at: event.at, mode: event.mode, hex: event.hex, fields: event.fields });
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
    toast(errorText(err), 'danger');
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
  /** Formato em vigor no endereço: o próprio (`custom`) ou o padrão da tabela; `floatOwner` quando
   *  ele é a 2ª metade de um float que começa no endereço anterior. */
  formatAt(address: number) {
    const own = formats()[address];
    const conv = assigned()[address];
    return {
      base: own ?? form.format,
      endian: endians()[address] ?? toEndian(settings.floatEndian),
      custom: own !== undefined || conv !== undefined,
      floatOwner: formats()[address - 1] === 'float' ? address - 1 : null,
      // o próprio, ou o do formato padrão quando o registrador não tem nada seu
      converter: conv ?? (own === undefined && form.converter ? form.converter : null),
    };
  },
  /** Formato padrão como no menu: 'dec' | 'bin' | 'hex' | 'float:N' (ordem de bytes) | 'conv:id'. */
  defaultFormat: () => (form.converter ? `conv:${form.converter}` : form.format === 'float' ? `float:${toEndian(settings.floatEndian)}` : form.format),
  setDefaultFormat(value: string) {
    const [kind, arg] = value.split(':');
    if (kind === 'conv') setForm({ format: 'dec', converter: arg });
    else if (kind === 'float') {
      setForm({ format: 'float', converter: '' });
      setSettings('floatEndian', toEndian(Number(arg))); // é a mesma Float Byte Order das configurações
    } else setForm({ format: kind as Base, converter: '' });
    void persist();
  },
  catalog,
  async reloadConverters() {
    try {
      setCatalog(await api.converters(true));
    } catch (err) {
      toast(errorText(err), 'danger');
    }
  },
  setCatalog,
  /** Atribui o converter a partir de `address`; o formato próprio do endereço sai. */
  setConverter(address: number, id: string) {
    const size = sizes()[id] ?? 1;
    const message = validateConverter(address, size, formats(), assigned(), sizes());
    if (message) return toast(message, 'warning');
    resetColumn(chart, address);
    setSettings('registerConverters', String(address), id);
    setSettings('registerFormats', String(address), undefined!);
    setSettings('registerFloatEndians', String(address), undefined!);
    void persist(); // escolha de formato não se perde ao fechar sem ler
  },
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
    setCatalog(await api.converters());
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
        toast(t('store.connectedTcp', { target: `${settings.slaveIp}:${settings.tcpPort}` }));
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
        toast(t('store.connectedRtu', { port: settings.serialPortName, baud: settings.baud }));
      }
      setConnected(form.mode);
      await persist();
    }),

  readWrite: () =>
    guarded(async () => {
      if (!connected() || scanning() || blockedByForm()) return;
      const values = await writeValues();
      if (values === null) return;
      const outcome = await api.transaction(request(values));
      apply(outcome);
      if (values && outcome.error === null) {
        toast(t('store.wrote', { n: values.length, bits: spec().bits, start: startAddress() }));
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
      const values = await writeValues();
      if (values === null) return;
      lastScanError = null;
      await api.startScan(request(values), int(form.scanRate, 1000));
      setScanning(true);
    }),

  clearTable,
  view,
  setView,
  showingChart,
  chart,
  chartVersion,
  charted,
  labels,
  clearChart,
  chartWindow,
  setChartWindow(value: WindowKey) {
    localStorage.setItem(WINDOW_KEY, value);
    setChartWindowSignal(value);
  },
  /** Põe ou tira o registrador do gráfico (no máximo 8, cada um com sua cor). */
  toggleChart(address: number) {
    if (charted().has(address)) {
      setSettings('registerCharts', String(address), undefined!);
      dropColumn(chart, address);
      bumpChart();
    } else {
      const slot = freeSlot(charted().values());
      if (slot === null) return toast(t('store.chartFull'), 'warning');
      setSettings('registerCharts', String(address), slot);
    }
    void persist();
  },
  /** Nome do registrador (vazio apaga), até 32 caracteres. */
  setLabel(address: number, text: string) {
    const label = text.trim().slice(0, 32);
    if ((labels()[address] ?? '') === label) return;
    setSettings('registerLabels', String(address), label || undefined!);
    void persist();
  },

  async resetCounters() {
    await api.resetCounters();
    setCounters({ packets: 0, errors: 0 });
  },

  /** Troca de função: guarda as escolhas da anterior e recupera as da nova (ou ajusta a quantidade). */
  setFunction(code: number) {
    clearChart(); // outra função, outros dados
    const previous = form.fn;
    checkpoints.set(previous, {
      qty: form.qty,
      start: form.start,
      format: form.format,
      formats: { ...settings.registerFormats },
      endians: { ...settings.registerFloatEndians },
      converters: { ...settings.registerConverters },
      labels: { ...settings.registerLabels },
      charts: { ...settings.registerCharts },
    });
    const next = functionSpec(code);
    const saved = checkpoints.get(code);
    if (saved) {
      setForm({ fn: code, qty: saved.qty, start: saved.start, format: saved.format });
      setSettings('registerFormats', reconcile(saved.formats));
      setSettings('registerFloatEndians', reconcile(saved.endians));
      setSettings('registerConverters', reconcile(saved.converters));
      setSettings('registerLabels', reconcile(saved.labels));
      setSettings('registerCharts', reconcile(saved.charts));
    } else {
      setForm({ fn: code, qty: String(clampQuantity(int(form.qty, next.min), next)) });
    }
    if (code === 0x06 && form.format === 'float') setForm('format', 'dec');
    if (code === 0x05) toast(t('store.singleCoil'), 'warning');
    else if (code === 0x06 && hasFloat(rows())) toast(t('store.floatNeedsFc10'), 'warning');
  },

  setFormat(address: number, base: Base, endian?: Endian) {
    if (base === 'float' && singleRegisterWrite()) return toast(t('store.floatNeedsFc10'), 'warning');
    const message = validateFormat(address, base, formats(), assigned(), sizes());
    if (message) return toast(message, 'warning');
    resetColumn(chart, address);
    setSettings('registerConverters', String(address), undefined!);
    setSettings('registerFormats', String(address), baseToFormat(base));
    if (base === 'float') setSettings('registerFloatEndians', String(address), endian ?? toEndian(settings.floatEndian));
    else setSettings('registerFloatEndians', String(address), undefined!);
    void persist();
  },

  resetFormat(address: number) {
    resetColumn(chart, address);
    setSettings('registerConverters', String(address), undefined!);
    setSettings('registerFormats', String(address), undefined!);
    setSettings('registerFloatEndians', String(address), undefined!);
    void persist();
  },

  async saveSettings(changes: Partial<Settings>) {
    setSettings(changes);
    await persist();
  },

  newSession() {
    setSettings(sessionDefaults);
    setSettings('registerFormats', reconcile({}));
    setSettings('registerFloatEndians', reconcile({}));
    setSettings('registerConverters', reconcile({}));
    setSettings('registerLabels', reconcile({}));
    setSettings('registerCharts', reconcile({}));
    clearChart();
    checkpoints.clear();
    loadForm();
    clearTable();
  },

  async loadSession() {
    try {
      const loadedSettings = await api.loadSession(t('titlebar.loadSession'), t('store.sessionFilter'));
      if (!loadedSettings) return;
      setSettings(reconcile(loadedSettings));
      clearChart();
      checkpoints.clear();
      loadForm();
      clearTable();
      toast(t('store.sessionLoaded'));
    } catch (err) {
      toast(errorText(err), 'danger');
    }
  },

  async saveSession() {
    syncSettings();
    try {
      const path = await api.saveSession(structuredClone(unwrap(settings)), t('titlebar.saveSession'), t('store.sessionFilter'));
      if (path) toast(t('store.sessionSaved', { path }));
    } catch (err) {
      toast(errorText(err), 'danger');
    }
  },
};
