import { For, Show } from 'solid-js';
import { app } from '../appStore';
import { t } from '../i18n';
import { FORMAT_OPTIONS, FUNCTIONS, toEndian } from '../lib/registers';
import { SelectField, TextField } from './Field';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

const ADDRESS_BASES = [
  { value: 'dec', label: 'Dec' },
  { value: 'hex', label: 'Hex' },
] as const;

/** Função e formato padrão da tabela; embaixo, endereço inicial e quantidade (rótulo à esquerda). */
export function RequestCard() {
  const locked = () => app.scanning();
  return (
    <section class="card request" aria-labelledby="request-title">
      <div class="card-head">
        <h2 class="section-title" id="request-title">
          <Icon name="send" />
          {t('request.title')}
        </h2>
      </div>
      <div class="request-grid">
        <SelectField label={t('request.functionCode')} value={app.form.fn} disabled={locked()} onChange={(e) => app.setFunction(Number(e.currentTarget.value))}>
          <For each={FUNCTIONS}>
            {(f) => (
              <option value={f.code}>
                {f.code.toString(16).padStart(2, '0').toUpperCase()} · {f.name}
              </option>
            )}
          </For>
        </SelectField>
        <SelectField
          label={t('request.defaultFormat')}
          value={app.defaultFormat()}
          disabled={locked() || app.spec().bits}
          onChange={(e) => app.setDefaultFormat(e.currentTarget.value)}
        >
          {/* os mesmos formatos do menu de contexto (FORMAT_OPTIONS) */}
          <For each={FORMAT_OPTIONS}>
            {(o) => (
              <option value={o.value} disabled={o.base === 'float' && app.singleRegisterWrite()}>
                {o.label()}
                {o.base === 'float' && o.endian === toEndian(app.settings.floatEndian) ? t('request.isDefault') : ''}
              </option>
            )}
          </For>
          <Show when={app.catalog().converters.length}>
            <optgroup label={t('request.converters')}>
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
        <div class="field inline">
          <span class="label">{t('request.startAddress')}</span>
          <div class="addr" title={app.errors().start}>
            <span class="input" classList={{ invalid: Boolean(app.errors().start) }}>
              <Show when={app.form.addrHex}>
                <span class="input-prefix">0x</span>
              </Show>
              <input
                aria-label={t('request.startAddress')}
                aria-invalid={Boolean(app.errors().start)}
                spellcheck={false}
                autocomplete="off"
                value={app.form.start}
                disabled={locked()}
                onInput={(e) => app.setForm('start', e.currentTarget.value)}
              />
            </span>
            <Segmented
              label={t('request.addressBase')}
              options={ADDRESS_BASES}
              value={app.form.addrHex ? 'hex' : 'dec'}
              disabled={locked()}
              onChange={(base) => app.setAddrHex(base === 'hex')}
            />
          </div>
        </div>
        <TextField
          label={app.spec().quantityLabel}
          class="inline"
          inputmode="numeric"
          value={app.form.qty}
          error={app.errors().qty}
          disabled={locked() || app.spec().max === 1}
          onInput={(e) => app.setForm('qty', e.currentTarget.value)}
        />
      </div>
    </section>
  );
}
