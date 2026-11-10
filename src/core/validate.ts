import type { AppError } from './errors';
import type { LessonRow, ResultRow, SchoolType, Textbook } from './types';

export const RESULTS_SHEET = 'Результаты';
export const LESSONS_SHEET = 'Уроки';
/** Больше ошибок не собираем: в файле с тысячами строк список всё равно нечитаем */
export const MAX_ERRORS = 50;

export const RESULTS_HEADERS = [
  'Учебный год',
  'Район',
  'Школа',
  'Тип',
  'Учебник',
  'Класс',
  'Раздел',
  'Учеников',
  'СОР %',
  'Входной уровень %',
] as const;

export const LESSONS_HEADERS = [
  'Учебный год',
  'Школа',
  'Класс',
  'Раздел',
  'Часов по плану',
  'Часов по факту',
] as const;

/** Лист в том виде, как его отдаёт чтение файла. headers — строка 1, rows[i] — строка i+2 */
export interface RawSheet {
  name: string;
  headers: string[];
  rows: unknown[][];
}

export interface RawWorkbook {
  sheets: RawSheet[];
}

export type ParseResult =
  | { ok: true; results: ResultRow[]; lessons: LessonRow[] }
  | { ok: false; errors: AppError[] };

/** Заголовки, по которым видно персональные данные учеников (ТЗ: ФИО учеников нет) */
const PERSONAL_HEADER = /фио|фамилия|^имя$/iu;

/** Кириллица и латиница в обозначениях учебников: «А»/«A», «Б»/«B» */
const TEXTBOOK_ALIASES: Record<string, Textbook> = {
  А: 'А', а: 'А', A: 'А', a: 'А',
  Б: 'Б', б: 'Б', B: 'Б', b: 'Б',
};

type Report = (error: AppError) => void;
type ColumnMap = Record<string, number>;

export function validateWorkbook(wb: RawWorkbook): ParseResult {
  const errors: AppError[] = [];
  const report: Report = (error) => {
    if (errors.length < MAX_ERRORS) errors.push(error);
  };

  const resultsSheet = findSheet(wb, RESULTS_SHEET);
  if (!resultsSheet) {
    return fail([{ code: 'err.noSheet', params: { sheet: RESULTS_SHEET } }]);
  }
  const lessonsSheet = findSheet(wb, LESSONS_SHEET);

  // Структура проверяется до строк: если колонок нет, разбирать строки бессмысленно.
  const structural = [
    ...checkStructure(resultsSheet, RESULTS_HEADERS),
    ...(lessonsSheet ? checkStructure(lessonsSheet, LESSONS_HEADERS) : []),
  ];
  if (structural.length > 0) return fail(structural);

  const results: ResultRow[] = [];
  const resultKeys = new Set<string>();
  const resultCols = columnMap(resultsSheet, RESULTS_HEADERS);
  resultsSheet.rows.forEach((raw, index) => {
    if (isEmptyRow(raw)) return;
    const row = parseResultRow(resultsSheet, index, raw, resultCols, report);
    if (!row) return;
    const key = [row.year, row.school, row.grade, row.topic, row.textbook].join('|');
    if (resultKeys.has(key)) {
      report({ code: 'err.duplicateRow', where: { sheet: resultsSheet.name, row: index + 2 } });
      return;
    }
    resultKeys.add(key);
    results.push(row);
  });

  const lessons: LessonRow[] = [];
  if (lessonsSheet) {
    const lessonKeys = new Set<string>();
    const lessonCols = columnMap(lessonsSheet, LESSONS_HEADERS);
    lessonsSheet.rows.forEach((raw, index) => {
      if (isEmptyRow(raw)) return;
      const row = parseLessonRow(lessonsSheet, index, raw, lessonCols, report);
      if (!row) return;
      const key = [row.year, row.school, row.grade, row.topic].join('|');
      if (lessonKeys.has(key)) {
        report({ code: 'err.duplicateRow', where: { sheet: lessonsSheet.name, row: index + 2 } });
        return;
      }
      lessonKeys.add(key);
      lessons.push(row);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, results, lessons };
}

function fail(errors: AppError[]): ParseResult {
  return { ok: false, errors };
}

function findSheet(wb: RawWorkbook, name: string): RawSheet | undefined {
  return wb.sheets.find((s) => s.name.trim() === name);
}

function checkStructure(sheet: RawSheet, required: readonly string[]): AppError[] {
  const headers = sheet.headers.map((h) => h.trim());
  if (headers.some((h) => PERSONAL_HEADER.test(h))) {
    return [{ code: 'err.personalData', where: { sheet: sheet.name } }];
  }
  return required
    .filter((h) => !headers.includes(h))
    .map((h) => ({
      code: 'err.missingColumn' as const,
      params: { column: h },
      where: { sheet: sheet.name, column: h },
    }));
}

function columnMap(sheet: RawSheet, required: readonly string[]): ColumnMap {
  const headers = sheet.headers.map((h) => h.trim());
  const map: ColumnMap = {};
  for (const name of required) map[name] = headers.indexOf(name);
  return map;
}

function isEmptyRow(raw: unknown[]): boolean {
  return raw.every(isBlank);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function asText(value: unknown): string | null {
  if (isBlank(value)) return null;
  return String(value).trim();
}

/** Принимает число и строку с запятой или точкой; «восемь» и пустое значение не принимает */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const s = value.trim().replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}

/** Пустое значение — пустая строка: подпись «пусто» выводит UI из словаря */
function displayValue(value: unknown): string {
  return isBlank(value) ? '' : String(value).trim();
}

interface RowParser {
  ok: boolean;
  text(column: string): string;
  schoolType(column: string): SchoolType | null;
  textbook(column: string): Textbook | null;
  number(column: string, min: number, max: number, integer: boolean): number;
}

function rowParser(
  sheet: RawSheet,
  rowIndex: number,
  raw: unknown[],
  cols: ColumnMap,
  report: Report,
): RowParser {
  const parser: RowParser = {
    ok: true,
    text: () => '',
    schoolType: () => null,
    textbook: () => null,
    number: () => 0,
  };
  const cellOf = (column: string): unknown => {
    const i = cols[column];
    return i === undefined || i < 0 ? undefined : raw[i];
  };
  // expected — ключ словаря (expect.*), extra — числа для подстановки. Текст строит UI.
  const bad = (column: string, value: unknown, expected: string, extra: Record<string, number> = {}) => {
    parser.ok = false;
    report({
      code: 'err.badValue',
      params: { value: displayValue(value), expected, ...extra },
      where: { sheet: sheet.name, row: rowIndex + 2, column },
    });
  };

  parser.text = (column) => {
    const t = asText(cellOf(column));
    if (t === null) {
      bad(column, cellOf(column), 'expect.filled');
      return '';
    }
    return t;
  };

  parser.schoolType = (column) => {
    const t = asText(cellOf(column))?.toLowerCase() ?? null;
    if (t === 'город' || t === 'село') return t;
    bad(column, cellOf(column), 'expect.schoolType');
    return null;
  };

  parser.textbook = (column) => {
    const t = asText(cellOf(column));
    const mapped = t === null ? undefined : TEXTBOOK_ALIASES[t];
    if (mapped) return mapped;
    bad(column, cellOf(column), 'expect.textbook');
    return null;
  };

  parser.number = (column, min, max, integer) => {
    const n = asNumber(cellOf(column));
    const inRange = n !== null && n >= min && n <= max && (!integer || Number.isInteger(n));
    if (n !== null && inRange) return n;
    bad(column, cellOf(column), integer ? 'expect.int' : 'expect.number', { min, max });
    return 0;
  };

  return parser;
}

function parseResultRow(
  sheet: RawSheet,
  rowIndex: number,
  raw: unknown[],
  cols: ColumnMap,
  report: Report,
): ResultRow | null {
  const p = rowParser(sheet, rowIndex, raw, cols, report);
  const year = p.text('Учебный год');
  const district = p.text('Район');
  const school = p.text('Школа');
  const schoolType = p.schoolType('Тип');
  const textbook = p.textbook('Учебник');
  const grade = p.text('Класс');
  const topic = p.text('Раздел');
  const students = p.number('Учеников', 1, 1000, true);
  const sorPct = p.number('СОР %', 0, 100, false);
  const entryPct = p.number('Входной уровень %', 0, 100, false);
  if (!p.ok || schoolType === null || textbook === null) return null;
  return { year, district, school, schoolType, textbook, grade, topic, students, sorPct, entryPct };
}

function parseLessonRow(
  sheet: RawSheet,
  rowIndex: number,
  raw: unknown[],
  cols: ColumnMap,
  report: Report,
): LessonRow | null {
  const p = rowParser(sheet, rowIndex, raw, cols, report);
  const year = p.text('Учебный год');
  const school = p.text('Школа');
  const grade = p.text('Класс');
  const topic = p.text('Раздел');
  const plannedHours = p.number('Часов по плану', 0, 500, true);
  const actualHours = p.number('Часов по факту', 0, 500, true);
  if (!p.ok) return null;
  return { year, school, grade, topic, plannedHours, actualHours };
}
