import { beforeAll, describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../data/demo';
import { analyze, applyScope, type Analysis } from './analysis';
import { ANALYSIS_CONFIG } from './config';
import type { Dataset } from './types';

describe('analyze на демо-данных (приёмка ТЗ, чек-лист «Продукт»)', () => {
  let dataset: Dataset;
  let result: Analysis;
  beforeAll(async () => {
    dataset = await makeDemoDataset();
    result = analyze(dataset, ANALYSIS_CONFIG);
  });
  const topic = (name: string) => result.topics.find((t) => t.topic === name)!;

  it('10 тем, 20 школ, ключ расчёта содержит версию методики', () => {
    expect(result.topics).toHaveLength(10);
    expect(result.schools).toHaveLength(20);
    // Порядок колонок карты тем: по алфавиту кодов (К < Т < Ш)
    expect(result.schools[0]).toBe('К-01');
    expect(result.schools[result.schools.length - 1]).toBe('Ш-06');
    expect(result.analysisKey).toBe(`${dataset.id}:${ANALYSIS_CONFIG.version}`);
    expect(result.datasetSource).toBe('demo');
  });

  it('«Обыкновенные дроби» — «Проблема учебника», проблемный учебник Б', () => {
    const t = topic('Обыкновенные дроби');
    expect(t.status.code).toBe('textbook');
    expect(t.status.problemTextbook).toBe('Б');
    expect(t.comparison).not.toBeNull();
    // ТЗ: Б слабее примерно на 10 п.п. при равном уровне школ
    expect(t.comparison!.deltaPp).toBeLessThan(-7);
    expect(t.comparison!.deltaPp).toBeGreaterThan(-13);
  });

  it('«Проценты» — «Проблема программы»: ниже 60% у обоих учебников', () => {
    const t = topic('Проценты');
    expect(t.status.code).toBe('program');
    expect(t.mastery.А).toBeLessThan(60);
    expect(t.mastery.Б).toBeLessThan(60);
  });

  it('статус «Мало данных» не возникает при 20 школах', () => {
    for (const t of result.topics) {
      expect(t.status.code).not.toBe('lowdata');
      expect(t.classes.А).toBeGreaterThanOrEqual(ANALYSIS_CONFIG.minClassesPerTextbook);
      expect(t.classes.Б).toBeGreaterThanOrEqual(ANALYSIS_CONFIG.minClassesPerTextbook);
    }
  });

  it('у каждой темы есть подсказка «почему» хотя бы из одного пункта', () => {
    for (const t of result.topics) {
      expect(t.status.reasons.length).toBeGreaterThan(0);
    }
  });

  it('кривые «цена часа» строятся для обоих учебников во всех темах', () => {
    for (const t of result.topics) {
      expect(t.curves.А.ok).toBe(true);
      expect(t.curves.Б.ok).toBe(true);
    }
  });

  it('карта тем: у каждой школы есть ячейка в каждой теме', () => {
    for (const t of result.topics) {
      expect(Object.keys(t.cells)).toHaveLength(20);
    }
  });

  it('расчёт всех тем укладывается в 500 мс', () => {
    // Берём лучший из трёх прогонов: так тест меряет расчёт, а не загрузку машины соседними тестами
    const times = [0, 1, 2].map(() => {
      const started = performance.now();
      analyze(dataset, ANALYSIS_CONFIG);
      return performance.now() - started;
    });
    expect(Math.min(...times)).toBeLessThan(500);
  });
});

describe('фильтры', () => {
  const dataset_ = makeDemoDataset();

  it('выбор одного учебника убирает сравнение и статус «Проблема учебника»', async () => {
    const dataset = await dataset_;
    const scoped = applyScope(dataset, { textbook: 'А' });
    const r = analyze({ ...dataset, ...scoped, id: 'scoped-A' }, ANALYSIS_CONFIG);
    for (const t of r.topics) {
      expect(t.comparison).toBeNull();
      expect(t.comparisonSkip).toBe('oneTextbook');
      expect(t.status.code).not.toBe('textbook');
    }
    expect(r.analysisKey).toBe(`scoped-A:${ANALYSIS_CONFIG.version}`);
  });

  it('фильтр по классу сужает выборку', async () => {
    const dataset = await dataset_;
    const scoped = applyScope(dataset, { grades: ['5А'] });
    expect(scoped.results.every((r) => r.grade === '5А')).toBe(true);
    expect(scoped.lessons.every((l) => l.grade === '5А')).toBe(true);
    expect(scoped.results.length).toBe(dataset.results.length / 4);
  });

  it('фильтр по району оставляет только его школы', async () => {
    const dataset = await dataset_;
    const scoped = applyScope(dataset, { district: 'Шуский' });
    expect(new Set(scoped.results.map((r) => r.district))).toEqual(new Set(['Шуский']));
  });
});
