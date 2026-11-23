import { createSignal, For, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { api } from '../api';
import { app } from '../appStore';
import { ENDIAN_LABELS } from '../lib/registers';
import { splitSerialPortName, validIp, validPort } from '../lib/settings';
import type { Settings } from '../lib/types';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { SelectField, TextField } from './Field';
import { Segmented } from './Segmented';

type Tab = 'rtu' | 'tcp' | 'general';
const TABS = [
  { value: 'rtu', label: 'Modbus RTU' },
  { value: 'tcp', label: 'Modbus TCP' },
  { value: 'general', label: 'General' },
] as const;
const OTHER = '\u0000other';
const RTS_MODES = ['None', 'Disable', 'Enable'];
const isWindows = navigator.userAgent.includes('Windows');
const BAUDS = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'];
type Draft = Pick<
  Settings,
  'serialPortName' | 'baud' | 'dataBits' | 'stopBits' | 'parity' | 'rts' | 'slaveIp' | 'tcpPort' | 'timeOut' | 'maxNoOfLines' | 'baseAddr' | 'floatEndian'
>;
const digits = (text: string) => /^\d+$/.test(text.trim());

/** Os três diálogos de configuração do fModMaster (RTU, TCP e geral) num só, em abas. */
export function SettingsDialog() {
  const [tab, setTab] = createSignal<Tab>('rtu');
  const fromSettings = (): Draft => {
    const s = app.settings;
    return {
      serialPortName: s.serialPortName,
      baud: s.baud,
      dataBits: s.dataBits,
      stopBits: s.stopBits,
      parity: s.parity,
      rts: s.rts,
      slaveIp: s.slaveIp,
      tcpPort: s.tcpPort,
      timeOut: s.timeOut,
      maxNoOfLines: s.maxNoOfLines,
      baseAddr: s.baseAddr,
      floatEndian: s.floatEndian,
    };
  };
  const [draft, setDraft] = createStore<Draft>(fromSettings());
  const [ports, setPorts] = createSignal<string[]>([]);
  /** porta digitada à mão ("Other…"), fora da lista detectada */
  const [customPort, setCustomPort] = createSignal(false);
  const open = () => app.dialog() === 'settings';
  const refreshPorts = () => api.serialPorts().then(setPorts, () => setPorts([]));
  const reset = () => {
    setDraft(fromSettings());
    setCustomPort(false);
    setTab(app.form.mode === 'TCP' ? 'tcp' : 'rtu');
    refreshPorts();
  };
  const portMissing = () => !customPort() && !ports().includes(draft.serialPortName);
  const pickPort = (value: string) => {
    setCustomPort(value === OTHER);
    if (value !== OTHER) setDraft('serialPortName', value);
  };
  const invalid = {
    baud: () => !digits(draft.baud),
    ip: () => !validIp(draft.slaveIp),
    port: () => !validPort(draft.tcpPort),
    timeOut: () => !digits(draft.timeOut),
    lines: () => !digits(draft.maxNoOfLines),
    baseAddr: () => !digits(draft.baseAddr),
  };
  // valor do INI fora da lista (qModMaster no Linux usa Up/Down) continua escolhível
  const rtsModes = () => [...new Set([...RTS_MODES, draft.rts])];
  const anyInvalid = () => Object.values(invalid).some((check) => check());
  const save = async (event: Event) => {
    event.preventDefault();
    if (anyInvalid()) return;
    const [serialDev, serialPort] = splitSerialPortName(draft.serialPortName);
    await app.saveSettings({ ...draft, serialPortName: draft.serialPortName.trim(), serialDev, serialPort });
    app.setDialog(null);
  };
  return (
    <Dialog open={open()} onOpen={reset} onClose={() => app.setDialog(null)} labelledBy="settings-title" class="settings-dialog">
      <form class="dialog-form" onSubmit={save}>
        <div class="dialog-head">
          <h2 class="dialog-title" id="settings-title">
            Settings
          </h2>
          <Segmented label="Settings section" options={TABS} value={tab()} autofocus onChange={setTab} />
        </div>
        <Show when={tab() === 'rtu'}>
          <div class="form-grid">
            <div class="port-row">
              <SelectField label="Serial Port" class="grow" value={customPort() ? OTHER : draft.serialPortName} onChange={(e) => pickPort(e.currentTarget.value)}>
                <For each={ports()}>{(port) => <option value={port}>{port}</option>}</For>
                <Show when={portMissing()}>
                  <option value={draft.serialPortName}>{draft.serialPortName} (not found)</option>
                </Show>
                <option value={OTHER}>Other…</option>
              </SelectField>
              <button class="btn outline square tall" type="button" title="Refresh ports" aria-label="Refresh ports" onClick={refreshPorts}>
                <Icon name="refresh-cw" />
              </button>
            </div>
            <Show when={customPort()}>
              <TextField
                label="Port name"
                class="wide"
                placeholder={isWindows ? 'COM3' : '/dev/ttyUSB0'}
                value={draft.serialPortName}
                onInput={(e) => setDraft('serialPortName', e.currentTarget.value)}
              />
            </Show>
            <TextField label="Baud" list="bauds" invalid={invalid.baud()} value={draft.baud} onInput={(e) => setDraft('baud', e.currentTarget.value)} />
            <datalist id="bauds">
              <For each={BAUDS}>{(baud) => <option value={baud} />}</For>
            </datalist>
            <SelectField label="Data Bits" value={draft.dataBits} onChange={(e) => setDraft('dataBits', e.currentTarget.value)}>
              <option value="7">7</option>
              <option value="8">8</option>
            </SelectField>
            <SelectField label="Stop Bits" value={draft.stopBits} onChange={(e) => setDraft('stopBits', e.currentTarget.value)}>
              <option value="1">1</option>
              <option value="2">2</option>
            </SelectField>
            <SelectField label="Parity" value={draft.parity} onChange={(e) => setDraft('parity', e.currentTarget.value)}>
              <option value="None">None</option>
              <option value="Even">Even</option>
              <option value="Odd">Odd</option>
            </SelectField>
            <SelectField label="RTS" value={draft.rts} onChange={(e) => setDraft('rts', e.currentTarget.value)}>
              <For each={rtsModes()}>{(mode) => <option value={mode}>{mode}</option>}</For>
            </SelectField>
          </div>
        </Show>
        <Show when={tab() === 'tcp'}>
          <div class="form-grid">
            <TextField label="Slave IP" invalid={invalid.ip()} value={draft.slaveIp} onInput={(e) => setDraft('slaveIp', e.currentTarget.value)} />
            <TextField label="TCP Port" invalid={invalid.port()} value={draft.tcpPort} onInput={(e) => setDraft('tcpPort', e.currentTarget.value)} />
          </div>
        </Show>
        <Show when={tab() === 'general'}>
          <div class="form-grid">
            <TextField
              label="Response Timeout (ms)"
              invalid={invalid.timeOut()}
              value={draft.timeOut}
              onInput={(e) => setDraft('timeOut', e.currentTarget.value)}
            />
            <TextField
              label="Max No Of Bus Monitor Lines"
              invalid={invalid.lines()}
              value={draft.maxNoOfLines}
              onInput={(e) => setDraft('maxNoOfLines', e.currentTarget.value)}
            />
            <TextField label="Base Addr" invalid={invalid.baseAddr()} value={draft.baseAddr} onInput={(e) => setDraft('baseAddr', e.currentTarget.value)} />
            <SelectField label="Float Byte Order" value={draft.floatEndian} onChange={(e) => setDraft('floatEndian', Number(e.currentTarget.value))}>
              <For each={ENDIAN_LABELS}>{(label, i) => <option value={i()}>{label}</option>}</For>
            </SelectField>
          </div>
          <p class="muted hint-text">Timeouts under 1000 ms are raised to 1000 ms when connecting.</p>
        </Show>
        <Show when={app.connected()}>
          <p class="muted hint-text">Connection changes apply the next time you connect.</p>
        </Show>
        <Show when={anyInvalid()}>
          <p class="error">Fix the highlighted fields (in any tab) before saving.</p>
        </Show>
        <div class="dialog-actions">
          <button class="btn outline" type="button" onClick={() => app.setDialog(null)}>
            Cancel
          </button>
          <button class="btn primary" type="submit" disabled={anyInvalid()}>
            OK
          </button>
        </div>
      </form>
    </Dialog>
  );
}
