import { createEffect, type JSX, onCleanup, onMount, splitProps } from 'solid-js';
import { Icon } from './Icon';

/** Rótulo + campo de texto do design system. */
export function TextField(
  props: { label: string; invalid?: boolean; error?: string; class?: string } & JSX.InputHTMLAttributes<HTMLInputElement>,
) {
  const [own, input] = splitProps(props, ['label', 'invalid', 'error', 'class']);
  return (
    <label class={own.class ? `field ${own.class}` : 'field'} title={own.error}>
      <span class="label">{own.label}</span>
      <span class="input" classList={{ invalid: own.invalid || Boolean(own.error) }}>
        <input spellcheck={false} autocomplete="off" aria-invalid={own.invalid || Boolean(own.error)} {...input} />
      </span>
    </label>
  );
}

/** Rótulo + select nativo do design system. O `value` é aplicado depois que as opções existem: no
 *  JSX ele chegaria antes delas e o navegador ficaria com a primeira opção. */
export function SelectField(props: { label: string; class?: string; children: JSX.Element } & JSX.SelectHTMLAttributes<HTMLSelectElement>) {
  const [own, select] = splitProps(props, ['label', 'class', 'children', 'value']);
  let el!: HTMLSelectElement;
  const apply = () => (el.value = String(own.value ?? ''));
  createEffect(apply);
  // opções que chegam depois (lista de portas): reaplica o valor
  onMount(() => {
    const observer = new MutationObserver(apply);
    observer.observe(el, { childList: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });
  return (
    <label class={own.class ? `field ${own.class}` : 'field'}>
      <span class="label">{own.label}</span>
      <span class="select">
        <select ref={el} {...select}>
          {own.children}
        </select>
        <Icon name="chevron-down" />
      </span>
    </label>
  );
}
