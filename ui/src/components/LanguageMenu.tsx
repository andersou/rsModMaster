import { createSignal, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { type Locale, LOCALES, locale, setLocale, t } from '../i18n';
import { Flag } from './Flag';
import { Icon } from './Icon';
import { Popup, popupBelow } from './Popup';

/** Idioma na barra de título: o botão mostra só a bandeira atual; o menu lista bandeira e nome.
 *  O menu vai num Portal, fora da área de arrastar a janela. */
export function LanguageMenu() {
  let button!: HTMLButtonElement;
  const [pos, setPos] = createSignal<{ right: number; top: number } | null>(null);
  const name = () => LOCALES.find((l) => l.value === locale())?.label ?? '';
  const toggle = () => {
    setPos(pos() ? null : popupBelow(button));
  };
  const close = () => {
    setPos(null);
    button.focus();
  };
  const pick = (value: Locale) => {
    setLocale(value);
    close();
  };
  return (
    <>
      <button
        ref={button}
        class="btn ghost square"
        type="button"
        title={`${t('language')}: ${name()}`}
        aria-label={`${t('language')}: ${name()}`}
        aria-haspopup="menu"
        aria-expanded={pos() !== null}
        onClick={toggle}
      >
        <Flag locale={locale()} />
      </button>
      <Show when={pos()}>
        {(p) => (
          <Portal>
            <Popup pos={p()} anchor={button} label={t('language')} class="lang-menu" onClose={close}>
              <For each={LOCALES}>
                {(l) => (
                  <button role="menuitemradio" aria-checked={locale() === l.value} type="button" onClick={() => pick(l.value)}>
                    <Flag locale={l.value} />
                    <span class="spacer">{l.label}</span>
                    <Icon name="check" class="menu-check" />
                  </button>
                )}
              </For>
            </Popup>
          </Portal>
        )}
      </Show>
    </>
  );
}
