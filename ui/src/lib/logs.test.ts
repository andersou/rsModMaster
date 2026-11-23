import { describe, expect, it } from 'vitest';
import { capEntries, formatLine, type LogEntry, levelFromPlugin, matches } from './logs';

const entry = (level: LogEntry['level'], text: string): LogEntry => ({ time: '10:00:00.000', level, text });

describe('log', () => {
  it('filtro de nível é OR; nenhum = todos; busca ignora caixa', () => {
    expect(matches(entry('info', 'TCP connected'), new Set(), '')).toBe(true);
    expect(matches(entry('info', 'x'), new Set(['warn', 'error']), '')).toBe(false);
    expect(matches(entry('error', 'x'), new Set(['warn', 'error']), '')).toBe(true);
    expect(matches(entry('info', 'TCP connected'), new Set(), 'tcp')).toBe(true);
    expect(matches(entry('info', 'RTU'), new Set(), 'tcp')).toBe(false);
  });

  it('formato da linha copiada/exportada e níveis do plugin', () => {
    expect(formatLine(entry('warn', 'oops'))).toBe('[10:00:00.000] WARN  oops');
    expect([1, 2, 3, 4, 5].map(levelFromPlugin)).toEqual(['debug', 'debug', 'info', 'warn', 'error']);
  });

  it('acima do teto sai um quinto das mais antigas', () => {
    expect(capEntries([1, 2, 3, 4, 5, 6], 5)).toEqual([2, 3, 4, 5, 6]);
    expect(capEntries([1, 2], 5)).toEqual([1, 2]);
  });
});
