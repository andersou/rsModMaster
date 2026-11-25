import { type JSX, onCleanup, onMount } from 'solid-js';

/** Menu suspenso preso a um botão: fecha com Esc ou clique fora (o clique no próprio botão fica com o
 *  toggle dele) e começa com o foco no item marcado, ou no primeiro. Use dentro de um Portal. */
export function Popup(props: { pos: { right: number; top: number }; anchor: HTMLElement; label: string; class?: string; onClose: () => void; children: JSX.Element }) {
  let ref!: HTMLDivElement;
  const onEvent = (event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
      }
      return;
    }
    if (!ref.contains(event.target as Node) && !props.anchor.contains(event.target as Node)) props.onClose();
  };
  onMount(() => {
    document.addEventListener('pointerdown', onEvent, true);
    document.addEventListener('keydown', onEvent, true);
    (ref.querySelector<HTMLElement>('[aria-checked="true"]') ?? ref.querySelector<HTMLElement>('button'))?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('pointerdown', onEvent, true);
    document.removeEventListener('keydown', onEvent, true);
  });
  return (
    <div ref={ref} class={props.class ? `menu ${props.class}` : 'menu'} role="menu" aria-label={props.label} style={{ right: `${props.pos.right}px`, top: `${props.pos.top}px` }}>
      {props.children}
    </div>
  );
}

/** Posição do menu logo abaixo do botão, alinhado pela direita. */
export const popupBelow = (button: HTMLElement) => {
  const r = button.getBoundingClientRect();
  return { right: innerWidth - r.right, top: r.bottom + 4 };
};
