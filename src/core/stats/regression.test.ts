import { describe, expect, it } from 'vitest';
import { invert } from './linalg';
import { clusteredWls, type WlsRow } from './regression';

/** Детерминированный шум без Math.random: линейный конгруэнтный генератор */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

describe('invert', () => {
  it('обращает матрицу 3×3 и даёт единичную при умножении', () => {
    const a = [
      [4, 1, 0],
      [1, 3, 1],
      [0, 1, 2],
    ];
    const inv = invert(a)!;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += a[i]![k]! * inv[k]![j]!;
        expect(s).toBeCloseTo(i === j ? 1 : 0, 9);
      }
    }
  });

  it('вырожденная матрица — null', () => {
    expect(invert([[1, 2], [2, 4]])).toBeNull();
  });
});

describe('clusteredWls', () => {
  // 12 школ, в каждой — один учебник (isB) и несколько классов.
  // Истинный эффект учебника Б: −6. Эффект уровня: +0.5 на пункт входного уровня.
  const rows: WlsRow[] = [];
  const noise = lcg(7);
  for (let s = 0; s < 12; s++) {
    const isB = s % 2;
    const schoolEffect = noise() * 4;
    for (let c = 0; c < 6; c++) {
      const entry = 50 + ((s * 6 + c) % 25);
      rows.push({
        y: 60 + -6 * isB + 0.5 * entry + schoolEffect + noise() * 2,
        x: [1, isB, entry],
        w: 20 + c,
        cluster: `school-${s}`,
      });
    }
  }

  it('восстанавливает эффект учебника и уровня с точностью до шума', () => {
    const fit = clusteredWls(rows);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.beta[1]).toBeGreaterThan(-7.5);
    expect(fit.beta[1]).toBeLessThan(-4.5);
    // 12 школ с общим школьным эффектом: допуск 0,15 отражает выборочный разброс
    expect(Math.abs(fit.beta[2]! - 0.5)).toBeLessThan(0.15);
    expect(fit.df).toBe(11);
    expect(fit.clusters).toBe(12);
    expect(fit.se.every((s) => s > 0)).toBe(true);
  });

  it('стандартная ошибка эффекта учебника больше, чем для независимых наблюдений (школьный эффект учтён)', () => {
    // Те же строки, но каждая в своём кластере: это наивная оценка без кластеризации
    const naive = rows.map((r, i) => ({ ...r, cluster: `row-${i}` }));
    const clustered = clusteredWls(rows);
    const independent = clusteredWls(naive);
    expect(clustered.ok && independent.ok).toBe(true);
    if (!clustered.ok || !independent.ok) return;
    expect(clustered.se[1]!).toBeGreaterThan(independent.se[1]!);
  });

  it('меньше трёх кластеров — fewClusters', () => {
    const two = rows.filter((r) => r.cluster === 'school-0' || r.cluster === 'school-1');
    expect(clusteredWls(two)).toEqual({ ok: false, reason: 'fewClusters' });
  });

  it('вырожденный регрессор (все строки одинаковы) — singular', () => {
    const flat = rows.map((r, i) => ({ ...r, x: [1, 0, 50], cluster: `school-${i % 5}` }));
    expect(clusteredWls(flat)).toEqual({ ok: false, reason: 'singular' });
  });
});
