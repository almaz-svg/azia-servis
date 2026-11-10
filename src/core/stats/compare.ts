import type { ResultRow } from '../types';
import { clusteredWls } from './regression';
import { tQuantile } from './tdist';

/**
 * Сравнение учебников «А» и «Б» по строкам одной темы.
 * Δ = Б − А, в процентных пунктах. Поправка: входной уровень класса как ковариата.
 * Интервал 95%: Δ ± t(0,975; G−1) · SE, где G — число школ (ТЗ дало 1,96; см. ARCHITECTURE.md, раздел 15).
 */

export interface TextbookComparison {
  /** Δ с поправкой на входной уровень, п.п. */
  deltaPp: number;
  ciLow: number;
  ciHigh: number;
  /** Δ без поправки (сырые средние с весами по ученикам), п.п. */
  rawDeltaPp: number;
  /** 95%-интервал для Δ без поправки (регрессия на один учебник, кластеры по школе); null, если не посчитался */
  rawCiLow: number | null;
  rawCiHigh: number | null;
  /** Освоение учебников при среднем входном уровне темы, % */
  adjustedA: number;
  adjustedB: number;
  schools: number;
  df: number;
}

export type ComparisonResult =
  | { ok: true; value: TextbookComparison }
  | { ok: false; reason: 'oneTextbook' | 'fewSchools' | 'singular' };

export function weightedMean(pairs: Array<{ value: number; weight: number }>): number | null {
  let sw = 0;
  let s = 0;
  for (const p of pairs) {
    sw += p.weight;
    s += p.value * p.weight;
  }
  return sw > 0 ? s / sw : null;
}

export function compareTextbooks(rows: ResultRow[]): ComparisonResult {
  const hasA = rows.some((r) => r.textbook === 'А');
  const hasB = rows.some((r) => r.textbook === 'Б');
  if (!hasA || !hasB) return { ok: false, reason: 'oneTextbook' };

  const fit = clusteredWls(
    rows.map((r) => ({
      y: r.sorPct,
      x: [1, r.textbook === 'Б' ? 1 : 0, r.entryPct],
      w: r.students,
      cluster: r.school,
    })),
  );
  if (!fit.ok) {
    return { ok: false, reason: fit.reason === 'fewClusters' ? 'fewSchools' : 'singular' };
  }

  const [b0, b1, b2] = fit.beta as [number, number, number];
  const se1 = fit.se[1]!;
  const t = tQuantile(0.975, fit.df);

  const entryMean = weightedMean(rows.map((r) => ({ value: r.entryPct, weight: r.students }))) ?? 0;
  const adjustedA = b0 + b2 * entryMean;
  const adjustedB = adjustedA + b1;

  const rawA = weightedMean(rows.filter((r) => r.textbook === 'А').map((r) => ({ value: r.sorPct, weight: r.students })));
  const rawB = weightedMean(rows.filter((r) => r.textbook === 'Б').map((r) => ({ value: r.sorPct, weight: r.students })));

  // Интервал без поправки: та же регрессия, но только с константой и учебником (без входного уровня)
  const rawFit = clusteredWls(
    rows.map((r) => ({
      y: r.sorPct,
      x: [1, r.textbook === 'Б' ? 1 : 0],
      w: r.students,
      cluster: r.school,
    })),
  );
  const rawCi = rawFit.ok ? { rawDelta: rawFit.beta[1]!, rawSe: rawFit.se[1]! } : null;

  return {
    ok: true,
    value: {
      deltaPp: b1,
      ciLow: b1 - t * se1,
      ciHigh: b1 + t * se1,
      rawDeltaPp: (rawB ?? 0) - (rawA ?? 0),
      rawCiLow: rawCi ? rawCi.rawDelta - t * rawCi.rawSe : null,
      rawCiHigh: rawCi ? rawCi.rawDelta + t * rawCi.rawSe : null,
      adjustedA,
      adjustedB,
      schools: fit.clusters,
      df: fit.df,
    },
  };
}

/** Интервал не содержит 0: разница статистически уверенная */
export function ciExcludesZero(c: Pick<TextbookComparison, 'ciLow' | 'ciHigh'>): boolean {
  return c.ciLow > 0 || c.ciHigh < 0;
}
