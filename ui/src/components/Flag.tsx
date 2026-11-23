import { For } from 'solid-js';
import type { Locale } from '../i18n';

const STRIPES = Array.from({ length: 13 }, (_, i) => i);

/** Bandeira do idioma em SVG (os emojis de bandeira não aparecem no Windows). Simplificada para
 *  20×14 px: sem as estrelas dos EUA nem o brasão da Espanha. */
export function Flag(props: { locale: Locale }) {
  return (
    <svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">
      {props.locale === 'en' ? (
        <>
          <For each={STRIPES}>{(i) => <rect y={(i * 20) / 13} width="30" height={20 / 13 + 0.05} fill={i % 2 ? '#fff' : '#b22234'} />}</For>
          <rect width="12" height={(7 * 20) / 13} fill="#3c3b6e" />
        </>
      ) : props.locale === 'pt' ? (
        <>
          <rect width="30" height="20" fill="#009c3b" />
          <polygon points="15,2.2 27.6,10 15,17.8 2.4,10" fill="#ffdf00" />
          <circle cx="15" cy="10" r="4.6" fill="#002776" />
        </>
      ) : (
        <>
          <rect width="30" height="20" fill="#aa151b" />
          <rect y="5" width="30" height="10" fill="#f1bf00" />
        </>
      )}
    </svg>
  );
}
