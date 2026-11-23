// Idioma da tela: inglês, português ou espanhol. Preferência em localStorage (como o tema; não vai
// na sessão) e, sem ela, o idioma do sistema. Tudo o que chama `t` dentro de JSX, memo ou efeito se
// atualiza ao trocar o idioma.

import * as i18n from '@solid-primitives/i18n';
import { createEffect, createRoot, createSignal } from 'solid-js';
import type { Msg } from '../lib/types';
import { type Dict, en } from './en';
import { es } from './es';
import { pt } from './pt';

export type Locale = 'en' | 'pt' | 'es';

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'es', label: 'Español' },
];

export const DICTS: Record<Locale, Dict> = { en, pt, es };

const KEY = 'rsmodmaster.locale';

/** `pt-BR` -> `pt`; idioma sem tradução -> `null`. */
export const parseLocale = (raw: string | null | undefined): Locale | null => {
  const code = raw?.slice(0, 2).toLowerCase();
  return code === 'en' || code === 'pt' || code === 'es' ? code : null;
};

const stored = () => {
  try {
    return globalThis.localStorage?.getItem(KEY);
  } catch {
    return null;
  }
};

const [locale, setLocaleSignal] = createSignal<Locale>(parseLocale(stored()) ?? parseLocale(globalThis.navigator?.language) ?? 'en');
const flat = { en: i18n.flatten(en), pt: i18n.flatten(pt), es: i18n.flatten(es) };

export { locale };

export function setLocale(value: Locale) {
  try {
    globalThis.localStorage?.setItem(KEY, value);
  } catch {
    // sem localStorage (testes): vale só nesta execução
  }
  setLocaleSignal(value);
}

/** Tradução com chave tipada: `t('comm.connect')`, `t('status.packets', { n: 3 })`. */
export const t = i18n.translator(() => flat[locale()], i18n.resolveTemplate);

/** Chave montada em tempo de execução (código de erro, campo do bus monitor); `undefined` se não houver. */
export const tk = (key: string, args?: Record<string, string | number>): string | undefined => {
  const value = (t as (key: string, args?: Record<string, string | number>) => unknown)(key, args);
  return typeof value === 'string' ? value : undefined;
};

const isMsg = (value: unknown): value is Msg => typeof value === 'object' && value !== null && typeof (value as Msg).code === 'string';

/** Texto de um erro do core (`{ code, args }`) no idioma da tela; qualquer outra coisa vira texto. */
export function errorText(err: unknown): string {
  if (!isMsg(err)) return err instanceof Error ? err.message : String(err);
  const args: Record<string, string> = { ...err.args };
  if (err.code === 'exception') args.name = tk(`exceptions.e${args.code}`) ?? t('exceptions.unknown');
  return tk(`errors.${err.code}`, args) ?? err.code;
}

/** `lang` do documento acompanha o idioma (leitores de tela, hifenização). */
export function startLocale() {
  createRoot(() => createEffect(() => (document.documentElement.lang = locale())));
}
