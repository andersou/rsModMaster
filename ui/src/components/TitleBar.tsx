import { app } from '../appStore';
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
      <div class="titlebar-group" role="group" aria-label="Session">
        {/* trocar a sessão no meio do scan deixaria a thread com a requisição antiga */}
        <Action icon="file-plus" label="New Session" disabled={app.scanning()} onClick={app.newSession} />
        <Action icon="folder-open" label="Load Session" disabled={app.scanning()} onClick={app.loadSession} />
        <Action icon="save" label="Save Session" onClick={app.saveSession} />
      </div>
      <div class="titlebar-group" role="group" aria-label="View">
        <Action icon="activity" label="Bus Monitor" onClick={() => panel.toggle('bus')} />
        <Action icon="wrench" label="Tools" onClick={() => app.setDialog('tools')} />
        <Action icon="braces" label="Converters" onClick={() => app.setDialog('converters')} />
        <Action icon="file-text" label="Log" onClick={() => panel.toggle('log')} />
        <Action icon="settings-2" label="Settings" onClick={() => app.setDialog('settings')} />
        <Action icon="info" label="About" onClick={() => app.setDialog('about')} />
      </div>
      <div class="titlebar-group">
        <Segmented
          label="Theme"
          value={themePref()}
          onChange={setThemePref}
          options={[
            { value: 'system', label: <Icon name="monitor" />, title: 'Theme: follow the system' },
            { value: 'light', label: <Icon name="sun" />, title: 'Theme: light' },
            { value: 'dark', label: <Icon name="moon" />, title: 'Theme: dark' },
          ]}
        />
      </div>
    </header>
  );
}
