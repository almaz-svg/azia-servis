import type { LessonRow, ResultRow } from './types';

/**
 * Идентификатор содержимого датасета: SHA-256 от строк, отсортированных по значению.
 * Порядок строк в файле на него не влияет. Источник (demo/upload) не входит:
 * метка «Демо-данные» хранится отдельно.
 * Работает и в браузере, и в Node: crypto.subtle есть в обоих.
 */
export async function datasetId(results: ResultRow[], lessons: LessonRow[]): Promise<string> {
  const lines = [
    ...results.map((r) =>
      'R' + JSON.stringify([
        r.year, r.district, r.school, r.schoolType, r.textbook, r.grade,
        r.topic, r.students, r.sorPct, r.entryPct,
      ]),
    ),
    ...lessons.map((l) =>
      'L' + JSON.stringify([l.year, l.school, l.grade, l.topic, l.plannedHours, l.actualHours]),
    ),
  ].sort();

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines.join('\n')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
