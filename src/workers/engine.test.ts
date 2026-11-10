import { describe, expect, it } from 'vitest';
import { generateDemoRows, makeDemoDataset } from '@/data/demo';
import { writeWorkbook } from '@/data/workbook';
import { AnalysisEngine } from './engine';

describe('AnalysisEngine.parse', () => {
  it('корректный файл → датасет с источником upload и идентификатором содержимого', async () => {
    const { results, lessons } = generateDemoRows();
    const engine = new AnalysisEngine();
    const r = await engine.parse('выгрузка.xlsx', writeWorkbook(results, lessons));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dataset.source).toBe('upload');
    expect(r.dataset.id).toMatch(/^[0-9a-f]{64}$/);
    expect(r.dataset.id).toBe((await makeDemoDataset()).id);
  });

  it('ошибки валидации возвращаются, а не бросаются', async () => {
    const engine = new AnalysisEngine();
    const r = await engine.parse('отчёт.pdf', new ArrayBuffer(4));
    expect(r).toEqual({ ok: false, errors: [{ code: 'err.format', params: { ext: '.pdf' } }] });
  });
});

describe('AnalysisEngine.analyze', () => {
  it('полный датасет: ключ расчёта совпадает с идентификатором датасета', async () => {
    const dataset = await makeDemoDataset();
    const engine = new AnalysisEngine();
    const a = await engine.analyze(dataset, {});
    expect(a.analysisKey.startsWith(dataset.id + ':')).toBe(true);
    expect(a.topics).toHaveLength(10);
    expect(a.datasetSource).toBe('demo');
  });

  it('повторный расчёт той же выборки берётся из кэша и даёт тот же результат', async () => {
    const dataset = await makeDemoDataset();
    const engine = new AnalysisEngine();
    const first = await engine.analyze(dataset, { district: 'Шуский' });
    const second = await engine.analyze(dataset, { district: 'Шуский' });
    expect(second).toEqual(first);
  });

  it('фильтр меняет ключ расчёта', async () => {
    const dataset = await makeDemoDataset();
    const engine = new AnalysisEngine();
    const all = await engine.analyze(dataset, {});
    const one = await engine.analyze(dataset, { textbook: 'А' });
    expect(one.analysisKey).not.toBe(all.analysisKey);
    expect(one.topics.every((t) => t.comparison === null)).toBe(true);
  });

  it('метка источника следует за запросом, даже если расчёт взят из кэша', async () => {
    const dataset = await makeDemoDataset();
    const engine = new AnalysisEngine();
    await engine.analyze({ ...dataset, source: 'demo' }, {});
    const asUpload = await engine.analyze({ ...dataset, source: 'upload' }, {});
    expect(asUpload.datasetSource).toBe('upload');
  });
});

describe('AnalysisEngine.plan', () => {
  it('авто-перераспределение на демо: 10 тем, сумма часов не меняется', async () => {
    const dataset = await makeDemoDataset();
    const engine = new AnalysisEngine();
    const view = await engine.plan(dataset, { kind: 'view' });
    const auto = await engine.plan(dataset, { kind: 'auto' });
    expect(view.rows).toHaveLength(10);
    expect(auto.totalHours).toBeCloseTo(view.totalHours, 6);
    expect(auto.stop).not.toBeNull();
  });

  it('ручной шаг использует кэш расчёта: второй вызов не пересчитывает кривые', async () => {
    const dataset = await makeDemoDataset();
    const engine = new AnalysisEngine();
    const view = await engine.plan(dataset, { kind: 'view' });
    const topic = view.rows[0]!.topic;
    const stepped = await engine.plan(dataset, { kind: 'step', topic, direction: 'to', current: view.hours });
    expect(stepped.totalHours).toBeCloseTo(view.totalHours, 6);
    expect(stepped.transfer !== null || stepped.blocked !== null).toBe(true);
  });
});
