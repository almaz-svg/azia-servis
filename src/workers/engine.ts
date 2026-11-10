import { analyze, applyScope, type Analysis, type ScopeFilter } from '@/core/analysis';
import { ANALYSIS_CONFIG, type AnalysisConfig } from '@/core/config';
import { datasetId } from '@/core/datasetId';
import { planView, type HourRequest, type HourView } from '@/core/hours';
import type { Dataset } from '@/core/types';
import { validateWorkbook } from '@/core/validate';
import { readWorkbook } from '@/data/workbook';
import type { ParseResult } from './protocol';

/**
 * Логика, которую выполняет Worker. Вынесена из файла воркера,
 * чтобы тестировать её в Node без браузера.
 */

const CACHE_LIMIT = 12;

export class AnalysisEngine {
  private cache = new Map<string, Analysis>();

  constructor(private readonly cfg: AnalysisConfig = ANALYSIS_CONFIG) {}

  /** Разбор файла: чтение, валидация, идентификатор содержимого */
  async parse(fileName: string, bytes: ArrayBuffer): Promise<ParseResult> {
    const read = readWorkbook(bytes, fileName);
    if (!read.ok) return read;

    const parsed = validateWorkbook(read.workbook);
    if (!parsed.ok) return parsed;

    const id = await datasetId(parsed.results, parsed.lessons);
    return {
      ok: true,
      dataset: { id, source: 'upload', results: parsed.results, lessons: parsed.lessons },
    };
  }

  /**
   * Расчёт с фильтрами. Идентификатор берётся от выбранного содержимого,
   * поэтому одинаковая выборка даёт один и тот же кэшированный результат.
   */
  async analyze(dataset: Dataset, scope: ScopeFilter): Promise<Analysis> {
    const scoped = applyScope(dataset, scope);
    const isFull = scoped.results.length === dataset.results.length;
    const id = isFull ? dataset.id : await datasetId(scoped.results, scoped.lessons);

    const key = `${id}:${this.cfg.version}`;
    const hit = this.cache.get(key);
    if (hit) {
      // Метка источника не входит в идентификатор содержимого, поэтому подставляем её заново
      return { ...hit, datasetSource: dataset.source };
    }

    const result = analyze({ ...dataset, id, results: scoped.results, lessons: scoped.lessons }, this.cfg);
    this.remember(key, result);
    return { ...result, datasetSource: dataset.source };
  }

  /**
   * Часы поверх расчёта по всему датасету (экран «Часы» не фильтруется).
   * Кривые берутся из того же кэша, поэтому ±1 час и «Перераспределить» укладываются в бюджет по времени.
   */
  async plan(dataset: Dataset, request: HourRequest): Promise<HourView> {
    const analysis = await this.analyze(dataset, {});
    return planView(analysis, request, this.cfg);
  }

  private remember(key: string, value: Analysis): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }
}
