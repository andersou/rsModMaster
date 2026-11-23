import { For, type JSX } from 'solid-js';

/** Escolha entre poucas opções (radio group). */
export function Segmented<T extends string>(props: {
  label: string;
  options: readonly { value: T; label: JSX.Element; title?: string }[];
  value: T;
  disabled?: boolean;
  /** num diálogo: o foco inicial vai para a opção escolhida, não para a primeira */
  autofocus?: boolean;
  onChange: (value: T) => void;
}) {
  const onKey = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || props.disabled) return;
    event.preventDefault();
    const i = props.options.findIndex((o) => o.value === props.value);
    const next = props.options[(i + step + props.options.length) % props.options.length];
    props.onChange(next.value);
    queueMicrotask(() => (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label} onKeyDown={onKey}>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            aria-label={option.title}
            title={option.title}
            aria-disabled={props.disabled}
            tabindex={props.value === option.value ? 0 : -1}
            autofocus={props.autofocus && props.value === option.value}
            onClick={() => !props.disabled && props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}
