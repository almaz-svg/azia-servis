import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { ANALYSIS_CONFIG } from './config';
import { planView } from './hours';
import { buildNoteFacts } from './note';
import { generateDemoRows } from '../data/demo';

const rows = generateDemoRows();
const analysis = analyze({ id: 'demo-id', source: 'demo', ...rows }, ANALYSIS_CONFIG);

describe('buildNoteFacts', () => {
  it('берёт проблемные темы и их числа из Analysis без пересчёта', () => {
    const f = buildNoteFacts(analysis, null);
    expect(f.demo).toBe(true);
    expect(f.analysisKey).toBe(analysis.analysisKey);
    expect(f.hours).toBeNull();

    const fractions = analysis.topics.find((t) => t.topic === 'Обыкновенные дроби')!;
    expect(f.textbookProblems).toContainEqual({
      topic: 'Обыкновенные дроби',
      weak: 'Б',
      deltaPp: fractions.comparison!.deltaPp,
      ciLow: fractions.comparison!.ciLow,
      ciHigh: fractions.comparison!.ciHigh,
    });
    expect(f.programProblems.map((p) => p.topic)).toContain('Проценты');

    const flagged = analysis.topics.filter((t) => t.status.code !== 'norm').length;
    expect(f.textbookProblems.length + f.programProblems.length + f.lowData.length).toBe(flagged);
  });

  it('без переносов список изменений часов пуст', () => {
    const f = buildNoteFacts(analysis, planView(analysis, { kind: 'view' }, ANALYSIS_CONFIG));
    expect(f.hours).not.toBeNull();
    expect(f.hours!.moves).toEqual([]);
    expect(f.hours!.forecastPp).toBe(0);
  });

  it('после перераспределения изменения совпадают со строками HourView, сумма переносов равна нулю', () => {
    const view = planView(analysis, { kind: 'auto' }, ANALYSIS_CONFIG);
    const f = buildNoteFacts(analysis, view);
    expect(view.steps).toBeGreaterThan(0);
    expect(f.hours!.moves.length).toBeGreaterThanOrEqual(2);
    for (const m of f.hours!.moves) {
      const row = view.rows.find((r) => r.topic === m.topic)!;
      expect(m).toEqual({ topic: row.topic, before: row.baseHours, after: row.hours, deltaPp: row.deltaPp });
    }
    expect(f.hours!.moves.reduce((s, m) => s + m.after - m.before, 0)).toBeCloseTo(0, 9);
    expect(f.hours!.forecastPp).toBe(view.forecastPp);
  });

  it('файл без листа «Уроки»: раздела про часы нет', () => {
    const noLessons = analyze({ id: 'x', source: 'upload', results: rows.results, lessons: [] }, ANALYSIS_CONFIG);
    const f = buildNoteFacts(noLessons, planView(noLessons, { kind: 'view' }, ANALYSIS_CONFIG));
    expect(f.demo).toBe(false);
    expect(f.hours).toBeNull();
  });
});
