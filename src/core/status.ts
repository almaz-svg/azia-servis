import type { AnalysisConfig } from './config';
import { ciExcludesZero, type TextbookComparison } from './stats/compare';
import type { Textbook } from './types';

/**
 * Статус темы (ТЗ, F3). Правила проверяются по порядку, первое совпадение побеждает:
 *   1. «Мало данных»: на одном из присутствующих учебников меньше minClassesPerTextbook классов.
 *   2. «Проблема учебника»: |Δ| ≥ textbookGapPp и интервал 95% не содержит 0.
 *      Проблемный учебник — тот, у которого скорректированное освоение ниже.
 *   3. «Проблема программы»: освоение ниже programMasteryPct на всех присутствующих учебниках.
 *   4. «Норма».
 * Учебник «отсутствует» в теме, если ни один класс его не проходил. Тогда он не участвует в правилах 1–3.
 */

export const TEXTBOOKS: readonly Textbook[] = ['А', 'Б'];

export type StatusCode = 'norm' | 'textbook' | 'program' | 'lowdata';

export type ComparisonSkip = 'oneTextbook' | 'fewSchools' | 'singular';

/**
 * Причина статуса для подсказки «почему такой статус».
 * key — ключ i18n, params — числа и коды для подстановки. Сам текст строит UI.
 */
export type Reason =
  | { key: 'why.lowdata'; params: { textbook: Textbook; classes: number; min: number } }
  | {
      key: 'why.textbookGap';
      params: { weak: Textbook; deltaPp: number; ciLow: number; ciHigh: number; threshold: number };
    }
  | { key: 'why.program'; params: { threshold: number; textbooks: number } }
  | { key: 'why.norm'; params: { threshold: number } }
  | { key: 'why.noComparison'; params: { reason: ComparisonSkip } };

export interface TopicStatus {
  code: StatusCode;
  /** Только для «textbook»: учебник, который тянет результат вниз */
  problemTextbook: Textbook | null;
  reasons: Reason[];
}

export interface TopicFacts {
  classes: Record<Textbook, number>;
  /** Освоение по учебнику, %; null, если учебника в теме нет */
  mastery: Record<Textbook, number | null>;
  comparison: TextbookComparison | null;
  comparisonSkip: ComparisonSkip | null;
}

export function classifyTopic(facts: TopicFacts, cfg: AnalysisConfig): TopicStatus {
  const present = TEXTBOOKS.filter((t) => facts.classes[t] > 0);

  const small = present.find((t) => facts.classes[t] < cfg.minClassesPerTextbook);
  if (small) {
    return {
      code: 'lowdata',
      problemTextbook: null,
      reasons: [{ key: 'why.lowdata', params: { textbook: small, classes: facts.classes[small], min: cfg.minClassesPerTextbook } }],
    };
  }

  const c = facts.comparison;
  if (present.length === 2 && c && Math.abs(c.deltaPp) >= cfg.textbookGapPp && ciExcludesZero(c)) {
    // Δ = Б − А: отрицательная — учебник Б слабее
    const weak: Textbook = c.deltaPp < 0 ? 'Б' : 'А';
    return {
      code: 'textbook',
      problemTextbook: weak,
      reasons: [{
        key: 'why.textbookGap',
        params: { weak, deltaPp: c.deltaPp, ciLow: c.ciLow, ciHigh: c.ciHigh, threshold: cfg.textbookGapPp },
      }],
    };
  }

  const extra: Reason[] =
    present.length === 2 && !c && facts.comparisonSkip
      ? [{ key: 'why.noComparison', params: { reason: facts.comparisonSkip } }]
      : [];

  const allBelow = present.length > 0 && present.every((t) => (facts.mastery[t] ?? Infinity) < cfg.programMasteryPct);
  if (allBelow) {
    return {
      code: 'program',
      problemTextbook: null,
      reasons: [{ key: 'why.program', params: { threshold: cfg.programMasteryPct, textbooks: present.length } }, ...extra],
    };
  }

  return {
    code: 'norm',
    problemTextbook: null,
    reasons: [{ key: 'why.norm', params: { threshold: cfg.programMasteryPct } }, ...extra],
  };
}
