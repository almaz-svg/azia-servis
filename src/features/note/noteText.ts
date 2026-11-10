import type { NoteFacts } from '@/core/note';
import { formatHours, formatNumber, formatSigned, t, type Lang } from '@/i18n';

/**
 * Шаблон текста обоснования (ТЗ, F7: копирование — P0). Числа форматируются так же, как на экранах
 * «Темы», «Учебники» и «Часы», чтобы скопированный текст совпадал с экраном (чек-лист приёмки).
 * Возвращает обычный текст: его вставляют в письмо или протокол методобъединения.
 */
export function renderTemplateNote(lang: Lang, f: NoteFacts): string {
  const lines: string[] = [t(lang, 'note.heading')];
  if (f.demo) lines.push(t(lang, 'note.demo'));
  lines.push(
    t(lang, 'note.scope', {
      schools: formatNumber(f.schools),
      rows: formatNumber(f.resultRows),
      topics: formatNumber(f.topics),
    }),
  );

  lines.push('', t(lang, 'note.topics.title'));
  const pct = (v: number | null) => (v === null ? t(lang, 'value.empty') : formatNumber(v));
  for (const p of f.textbookProblems) {
    lines.push(
      '• ' +
        t(lang, 'note.textbook', {
          topic: p.topic,
          weak: p.weak,
          delta: formatNumber(Math.abs(p.deltaPp), 1),
          low: formatSigned(p.ciLow),
          high: formatSigned(p.ciHigh),
        }),
    );
  }
  for (const p of f.programProblems) {
    lines.push('• ' + t(lang, 'note.program', { topic: p.topic, a: pct(p.mastery['А']), b: pct(p.mastery['Б']) }));
  }
  if (f.lowData.length > 0) lines.push('• ' + t(lang, 'note.lowdata', { topics: f.lowData.join(', ') }));
  if (f.textbookProblems.length + f.programProblems.length + f.lowData.length === 0) {
    lines.push('• ' + t(lang, 'topics.summary.none'));
  }

  if (f.hours) {
    lines.push('', t(lang, 'note.hours.title'));
    if (f.hours.moves.length === 0) {
      lines.push('• ' + t(lang, 'note.hours.none'));
    } else {
      for (const m of f.hours.moves) {
        lines.push(
          '• ' +
            t(lang, 'note.hours.move', {
              topic: m.topic,
              before: formatHours(m.before),
              after: formatHours(m.after),
              delta: formatSigned(m.deltaPp, 2),
            }),
        );
      }
      lines.push(t(lang, 'hours.sum', { total: formatHours(f.hours.totalHours) }));
      lines.push(t(lang, 'note.hours.forecast', { gain: formatSigned(f.hours.forecastPp, 2) }));
    }
  }

  lines.push('', t(lang, 'note.footer', { version: f.configVersion, key: shortKey(f.analysisKey) }));
  return lines.join('\n');
}

/** Ключ расчёта: первые 12 знаков хэша датасета. Версия методики стоит рядом отдельным полем */
function shortKey(analysisKey: string): string {
  return analysisKey.split(':')[0]!.slice(0, 12);
}
