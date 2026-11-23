import { app } from '../appStore';
import { LOCALES, locale, setLocale, t } from '../i18n';
import { panel } from '../panel';
import { setThemePref, themePref } from '../theme';
import { Segmented } from './Segmented';
import { Icon } from './Icon';

function Action(props: { icon: string; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button class="btn ghost square" type="button" title={props.label} aria-label={props.label} disabled={props.disabled} onClick={() => props.onClick()}>
      <Icon name={props.icon} />
    </button>
  );
}

/** Barra de título própria (arrastável), com as ações dos menus File, View e Help do fModMaster. */
export function TitleBar() {
  return (
    <header class="titlebar" data-tauri-drag-region="deep">
      <Icon name="cpu" class="brand" />
      <span class="app-name">rsModMaster</span>
      <span class="spacer" />
      <div class="titlebar-group" role="group" aria-label={t('titlebar.session')}>
        {/* trocar a sessão no meio do scan deixaria a thread com a requisição antiga */}
        <Action icon="file-plus" label={t('titlebar.newSession')} disabled={app.scanning()} onClick={app.newSession} />
        <Action icon="folder-open" label={t('titlebar.loadSession')} disabled={app.scanning()} onClick={app.loadSession} />
        <Action icon="save" label={t('titlebar.saveSession')} onClick={app.saveSession} />
      </div>
      <div class="titlebar-group" role="group" aria-label={t('titlebar.view')}>
        <Action icon="activity" label={t('titlebar.busMonitor')} onClick={() => panel.toggle('bus')} />
        <Action icon="wrench" label={t('titlebar.tools')} onClick={() => app.setDialog('tools')} />
        <Action icon="braces" label={t('titlebar.converters')} onClick={() => app.setDialog('converters')} />
        <Action icon="file-text" label={t('titlebar.log')} onClick={() => panel.toggle('log')} />
        <Action icon="settings-2" label={t('titlebar.settings')} onClick={() => app.setDialog('settings')} />
        <Action icon="info" label={t('titlebar.about')} onClick={() => app.setDialog('about')} />
      </div>
      <div class="titlebar-group">
        <Segmented
          label={t('language')}
          value={locale()}
          onChange={setLocale}
          options={LOCALES.map((l) => ({ value: l.value, label: l.value.toUpperCase(), title: l.label }))}
        />
        <Segmented
          label={t('titlebar.theme')}
          value={themePref()}
          onChange={setThemePref}
          options={[
            { value: 'system', label: <Icon name="monitor" />, title: t('titlebar.themeSystem') },
            { value: 'light', label: <Icon name="sun" />, title: t('titlebar.themeLight') },
            { value: 'dark', label: <Icon name="moon" />, title: t('titlebar.themeDark') },
          ]}
        />
      </div>
    </header>
  );
}
