import { createSignal, For, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { api } from '../api';
import { app } from '../appStore';
import { updates } from '../updates';
import { t, tk } from '../i18n';
import { ENDIAN_LABELS } from '../lib/registers';
import { splitSerialPortName, validIp, validPort } from '../lib/settings';
import type { Settings } from '../lib/types';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { SelectField, TextField } from './Field';
import { Segmented } from './Segmented';

type Tab = 'rtu' | 'tcp' | 'general';
const TABS = ['rtu', 'tcp', 'general'] as const;
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
  /** preferência do app (localStorage), aplicada no OK como o resto */
  const [checkUpdates, setCheckUpdates] = createSignal(updates.enabled());
  const [ports, setPorts] = createSignal<string[]>([]);
  /** porta digitada à mão ("Other…"), fora da lista detectada */
  const [customPort, setCustomPort] = createSignal(false);
  const open = () => app.dialog() === 'settings';
  const refreshPorts = () => api.serialPorts().then(setPorts, () => setPorts([]));
  const reset = () => {
    setDraft(fromSettings());
    setCheckUpdates(updates.enabled());
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
    updates.setEnabled(checkUpdates());
    await app.saveSettings({ ...draft, serialPortName: draft.serialPortName.trim(), serialDev, serialPort });
    app.setDialog(null);
  };
  return (
    <Dialog open={open()} onOpen={reset} onClose={() => app.setDialog(null)} labelledBy="settings-title" class="settings-dialog">
      <form class="dialog-form" onSubmit={save}>
        <div class="dialog-head">
          <h2 class="dialog-title" id="settings-title">
            {t('settings.title')}
          </h2>
          <Segmented label={t('settings.section')} options={TABS.map((value) => ({ value, label: t(`settings.${value}`) }))} value={tab()} autofocus onChange={setTab} />
        </div>
        <Show when={tab() === 'rtu'}>
          <div class="form-grid">
            <div class="port-row">
              <SelectField label={t('settings.serialPort')} class="grow" value={customPort() ? OTHER : draft.serialPortName} onChange={(e) => pickPort(e.currentTarget.value)}>
                <For each={ports()}>{(port) => <option value={port}>{port}</option>}</For>
                <Show when={portMissing()}>
                  <option value={draft.serialPortName}>{t('settings.notFound', { port: draft.serialPortName })}</option>
                </Show>
                <option value={OTHER}>{t('settings.other')}</option>
              </SelectField>
              <button class="btn outline square tall" type="button" title={t('settings.refreshPorts')} aria-label={t('settings.refreshPorts')} onClick={refreshPorts}>
                <Icon name="refresh-cw" />
              </button>
            </div>
            <Show when={customPort()}>
              <TextField
                label={t('settings.portName')}
                class="wide"
                placeholder={isWindows ? 'COM3' : '/dev/ttyUSB0'}
                value={draft.serialPortName}
                onInput={(e) => setDraft('serialPortName', e.currentTarget.value)}
              />
            </Show>
            <TextField label={t('settings.baud')} list="bauds" invalid={invalid.baud()} value={draft.baud} onInput={(e) => setDraft('baud', e.currentTarget.value)} />
            <datalist id="bauds">
              <For each={BAUDS}>{(baud) => <option value={baud} />}</For>
            </datalist>
            <SelectField label={t('settings.dataBits')} value={draft.dataBits} onChange={(e) => setDraft('dataBits', e.currentTarget.value)}>
              <option value="7">7</option>
              <option value="8">8</option>
            </SelectField>
            <SelectField label={t('settings.stopBits')} value={draft.stopBits} onChange={(e) => setDraft('stopBits', e.currentTarget.value)}>
              <option value="1">1</option>
              <option value="2">2</option>
            </SelectField>
            {/* o valor gravado no INI segue em inglês, como o qModMaster espera */}
            <SelectField label={t('settings.parity')} value={draft.parity} onChange={(e) => setDraft('parity', e.currentTarget.value)}>
              <option value="None">{t('settings.parityNone')}</option>
              <option value="Even">{t('settings.parityEven')}</option>
              <option value="Odd">{t('settings.parityOdd')}</option>
            </SelectField>
            <SelectField label={t('settings.rts')} value={draft.rts} onChange={(e) => setDraft('rts', e.currentTarget.value)}>
              <For each={rtsModes()}>{(mode) => <option value={mode}>{tk(`settings.rts${mode}`) ?? mode}</option>}</For>
            </SelectField>
          </div>
        </Show>
        <Show when={tab() === 'tcp'}>
          <div class="form-grid">
            <TextField label={t('settings.slaveIp')} invalid={invalid.ip()} value={draft.slaveIp} onInput={(e) => setDraft('slaveIp', e.currentTarget.value)} />
            <TextField label={t('settings.tcpPort')} invalid={invalid.port()} value={draft.tcpPort} onInput={(e) => setDraft('tcpPort', e.currentTarget.value)} />
          </div>
        </Show>
        <Show when={tab() === 'general'}>
          <div class="form-grid">
            <TextField
              label={t('settings.timeout')}
              invalid={invalid.timeOut()}
              value={draft.timeOut}
              onInput={(e) => setDraft('timeOut', e.currentTarget.value)}
            />
            <TextField
              label={t('settings.maxLines')}
              invalid={invalid.lines()}
              value={draft.maxNoOfLines}
              onInput={(e) => setDraft('maxNoOfLines', e.currentTarget.value)}
            />
            <TextField label={t('settings.baseAddr')} invalid={invalid.baseAddr()} value={draft.baseAddr} onInput={(e) => setDraft('baseAddr', e.currentTarget.value)} />
            <SelectField label={t('settings.floatOrder')} value={draft.floatEndian} onChange={(e) => setDraft('floatEndian', Number(e.currentTarget.value))}>
              <For each={ENDIAN_LABELS}>{(label, i) => <option value={i()}>{label}</option>}</For>
            </SelectField>
          </div>
          <p class="muted hint-text">{t('settings.timeoutHint')}</p>
          <label class="check">
            <input type="checkbox" checked={checkUpdates()} onChange={(e) => setCheckUpdates(e.currentTarget.checked)} />
            {t('settings.checkUpdates')}
          </label>
        </Show>
        <Show when={app.connected()}>
          <p class="muted hint-text">{t('settings.applyNext')}</p>
        </Show>
        <Show when={anyInvalid()}>
          <p class="error">{t('settings.fixFields')}</p>
        </Show>
        <div class="dialog-actions">
          <button class="btn outline" type="button" onClick={() => app.setDialog(null)}>
            {t('common.cancel')}
          </button>
          <button class="btn primary" type="submit" disabled={anyInvalid()}>
            {t('common.ok')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
