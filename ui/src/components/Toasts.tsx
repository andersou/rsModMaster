import { For } from 'solid-js';
import { dismiss, type Tone, toasts } from '../toasts';
import { Icon } from './Icon';

const ICONS: Record<Tone, string> = { success: 'circle-check', warning: 'info', danger: 'circle-x' };

export function Toasts() {
  return (
    <div class="toasts">
      <For each={toasts()}>
        {(toast) => (
          <div class={`toast ${toast.tone}`} role={toast.tone === 'danger' ? 'alert' : 'status'}>
            <Icon name={ICONS[toast.tone]} />
            <span class="spacer">{toast.text}</span>
            <button class="toast-close" type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <Icon name="x" />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
