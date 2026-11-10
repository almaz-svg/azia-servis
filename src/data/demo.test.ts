import { describe, expect, it } from 'vitest';
import { datasetId } from '@/core/datasetId';
import { validateWorkbook } from '@/core/validate';
import { DEMO_TOPICS, generateDemoRows, makeDemoDataset, mulberry32 } from './demo';
import { readWorkbook, writeWorkbook } from './workbook';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('mulberry32', () => {
  it('одинаковый seed — одинаковая последовательность', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('демо-генератор', () => {
  const { results, lessons } = generateDemoRows();

  it('20 школ, по 4 класса, 10 разделов: 800 строк результатов и 800 строк уроков', () => {
    expect(new Set(results.map((r) => r.school)).size).toBe(20);
    expect(new Set(results.map((r) => r.grade))).toEqual(new Set(['5А', '5Б', '6А', '6Б']));
    expect(new Set(results.map((r) => r.topic))).toEqual(new Set(DEMO_TOPICS));
    expect(results).toHaveLength(800);
    expect(lessons).toHaveLength(800);
  });

  it('каждая строка результатов имеет пару в «Уроках» (тот же класс и раздел)', () => {
    const lessonKeys = new Set(lessons.map((l) => `${l.school}|${l.grade}|${l.topic}`));
    expect(results.every((r) => lessonKeys.has(`${r.school}|${r.grade}|${r.topic}`))).toBe(true);
  });

  it('значения в допустимых диапазонах', () => {
    expect(results.every((r) => r.sorPct >= 0 && r.sorPct <= 100)).toBe(true);
    expect(results.every((r) => r.entryPct >= 45 && r.entryPct <= 75)).toBe(true);
    expect(results.every((r) => Number.isInteger(r.students) && r.students >= 16)).toBe(true);
  });

  it('заложенные закономерности из ТЗ видны в сырых данных', () => {
    const byBook = (topic: string, book: 'А' | 'Б') =>
      results.filter((r) => r.topic === topic && r.textbook === book).map((r) => r.sorPct);

    // «Обыкновенные дроби»: учебник Б примерно на 10 п.п. слабее (сырая разница, без поправки)
    const gap = mean(byBook('Обыкновенные дроби', 'Б')) - mean(byBook('Обыкновенные дроби', 'А'));
    expect(gap).toBeLessThan(-6);
    expect(gap).toBeGreaterThan(-14);

    // «Проценты» ниже 60% у обоих учебников
    expect(mean(byBook('Проценты', 'А'))).toBeLessThan(60);
    expect(mean(byBook('Проценты', 'Б'))).toBeLessThan(60);

    // Учебник Б чаще в сельских школах
    const share = (type: 'город' | 'село') => {
      const rows = results.filter((r) => r.schoolType === type);
      return rows.filter((r) => r.textbook === 'Б').length / rows.length;
    };
    expect(share('село')).toBeGreaterThan(share('город'));
  });

  it('повторный запуск даёт тот же идентификатор датасета', async () => {
    const a = await makeDemoDataset();
    const b = await makeDemoDataset();
    expect(a.id).toBe(b.id);
    expect(a.source).toBe('demo');
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('демо проходит ту же валидацию, что и загруженный файл', () => {
    const buffer = writeWorkbook(results, lessons);
    const read = readWorkbook(buffer, 'demo.xlsx');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const parsed = validateWorkbook(read.workbook);
    expect(parsed.ok).toBe(true);
  });
});

describe('datasetId', () => {
  const { results, lessons } = generateDemoRows();

  it('не зависит от порядка строк', async () => {
    const shuffled = [...results].reverse();
    expect(await datasetId(shuffled, lessons)).toBe(await datasetId(results, lessons));
  });

  it('меняется при изменении одного значения', async () => {
    const changed = results.map((r, i) => (i === 0 ? { ...r, sorPct: r.sorPct + 1 } : r));
    expect(await datasetId(changed, lessons)).not.toBe(await datasetId(results, lessons));
  });
});
