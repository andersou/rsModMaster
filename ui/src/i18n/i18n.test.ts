import { readFileSync } from 'node:fs';
import { flatten } from '@solid-primitives/i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { DICTS, errorText, parseLocale, setLocale, t } from '.';

const flat = (dict: object) => flatten(dict as Record<string, unknown>) as Record<string, unknown>;
const placeholders = (text: unknown) => (typeof text === 'string' ? [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort() : []);
const en = flat(DICTS.en);

describe('dictionaries', () => {
  for (const [name, dict] of Object.entries(DICTS)) {
    it(`${name} has the same keys and parameters as English`, () => {
      const other = flat(dict);
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
      for (const [key, value] of Object.entries(en)) {
        expect(typeof other[key], key).toBe(typeof value);
        expect(placeholders(other[key]), key).toEqual(placeholders(value));
      }
    });
  }

  it('every core message code has a translation with the same parameters', () => {
    const rust = readFileSync(new URL('../../../core/src/msg.rs', import.meta.url), 'utf8');
    const codes = [...rust.matchAll(/^\s*"(\w+)" => "([^"]*)",$/gm)];
    expect(codes.length).toBeGreaterThan(30);
    for (const [, code, english] of codes) {
      const params = [...english.matchAll(/{(\w+)}/g)].map((m) => m[1]).sort();
      expect(placeholders(en[`errors.${code}`]), code).toEqual(params);
    }
  });
});

describe('locale', () => {
  afterEach(() => setLocale('en'));

  it('maps system languages to a dictionary', () => {
    expect(parseLocale('pt-BR')).toBe('pt');
    expect(parseLocale('es-419')).toBe('es');
    expect(parseLocale('EN')).toBe('en');
    expect(parseLocale('de-DE')).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
  });

  it('translates core errors, plurals and exception names in the chosen language', () => {
    const exception = { code: 'exception', args: { code: '2' } };
    expect(errorText(exception)).toBe('Modbus exception 2 (illegal data address)');
    expect(t('bus.count', { n: 1 })).toBe('last 1 frame');
    setLocale('pt');
    expect(errorText(exception)).toBe('Exceção Modbus 2 (endereço de dados ilegal)');
    expect(errorText({ code: 'wrong_slave', args: { got: '2', expected: '1' } })).toBe('Resposta do escravo 2 (esperado 1)');
    setLocale('es');
    expect(t('status.packets', { n: 3 })).toBe('Paquetes: 3');
    expect(errorText({ code: 'nope', args: {} })).toBe('nope');
    expect(errorText(new Error('boom'))).toBe('boom');
  });
});
