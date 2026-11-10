import type { Analysis } from './analysis';
import type { HourView } from './hours';
import type { Textbook } from './types';

/**
 * Факты для текста обоснования (ТЗ, F7 и F10; ARCHITECTURE.md, 5.5).
 * Только числа и коды из уже посчитанных Analysis и HourView: здесь ничего не пересчитывается,
 * поэтому записка не может разойтись с экраном. Строк школ в фактах нет.
 */

/** Перенос меньше этого не считаем изменением: защита от шума в дробных часах */
const HOUR_EPS = 1e-6;

export interface NoteTextbookProblem {
  topic: string;
  weak: Textbook;
  /** Δ = Б − А с поправкой, п.п. */
  deltaPp: number;
  ciLow: number;
  ciHigh: number;
}

export interface NoteProgramProblem {
  topic: string;
  mastery: Record<Textbook, number | null>;
}

export interface NoteHourMove {
  topic: string;
  before: number;
  after: number;
  /** Изменение освоения темы по модели, п.п. */
  deltaPp: number;
}

export interface NoteFacts {
  demo: boolean;
  configVersion: string;
  analysisKey: string;
  schools: number;
  resultRows: number;
  topics: number;
  textbookProblems: NoteTextbookProblem[];
  programProblems: NoteProgramProblem[];
  lowData: string[];
  /** null — листа «Уроки» нет, раздел про часы в записку не попадает */
  hours: {
    moves: NoteHourMove[];
    totalHours: number;
    forecastPp: number;
  } | null;
}

export function buildNoteFacts(analysis: Analysis, view: HourView | null): NoteFacts {
  const textbookProblems: NoteTextbookProblem[] = [];
  const programProblems: NoteProgramProblem[] = [];
  const lowData: string[] = [];

  for (const t of analysis.topics) {
    if (t.status.code === 'textbook' && t.status.problemTextbook && t.comparison) {
      textbookProblems.push({
        topic: t.topic,
        weak: t.status.problemTextbook,
        deltaPp: t.comparison.deltaPp,
        ciLow: t.comparison.ciLow,
        ciHigh: t.comparison.ciHigh,
      });
    } else if (t.status.code === 'program') {
      programProblems.push({ topic: t.topic, mastery: { ...t.mastery } });
    } else if (t.status.code === 'lowdata') {
      lowData.push(t.topic);
    }
  }

  const hours =
    view && view.hasLessons
      ? {
          moves: view.rows
            .filter((r) => Math.abs(r.hours - r.baseHours) > HOUR_EPS)
            .map((r) => ({ topic: r.topic, before: r.baseHours, after: r.hours, deltaPp: r.deltaPp })),
          totalHours: view.totalHours,
          forecastPp: view.forecastPp,
        }
      : null;

  return {
    demo: analysis.datasetSource === 'demo',
    configVersion: analysis.configVersion,
    analysisKey: analysis.analysisKey,
    schools: analysis.counts.schools,
    resultRows: analysis.counts.resultRows,
    topics: analysis.topics.length,
    textbookProblems,
    programProblems,
    lowData,
    hours,
  };
}
