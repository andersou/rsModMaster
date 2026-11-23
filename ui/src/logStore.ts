// Linhas do log (as do Rust, via tauri-plugin-log) e os filtros do painel.

import { listen } from '@tauri-apps/api/event';
import { batch, createEffect, createMemo, createRoot, createSignal } from 'solid-js';
import { capEntries, type Level, type LogEntry, levelFromPlugin, matches } from './lib/logs';
import { localIso } from './lib/time';
import { panel } from './panel';

export const logs = createRoot(() => {
  const [entries, setEntries] = createSignal<LogEntry[]>([]);
  const [levels, setLevels] = createSignal<ReadonlySet<Level>>(new Set());
  const [query, setQuery] = createSignal('');
  const open = () => panel.tab() === 'log';
  /** erros chegados com o painel fechado (selo no botão) */
  const [unseen, setUnseen] = createSignal(0);
  // filtra só com o painel aberto (fechado, nenhuma linha nova refaz o filtro)
  createEffect(() => open() && setUnseen(0));
  const visible = createMemo(() => {
    if (!open()) return [];
    const [wanted, text] = [levels(), query().trim().toLowerCase()];
    return entries().filter((entry) => matches(entry, wanted, text));
  });

  // uma rajada de linhas vira um só lote na lista
  let pending: LogEntry[] = [];
  const flush = () => {
    const added = pending;
    pending = [];
    setEntries((list) => capEntries([...list, ...added]));
  };
  const push = (level: Level, text: string) => {
    if (!pending.length) queueMicrotask(flush);
    pending.push({ time: localIso(Date.now()).slice(11), level, text: text.trimEnd() });
    if (level === 'error' && !open()) setUnseen((n) => n + 1);
  };

  return {
    entries,
    visible,
    levels,
    query,
    setQuery,
    open,
    unseen,
    clear: () => setEntries([]),
    /** Passa a receber o log do Rust (chamar antes do primeiro comando). */
    listen: () => listen<{ level: number; message: string }>('log://log', (e) => push(levelFromPlugin(e.payload.level), e.payload.message)),
    toggleLevel(level: Level) {
      setLevels((current) => {
        const next = new Set(current);
        if (!next.delete(level)) next.add(level);
        return next;
      });
    },
    clearFilters() {
      batch(() => {
        setLevels(new Set<Level>());
        setQuery('');
      });
    },
  };
});
