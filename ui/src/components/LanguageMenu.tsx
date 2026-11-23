import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { type Locale, LOCALES, locale, setLocale, t } from '../i18n';
import { Flag } from './Flag';
import { Icon } from './Icon';

/** Idioma na barra de título: o botão mostra só a bandeira atual; o menu lista bandeira e nome.
 *  O menu vai num Portal, fora da área de arrastar a janela. */
export function LanguageMenu() {
  let button!: HTMLButtonElement;
  const [pos, setPos] = createSignal<{ right: number; top: number } | null>(null);
  const name = () => LOCALES.find((l) => l.value === locale())?.label ?? '';
  const toggle = () => {
    if (pos()) return setPos(null);
    const r = button.getBoundingClientRect();
    setPos({ right: innerWidth - r.right, top: r.bottom + 4 });
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
            <Menu pos={p()} anchor={button} onPick={pick} onClose={close} />
          </Portal>
        )}
      </Show>
    </>
  );
}

function Menu(props: { pos: { right: number; top: number }; anchor: HTMLElement; onPick: (value: Locale) => void; onClose: () => void }) {
  let ref!: HTMLDivElement;
  const onEvent = (event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
      }
      return;
    }
    // clique no próprio botão: quem fecha é o toggle dele
    if (!ref.contains(event.target as Node) && !props.anchor.contains(event.target as Node)) props.onClose();
  };
  onMount(() => {
    document.addEventListener('pointerdown', onEvent, true);
    document.addEventListener('keydown', onEvent, true);
    ref.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('pointerdown', onEvent, true);
    document.removeEventListener('keydown', onEvent, true);
  });
  return (
    <div ref={ref} class="menu lang-menu" role="menu" aria-label={t('language')} style={{ right: `${props.pos.right}px`, top: `${props.pos.top}px` }}>
      <For each={LOCALES}>
        {(l) => (
          <button role="menuitemradio" aria-checked={locale() === l.value} type="button" onClick={() => props.onPick(l.value)}>
            <Flag locale={l.value} />
            <span class="spacer">{l.label}</span>
            <Icon name="check" class="menu-check" />
          </button>
        )}
      </For>
    </div>
  );
}
