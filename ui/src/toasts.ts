import { createSignal } from 'solid-js';

export type Tone = 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let ids = 0;

export { toasts };

export function toast(text: string, tone: Tone = 'success') {
  const id = ++ids;
  setToasts((list) => [...list, { id, text, tone }]);
  setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'danger' ? 8000 : 4000);
}

export function dismiss(id: number) {
  setToasts((list) => list.filter((t) => t.id !== id));
}
