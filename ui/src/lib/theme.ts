// Regras do tema, sem DOM: a preferência gravada e o tema efetivo.

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** Valor gravado inválido ou ausente volta a "system". */
export const parseThemePref = (raw: string | null): ThemePref => (raw === 'light' || raw === 'dark' ? raw : 'system');

export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme => (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref);
