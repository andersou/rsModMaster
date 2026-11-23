import { createSignal, Show } from 'solid-js';
import { api } from '../api';
import { app } from '../appStore';
import { t } from '../i18n';
import { updates } from '../updates';
import { Icon } from './Icon';
import { Dialog } from './Dialog';

const REPO = 'https://github.com/andersou/rsModMaster';

export function AboutDialog() {
  const [check, setCheck] = createSignal<'idle' | 'checking' | 'new' | 'latest' | 'error'>('idle');
  const checkNow = async () => {
    setCheck('checking');
    setCheck(await updates.check());
  };
  return (
    <Dialog open={app.dialog() === 'about'} onOpen={() => setCheck('idle')} onClose={() => app.setDialog(null)} labelledBy="about-title">
      <h2 class="dialog-title" id="about-title">
        {t('about.title')}
      </h2>
      <div class="row about-version">
        <span>rsModMaster {__APP_VERSION__}</span>
        <button class="btn outline small" classList={{ loading: check() === 'checking' }} type="button" disabled={check() === 'checking'} onClick={checkNow}>
          <Icon name="refresh-cw" />
          {t('update.checkNow')}
        </button>
      </div>
      <Show when={check() === 'latest'}>
        <p class="muted">{t('update.latest')}</p>
      </Show>
      <Show when={check() === 'error'}>
        <p class="error">{t('update.failed')}</p>
      </Show>
      <Show when={check() === 'new' && updates.available()}>
        {(update) => (
          <div class="row about-version">
            <span>{t('update.available', { version: update().version })}</span>
            <button class="btn primary small" type="button" onClick={() => api.openUrl(update().url)}>
              <Icon name="download" />
              {t('update.download', { version: update().version })}
            </button>
          </div>
        )}
      </Show>
      <p class="muted">{t('about.description')}</p>
      <p>
        <a href={REPO} onClick={(e) => (e.preventDefault(), api.openUrl(REPO))}>
          github.com/andersou/rsModMaster
        </a>
      </p>
      <p class="muted">{t('about.credits')}</p>
      <div class="dialog-actions">
        <button class="btn primary" type="button" autofocus onClick={() => app.setDialog(null)}>
          {t('common.ok')}
        </button>
      </div>
    </Dialog>
  );
}
