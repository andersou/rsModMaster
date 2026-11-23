import { createEffect, createSignal, For, on, Show } from 'solid-js';
import { api } from '../api';
import { app, type RawLine } from '../appStore';
import { localIso } from '../lib/time';
import { toast } from '../toasts';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

const lineText = (line: RawLine) => `${line.type} ${localIso(line.at)} ${line.mode} ${line.hex}`;

/** Quadros brutos Tx/Rx e os campos ADU/PDU do quadro escolhido. */
export function BusMonitorDialog() {
  const [selected, setSelected] = createSignal<RawLine | null>(null);
  let list!: HTMLDivElement;
  const open = () => app.dialog() === 'bus';
  // segue o fim da lista enquanto o usuário não rolar para cima
  createEffect(
    on(app.raw, () => {
      if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 48) queueMicrotask(() => (list.scrollTop = list.scrollHeight));
    }),
  );
  const save = async () => {
    const text = app.raw().map(lineText).join('\n');
    try {
      const path = await api.saveText(text ? `${text}\n` : '', 'bus-monitor.txt');
      if (path) toast(`Saved to ${path}`);
    } catch (err) {
      toast(String(err), 'danger');
    }
  };
  const clear = () => {
    app.clearRaw();
    setSelected(null);
  };
  return (
    <Dialog open={open()} onOpen={() => setSelected(null)} onClose={() => app.setDialog(null)} labelledBy="bus-title" class="bus-dialog">
      <div class="dialog-head">
        <h2 class="dialog-title" id="bus-title">
          Bus Monitor
        </h2>
        <span class="context">last {app.raw().length} frames</span>
      </div>
      <div class="bus-body">
        <div class="log-box">
          <div class="log-list" ref={list} role="listbox" aria-label="Raw Data">
            <For each={app.raw()}>
              {(line) => (
                <div
                  class={`log-row raw ${line.type.toLowerCase()}`}
                  role="option"
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
              <span class="log-empty-title">No frames yet</span>
              <span class="log-empty-text">Read, write or scan to see the raw Tx/Rx frames here.</span>
            </div>
          </Show>
        </div>
        <pre class="frame-detail" aria-label="ADU / PDU">
          {selected() ? `Type: ${selected()!.type}\nTimestamp: ${localIso(selected()!.at)}\nMode: ${selected()!.mode}\n${selected()!.detail}` : 'Select a raw line to decode ADU/PDU fields.'}
        </pre>
      </div>
      <div class="dialog-actions">
        <button class="btn ghost" type="button" disabled={!app.raw().length} onClick={save}>
          <Icon name="save" />
          Save
        </button>
        <button class="btn ghost" type="button" disabled={!app.raw().length} onClick={clear}>
          <Icon name="eraser" />
          Clear
        </button>
        <span class="spacer" />
        <button class="btn outline" type="button" autofocus onClick={() => app.setDialog(null)}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
