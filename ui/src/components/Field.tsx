import { type JSX, splitProps } from 'solid-js';
import { Icon } from './Icon';

/** Rótulo + campo de texto do design system. */
export function TextField(props: { label: string; invalid?: boolean; class?: string } & JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [own, input] = splitProps(props, ['label', 'invalid', 'class']);
  return (
    <label class={own.class ? `field ${own.class}` : 'field'}>
      <span class="label">{own.label}</span>
      <span class="input" classList={{ invalid: own.invalid }}>
        <input spellcheck={false} autocomplete="off" {...input} />
      </span>
    </label>
  );
}

/** Rótulo + select nativo do design system. */
export function SelectField(props: { label: string; class?: string; children: JSX.Element } & JSX.SelectHTMLAttributes<HTMLSelectElement>) {
  const [own, select] = splitProps(props, ['label', 'class', 'children']);
  return (
    <label class={own.class ? `field ${own.class}` : 'field'}>
      <span class="label">{own.label}</span>
      <span class="select">
        <select {...select}>{own.children}</select>
        <Icon name="chevron-down" />
      </span>
    </label>
  );
}
