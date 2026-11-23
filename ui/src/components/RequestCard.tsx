import { For, Show } from 'solid-js';
import { app } from '../appStore';
import { BASE_LABELS, type Base, FUNCTIONS } from '../lib/registers';
import { SelectField, TextField } from './Field';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

const ADDRESS_BASES = [
  { value: 'dec', label: 'Dec' },
  { value: 'hex', label: 'Hex' },
] as const;
const FORMATS: Base[] = ['bin', 'dec', 'hex', 'float'];

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
              <option value={f.code} selected={f.code === app.form.fn}>
                {f.code.toString(16).padStart(2, '0').toUpperCase()} · {f.name}
              </option>
            )}
          </For>
        </SelectField>
        <div class="field">
          <span class="label">Start Address</span>
          <div class="addr">
            <span class="input">
              <input
                aria-label="Start Address"
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
              onChange={(base) => app.setForm('addrHex', base === 'hex')}
            />
          </div>
        </div>
        <TextField
          label={app.spec().quantityLabel}
          class="narrow"
          inputmode="numeric"
          value={app.form.qty}
          disabled={locked() || app.spec().max === 1}
          onInput={(e) => app.setForm('qty', e.currentTarget.value)}
          onBlur={() => app.setForm('qty', String(app.quantity()))}
        />
        <SelectField
          label="Default Format"
          class="narrow"
          value={app.form.format}
          disabled={locked() || app.spec().bits}
          onChange={(e) => app.setForm('format', e.currentTarget.value as Base)}
        >
          <For each={FORMATS}>
            {(base) => (
              <option value={base} selected={base === app.form.format} disabled={base === 'float' && app.singleRegisterWrite()}>
                {BASE_LABELS[base]}
              </option>
            )}
          </For>
        </SelectField>
        <Show when={app.form.format === 'dec' && !app.spec().bits}>
          <label class="check signed">
            <input type="checkbox" checked={app.form.signed} disabled={locked()} onChange={(e) => app.setForm('signed', e.currentTarget.checked)} />
            Signed
          </label>
        </Show>
      </div>
    </section>
  );
}
