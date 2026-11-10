import { describe, expect, it } from 'vitest';
import { ANALYSIS_CONFIG } from './config';
import { fitCurve, predictMastery, type CurvePoint } from './curve';

/**
 * Точки без шума по известной модели: тогда подгонка должна восстановить параметры точно.
 * Модель центрирована по L̄ — среднему входному уровню группы (взвешенному по ученикам), как в самой модели.
 */
function synthetic(M: number, tau: number, beta: number, n = 30): CurvePoint[] {
  const raw = Array.from({ length: n }, (_, i) => ({
    hours: 18 + (i % 11) * 2,                 // 18…38
    entryPct: 45 + ((i * 7) % 31),            // 45…75
    students: 18 + (i % 5),
  }));
  const W = raw.reduce((s, p) => s + p.students, 0);
  const entryMean = raw.reduce((s, p) => s + p.students * p.entryPct, 0) / W;
  return raw.map((p) => ({
    ...p,
    sorPct: M * (1 - Math.exp(-p.hours / tau)) + beta * (p.entryPct - entryMean),
  }));
}

describe('fitCurve', () => {
  it('восстанавливает M, τ и β на данных без шума', () => {
    const r = fitCurve(synthetic(80, 6, 0.5), ANALYSIS_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fit.tau).toBeCloseTo(6, 6);
    expect(r.fit.M).toBeCloseTo(80, 4);
    expect(r.fit.beta).toBeCloseTo(0.5, 4);
  });

  it('часов до 70% считается по формуле −τ·ln(1 − 70/M)', () => {
    const r = fitCurve(synthetic(80, 6, 0.5), ANALYSIS_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // −6·ln(1 − 70/80) = 12,48
    expect(r.fit.h70).toBeCloseTo(-6 * Math.log(1 - 70 / 80), 2);
    expect(r.fit.h70Extrapolated).toBe(false);
  });

  it('если предел M не выше 70%, цель недостижима — h70 = null', () => {
    const r = fitCurve(synthetic(60, 6, 0), ANALYSIS_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fit.h70).toBeNull();
  });

  it('цель вне наблюдаемых часов помечается как экстраполяция', () => {
    // M = 75, τ = 20: h70 ≈ 54 часа, а наблюдали до 38
    const r = fitCurve(synthetic(75, 20, 0), ANALYSIS_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fit.h70).not.toBeNull();
    expect(r.fit.h70Extrapolated).toBe(true);
  });

  it('отдача следующего часа равна разности кривой в h+1 и h', () => {
    const r = fitCurve(synthetic(80, 6, 0), ANALYSIS_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.fit.meanHours;
    const expected = predictMastery({ ...r.fit, beta: 0 }, h + 1, r.fit.entryMean)
      - predictMastery({ ...r.fit, beta: 0 }, h, r.fit.entryMean);
    expect(r.fit.nextHourGainPp).toBeCloseTo(expected, 6);
    expect(r.fit.nextHourGainPp).toBeGreaterThan(0);
  });

  it('плоская кривая (часы не влияют): τ на нижней границе, tauAtLimit = low', () => {
    const r = fitCurve(synthetic(70, 0.5, 0), ANALYSIS_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fit.tauAtLimit).toBe('low');
    expect(r.fit.nextHourGainPp).toBeCloseTo(0, 2);
  });

  it('обычная кривая: tauAtLimit = null', () => {
    const r = fitCurve(synthetic(80, 6, 0.5), ANALYSIS_CONFIG);
    expect(r.ok && r.fit.tauAtLimit).toBe(null);
  });

  it('меньше 6 точек — fewPoints', () => {
    expect(fitCurve(synthetic(80, 6, 0.5, 5), ANALYSIS_CONFIG)).toEqual({ ok: false, reason: 'fewPoints' });
  });

  it('все классы провели одинаково часов — кривую не строим', () => {
    const flat = synthetic(80, 6, 0.5).map((p) => ({ ...p, hours: 28 }));
    expect(fitCurve(flat, ANALYSIS_CONFIG)).toEqual({ ok: false, reason: 'noHourVariance' });
  });
});
