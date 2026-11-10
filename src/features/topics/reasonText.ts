import type { Reason } from '@/core/status';
import { formatNumber, t, type Lang } from '@/i18n';

/**
 * Подсказка «почему такой статус» (ТЗ, F3). Числа берутся из расчёта, текст строит словарь.
 */
export function reasonText(r: Reason, lang: Lang): string {
  switch (r.key) {
    case 'why.lowdata':
      return t(lang, r.key, {
        textbook: r.params.textbook,
        classes: formatNumber(r.params.classes),
        min: formatNumber(r.params.min),
      });
    case 'why.textbookGap':
      return t(lang, r.key, {
        weak: r.params.weak,
        delta: formatNumber(Math.abs(r.params.deltaPp), 1),
        low: formatNumber(r.params.ciLow, 1),
        high: formatNumber(r.params.ciHigh, 1),
        threshold: formatNumber(r.params.threshold),
      });
    case 'why.program':
      return t(lang, r.params.textbooks === 1 ? 'why.program.one' : 'why.program.many', {
        threshold: formatNumber(r.params.threshold),
      });
    case 'why.norm':
      return t(lang, r.key, { threshold: formatNumber(r.params.threshold) });
    case 'why.noComparison':
      return t(lang, r.key, { reason: t(lang, `reason.${r.params.reason}`) });
  }
}
