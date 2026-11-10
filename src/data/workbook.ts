import * as XLSX from 'xlsx';
import type { AppError } from '@/core/errors';
import type { LessonRow, ResultRow } from '@/core/types';
import {
  LESSONS_HEADERS,
  LESSONS_SHEET,
  RESULTS_HEADERS,
  RESULTS_SHEET,
  type RawSheet,
  type RawWorkbook,
} from '@/core/validate';

/**
 * Единственное место, где используется SheetJS.
 * Ядро получает уже прочитанные листы (RawWorkbook) и работает без библиотеки.
 */

export type ReadResult =
  | { ok: true; workbook: RawWorkbook }
  | { ok: false; errors: AppError[] };

const ALLOWED_EXT = ['.xlsx', '.csv'] as const;

export function readWorkbook(bytes: ArrayBuffer, fileName: string): ReadResult {
  const ext = (fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '') as string;
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    return { ok: false, errors: [{ code: 'err.format', params: { ext: ext || fileName } }] };
  }

  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  } catch {
    return { ok: false, errors: [{ code: 'err.format', params: { ext } }] };
  }

  const sheets: RawSheet[] = [];
  book.SheetNames.forEach((name, i) => {
    const ws = book.Sheets[name];
    if (!ws) return;
    // CSV содержит один лист: считаем его листом «Результаты».
    const sheetName = ext === '.csv' && i === 0 ? RESULTS_SHEET : name;
    sheets.push(toRawSheet(sheetName, ws));
  });

  return { ok: true, workbook: { sheets } };
}

function toRawSheet(name: string, ws: XLSX.WorkSheet): RawSheet {
  // blankrows: true сохраняет номера строк: строка i+2 в файле — rows[i]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: true, defval: null });
  const [headerRow = [], ...rows] = aoa;
  return {
    name,
    headers: headerRow.map((h) => (h === null || h === undefined ? '' : String(h))),
    rows,
  };
}

/** Файл .xlsx с листами «Результаты» и «Уроки» — для демо-выгрузки и тестов */
export function writeWorkbook(results: ResultRow[], lessons: LessonRow[]): ArrayBuffer {
  const book = XLSX.utils.book_new();

  const resultRows = results.map((r) => [
    r.year, r.district, r.school, r.schoolType, r.textbook,
    r.grade, r.topic, r.students, r.sorPct, r.entryPct,
  ]);
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([[...RESULTS_HEADERS], ...resultRows]),
    RESULTS_SHEET,
  );

  const lessonRows = lessons.map((l) => [
    l.year, l.school, l.grade, l.topic, l.plannedHours, l.actualHours,
  ]);
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([[...LESSONS_HEADERS], ...lessonRows]),
    LESSONS_SHEET,
  );

  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** Пустой шаблон для кнопки «Скачать шаблон»: только заголовки */
export function writeTemplate(): ArrayBuffer {
  return writeWorkbook([], []);
}
