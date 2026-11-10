import { describe, expect, it } from 'vitest';
import { RESULTS_HEADERS, validateWorkbook } from '@/core/validate';
import { generateDemoRows } from './demo';
import { readWorkbook, writeTemplate, writeWorkbook } from './workbook';

describe('чтение и запись Excel', () => {
  const { results, lessons } = generateDemoRows();

  it('демо-выгрузка переживает запись и чтение без изменений', () => {
    const read = readWorkbook(writeWorkbook(results, lessons), 'demo.xlsx');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const parsed = validateWorkbook(read.workbook);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.results).toEqual(results);
    expect(parsed.lessons).toEqual(lessons);
  });

  it('файл на 1 600 строк разбирается быстрее 2 с (ТЗ, F1)', () => {
    const buffer = writeWorkbook(results, lessons);
    const started = performance.now();
    const read = readWorkbook(buffer, 'demo.xlsx');
    const parsed = read.ok ? validateWorkbook(read.workbook) : null;
    const elapsed = performance.now() - started;
    expect(parsed?.ok).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it('CSV читается как лист «Результаты»', () => {
    const header = RESULTS_HEADERS.join(',');
    const row = ['2025-2026', 'Тараз', 'Т-01', 'город', 'А', '5А', 'Обыкновенные дроби', '26', '71', '68'].join(',');
    // BOM помогает SheetJS распознать UTF-8 в CSV
    const bytes = new TextEncoder().encode('﻿' + header + '\n' + row + '\n');
    const read = readWorkbook(bytes.buffer as ArrayBuffer, 'класс.csv');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const parsed = validateWorkbook(read.workbook);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.results[0]?.school).toBe('Т-01');
  });

  it('формат, который не читается, — err.format с расширением', () => {
    const r = readWorkbook(new ArrayBuffer(8), 'отчёт.pdf');
    expect(r).toEqual({ ok: false, errors: [{ code: 'err.format', params: { ext: '.pdf' } }] });
  });

  it('повреждённый .xlsx — err.format, без исключения', () => {
    const garbage = new TextEncoder().encode('это не таблица, а текст').buffer as ArrayBuffer;
    const r = readWorkbook(garbage, 'damaged.xlsx');
    if (r.ok) {
      // SheetJS может прочитать текст как CSV: тогда ошибка будет в структуре
      expect(validateWorkbook(r.workbook).ok).toBe(false);
    } else {
      expect(r.errors[0]?.code).toBe('err.format');
    }
  });

  it('шаблон содержит оба листа и только заголовки', () => {
    const read = readWorkbook(writeTemplate(), 'шаблон.xlsx');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const parsed = validateWorkbook(read.workbook);
    expect(parsed).toEqual({ ok: true, results: [], lessons: [] });
  });
});
