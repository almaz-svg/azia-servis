import { describe, expect, it } from 'vitest';
import type { ResultRow, Textbook } from '../types';
import { ciExcludesZero, compareTextbooks } from './compare';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Школы: у каждой один учебник. Классы внутри школы — разный входной уровень.
 * opts.confound — если true, учебник Б выбирают более слабые по уровню школы (смещение в сыром сравнении).
 */
function makeRows(opts: { schools: number; trueDelta: number; confound: boolean; seed?: number }): ResultRow[] {
  const rnd = lcg(opts.seed ?? 11);
  const rows: ResultRow[] = [];
  for (let s = 0; s < opts.schools; s++) {
    const textbook: Textbook = s % 2 === 0 ? 'А' : 'Б';
    const schoolLevel = opts.confound && textbook === 'Б' ? 50 : 62;
    for (let c = 0; c < 4; c++) {
      const entry = Math.round(schoolLevel + (rnd() - 0.5) * 16);
      const base = 70 + 0.4 * (entry - 60);
      const delta = textbook === 'Б' ? opts.trueDelta : 0;
      rows.push({
        year: '2025-2026',
        district: 'Тараз',
        school: `T-${String(s + 1).padStart(2, '0')}`,
        schoolType: 'город',
        textbook,
        grade: c < 2 ? '5А' : '6Б',
        topic: 'Обыкновенные дроби',
        students: 20 + c,
        sorPct: Math.round(base + delta + (rnd() - 0.5) * 6),
        entryPct: entry,
      });
    }
  }
  return rows;
}

describe('compareTextbooks', () => {
  it('восстанавливает разницу учебников с поправкой, интервал исключает 0', () => {
    const r = compareTextbooks(makeRows({ schools: 20, trueDelta: -10, confound: false }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.deltaPp).toBeGreaterThan(-12);
    expect(r.value.deltaPp).toBeLessThan(-8);
    expect(ciExcludesZero(r.value)).toBe(true);
    expect(r.value.df).toBe(19);
    expect(r.value.schools).toBe(20);
  });

  it('поправка на входной уровень убирает смещение сырого сравнения', () => {
    // Б выбирают слабые школы: сырая разница занижена, с поправкой она близка к истинной
    const rows = makeRows({ schools: 20, trueDelta: -6, confound: true, seed: 3 });
    const r = compareTextbooks(rows);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rawDeltaPp).toBeLessThan(r.value.deltaPp - 3);
    expect(Math.abs(r.value.deltaPp - -6)).toBeLessThan(2);
  });

  it('одна книга в теме — oneTextbook', () => {
    const rows = makeRows({ schools: 10, trueDelta: 0, confound: false }).filter((r) => r.textbook === 'А');
    expect(compareTextbooks(rows)).toEqual({ ok: false, reason: 'oneTextbook' });
  });

  it('две школы — fewSchools (нельзя оценить ошибку по кластерам)', () => {
    const rows = makeRows({ schools: 2, trueDelta: -10, confound: false });
    expect(compareTextbooks(rows)).toEqual({ ok: false, reason: 'fewSchools' });
  });

  it('ciExcludesZero: интервал через ноль — false', () => {
    expect(ciExcludesZero({ ciLow: -1, ciHigh: 2 })).toBe(false);
    expect(ciExcludesZero({ ciLow: 0.5, ciHigh: 2 })).toBe(true);
    expect(ciExcludesZero({ ciLow: -3, ciHigh: -0.5 })).toBe(true);
  });
});
