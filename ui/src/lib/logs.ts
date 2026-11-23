// Regras do painel de log sem DOM (as mesmas do garten-updater), testadas em logs.test.ts.

export type Level = 'debug' | 'info' | 'warn' | 'error';

export const LEVELS: Level[] = ['debug', 'info', 'warn', 'error'];

/** Nomes dos níveis no selo, nos filtros e no texto copiado/exportado. */
export const LEVEL_LABELS: Record<Level, string> = { debug: 'DEBUG', info: 'INFO', warn: 'WARN', error: 'ERROR' };

export const MAX_ENTRIES = 5000;

export interface LogEntry {
  time: string;
  level: Level;
  text: string;
}

/** Nível do evento `log://log` do tauri-plugin-log (1 trace … 5 error). */
export const levelFromPlugin = (n: number): Level => (n >= 5 ? 'error' : n === 4 ? 'warn' : n === 3 ? 'info' : 'debug');

/** Filtro por nível é um OR: nenhum escolhido = todos; vários = qualquer um deles. A busca ignora caixa. */
export const matches = (entry: LogEntry, levels: ReadonlySet<Level>, query: string) =>
  (levels.size === 0 || levels.has(entry.level)) && (!query || entry.text.toLowerCase().includes(query));

/** Linha no formato do texto copiado e do arquivo exportado. */
export const formatLine = (entry: LogEntry) => `[${entry.time}] ${LEVEL_LABELS[entry.level].padEnd(5)} ${entry.text}`;

/** Acima do teto, as mais antigas saem em bloco (um quinto), para não cortar a cada linha nova. */
export const capEntries = <T>(entries: T[], max = MAX_ENTRIES): T[] => (entries.length > max ? entries.slice(max / 5) : entries);
