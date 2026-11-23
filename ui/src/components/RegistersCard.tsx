import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { app } from '../appStore';
import { BASE_LABELS, type Base, type Cell, ENDIAN_LABELS, type Endian, formatAddress, GRID_WIDTH, inputValid, maxLength } from '../lib/registers';
import { Icon } from './Icon';

const COLUMNS = Array.from({ length: GRID_WIDTH }, (_, i) => String(i).padStart(2, '0'));

interface Menu {
  address: number;
  x: number;
  y: number;
}

/** Formato de um endereço pelo botão direito, como o menu de contexto do fModMaster. */
const MENU_ITEMS: { label: string; base: Base; endian?: Endian }[] = [
  { label: 'Dec', base: 'dec' },
  { label: 'Bin', base: 'bin' },
  { label: 'Hex', base: 'hex' },
  ...ENDIAN_LABELS.map((label, i) => ({ label: `Float ${label}`, base: 'float' as Base, endian: i as Endian })),
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
    if (c.floatOwner !== null) return `Second half of the float at ${c.floatOwner}`;
    if (c.converter !== null) return `${app.catalog().converters.find((x) => x.id === c.converter)?.name ?? c.converter} · converter`;
    const name = MENU_ITEMS.find(checked)?.label ?? BASE_LABELS[c.base];
    return `${name} · ${c.custom ? 'custom' : 'table default'}`;
  };
  return (
    <div
      ref={ref}
      class="menu"
      role="menu"
      aria-label={`Format of register ${props.menu.address}: ${state()}`}
      style={{ left: `${Math.min(props.menu.x, innerWidth - 240)}px`, top: `${Math.max(8, Math.min(props.menu.y, innerHeight - 440))}px` }}
    >
      <div class="menu-title">
        <span>Register {props.menu.address}</span>
        <span class="menu-state">{state()}</span>
      </div>
      <For each={MENU_ITEMS}>
        {(item) => (
          <button
            role="menuitemradio"
            aria-checked={checked(item)}
            type="button"
            disabled={current().floatOwner !== null || (item.base === 'float' && floatBlocked())}
            title={item.base === 'float' && floatBlocked() ? 'Float requires Write Multiple Registers (FC 10).' : undefined}
            onClick={() => pick(item.base, item.endian)}
          >
            <Icon name="check" class="menu-check" />
            {item.label}
          </button>
        )}
      </For>
      <div class="hairline" />
      <div class="menu-section">Converters</div>
      <For each={app.catalog().converters} fallback={<div class="menu-empty">No converters loaded</div>}>
        {(c) => (
          <button
            role="menuitemradio"
            aria-checked={current().converter === c.id}
            type="button"
            disabled={current().floatOwner !== null || (c.registers > 1 && floatBlocked())}
            title={`${c.id}.lua · ${c.registers} register${c.registers > 1 ? 's' : ''}${c.writable ? '' : ' · read-only'}`}
            onClick={() => {
              app.setConverter(props.menu.address, c.id);
              props.onClose();
            }}
          >
            <Icon name="check" class="menu-check" />
            <span class="spacer">{c.name}</span>
            <span class="menu-hint">
              {c.registers > 1 ? `×${c.registers}` : ''}
              {c.writable ? '' : ' RO'}
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
        Manage converters…
      </button>
      <div class="hairline" />
      <button
        role="menuitem"
        type="button"
        disabled={!current().custom && current().converter === null}
        onClick={() => {
          app.resetFormat(props.menu.address);
          props.onClose();
        }}
      >
        <span class="menu-check" />
        Reset to default ({BASE_LABELS[app.form.format]})
      </button>
    </div>
  );
}

function CellView(props: { cell: Cell; onMenu: (event: MouseEvent, cell: Cell) => void }) {
  const bits = () => app.spec().bits;
  const signed = () => app.grid().signed;
  const text = () => app.cellText(props.cell);
  const binary = () => props.cell.base === 'bin' && !bits() && props.cell.hasValue;
  const invalid = () => app.invalidCell() === props.cell.address || !inputValid(props.cell, text(), bits(), signed());
  return (
    <td
      class={`cell ${props.cell.kind}`}
      classList={{
        overridden: props.cell.overridden,
        bad: (!app.grid().valid && props.cell.kind !== 'unused') || Boolean(props.cell.error),
        bin: binary(),
      }}
      title={props.cell.tooltip || undefined}
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
    if (cell.kind === 'unused' || app.spec().bits || app.scanning()) return;
    setMenu({ address: cell.address, x: event.clientX, y: event.clientY });
  };
  const columns = () => (app.quantity() === 1 ? COLUMNS.slice(0, 1) : COLUMNS);
  const write = () => app.spec().write;
  const disabled = () => !app.connected() || app.scanning() || app.busy();
  return (
    <section class="card registers" aria-labelledby="registers-title">
      <div class="card-head">
        <h2 class="section-title" id="registers-title">
          <Icon name="table" />
          Registers
        </h2>
        <span class="context">
          {app.quantity()} × {app.spec().bits ? 'coil' : 'register'} · right-click a register to change its format
        </span>
        <span class="spacer" />
        <button class="btn primary" classList={{ loading: app.busy() && !app.scanning() }} type="button" disabled={disabled()} onClick={app.readWrite}>
          <Icon name={write() ? 'pencil' : 'play'} />
          {write() ? 'Write' : 'Read'}
        </button>
        <button class="btn outline" type="button" disabled={!app.connected() || (app.busy() && !app.scanning())} onClick={app.toggleScan}>
          <Icon name={app.scanning() ? 'square' : 'refresh-cw'} />
          {app.scanning() ? 'Stop' : 'Scan'}
        </button>
        <button class="btn ghost" type="button" disabled={app.scanning()} onClick={app.clearTable}>
          <Icon name="eraser" />
          Clear Table
        </button>
      </div>
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
            <For each={app.rows()}>
              {(row) => (
                <tr>
                  <th scope="row">{formatAddress(row.address, app.form.addrHex)}</th>
                  <For each={row.cells}>{(cell) => <CellView cell={cell} onMenu={onMenu} />}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={menu()}>{(m) => <FormatMenu menu={m()} onClose={() => setMenu(null)} />}</Show>
    </section>
  );
}
