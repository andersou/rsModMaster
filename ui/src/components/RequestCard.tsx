import { For, Show } from 'solid-js';
import { app } from '../appStore';
import { BASE_LABELS, type Base, ENDIAN_LABELS, FUNCTIONS, toEndian } from '../lib/registers';
import { SelectField, TextField } from './Field';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

const ADDRESS_BASES = [
  { value: 'dec', label: 'Dec' },
  { value: 'hex', label: 'Hex' },
] as const;
const BASES: Base[] = ['dec', 'bin', 'hex'];

/** Função, endereço inicial, quantidade e formato padrão da tabela. */
export function RequestCard() {
  const locked = () => app.scanning();
  return (
    <section class="card request" aria-labelledby="request-title">
      <div class="card-head">
        <h2 class="section-title" id="request-title">
          <Icon name="send" />
          Request
        </h2>
      </div>
      <div class="row">
        <SelectField label="Function Code" class="grow" value={app.form.fn} disabled={locked()} onChange={(e) => app.setFunction(Number(e.currentTarget.value))}>
          <For each={FUNCTIONS}>
            {(f) => (
              <option value={f.code}>
                {f.code.toString(16).padStart(2, '0').toUpperCase()} · {f.name}
              </option>
            )}
          </For>
        </SelectField>
        <div class="field">
          <span class="label">Start Address</span>
          <div class="addr" title={app.errors().start}>
            <span class="input" classList={{ invalid: Boolean(app.errors().start) }}>
              <input
                aria-label="Start Address"
                aria-invalid={Boolean(app.errors().start)}
                spellcheck={false}
                autocomplete="off"
                value={app.form.start}
                disabled={locked()}
                onInput={(e) => app.setForm('start', e.currentTarget.value)}
              />
            </span>
            <Segmented
              label="Address base"
              options={ADDRESS_BASES}
              value={app.form.addrHex ? 'hex' : 'dec'}
              disabled={locked()}
              onChange={(base) => app.setAddrHex(base === 'hex')}
            />
          </div>
        </div>
        <TextField
          label={app.spec().quantityLabel}
          class="narrow"
          inputmode="numeric"
          value={app.form.qty}
          error={app.errors().qty}
          disabled={locked() || app.spec().max === 1}
          onInput={(e) => app.setForm('qty', e.currentTarget.value)}
        />
        <SelectField
          label="Default Format"
          class="format-field"
          value={app.defaultFormat()}
          disabled={locked() || app.spec().bits}
          onChange={(e) => app.setDefaultFormat(e.currentTarget.value)}
        >
          {/* as mesmas opções do menu de contexto */}
          <For each={BASES}>{(base) => <option value={base}>{BASE_LABELS[base]}</option>}</For>
          <For each={ENDIAN_LABELS}>
            {(label, i) => (
              <option value={`float:${i()}`} disabled={app.singleRegisterWrite()}>
                Float {label}
                {i() === toEndian(app.settings.floatEndian) ? ' · default' : ''}
              </option>
            )}
          </For>
          <Show when={app.catalog().converters.length}>
            <optgroup label="Converters">
              <For each={app.catalog().converters}>
                {(c) => (
                  <option value={`conv:${c.id}`} disabled={c.registers > 1 && app.singleRegisterWrite()}>
                    {c.name}
                    {c.registers > 1 ? ` ×${c.registers}` : ''}
                  </option>
                )}
              </For>
            </optgroup>
          </Show>
        </SelectField>
        <Show when={app.form.format === 'dec' && !app.form.converter && !app.spec().bits}>
          <label class="check signed">
            <input type="checkbox" checked={app.form.signed} disabled={locked()} onChange={(e) => app.setForm('signed', e.currentTarget.checked)} />
            Signed
          </label>
        </Show>
      </div>
    </section>
  );
}
