import { describe, expect, it } from 'vitest';
import { ANALYSIS_CONFIG } from './config';
import { classifyTopic, type TopicFacts } from './status';
import type { TextbookComparison } from './stats/compare';

const cmp = (deltaPp: number, ciLow: number, ciHigh: number): TextbookComparison => ({
  deltaPp,
  ciLow,
  ciHigh,
  rawDeltaPp: deltaPp,
  rawCiLow: ciLow,
  rawCiHigh: ciHigh,
  adjustedA: 70,
  adjustedB: 70 + deltaPp,
  schools: 20,
  df: 19,
});

function facts(over: Partial<TopicFacts> & Pick<TopicFacts, 'classes' | 'mastery'>): TopicFacts {
  return { comparison: null, comparisonSkip: null, ...over };
}

const big = { А: 40, Б: 40 };

describe('classifyTopic: порядок правил', () => {
  it('«Мало данных» важнее всего: даже при большой разнице', () => {
    const s = classifyTopic(
      facts({
        classes: { А: 40, Б: 5 },
        mastery: { А: 75, Б: 50 },
        comparison: cmp(-12, -15, -9),
      }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('lowdata');
    expect(s.reasons[0]).toEqual({ key: 'why.lowdata', params: { textbook: 'Б', classes: 5, min: 8 } });
  });

  it('«Проблема учебника»: Δ ≥ 7 п.п. и интервал не содержит 0; проблемный — слабый учебник', () => {
    const s = classifyTopic(
      facts({ classes: big, mastery: { А: 74, Б: 64 }, comparison: cmp(-10, -13, -7) }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('textbook');
    expect(s.problemTextbook).toBe('Б');
  });

  it('разница ≥ 7, но интервал через ноль — не «Проблема учебника»', () => {
    const s = classifyTopic(
      facts({ classes: big, mastery: { А: 74, Б: 66 }, comparison: cmp(-8, -17, 1) }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).not.toBe('textbook');
  });

  it('значимая разница меньше порога — не «Проблема учебника»', () => {
    const s = classifyTopic(
      facts({ classes: big, mastery: { А: 74, Б: 70 }, comparison: cmp(-4, -6, -2) }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).not.toBe('textbook');
  });

  it('«Проблема программы»: освоение ниже 60% на всех учебниках, разница не доказана', () => {
    const s = classifyTopic(
      facts({ classes: big, mastery: { А: 52, Б: 51 }, comparison: cmp(-1, -4, 2) }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('program');
    expect(s.problemTextbook).toBeNull();
  });

  it('ниже 60% только на одном учебнике — не «программа»', () => {
    const s = classifyTopic(
      facts({ classes: big, mastery: { А: 75, Б: 52 }, comparison: cmp(-2, -4, 0) }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('norm');
  });

  it('«Норма», если всё в порядке', () => {
    const s = classifyTopic(
      facts({ classes: big, mastery: { А: 78, Б: 75 }, comparison: cmp(-3, -5, -1) }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('norm');
    expect(s.reasons[0]?.key).toBe('why.norm');
  });
});

describe('classifyTopic: один учебник в теме', () => {
  it('статус «Проблема учебника» не ставится, сравнивать не с чем', () => {
    const s = classifyTopic(
      facts({
        classes: { А: 40, Б: 0 },
        mastery: { А: 55, Б: null },
        comparison: null,
        comparisonSkip: 'oneTextbook',
      }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('program');
    expect(s.problemTextbook).toBeNull();
  });

  it('учебник отсутствует, а остальные классы малочисленны — «Мало данных» не применяется к отсутствующему', () => {
    const s = classifyTopic(
      facts({ classes: { А: 30, Б: 0 }, mastery: { А: 80, Б: null }, comparisonSkip: 'oneTextbook' }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('norm');
  });
});

describe('classifyTopic: подсказка при невозможном сравнении', () => {
  it('два учебника, но сравнение не удалось — причина в подсказке', () => {
    const s = classifyTopic(
      facts({ classes: big, mastery: { А: 78, Б: 77 }, comparison: null, comparisonSkip: 'fewSchools' }),
      ANALYSIS_CONFIG,
    );
    expect(s.code).toBe('norm');
    expect(s.reasons.some((r) => r.key === 'why.noComparison')).toBe(true);
  });
});
