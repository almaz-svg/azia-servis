import type { AnalysisConfig } from './config';

/**
 * Кривая «цена часа» (ТЗ, F5). Модель для пары «тема × учебник»:
 *   s(h, L) = M · (1 − e^(−h/τ)) + β · (L − L̄)
 * h — фактические часы класса, L — входной уровень, L̄ — средний уровень группы.
 * Член с β убирает смещение: слабым классам дают больше часов, и без β кривая врёт, что часы вредят.
 *
 * Перебор: τ по сетке (0,5…80). При фиксированном τ модель линейна по M и β,
 * поэтому они находятся замкнутой формулой МНК. Это держит расчёт в пределах бюджета 100 мс.
 */

export const MIN_CURVE_POINTS = 6;
export const TAU_STEP = 0.5;
export const TAU_MAX = 80;
const TAU_COUNT = Math.round(TAU_MAX / TAU_STEP);
const M_MIN = 0;
const M_MAX = 100;

export interface CurvePoint {
  hours: number;
  sorPct: number;
  entryPct: number;
  students: number;
}

export interface CurveFit {
  /** Предельное освоение при бесконечных часах, % */
  M: number;
  /** Характерное число часов, при котором достигается ~63% от M */
  tau: number;
  /** Поправка на входной уровень: п.п. на один пункт L */
  beta: number;
  /** Средний входной уровень группы (L̄), взвешенный по ученикам */
  entryMean: number;
  hoursMin: number;
  hoursMax: number;
  /** Средние часы группы, взвешенные по ученикам */
  meanHours: number;
  n: number;
  /** Часов до целевого освоения при L̄; null — цель недостижима (M ≤ цели) */
  h70: number | null;
  /** Цель требует часов больше, чем наблюдалось: показываем пометку «экстраполяция» */
  h70Extrapolated: boolean;
  /** Прирост освоения от следующего часа при средних часах группы, п.п. */
  nextHourGainPp: number;
  /**
   * τ упёрлась в границу сетки: 'low' — кривая плоская, часы не влияют (эффект не виден);
   * 'high' — почти линейная, предела насыщения не видно. Интерфейс показывает это явно.
   */
  tauAtLimit: 'low' | 'high' | null;
}

export type CurveResult =
  | { ok: true; fit: CurveFit }
  | { ok: false; reason: 'fewPoints' | 'noHourVariance' | 'noFit' };

/** Освоение по модели при заданных часах и уровне (для прогноза и подсказок) */
export function predictMastery(fit: Pick<CurveFit, 'M' | 'tau' | 'beta' | 'entryMean'>, hours: number, entry: number): number {
  return fit.M * (1 - Math.exp(-hours / fit.tau)) + fit.beta * (entry - fit.entryMean);
}

export function fitCurve(points: CurvePoint[], cfg: AnalysisConfig): CurveResult {
  if (points.length < MIN_CURVE_POINTS) return { ok: false, reason: 'fewPoints' };

  const hours = points.map((p) => p.hours);
  const hoursMin = Math.min(...hours);
  const hoursMax = Math.max(...hours);
  if (hoursMax === hoursMin) return { ok: false, reason: 'noHourVariance' };

  const W = points.reduce((s, p) => s + p.students, 0);
  const entryMean = points.reduce((s, p) => s + p.students * p.entryPct, 0) / W;
  const meanHours = points.reduce((s, p) => s + p.students * p.hours, 0) / W;

  let best: { M: number; tau: number; beta: number; sse: number } | null = null;

  for (let k = 1; k <= TAU_COUNT; k++) {
    const tau = k * TAU_STEP;
    // Регрессоры: g = 1 − e^(−h/τ) и d = L − L̄; целевая — освоение s
    let a11 = 0;
    let a12 = 0;
    let a22 = 0;
    let b1 = 0;
    let b2 = 0;
    for (const p of points) {
      const g = 1 - Math.exp(-p.hours / tau);
      const d = p.entryPct - entryMean;
      const w = p.students;
      a11 += w * g * g;
      a12 += w * g * d;
      a22 += w * d * d;
      b1 += w * g * p.sorPct;
      b2 += w * d * p.sorPct;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-9 * (a11 * a22 + 1)) continue;

    const M = (b1 * a22 - a12 * b2) / det;
    const beta = (a11 * b2 - a12 * b1) / det;
    if (M < M_MIN || M > M_MAX) continue;

    let sse = 0;
    for (const p of points) {
      const g = 1 - Math.exp(-p.hours / tau);
      const e = p.sorPct - M * g - beta * (p.entryPct - entryMean);
      sse += p.students * e * e;
    }
    if (!best || sse < best.sse) best = { M, tau, beta, sse };
  }

  if (!best) return { ok: false, reason: 'noFit' };

  const target = cfg.targetMasteryPct;
  const h70 = best.M > target ? -best.tau * Math.log(1 - target / best.M) : null;
  const nextHourGainPp =
    best.M * (Math.exp(-meanHours / best.tau) - Math.exp(-(meanHours + 1) / best.tau));

  return {
    ok: true,
    fit: {
      M: best.M,
      tau: best.tau,
      beta: best.beta,
      entryMean,
      hoursMin,
      hoursMax,
      meanHours,
      n: points.length,
      h70,
      h70Extrapolated: h70 !== null && h70 > hoursMax,
      nextHourGainPp,
      tauAtLimit: best.tau <= TAU_STEP ? 'low' : best.tau >= TAU_MAX ? 'high' : null,
    },
  };
}
