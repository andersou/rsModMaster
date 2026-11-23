import { createEffect, createSignal, For, on, onMount, Show } from 'solid-js';
import { api } from '../api';
import { app, type RawLine } from '../appStore';
import { errorText, t, tk } from '../i18n';
import { localIso } from '../lib/time';
import { toast } from '../toasts';
import { Icon } from './Icon';

const lineText = (line: RawLine) => `${line.type} ${localIso(line.at)} ${line.mode} ${line.hex}`;
const [selected, setSelected] = createSignal<RawLine | null>(null);

/** Quantidade, salvar e limpar, no cabeçalho do painel. */
export function BusTools() {
  const save = async () => {
    const text = app.raw().map(lineText).join('\n');
    try {
      const path = await api.saveText(text ? `${text}\n` : '', 'bus-monitor.txt', t('bus.saveTitle'), t('store.textFilter'));
      if (path) toast(t('bus.saved', { path }));
    } catch (err) {
      toast(errorText(err), 'danger');
    }
  };
  return (
    <>
      <span class="context">{t('bus.count', { n: app.raw().length })}</span>
      <span class="log-sep" />
      <button class="btn ghost small square" type="button" title={t('bus.save')} aria-label={t('bus.saveLabel')} disabled={!app.raw().length} onClick={save}>
        <Icon name="download" />
      </button>
      <button
        class="btn ghost small square"
        type="button"
        title={t('bus.clear')}
        aria-label={t('bus.clear')}
        disabled={!app.raw().length}
        onClick={() => {
          app.clearRaw();
          setSelected(null);
        }}
      >
        <Icon name="trash-2" />
      </button>
    </>
  );
}

/** Quadros brutos Tx/Rx e os campos ADU/PDU do quadro escolhido. Fica no painel, não num diálogo:
 *  dá para ler, escrever e escanear olhando os quadros. */
export function BusView() {
  let list!: HTMLDivElement;
  // abre já no fim (os quadros mais recentes) e segue o fim enquanto o usuário não rolar para cima
  onMount(() => (list.scrollTop = list.scrollHeight));
  createEffect(
    on(app.raw, () => {
      if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 48) queueMicrotask(() => (list.scrollTop = list.scrollHeight));
    }),
  );
  const detail = () => {
    const line = selected();
    if (!line) return t('bus.select');
    const fields: [string, string][] = [[t('bus.type'), line.type], [t('bus.timestamp'), localIso(line.at)], [t('bus.mode'), line.mode]];
    for (const [key, value] of line.fields) fields.push([tk(`bus.fields.${key}`) ?? key, value]);
    return fields.map(([label, value]) => `${label}: ${value}`).join('\n');
  };
  return (
    <div class="bus-body">
      <div class="log-box">
        <div class="log-list" ref={list} role="listbox" aria-label={t('bus.list')}>
          <For each={app.raw()}>
            {(line) => (
              <div
                class={`log-row raw ${line.type.toLowerCase()}`}
                role="option"
                tabindex="-1"
                aria-selected={selected() === line}
                onClick={() => setSelected(line)}
              >
                <span class="dir">{line.type}</span>
                <span class="time">{localIso(line.at).slice(11)}</span>
                <span class="msg">{line.hex}</span>
              </div>
            )}
          </For>
        </div>
        <Show when={!app.raw().length}>
          <div class="log-empty">
            <Icon name="activity" />
            <span class="log-empty-title">{t('bus.emptyTitle')}</span>
            <span class="log-empty-text">{t('bus.emptyText')}</span>
          </div>
        </Show>
      </div>
      <pre class="frame-detail" aria-label="ADU / PDU">
        {detail()}
      </pre>
    </div>
  );
}
