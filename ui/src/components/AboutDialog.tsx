import { api } from '../api';
import { app } from '../appStore';
import { t } from '../i18n';
import { Dialog } from './Dialog';

const REPO = 'https://github.com/andersou/rsModMaster';

export function AboutDialog() {
  return (
    <Dialog open={app.dialog() === 'about'} onClose={() => app.setDialog(null)} labelledBy="about-title">
      <h2 class="dialog-title" id="about-title">
        {t('about.title')}
      </h2>
      <p>rsModMaster {__APP_VERSION__}</p>
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
