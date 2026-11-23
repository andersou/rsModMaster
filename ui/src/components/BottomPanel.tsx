import { onCleanup, onMount, Show } from 'solid-js';
import { app } from '../appStore';
import { logs } from '../logStore';
import { panel } from '../panel';
import { BusTools, BusView } from './BusMonitor';
import { Icon } from './Icon';
import { LogList, LogTools } from './LogPanel';

/** Painel que sobe da barra de status, como o devtools do Bruno: abas Log e Bus Monitor, os
 *  controles da aba à direita. Só a aba aberta é montada; fechado, nada é renderizado. */
export function BottomPanel() {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && panel.tab() && !document.querySelector('dialog[open], .menu')) panel.close();
  };
  onMount(() => document.addEventListener('keydown', onKey));
  onCleanup(() => document.removeEventListener('keydown', onKey));
  return (
    <Show when={panel.tab()}>
      {(tab) => (
        <section class="log-panel" aria-label="Developer panel">
          <div class="log-head">
            <div class="panel-tabs" role="tablist" aria-label="Panel">
              <button role="tab" type="button" aria-selected={tab() === 'log'} onClick={() => panel.open('log')}>
                <Icon name="square-terminal" />
                Log
                <Show when={logs.unseen()}>
                  <span class="badge">{logs.unseen()}</span>
                </Show>
              </button>
              <button role="tab" type="button" aria-selected={tab() === 'bus'} onClick={() => panel.open('bus')}>
                <Icon name="activity" />
                Bus Monitor
                <Show when={app.raw().length}>
                  <span class="tab-count">{app.raw().length}</span>
                </Show>
              </button>
            </div>
            <span class="spacer" />
            <Show when={tab() === 'log'}>
              <LogTools />
            </Show>
            <Show when={tab() === 'bus'}>
              <BusTools />
            </Show>
            <button class="btn ghost small square" type="button" title="Close (Esc)" aria-label="Close the panel" onClick={panel.close}>
              <Icon name="x" />
            </button>
          </div>
          <Show when={tab() === 'log'}>
            <LogList />
          </Show>
          <Show when={tab() === 'bus'}>
            <BusView />
          </Show>
        </section>
      )}
    </Show>
  );
}
