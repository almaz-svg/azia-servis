import { fitCurve, type CurveFit, type CurvePoint } from './curve';
import type { AnalysisConfig } from './config';
import { compareTextbooks, weightedMean, type TextbookComparison } from './stats/compare';
import { classifyTopic, TEXTBOOKS, type ComparisonSkip, type TopicStatus } from './status';
import type { Dataset, LessonRow, ResultRow, Textbook } from './types';

/**
 * Сборка всех расчётов для экранов. Один объект Analysis — один источник чисел:
 * экран, экспорт и текст обоснования читают его, а не пересчитывают.
 */

export interface SchoolCell {
  /** Освоение школы по теме, % (взвешено по ученикам, оба учебника) */
  mastery: number;
  classes: number;
  textbook: Textbook | null;
}

export type CurveSlot =
  | { ok: true; fit: CurveFit }
  | { ok: false; reason: 'noHours' | 'fewPoints' | 'noHourVariance' | 'noFit' };

export interface TopicAnalysis {
  topic: string;
  status: TopicStatus;
  classes: Record<Textbook, number>;
  mastery: Record<Textbook, number | null>;
  overall: number | null;
  /** Δ без поправки, п.п.; null, если учебник один */
  rawDeltaPp: number | null;
  comparison: TextbookComparison | null;
  comparisonSkip: ComparisonSkip | null;
  curves: Record<Textbook, CurveSlot>;
  /** Точки «класс: часы → освоение» по учебникам; их рисует экран «Часы» */
  hourPoints: Record<Textbook, CurvePoint[]>;
  /** Карта тем: по коду школы */
  cells: Record<string, SchoolCell>;
}

export interface Analysis {
  analysisKey: string;
  configVersion: string;
  datasetSource: 'demo' | 'upload';
  hasLessons: boolean;
  schools: string[];
  topics: TopicAnalysis[];
  counts: { schools: number; resultRows: number; lessonRows: number };
}

/** Фильтры экрана «Темы». Пустое поле — без ограничения */
export interface ScopeFilter {
  grades?: string[];
  textbook?: Textbook;
  district?: string;
}

const hoursKey = (year: string, school: string, grade: string, topic: string) =>
  [year, school, grade, topic].join('|');

/** Ограничивает датасет фильтрами. Уроки остаются только для классов, которые попали в выборку. */
export function applyScope(dataset: Dataset, filter: ScopeFilter): Pick<Dataset, 'results' | 'lessons'> {
  const results = dataset.results.filter(
    (r) =>
      (!filter.grades?.length || filter.grades.includes(r.grade)) &&
      (!filter.textbook || r.textbook === filter.textbook) &&
      (!filter.district || r.district === filter.district),
  );
  const kept = new Set(results.map((r) => `${r.year}|${r.school}|${r.grade}|${r.topic}`));
  const lessons = dataset.lessons.filter((l) => kept.has(`${l.year}|${l.school}|${l.grade}|${l.topic}`));
  return { results, lessons };
}

export function analyze(dataset: Dataset, cfg: AnalysisConfig): Analysis {
  const hours = new Map<string, number>();
  for (const l of dataset.lessons) {
    hours.set(hoursKey(l.year, l.school, l.grade, l.topic), l.actualHours);
  }

  const topicOrder: string[] = [];
  for (const r of dataset.results) {
    if (!topicOrder.includes(r.topic)) topicOrder.push(r.topic);
  }
  const schools = [...new Set(dataset.results.map((r) => r.school))].sort((a, b) => a.localeCompare(b, 'ru'));

  const topics = topicOrder.map((topic) => analyzeTopic(topic, dataset.results, hours, cfg, dataset.lessons.length > 0));

  return {
    analysisKey: `${dataset.id}:${cfg.version}`,
    configVersion: cfg.version,
    datasetSource: dataset.source,
    hasLessons: dataset.lessons.length > 0,
    schools,
    topics,
    counts: {
      schools: schools.length,
      resultRows: dataset.results.length,
      lessonRows: dataset.lessons.length,
    },
  };
}

function analyzeTopic(
  topic: string,
  allRows: ResultRow[],
  hours: Map<string, number>,
  cfg: AnalysisConfig,
  hasLessons: boolean,
): TopicAnalysis {
  const rows = allRows.filter((r) => r.topic === topic);

  const classes = { А: 0, Б: 0 } as Record<Textbook, number>;
  const mastery = { А: null, Б: null } as Record<Textbook, number | null>;
  for (const t of TEXTBOOKS) {
    const own = rows.filter((r) => r.textbook === t);
    classes[t] = own.length;
    mastery[t] = weightedMean(own.map((r) => ({ value: r.sorPct, weight: r.students })));
  }
  const overall = weightedMean(rows.map((r) => ({ value: r.sorPct, weight: r.students })));

  const cmp = compareTextbooks(rows);
  const comparison = cmp.ok ? cmp.value : null;
  const comparisonSkip: ComparisonSkip | null = cmp.ok ? null : cmp.reason;

  const status = classifyTopic({ classes, mastery, comparison, comparisonSkip }, cfg);

  const curves = {} as Record<Textbook, CurveSlot>;
  const hourPoints = {} as Record<Textbook, CurvePoint[]>;
  for (const t of TEXTBOOKS) {
    hourPoints[t] = pointsFor(rows.filter((r) => r.textbook === t), hours);
    curves[t] = fitSlot(hourPoints[t], cfg, hasLessons);
  }

  const cells: Record<string, SchoolCell> = {};
  const schoolCodes = [...new Set(rows.map((r) => r.school))];
  for (const school of schoolCodes) {
    const own = rows.filter((r) => r.school === school);
    const m = weightedMean(own.map((r) => ({ value: r.sorPct, weight: r.students })));
    if (m === null) continue;
    const books = new Set(own.map((r) => r.textbook));
    cells[school] = {
      mastery: m,
      classes: own.length,
      // Один учебник в школе — показываем его; если в школе оба, учебник не указываем
      textbook: books.size === 1 ? own[0]!.textbook : null,
    };
  }

  return {
    topic,
    status,
    classes,
    mastery,
    overall,
    rawDeltaPp: comparison?.rawDeltaPp ?? null,
    comparison,
    comparisonSkip,
    curves,
    hourPoints,
    cells,
  };
}

/** Классы, для которых известны фактические часы по теме и учебнику */
function pointsFor(rows: ResultRow[], hours: Map<string, number>): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (const r of rows) {
    const h = hours.get(hoursKey(r.year, r.school, r.grade, r.topic));
    if (h === undefined) continue;
    points.push({ hours: h, sorPct: r.sorPct, entryPct: r.entryPct, students: r.students });
  }
  return points;
}

function fitSlot(points: CurvePoint[], cfg: AnalysisConfig, hasLessons: boolean): CurveSlot {
  if (!hasLessons || points.length === 0) return { ok: false, reason: 'noHours' };

  const fit = fitCurve(points, cfg);
  return fit.ok ? { ok: true, fit: fit.fit } : fit;
}
