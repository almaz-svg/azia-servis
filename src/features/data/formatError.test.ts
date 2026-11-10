import { describe, expect, it } from 'vitest';
import { formatError, formatErrors } from './formatError';

describe('formatErrors: сборка списка для экрана', () => {
  it('отсутствующие колонки собираются в одну строку с перечнем', () => {
    const lines = formatErrors(
      [
        { code: 'err.missingColumn', params: { column: 'Район' }, where: { sheet: 'Результаты', column: 'Район' } },
        { code: 'err.missingColumn', params: { column: 'Тип' }, where: { sheet: 'Результаты', column: 'Тип' } },
      ],
      'ru',
    );
    expect(lines).toEqual(['В листе нет колонок: Район, Тип. Скачайте шаблон и сверьте заголовки.']);
  });

  it('прочие ошибки остаются отдельными строками, после перечня колонок', () => {
    const lines = formatErrors(
      [
        { code: 'err.badValue', params: { value: 'x', expected: 'expect.int', min: 1, max: 9 }, where: { sheet: 'Результаты', row: 3, column: 'Учеников' } },
        { code: 'err.missingColumn', params: { column: 'Район' }, where: { sheet: 'Результаты', column: 'Район' } },
      ],
      'ru',
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('В листе нет колонок: Район');
    expect(lines[1]).toContain('строка 3');
  });
});

describe('formatError (ТЗ, раздел «Ошибки»)', () => {
  it('ошибка значения: лист, строка, колонка, что не так и что ожидается', () => {
    const text = formatError(
      {
        code: 'err.badValue',
        params: { value: 'восемь', expected: 'expect.number', min: 0, max: 100 },
        where: { sheet: 'Результаты', row: 14, column: 'СОР %' },
      },
      'ru',
    );
    expect(text).toBe(
      'Лист «Результаты», строка 14, колонка «СОР %»: «восемь» — не подходит. Ожидается: число от 0 до 100.',
    );
  });

  it('пустое значение: отдельная формулировка без пустых кавычек', () => {
    const text = formatError(
      {
        code: 'err.badValue',
        params: { value: '', expected: 'expect.filled' },
        where: { sheet: 'Результаты', row: 2, column: 'Школа' },
      },
      'ru',
    );
    expect(text).toBe('Лист «Результаты», строка 2, колонка «Школа»: поле пустое. Ожидается: заполненное поле.');
  });

  it('то же на казахском: тот же смысл, другой язык', () => {
    const text = formatError(
      {
        code: 'err.badValue',
        params: { value: 'сегіз', expected: 'expect.number', min: 0, max: 100 },
        where: { sheet: 'Результаты', row: 14, column: 'СОР %' },
      },
      'kk',
    );
    expect(text).toBe('«Результаты» парағы, 14-жол, «СОР %» бағаны: «сегіз» — жарамсыз. Күтілетіні: 0-ден 100-ге дейінгі сан.');
  });

  it('нет листа «Результаты» — имя листа из параметров', () => {
    expect(formatError({ code: 'err.noSheet', params: { sheet: 'Результаты' } }, 'ru')).toBe(
      'В файле нет листа «Результаты». Скачайте шаблон и перенесите данные в него.',
    );
  });

  it('персональные данные — без параметров, текст из словаря', () => {
    expect(formatError({ code: 'err.personalData', where: { sheet: 'Результаты' } }, 'ru')).toContain('ФИО');
  });
});
