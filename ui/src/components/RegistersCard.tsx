import { createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js';
import { app } from '../appStore';
import { t } from '../i18n';
import { BASE_LABELS, type Base, type Cell, ENDIAN_LABELS, toEndian, type Endian, formatAddress, GRID_WIDTH, inputValid, maxLength } from '../lib/registers';
import { shortcut } from '../platform';
import { ChartView } from './ChartView';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

const COLUMNS = Array.from({ length: GRID_WIDTH }, (_, i) => String(i).padStart(2, '0'));

interface Menu {
  address: number;
  /** célula que mostra o valor (não a 2ª metade de float/converter): pode ir ao gráfico */
  owner: boolean;
  x: number;
  y: number;
}

/** Formato de um endereço pelo botão direito, como o menu de contexto do fModMaster. */
/** Nome do formato padrão da tabela, para o "Reset to default". */
const defaultLabel = () => {
  const [kind, arg] = app.defaultFormat().split(':');
  if (kind === 'conv') return app.catalog().converters.find((c) => c.id === arg)?.name ?? arg;
  if (kind === 'float') return t('request.float', { order: ENDIAN_LABELS[Number(arg)] });
  return BASE_LABELS[kind as Base];
};

const MENU_ITEMS: { label: () => string; base: Base; endian?: Endian }[] = [
  { label: () => 'Dec', base: 'dec' },
  { label: () => 'Bin', base: 'bin' },
  { label: () => 'Hex', base: 'hex' },
  ...ENDIAN_LABELS.map((order, i) => ({ label: () => t('request.float', { order }), base: 'float' as Base, endian: i as Endian })),
];

/** Formato de um endereço pelo botão direito, como o menu de contexto do fModMaster; o formato em
 *  vigor vem marcado. */
function FormatMenu(props: { menu: Menu; onClose: () => void }) {
  let ref!: HTMLDivElement;
  const current = () => app.formatAt(props.menu.address);
  const checked = (item: (typeof MENU_ITEMS)[number]) =>
    current().floatOwner === null && current().converter === null && item.base === current().base && (item.base !== 'float' || item.endian === current().endian);
  const pick = (base: Base, endian?: Endian) => {
    app.setFormat(props.menu.address, base, endian);
    props.onClose();
  };
  const close = (event: Event) => {
    if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.contains(event.target as Node)) props.onClose();
  };
  onMount(() => {
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', close, true);
    (ref.querySelector<HTMLElement>('[aria-checked="true"]') ?? ref.querySelector('button'))?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('keydown', close, true);
  });
  const floatBlocked = () => app.singleRegisterWrite();
  const state = () => {
    const c = current();
    if (c.floatOwner !== null) return t('menu.secondHalf', { owner: c.floatOwner });
    if (c.converter !== null) return t('menu.converterState', { name: app.catalog().converters.find((x) => x.id === c.converter)?.name ?? c.converter });
    const name = MENU_ITEMS.find(checked)?.label() ?? BASE_LABELS[c.base];
    return t(c.custom ? 'menu.custom' : 'menu.tableDefault', { name });
  };
  return (
    <div
      ref={ref}
      class="menu"
      role="menu"
      aria-label={t('menu.formatOf', { address: props.menu.address, state: state() })}
      style={{ left: `${Math.min(props.menu.x, innerWidth - 240)}px`, top: `${Math.max(8, Math.min(props.menu.y, innerHeight - 440))}px` }}
    >
      <div class="menu-title">
        <span class="menu-register">
          {t('menu.register', { address: props.menu.address, hex: props.menu.address.toString(16).toUpperCase().padStart(4, '0') })}
        </span>
        {/* o formato atual já vem marcado na lista; só a 2ª metade de float não tem o que marcar */}
        <Show when={current().floatOwner !== null}>
          <span class="menu-state">{state()}</span>
        </Show>
      </div>
      {/* nome do registrador: tooltip, legenda do gráfico */}
      <span class="input small menu-label">
        <input
          aria-label={t('menu.labelOf', { address: props.menu.address })}
          placeholder={t('menu.label')}
          maxLength={32}
          spellcheck={false}
          autocomplete="off"
          value={app.labels()[props.menu.address] ?? ''}
          onChange={(e) => app.setLabel(props.menu.address, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              app.setLabel(props.menu.address, e.currentTarget.value);
              props.onClose();
            }
          }}
        />
      </span>
      <button
        role="menuitemcheckbox"
        aria-checked={app.charted().has(props.menu.address)}
        type="button"
        disabled={!props.menu.owner}
        title={props.menu.owner ? undefined : t('menu.partOf')}
        onClick={() => {
          app.toggleChart(props.menu.address);
          props.onClose();
        }}
      >
        <Icon name="check" class="menu-check" />
        <span class="spacer">{t('menu.showInChart')}</span>
        <Show when={app.charted().has(props.menu.address)}>
          <span class="menu-swatch" style={{ background: `var(--series-${(app.charted().get(props.menu.address) ?? 0) + 1})` }} />
        </Show>
      </button>
      {/* bobinas não têm formato; no scan o formato não muda (a tabela e o gráfico ficariam incoerentes) */}
      <Show when={!app.spec().bits}>
      <div class="hairline" />
      <For each={MENU_ITEMS}>
        {(item) => (
          <button
            role="menuitemradio"
            aria-checked={checked(item)}
            type="button"
            disabled={app.scanning() || current().floatOwner !== null || (item.base === 'float' && floatBlocked())}
            title={item.base === 'float' && floatBlocked() ? t('menu.floatNeedsFc10') : undefined}
            onClick={() => pick(item.base, item.endian)}
          >
            <Icon name="check" class="menu-check" />
            <span class="spacer">{item.label()}</span>
            <Show when={item.base === 'float' && item.endian === toEndian(app.settings.floatEndian)}>
              <span class="menu-hint">{t('menu.default')}</span>
            </Show>
          </button>
        )}
      </For>
      <div class="hairline" />
      <div class="menu-section">{t('menu.converters')}</div>
      <For each={app.catalog().converters} fallback={<div class="menu-empty">{t('menu.noConverters')}</div>}>
        {(c) => (
          <button
            role="menuitemradio"
            aria-checked={current().converter === c.id}
            type="button"
            disabled={app.scanning() || current().floatOwner !== null || (c.registers > 1 && floatBlocked())}
            title={t('menu.converterInfo', { file: `${c.id}.lua`, n: c.registers, writable: c.writable })}
            onClick={() => {
              app.setConverter(props.menu.address, c.id);
              props.onClose();
            }}
          >
            <Icon name="check" class="menu-check" />
            <span class="spacer">{c.name}</span>
            <span class="menu-hint">
              {c.registers > 1 ? `×${c.registers}` : ''}
              {c.writable ? '' : ` ${t('menu.readOnlyShort')}`}
            </span>
          </button>
        )}
      </For>
      <button
        role="menuitem"
        type="button"
        onClick={() => {
          app.setDialog('converters');
          props.onClose();
        }}
      >
        <Icon name="braces" class="menu-check visible" />
        {t('menu.manage')}
      </button>
      <div class="hairline" />
      <button
        role="menuitem"
        type="button"
        disabled={app.scanning() || !current().custom}
        onClick={() => {
          app.resetFormat(props.menu.address);
          props.onClose();
        }}
      >
        <span class="menu-check" />
        {t('menu.reset', { name: defaultLabel() })}
      </button>
      </Show>
    </div>
  );
}

function CellView(props: { cell: Cell; onMenu: (event: MouseEvent, cell: Cell) => void }) {
  const bits = () => app.spec().bits;
  const signed = () => app.grid().signed;
  const text = () => app.cellText(props.cell);
  const binary = () => props.cell.base === 'bin' && !bits() && props.cell.hasValue;
  const invalid = () => app.invalidCell() === props.cell.address || !inputValid(props.cell, text(), bits(), signed());
  /** faixa da cor da série (registrador no gráfico) */
  const marker = () => {
    const slot = props.cell.kind === 'value' ? app.charted().get(props.cell.address) : undefined;
    if (slot === undefined) return undefined;
    return `inset 3px 0 0 var(--series-${slot + 1})`;
  };
  return (
    <td
      class={`cell ${props.cell.kind}`}
      classList={{
        overridden: props.cell.overridden,
        bad: (!app.grid().valid && props.cell.kind !== 'unused') || Boolean(props.cell.error),
        bin: binary(),
      }}
      title={[app.labels()[props.cell.address], props.cell.tooltip].filter(Boolean).join('\n') || undefined}
      style={{ 'box-shadow': marker() }}
      onContextMenu={(e) => props.onMenu(e, props.cell)}
    >
      <Show when={props.cell.editable} fallback={binary() ? [props.cell.text.slice(0, 8), <wbr />, props.cell.text.slice(8)] : props.cell.text}>
        <input
          aria-label={props.cell.tooltip}
          classList={{ invalid: invalid() }}
          spellcheck={false}
          autocomplete="off"
          maxLength={props.cell.converter ? 64 : maxLength(props.cell.base, bits(), signed())}
          value={text()}
          disabled={app.scanning()}
          onInput={(e) => app.setEdit(props.cell.address, e.currentTarget.value)}
        />
      </Show>
    </td>
  );
}

/** Tabela de 10 colunas e as ações de leitura/escrita, scan e limpar. */
export function RegistersCard() {
  const [menu, setMenu] = createSignal<Menu | null>(null);
  const onMenu = (event: MouseEvent, cell: Cell) => {
    event.preventDefault();
    if (cell.kind === 'unused') return;
    setMenu({ address: cell.address, owner: cell.kind === 'value', x: event.clientX, y: event.clientY });
  };
  const columns = () => (app.quantity() === 1 ? COLUMNS.slice(0, 1) : COLUMNS);
  const write = () => app.spec().write;
  const chartView = app.showingChart;
  const disabled = () => !app.connected() || app.scanning() || app.busy();
  return (
    <section class="card registers" aria-labelledby="registers-title">
      <div class="card-head">
        <h2 class="section-title" id="registers-title">
          <Icon name="table" />
          {t('registers.title')}
        </h2>
        <Segmented
          label={t('registers.view')}
          value={chartView() ? 'chart' : 'table'}
          disabled={write()}
          onChange={app.setView}
          options={[
            { value: 'table', label: t('registers.table'), title: t('registers.tableView') },
            { value: 'chart', label: t('registers.chart'), title: write() ? t('registers.chartForReads') : t('registers.chartView', { key: shortcut('G') }) },
          ]}
        />
        <span class="context">
          {t('registers.context', { n: app.quantity(), bits: app.spec().bits })}
        </span>
        <span class="spacer" />
        <button class="btn primary" classList={{ loading: app.busy() && !app.scanning() }} type="button" disabled={disabled()} onClick={app.readWrite}>
          <Icon name={write() ? 'pencil' : 'play'} />
          {write() ? t('registers.write') : t('registers.read')}
        </button>
        <button class="btn outline" type="button" disabled={!app.connected() || (app.busy() && !app.scanning())} onClick={app.toggleScan}>
          <Icon name={app.scanning() ? 'square' : 'refresh-cw'} />
          {app.scanning() ? t('registers.stop') : t('registers.scan')}
        </button>
        <Show when={!chartView()}>
          <button class="btn ghost" type="button" disabled={app.scanning()} onClick={app.clearTable}>
            <Icon name="eraser" />
            {t('registers.clearTable')}
          </button>
        </Show>
      </div>
      <Show when={chartView()}>
        <ChartView />
      </Show>
      {/* desmontada no gráfico: nada de DOM atualizado a cada volta do scan */}
      <Show when={!chartView()}>
      <div class="grid-scroll">
        {/* colunas iguais e fixas: nada pula no scan; Bin pede colunas mais largas (16 dígitos) */}
        <table
          class="grid"
          classList={{ write: write(), single: app.quantity() === 1 }}
          style={{ '--col': write() && app.rows().some((r) => r.cells.some((c) => c.base === 'bin' && c.editable)) ? '132px' : '104px' }}
        >
          <colgroup>
            <col class="head-col" />
            <For each={columns()}>{() => <col />}</For>
          </colgroup>
          <thead>
            <tr>
              <th scope="col" class="corner" />
              <For each={columns()}>{(c) => <th scope="col">{c}</th>}</For>
            </tr>
          </thead>
          <tbody>
            {/* Index: a cada leitura as células são objetos novos; com For todo <td> seria recriado.
                Assim cada posição mantém o seu elemento e só o conteúdo muda. */}
            <Index each={app.rows()}>
              {(row) => (
                <tr>
                  <th scope="row">{formatAddress(row().address, app.form.addrHex)}</th>
                  <Index each={row().cells}>{(cell) => <CellView cell={cell()} onMenu={onMenu} />}</Index>
                </tr>
              )}
            </Index>
          </tbody>
        </table>
      </div>
      </Show>
      <Show when={menu()}>{(m) => <FormatMenu menu={m()} onClose={() => setMenu(null)} />}</Show>
    </section>
  );
}
