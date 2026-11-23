import { app } from '../appStore';
import { logs } from '../logStore';
import { Icon } from './Icon';

/** Conexão, Base Addr e contadores, como a barra de status do qModMaster. */
export function StatusBar() {
  return (
    <footer class="statusbar">
      <span class="status" classList={{ success: app.connected() !== null, danger: app.connected() === null }}>
        {app.connected() ? `Connected (${app.connected()})${app.scanning() ? ' · scanning' : ''}` : 'Disconnected'}
      </span>
      <span>Base Addr: {app.settings.baseAddr}</span>
      <span>Packets: {app.counters().packets}</span>
      <span classList={{ 'has-errors': app.counters().errors > 0 }}>Errors: {app.counters().errors}</span>
      <span class="spacer" />
      <button
        class="btn ghost small log-toggle"
        classList={{ active: logs.open() }}
        type="button"
        aria-pressed={logs.open()}
        aria-label={`Log${logs.unseen() ? ` (${logs.unseen()} new errors)` : ''}`}
        onClick={() => logs.setOpen(!logs.open())}
      >
        <Icon name="square-terminal" />
        Log
        {logs.unseen() > 0 && <span class="badge">{logs.unseen()}</span>}
      </button>
      <button class="btn ghost small" type="button" onClick={app.resetCounters}>
        <Icon name="rotate-ccw" />
        Reset Counters
      </button>
    </footer>
  );
}
