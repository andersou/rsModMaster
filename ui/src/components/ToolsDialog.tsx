import { createSignal, For } from 'solid-js';
import { api } from '../api';
import { app } from '../appStore';
import { errorText, t } from '../i18n';
import { Dialog } from './Dialog';
import { SelectField } from './Field';
import { Icon } from './Icon';

type Command = 'report' | 'ping' | 'port';
const COMMANDS: Command[] = ['report', 'ping', 'port'];
const NAMES = { report: 'tools.reportSlaveId', ping: 'tools.ping', port: 'tools.portStatus' } as const;
const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

/** Diagnóstico: Report Slave ID (FC 0x11) na conexão aberta; ping e porta TCP no IP configurado.
 *  O core devolve os dados e a tela monta o texto no idioma escolhido. */
export function ToolsDialog() {
  const [command, setCommand] = createSignal<Command>('report');
  const [output, setOutput] = createSignal('');
  const [running, setRunning] = createSignal(false);
  const tcpOnly = (c: Command) => c !== 'report';
  const available = (c: Command) => !tcpOnly(c) || app.form.mode === 'TCP';
  const result = async (c: Command): Promise<string[]> => {
    const s = app.settings;
    if (c === 'ping') {
      const ping = await api.ping(s.slaveIp);
      return [t(ping.success ? 'tools.pingOk' : 'tools.pingFailed', { target: ping.target }), ping.output];
    }
    if (c === 'port') return [t('tools.portOpen', { target: await api.portStatus(s.slaveIp, s.tcpPort) })];
    if (!app.connected()) throw { code: 'not_connected', args: {} };
    const id = await api.reportSlaveId(Math.min(Math.max(parseInt(app.form.slave, 10) || 1, 0), 255));
    const lines = [t('tools.runStatus', { state: t(id.running ? 'tools.on' : 'tools.off') }), t('tools.slaveId', { id: id.data[0] ?? '-' })];
    if (id.data.length) lines.push(t('tools.data', { bytes: hex(id.data) }));
    return lines;
  };
  const exec = async () => {
    const c = command();
    setRunning(true);
    setOutput(t('tools.running'));
    try {
      setOutput([t(NAMES[c]), ...(await result(c))].join('\n'));
    } catch (err) {
      setOutput(`${t(NAMES[c])}\n${t('tools.error', { text: errorText(err) })}`);
    } finally {
      setRunning(false);
    }
  };
  return (
    <Dialog
      open={app.dialog() === 'tools'}
      onOpen={() => available(command()) || setCommand('report')}
      onClose={() => app.setDialog(null)}
      labelledBy="tools-title"
      class="tools-dialog"
    >
      <h2 class="dialog-title" id="tools-title">
        {t('tools.title')}
      </h2>
      <div class="row end">
        <SelectField label={t('tools.command')} class="grow" value={command()} onChange={(e) => setCommand(e.currentTarget.value as Command)}>
          <For each={COMMANDS}>
            {(c) => (
              <option value={c} disabled={!available(c)}>
                {t(NAMES[c])}
                {tcpOnly(c) ? ' (TCP)' : ''}
              </option>
            )}
          </For>
        </SelectField>
        <button class="btn primary large" classList={{ loading: running() }} type="button" disabled={running()} onClick={exec}>
          <Icon name="play" />
          {t('tools.exec')}
        </button>
      </div>
      <pre class="tool-output" aria-live="polite">
        {output() || t('tools.hint')}
      </pre>
      <div class="dialog-actions">
        <button class="btn ghost" type="button" disabled={!output() || running()} onClick={() => setOutput('')}>
          <Icon name="eraser" />
          {t('common.clear')}
        </button>
        <span class="spacer" />
        <button class="btn outline" type="button" autofocus onClick={() => app.setDialog(null)}>
          {t('common.close')}
        </button>
      </div>
    </Dialog>
  );
}
