import { describe, expect, it } from 'vitest';
import kk from './kk.json';
import ru from './ru.json';
import { dictionaryKeys, formatNumber, formatPct, t, tp } from './index';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('словари ru и kk', () => {
  it('одинаковые ключи: строка без перевода ломает сборку (ТЗ, «Заметки по локализации»)', () => {
    const ruKeys = Object.keys(ru).sort();
    const kkKeys = Object.keys(kk).sort();
    expect(kkKeys.filter((k) => !ruKeys.includes(k))).toEqual([]);
    expect(ruKeys.filter((k) => !kkKeys.includes(k))).toEqual([]);
  });

  it('у каждого ключа одинаковые параметры подстановки в обоих языках', () => {
    const mismatched = Object.keys(ru).filter(
      (k) => placeholders((ru as Record<string, string>)[k]!) !== placeholders((kk as Record<string, string>)[k]!),
    );
    expect(mismatched).toEqual([]);
  });

  it('нет пустых значений', () => {
    for (const [lang, dict] of [['ru', ru], ['kk', kk]] as const) {
      const empty = Object.entries(dict).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
      expect(empty.map(([k]) => `${lang}:${k}`)).toEqual([]);
    }
  });

  it('ключи, которые использует ядро в ошибках, есть в словарях', () => {
    const coreKeys = [
      'err.noSheet', 'err.missingColumn', 'err.badValue', 'err.badValueEmpty', 'err.duplicateRow',
      'err.format', 'err.personalData', 'err.offline', 'err.trialClosed',
      'expect.number', 'expect.int', 'expect.filled', 'expect.schoolType', 'expect.textbook',
      'status.norm', 'status.textbook', 'status.program', 'status.lowdata',
    ];
    for (const key of coreKeys) {
      expect(dictionaryKeys('ru')).toContain(key);
      expect(dictionaryKeys('kk')).toContain(key);
    }
  });
});

describe('t и tp', () => {
  it('подставляет параметры', () => {
    expect(t('ru', 'err.noSheet', { sheet: 'Результаты' })).toBe(
      'В файле нет листа «Результаты». Скачайте шаблон и перенесите данные в него.',
    );
  });

  it('неизвестный ключ возвращается как есть, а не пустой строкой', () => {
    expect(t('ru', 'no.such.key')).toBe('no.such.key');
  });

  it('русские множественные формы: 1 тема, 2 темы, 5 тем, 21 тема', () => {
    const f = (n: number) => tp('ru', 'topics.summary', n, {});
    expect(f(1)).toBe('1 тема требует решения');
    expect(f(2)).toBe('2 темы требуют решения');
    expect(f(5)).toBe('5 тем требуют решения');
    expect(f(21)).toBe('21 тема требует решения');
    expect(f(11)).toBe('11 тем требуют решения');
  });

  it('казахский: одна форма для любого числа', () => {
    expect(tp('kk', 'topics.summary', 1)).toBe('1 тақырыпқа шешім қажет');
    expect(tp('kk', 'topics.summary', 7)).toBe('7 тақырыпқа шешім қажет');
  });
});

describe('числа', () => {
  it('десятичная запятая и пробел между разрядами', () => {
    expect(formatNumber(1512)).toBe('1 512');
    expect(formatNumber(-10.27, 1)).toBe('-10,3');
  });

  it('процент слитно с числом: 70%', () => {
    expect(formatPct(70)).toBe('70%');
  });
});
