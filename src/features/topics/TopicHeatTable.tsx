import type { CSSProperties, KeyboardEvent } from 'react';
import type { Analysis, SchoolCell } from '@/core/analysis';
import { formatNumber, t, type Lang } from '@/i18n';
import { StatusChip } from './StatusChip';

/**
 * Карта тем (ТЗ, F2): строки — темы, колонки — школы, в ячейке — освоение, %.
 * Ширина колонок подобрана так, чтобы 10 тем × 20 школ помещались на 1366 px без прокрутки.
 */

/** Цвет ячейки: красный ниже 65%, зелёный выше; сила оттенка растёт с отклонением */
function cellStyle(value: number): CSSProperties {
  const delta = value - 65;
  const strength = Math.min(1, Math.abs(delta) / 15);
  const ink = delta < 0 ? 'var(--pen-red)' : 'var(--check-green)';
  return { background: `color-mix(in srgb, ${ink} ${Math.round(strength * 22)}%, var(--paper))` };
}

function cellHint(lang: Lang, school: string, cell: SchoolCell): string {
  const value = formatNumber(cell.mastery);
  if (cell.textbook) {
    return t(lang, 'topics.cell', {
      school,
      textbook: t(lang, `textbook.${cell.textbook === 'А' ? 'a' : 'b'}`),
      value,
      classes: formatNumber(cell.classes),
    });
  }
  return t(lang, 'topics.cell.mixed', { school, value, classes: formatNumber(cell.classes) });
}

/**
 * Стрелки ходят по ячейкам (ТЗ, «Доступность»). В таблицу входит один Tab: фокус получает первая ячейка,
 * остальные доступны стрелками, Home и End. Подсказка ячейки читается из aria-label.
 */
function moveFocus(e: KeyboardEvent<HTMLTableElement>, rows: number, cols: number) {
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
  if (!cell) return;
  let row = Number(cell.dataset.row);
  let col = Number(cell.dataset.col);
  switch (e.key) {
    case 'ArrowRight': col += 1; break;
    case 'ArrowLeft': col -= 1; break;
    case 'ArrowDown': row += 1; break;
    case 'ArrowUp': row -= 1; break;
    case 'Home': col = 0; break;
    case 'End': col = cols - 1; break;
    default: return;
  }
  if (row < 0 || row >= rows || col < 0 || col >= cols) return;
  const next = e.currentTarget.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
  if (!next) return;
  e.preventDefault();
  next.focus();
}

export function TopicHeatTable({ analysis, lang }: { analysis: Analysis; lang: Lang }) {
  const rows = analysis.topics.length;
  const cols = analysis.schools.length;
  return (
    <table className="heat" onKeyDown={(e) => moveFocus(e, rows, cols)}>
      <caption className="sr-only">{t(lang, 'topics.caption')}</caption>
      <thead>
        <tr>
          <th scope="col" className="heat-topic">{t(lang, 'topics.col.topic')}</th>
          {analysis.schools.map((school) => (
            <th scope="col" key={school} className="heat-school">{school}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {analysis.topics.map((topic, row) => (
          <tr key={topic.topic}>
            <th scope="row" className="heat-topic">
              <span className="topic-name">{topic.topic}</span>
              <StatusChip code={topic.status.code} lang={lang} />
              <span className="topic-overall">
                {t(lang, 'topics.col.overall')}:{' '}
                {topic.overall === null ? t(lang, 'value.empty') : `${formatNumber(topic.overall)}%`}
              </span>
            </th>
            {analysis.schools.map((school, col) => {
              const cell = topic.cells[school];
              const nav = { 'data-row': row, 'data-col': col, tabIndex: row === 0 && col === 0 ? 0 : -1 };
              if (!cell) {
                return (
                  <td
                    key={school}
                    {...nav}
                    className="heat-cell is-empty"
                    title={t(lang, 'topics.cell.empty', { school })}
                    aria-label={`${topic.topic}. ${t(lang, 'topics.cell.empty', { school })}`}
                  >
                    {t(lang, 'value.empty')}
                  </td>
                );
              }
              return (
                <td
                  key={school}
                  {...nav}
                  className="heat-cell"
                  style={cellStyle(cell.mastery)}
                  title={cellHint(lang, school, cell)}
                  aria-label={`${topic.topic}. ${cellHint(lang, school, cell)}`}
                >
                  {formatNumber(cell.mastery)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
