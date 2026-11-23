import { Show } from 'solid-js';
import { app, type Mode } from '../appStore';
import { TextField } from './Field';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

const MODES = [
  { value: 'RTU', label: 'RTU' },
  { value: 'TCP', label: 'TCP' },
] as const satisfies readonly { value: Mode; label: string }[];

/** Modo, escravo e scan rate; a porta serial ou o IP vêm das configurações. */
export function CommCard() {
  const s = app.settings;
  const locked = () => app.connected() !== null || app.scanning();
  const target = () =>
    app.form.mode === 'TCP'
      ? `${s.slaveIp}:${s.tcpPort}`
      : `${s.serialPortName} · ${s.baud} ${s.dataBits}${(s.parity || 'N')[0].toUpperCase()}${s.stopBits}`;
  return (
    <section class="card comm" aria-labelledby="comm-title">
      <div class="card-head">
        <h2 class="section-title" id="comm-title">
          <Icon name="plug" />
          Communication
        </h2>
        <Segmented label="Modbus Mode" options={MODES} value={app.form.mode} disabled={locked()} onChange={(mode) => app.setForm('mode', mode)} />
      </div>
      <div class="row">
        <TextField
          label={app.form.mode === 'TCP' ? 'Unit ID' : 'Slave Addr'}
          class="narrow"
          inputmode="numeric"
          value={app.form.slave}
          error={app.errors().slave}
          disabled={locked()}
          onInput={(e) => app.setForm('slave', e.currentTarget.value)}
        />
        <TextField
          label="Scan Rate (ms)"
          class="narrow"
          inputmode="numeric"
          value={app.form.scanRate}
          error={app.errors().scanRate}
          disabled={locked()}
          onInput={(e) => app.setForm('scanRate', e.currentTarget.value)}
        />
      </div>
      <div class="row end nowrap">
        <button class="target" type="button" title="Edit connection settings" onClick={() => app.setDialog('settings')}>
          <Icon name={app.form.mode === 'TCP' ? 'globe' : 'cable'} />
          <span>{target()}</span>
        </button>
        <Show
          when={app.connected()}
          fallback={
            <button class="btn primary large" classList={{ loading: app.busy() }} type="button" onClick={app.connect}>
              <Icon name="plug" />
              Connect
            </button>
          }
        >
          <button class="btn outline large" type="button" disabled={app.busy() && !app.scanning()} onClick={app.connect}>
            <Icon name="unplug" />
            Disconnect
          </button>
        </Show>
      </div>
    </section>
  );
}
