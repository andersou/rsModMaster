import { onCleanup, onMount, Show } from 'solid-js';
import { app } from '../appStore';
import { t } from '../i18n';
import { logs } from '../logStore';
import { clampHeight } from '../lib/panel';
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
  // a borda de cima arrasta: a altura é o que sobra entre o ponteiro e a barra de status
  const drag = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement;
    if (event.type === 'pointerdown') {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
    } else if (handle.hasPointerCapture(event.pointerId)) {
      const bottom = handle.parentElement!.getBoundingClientRect().bottom;
      panel.setHeight(clampHeight(bottom - event.clientY, window.innerHeight));
    }
  };
  const resizeKey = (event: KeyboardEvent) => {
    const step = { ArrowUp: 24, ArrowDown: -24 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = (event.currentTarget as HTMLElement).parentElement!.offsetHeight;
    panel.setHeight(clampHeight(current + step, window.innerHeight));
  };
  return (
    <Show when={panel.tab()}>
      {(tab) => (
        <section class="log-panel" aria-label={t('panel.label')} style={{ height: panel.height() ? `${panel.height()}px` : undefined }}>
          <div
            class="panel-resize"
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('panel.resize')}
            title={t('panel.resizeHint')}
            tabindex="0"
            onPointerDown={drag}
            onPointerMove={drag}
            onDblClick={() => panel.setHeight(null)}
            onKeyDown={resizeKey}
          />
          <div class="log-head">
            <div class="panel-tabs" role="tablist" aria-label={t('panel.tabs')}>
              <button role="tab" type="button" aria-selected={tab() === 'log'} onClick={() => panel.open('log')}>
                <Icon name="square-terminal" />
                {t('panel.log')}
                <Show when={logs.unseen()}>
                  <span class="badge">{logs.unseen()}</span>
                </Show>
              </button>
              <button role="tab" type="button" aria-selected={tab() === 'bus'} onClick={() => panel.open('bus')}>
                <Icon name="activity" />
                {t('panel.bus')}
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
            <button class="btn ghost small square" type="button" title={t('panel.close')} aria-label={t('panel.closeLabel')} onClick={panel.close}>
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
