import { createEffect, createSignal, For, type JSX, on, onMount, Show } from 'solid-js';
import { api } from '../api';
import { app, type RawLine } from '../appStore';
import { errorText, t, tk } from '../i18n';
import { customRows, field, frameValues, functionText, type ValueEntry, valueEntries, type ValueMode } from '../lib/bus';
import type { Converted } from '../lib/registers';
import { localIso } from '../lib/time';
import { toast } from '../toasts';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

/** Com endereço, um registrador por linha (endereço apagado à direita, valor normal); sem, em linha. */
const valuesView = (entries: ValueEntry[]): JSX.Element =>
  entries[0]?.address === undefined ? (
    entries.map((e) => e.text).join(', ')
  ) : (
    <div class="frame-values">
      <For each={entries}>
        {(e) => (
          <>
            <span class="frame-addr">{e.address}</span>
            <span>{e.text}</span>
          </>
        )}
      </For>
    </div>
  );

/** Dec | Hex | Custom, ao lado de "Values:" (os valores vêm nas linhas de baixo). */
const valueModePicker = () => (
  <Segmented
    label={t('bus.valuesFormat')}
    value={valueMode()}
    onChange={setValueMode}
    options={[
      { value: 'dec', label: 'Dec', title: t('bus.valuesDec') },
      { value: 'hex', label: 'Hex', title: t('bus.valuesHex') },
      { value: 'custom', label: 'Custom', title: t('bus.valuesCustom') },
    ]}
  />
);

const lineText = (line: RawLine) => `${line.type} ${localIso(line.at)} ${line.mode} ${line.hex}`;
const [selected, setSelected] = createSignal<RawLine | null>(null);
const [valueMode, setValueMode] = createSignal<ValueMode>('custom');
/** decode dos converters do quadro escolhido (só ele: o Lua roda no core, sob demanda) */
const [decoded, setDecoded] = createSignal<{ line: RawLine; converted: Record<number, Converted> } | null>(null);

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
  const copy = () =>
    navigator.clipboard.writeText(app.raw().map(lineText).join('\n')).then(
      () => toast(t('bus.copied')),
      (error) => toast(t('log.copyFailed', { error: String(error) }), 'danger'),
    );
  return (
    <>
      <span class="context">{t('bus.count', { n: app.raw().length })}</span>
      <span class="log-sep" />
      <button class="btn ghost small square" type="button" title={t('bus.copy')} aria-label={t('bus.copy')} disabled={!app.raw().length} onClick={copy}>
        <Icon name="copy" />
      </button>
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
  // Custom com converter: decodifica os registradores do quadro escolhido, com os converters dele
  createEffect(
    on([selected, valueMode], async ([line, mode]) => {
      const text = line && field(line.fields, 'values');
      if (!line?.regs || !text || mode !== 'custom') return;
      const values = frameValues(text);
      const { start, format } = line.regs;
      const items = customRows(values, line.regs)
        .filter((c) => c.converter !== undefined && format.sizes?.[c.converter] !== undefined)
        .map((c) => ({ address: c.address, id: c.converter!, regs: values.slice(c.address - start, c.address - start + format.sizes![c.converter!]) }))
        .filter((item) => item.regs.length === format.sizes![item.id]);
      if (!items.length) return;
      try {
        const results = await api.convertDecode(items.map(({ id, regs }) => ({ id, regs })));
        setDecoded({ line, converted: Object.fromEntries(items.map((item, i) => [item.address, results[i]])) });
      } catch (err) {
        toast(errorText(err), 'danger');
      }
    }),
  );
  const detail = (): [string, JSX.Element][] | null => {
    const line = selected();
    if (!line) return null;
    // Tx/Rx na cor da lista de quadros
    const type = (
      <>
        <span class={`frame-dir ${line.type.toLowerCase()}`}>{line.type}</span> ({t(line.type === 'Tx' ? 'bus.request' : 'bus.response')})
      </>
    );
    const fields: [string, JSX.Element][] = [[t('bus.type'), type], [t('bus.timestamp'), localIso(line.at)], [t('bus.mode'), line.mode]];
    const converted = decoded()?.line === line ? decoded()!.converted : undefined;
    for (const [key, value] of line.fields) {
      const text = key === 'function' ? functionText(value) : key === 'values' ? (
          <>
            {valueModePicker()}
            {valuesView(valueEntries(frameValues(value), valueMode(), line.regs, converted))}
          </>
        ) : (
          value
        );
      fields.push([tk(`bus.fields.${key}`) ?? key, text]);
    }
    return fields;
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
      <div class="frame-detail" aria-label="ADU / PDU">
        <Show when={detail()} fallback={t('bus.select')}>
          {(fields) => <For each={fields()}>{([label, value]) => <div><span class="frame-key">{label}:</span> {value}</div>}</For>}
        </Show>
      </div>
    </div>
  );
}
