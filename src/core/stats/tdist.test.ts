import { describe, expect, it } from 'vitest';
import { lnGamma, tCdf, tQuantile } from './tdist';

describe('lnGamma', () => {
  it('Γ(5) = 24, Γ(1/2) = √π', () => {
    // Аппроксимация Ланцоша: относительная погрешность около 1e-7
    expect(Math.abs(Math.exp(lnGamma(5)) - 24) / 24).toBeLessThan(1e-6);
    expect(Math.abs(Math.exp(lnGamma(0.5)) - Math.sqrt(Math.PI)) / Math.sqrt(Math.PI)).toBeLessThan(1e-7);
  });
});

describe('tCdf', () => {
  it('симметрия: F(0) = 0.5, F(−t) = 1 − F(t)', () => {
    expect(tCdf(0, 7)).toBeCloseTo(0.5, 12);
    expect(tCdf(-1.3, 7)).toBeCloseTo(1 - tCdf(1.3, 7), 12);
  });
});

describe('tQuantile(0.975, df) — табличные значения', () => {
  // Таблица Стьюдента, двусторонний уровень 95%
  const table: Array<[number, number]> = [
    [1, 12.706],
    [2, 4.303],
    [5, 2.571],
    [10, 2.228],
    [19, 2.093],   // 20 школ − 1: как в поправке на уровень школ
    [30, 2.042],
  ];
  for (const [df, expected] of table) {
    it(`df = ${df} → ${expected}`, () => {
      expect(tQuantile(0.975, df)).toBeCloseTo(expected, 3);
    });
  }

  it('при больших df стремится к нормальному 1.96', () => {
    expect(tQuantile(0.975, 1_000_000)).toBeCloseTo(1.96, 2);
  });

  it('отвергает некорректные аргументы', () => {
    expect(() => tQuantile(0.4, 5)).toThrow(RangeError);
    expect(() => tQuantile(0.975, 0)).toThrow(RangeError);
  });
});
