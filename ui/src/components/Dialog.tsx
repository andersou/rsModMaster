import { createEffect, type JSX } from 'solid-js';

/** `<dialog>` modal nativo controlado por `open`: Esc e o fechamento nativo avisam por `onClose`.
 *  O foco inicial é o elemento com `autofocus` (comportamento do próprio `showModal`). */
export function Dialog(props: {
  open: boolean;
  /** chamado logo antes de abrir: o lugar de preparar o conteúdo */
  onOpen?: () => void;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  class?: string;
  onCancel?: (event: Event) => void;
  children: JSX.Element;
}) {
  let dialog!: HTMLDialogElement;
  createEffect(() => {
    if (props.open && !dialog.open) {
      props.onOpen?.();
      // o que o onOpen mudou só chega ao DOM depois deste efeito; o foco inicial do showModal
      // (autofocus) precisa já ver o conteúdo novo
      queueMicrotask(() => props.open && !dialog.open && dialog.showModal());
    }
    else if (!props.open && dialog.open) dialog.close();
  });
  return (
    <dialog
      ref={dialog}
      class={props.class ? `dialog ${props.class}` : 'dialog'}
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      onClose={() => props.onClose()}
      onCancel={(event) => props.onCancel?.(event)}
    >
      {props.children}
    </dialog>
  );
}
