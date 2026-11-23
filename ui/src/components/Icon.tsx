/** Ícone Lucide do sprite em index.html. */
export function Icon(props: { name: string; class?: string }) {
  return (
    <svg class={props.class ? `icon ${props.class}` : 'icon'} aria-hidden="true">
      <use href={`#i-${props.name}`} />
    </svg>
  );
}
