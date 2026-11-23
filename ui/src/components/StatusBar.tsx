import { app } from '../appStore';
import { t } from '../i18n';
import { logs } from '../logStore';
import { panel } from '../panel';
import { Icon } from './Icon';

/** Conexão, Base Addr e contadores, como a barra de status do qModMaster. */
export function StatusBar() {
  return (
    <footer class="statusbar">
      <span class="status" classList={{ success: app.connected() !== null, danger: app.connected() === null }}>
        {app.connected() ? t('status.connected', { target: app.connected()! }) + (app.scanning() ? t('status.scanning') : '') : t('status.disconnected')}
      </span>
      <span>{t('status.baseAddr', { value: app.settings.baseAddr })}</span>
      <span>{t('status.packets', { n: app.counters().packets })}</span>
      <span classList={{ 'has-errors': app.counters().errors > 0 }}>{t('status.errors', { n: app.counters().errors })}</span>
      <span class="spacer" />
      <div class="statusbar-actions">
        <button
          class="btn ghost small log-toggle"
          classList={{ active: panel.tab() === 'bus' }}
          type="button"
          aria-pressed={panel.tab() === 'bus'}
          onClick={() => panel.toggle('bus')}
        >
          <Icon name="activity" />
          {t('status.bus')}
        </button>
        <button
          class="btn ghost small log-toggle"
          classList={{ active: panel.tab() === 'log' }}
          type="button"
          aria-pressed={panel.tab() === 'log'}
          aria-label={logs.unseen() ? t('status.logUnseen', { n: logs.unseen() }) : t('status.log')}
          onClick={() => panel.toggle('log')}
        >
          <Icon name="square-terminal" />
          {t('status.log')}
          {logs.unseen() > 0 && <span class="badge">{logs.unseen()}</span>}
        </button>
        <button class="btn ghost small" type="button" onClick={app.resetCounters}>
          <Icon name="rotate-ccw" />
          {t('status.resetCounters')}
        </button>
      </div>
    </footer>
  );
}
