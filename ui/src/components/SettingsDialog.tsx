import { createSignal, For, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { api } from '../api';
import { app } from '../appStore';
import { ENDIAN_LABELS } from '../lib/registers';
import { splitSerialPortName, validIp, validPort } from '../lib/settings';
import type { Settings } from '../lib/types';
import { Dialog } from './Dialog';
import { SelectField, TextField } from './Field';
import { Segmented } from './Segmented';

type Tab = 'rtu' | 'tcp' | 'general';
const TABS = [
  { value: 'rtu', label: 'Modbus RTU' },
  { value: 'tcp', label: 'Modbus TCP' },
  { value: 'general', label: 'General' },
] as const;
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
  const open = () => app.dialog() === 'settings';
  const reset = () => {
    setDraft(fromSettings());
    setTab(app.form.mode === 'TCP' ? 'tcp' : 'rtu');
    api.serialPorts().then(setPorts, () => setPorts([]));
  };
  const invalid = {
    baud: () => !digits(draft.baud),
    ip: () => !validIp(draft.slaveIp),
    port: () => !validPort(draft.tcpPort),
    timeOut: () => !digits(draft.timeOut),
    lines: () => !digits(draft.maxNoOfLines),
    baseAddr: () => !digits(draft.baseAddr),
  };
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
          <Segmented label="Settings section" options={TABS} value={tab()} onChange={setTab} />
        </div>
        <Show when={tab() === 'rtu'}>
          <div class="form-grid">
            <TextField
              label="Serial Port"
              class="wide"
              list="serial-ports"
              value={draft.serialPortName}
              onInput={(e) => setDraft('serialPortName', e.currentTarget.value)}
            />
            <datalist id="serial-ports">
              <For each={ports()}>{(port) => <option value={port} />}</For>
            </datalist>
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
            <TextField label="RTS" list="rts-modes" value={draft.rts} onInput={(e) => setDraft('rts', e.currentTarget.value)} />
            <datalist id="rts-modes">
              <option value="None" />
              <option value="Disable" />
              <option value="Enable" />
            </datalist>
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
              <For each={ENDIAN_LABELS}>{(label, i) => (
                  <option value={i()} selected={i() === draft.floatEndian}>
                    {label}
                  </option>
                )}</For>
            </SelectField>
          </div>
          <p class="muted hint-text">Timeouts under 1000 ms are raised to 1000 ms when connecting.</p>
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
