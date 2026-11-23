import { createSignal, For } from 'solid-js';
import { api } from '../api';
import { app } from '../appStore';
import { Dialog } from './Dialog';
import { SelectField } from './Field';
import { Icon } from './Icon';

type Command = 'Report Slave ID' | 'Ping' | 'Port Status';
const COMMANDS: Command[] = ['Report Slave ID', 'Ping', 'Port Status'];

/** Diagnóstico: Report Slave ID (FC 0x11) na conexão aberta; ping e porta TCP no IP configurado. */
export function ToolsDialog() {
  const [command, setCommand] = createSignal<Command>('Report Slave ID');
  const [output, setOutput] = createSignal('');
  const [running, setRunning] = createSignal(false);
  const tcpOnly = (c: Command) => c !== 'Report Slave ID';
  const available = (c: Command) => !tcpOnly(c) || app.form.mode === 'TCP';
  const exec = async () => {
    setRunning(true);
    setOutput('Running...');
    const s = app.settings;
    try {
      const c = command();
      if (c === 'Ping') setOutput(await api.ping(s.slaveIp));
      else if (c === 'Port Status') setOutput(await api.portStatus(s.slaveIp, s.tcpPort));
      else if (!app.connected()) setOutput('Report Slave ID\nError: not connected');
      else setOutput(await api.reportSlaveId(Math.min(Math.max(parseInt(app.form.slave, 10) || 1, 0), 255)));
    } catch (err) {
      setOutput(String(err));
    } finally {
      setRunning(false);
    }
  };
  return (
    <Dialog
      open={app.dialog() === 'tools'}
      onOpen={() => available(command()) || setCommand('Report Slave ID')}
      onClose={() => app.setDialog(null)}
      labelledBy="tools-title"
      class="tools-dialog"
    >
      <h2 class="dialog-title" id="tools-title">
        Tools
      </h2>
      <div class="row end">
        <SelectField label="Command" class="grow" value={command()} onChange={(e) => setCommand(e.currentTarget.value as Command)}>
          <For each={COMMANDS}>
            {(c) => (
              <option value={c} disabled={!available(c)}>
                {c}
                {tcpOnly(c) ? ' (TCP)' : ''}
              </option>
            )}
          </For>
        </SelectField>
        <button class="btn primary large" classList={{ loading: running() }} type="button" disabled={running()} onClick={exec}>
          <Icon name="play" />
          Exec
        </button>
      </div>
      <pre class="tool-output" aria-live="polite">
        {output() || 'Choose a command and press Exec.'}
      </pre>
      <div class="dialog-actions">
        <button class="btn ghost" type="button" disabled={!output() || running()} onClick={() => setOutput('')}>
          <Icon name="eraser" />
          Clear
        </button>
        <span class="spacer" />
        <button class="btn outline" type="button" autofocus onClick={() => app.setDialog(null)}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
