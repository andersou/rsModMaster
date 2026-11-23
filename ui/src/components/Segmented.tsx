import { For } from 'solid-js';

/** Escolha entre poucas opções (radio group). */
export function Segmented<T extends string>(props: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            aria-disabled={props.disabled}
            onClick={() => !props.disabled && props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}
