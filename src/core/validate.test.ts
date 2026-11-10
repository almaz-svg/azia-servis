import { describe, expect, it } from 'vitest';
import {
  LESSONS_HEADERS,
  LESSONS_SHEET,
  MAX_ERRORS,
  RESULTS_HEADERS,
  RESULTS_SHEET,
  validateWorkbook,
  type RawSheet,
  type RawWorkbook,
} from './validate';

/** Строка «Результаты» в порядке колонок из ТЗ */
const resultRow = (over: Partial<Record<number, unknown>> = {}): unknown[] => {
  const base: unknown[] = [
    '2025-2026', 'Тараз', 'Т-01', 'город', 'А', '5А', 'Обыкновенные дроби', 26, 71, 68,
  ];
  for (const [i, v] of Object.entries(over)) base[Number(i)] = v;
  return base;
};

const lessonRow = (): unknown[] => ['2025-2026', 'Т-01', '5А', 'Обыкновенные дроби', 28, 27];

function book(resultRows: unknown[][], lessonRows?: unknown[][]): RawWorkbook {
  const sheets: RawSheet[] = [{ name: RESULTS_SHEET, headers: [...RESULTS_HEADERS], rows: resultRows }];
  if (lessonRows) {
    sheets.push({ name: LESSONS_SHEET, headers: [...LESSONS_HEADERS], rows: lessonRows });
  }
  return { sheets };
}

describe('validateWorkbook: структура', () => {
  it('без листа «Результаты» возвращает err.noSheet', () => {
    const r = validateWorkbook({ sheets: [{ name: 'Уроки', headers: [...LESSONS_HEADERS], rows: [] }] });
    expect(r).toEqual({ ok: false, errors: [{ code: 'err.noSheet', params: { sheet: 'Результаты' } }] });
  });

  it('нет нужной колонки — err.missingColumn с её названием', () => {
    const headers = RESULTS_HEADERS.filter((h) => h !== 'СОР %');
    const r = validateWorkbook({ sheets: [{ name: RESULTS_SHEET, headers: [...headers], rows: [] }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      { code: 'err.missingColumn', params: { column: 'СОР %' }, where: { sheet: 'Результаты', column: 'СОР %' } },
    ]);
  });

  it('колонка с ФИО блокирует загрузку — err.personalData', () => {
    const headers = [...RESULTS_HEADERS, 'ФИО ученика'];
    const r = validateWorkbook({ sheets: [{ name: RESULTS_SHEET, headers, rows: [resultRow()] }] });
    expect(r).toEqual({ ok: false, errors: [{ code: 'err.personalData', where: { sheet: 'Результаты' } }] });
  });

  it('без листа «Уроки» загрузка проходит, lessons пустой', () => {
    const r = validateWorkbook(book([resultRow()]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lessons).toEqual([]);
  });
});

describe('validateWorkbook: значения', () => {
  it('принимает корректные строки и разбирает типы', () => {
    const r = validateWorkbook(book([resultRow()], [lessonRow()]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results[0]).toEqual({
      year: '2025-2026', district: 'Тараз', school: 'Т-01', schoolType: 'город', textbook: 'А',
      grade: '5А', topic: 'Обыкновенные дроби', students: 26, sorPct: 71, entryPct: 68,
    });
    expect(r.lessons[0]).toEqual({
      year: '2025-2026', school: 'Т-01', grade: '5А', topic: 'Обыкновенные дроби',
      plannedHours: 28, actualHours: 27,
    });
  });

  it('ошибка указывает лист, строку и колонку, как в ТЗ («Строка 14, колонка «СОР %»»', () => {
    // Строка 14 файла = rows[12]: строка 1 — заголовки, данные начинаются со второй
    // Разные школы, чтобы строки не были дублями
    const rows = Array.from({ length: 12 }, (_, i) =>
      resultRow({ 2: `Т-${String(i + 1).padStart(2, '0')}` }),
    );
    rows.push(resultRow({ 8: 'восемь' }));
    const r = validateWorkbook(book(rows));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      {
        code: 'err.badValue',
        params: { value: 'восемь', expected: 'expect.number', min: 0, max: 100 },
        where: { sheet: 'Результаты', row: 14, column: 'СОР %' },
      },
    ]);
  });

  it('запятая как десятичный разделитель принимается', () => {
    const r = validateWorkbook(book([resultRow({ 8: '71,5' })]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.results[0]?.sorPct).toBe(71.5);
  });

  it('латинские A и B в колонке «Учебник» приводятся к кириллице', () => {
    const r = validateWorkbook(book([resultRow({ 4: 'A' }), resultRow({ 4: 'B', 2: 'Т-02' })]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.results.map((x) => x.textbook)).toEqual(['А', 'Б']);
  });

  it('процент вне диапазона — err.badValue', () => {
    const r = validateWorkbook(book([resultRow({ 8: 120 })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({ code: 'err.badValue', where: { row: 2, column: 'СОР %' } });
  });

  it('пустая школа — err.badValue с «пусто»', () => {
    const r = validateWorkbook(book([resultRow({ 2: '' })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toEqual({
      code: 'err.badValue',
      params: { value: '', expected: 'expect.filled' },
      where: { sheet: 'Результаты', row: 2, column: 'Школа' },
    });
  });

  it('неизвестный учебник и тип школы — err.badValue', () => {
    const r = validateWorkbook(book([resultRow({ 4: 'В', 3: 'район' })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.where?.column)).toEqual(['Тип', 'Учебник']);
  });

  it('пустые строки пропускаются, номера строк при этом сохраняются', () => {
    const r = validateWorkbook(book([resultRow(), [null, null, null], resultRow({ 8: 'x' })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.where?.row).toBe(4);
  });
});

describe('validateWorkbook: дубли и лимит ошибок', () => {
  it('повтор класса, раздела и учебника в одном году — err.duplicateRow', () => {
    const r = validateWorkbook(book([resultRow(), resultRow({ 8: 80 })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([{ code: 'err.duplicateRow', where: { sheet: 'Результаты', row: 3 } }]);
  });

  it('собирает не больше MAX_ERRORS ошибок', () => {
    const rows = Array.from({ length: 200 }, () => resultRow({ 8: 'плохо' }));
    const r = validateWorkbook(book(rows));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(MAX_ERRORS);
  });

  it('ошибка в «Уроках» тоже блокирует загрузку', () => {
    const r = validateWorkbook(book([resultRow()], [['2025-2026', 'Т-01', '5А', 'Проценты', 28, 'много']]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatchObject({
      code: 'err.badValue',
      where: { sheet: 'Уроки', row: 2, column: 'Часов по факту' },
    });
  });
});
