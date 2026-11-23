import { For } from 'solid-js';
import { type Tone, toasts } from '../toasts';
import { Icon } from './Icon';

const ICONS: Record<Tone, string> = { success: 'circle-check', warning: 'info', danger: 'circle-x' };

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      <For each={toasts()}>
        {(toast) => (
          <div class={`toast ${toast.tone}`}>
            <Icon name={ICONS[toast.tone]} />
            <span>{toast.text}</span>
          </div>
        )}
      </For>
    </div>
  );
}
